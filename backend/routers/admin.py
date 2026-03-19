import csv
import io
import json
import re
import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, Query, Request, UploadFile, File
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List

from db import db_manager
from auth import require_role, require_permission, AVAILABLE_PERMISSIONS, get_password_hash
from identity import email_in_use, normalize_email
from policies import get_password_policy, DEFAULT_PASSWORD_POLICY, validate_password
from audit import log_action
from logging_config import get_logger
from limiters import limiter
from operational_config import get_public_operational_config, update_operational_config
from operational_status import get_operational_status_snapshot
from mailer import send_smtp_test_email
from threat_ingestion import (
    get_public_threat_source,
    get_public_threat_sources,
    get_runtime_threat_source,
    update_misp_source_config,
)
from threat_misp import MISPClient

logger = get_logger("AdminRouter")

router = APIRouter(prefix="/admin", tags=["admin"])

_DEFAULT_MAX_ATTEMPTS = 5
_DEFAULT_LOCKOUT_MINUTES = 15


async def get_lockout_policy(db) -> dict:
    """Return the current lockout policy, falling back to defaults."""
    policy = await db.lockout_policy.find_one({"_id": "singleton"})
    if not policy:
        return {"max_attempts": _DEFAULT_MAX_ATTEMPTS, "lockout_minutes": _DEFAULT_LOCKOUT_MINUTES}
    return {"max_attempts": policy["max_attempts"], "lockout_minutes": policy["lockout_minutes"]}


class LockoutPolicyUpdate(BaseModel):
    max_attempts: int = Field(..., ge=1, le=100)
    lockout_minutes: int = Field(..., ge=1, le=1440)


@router.get("/lockout-policy")
async def read_lockout_policy(current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    return await get_lockout_policy(db)


@router.put("/lockout-policy")
async def update_lockout_policy(
    request: Request,
    policy: LockoutPolicyUpdate,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    await db.lockout_policy.update_one(
        {"_id": "singleton"},
        {"$set": {"max_attempts": policy.max_attempts, "lockout_minutes": policy.lockout_minutes}},
        upsert=True,
    )
    logger.info(
        f"Admin '{current_user['username']}' updated lockout policy: "
        f"max_attempts={policy.max_attempts}, lockout_minutes={policy.lockout_minutes}"
    )
    ip = request.client.host if request.client else ""
    await log_action(db, user=current_user["username"], action="lockout_policy_changed",
                     ip=ip, result="success",
                     detail=f"max_attempts={policy.max_attempts}, lockout_minutes={policy.lockout_minutes}")
    return {"max_attempts": policy.max_attempts, "lockout_minutes": policy.lockout_minutes}


class PasswordPolicyUpdate(BaseModel):
    min_length: Optional[int] = Field(None, ge=6, le=128)
    require_uppercase: Optional[bool] = None
    require_numbers: Optional[bool] = None
    require_symbols: Optional[bool] = None
    history_count: Optional[int] = Field(None, ge=0, le=24)
    expiry_days: Optional[int] = Field(None, ge=0, le=3650)
    expiry_warning_days: Optional[int] = Field(None, ge=1, le=90)
    mask_pii: Optional[bool] = None


@router.get("/password-policy")
async def read_password_policy(current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    return await get_password_policy(db)


@router.put("/password-policy")
async def update_password_policy(
    request: Request,
    policy: PasswordPolicyUpdate,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    # Build the update from current policy, applying only provided fields
    current = await get_password_policy(db)
    updates = policy.model_dump(exclude_none=True)
    current.update(updates)

    await db.password_policy.update_one(
        {"_id": "singleton"},
        {"$set": current},
        upsert=True,
    )
    logger.info(f"Admin '{current_user['username']}' updated password policy: {updates}")
    ip = request.client.host if request.client else ""
    await log_action(db, user=current_user["username"], action="password_policy_changed",
                     ip=ip, result="success", detail=str(updates))
    return current


@router.get("/stats")
async def get_admin_stats(current_user: dict = Depends(require_role(["admin", "manager"]))):
    """IAM metrics for the admin dashboard."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(hours=24)

    all_users = await db.users.find({}).to_list(length=1000)

    total_users = len(all_users)
    active_users = sum(1 for u in all_users if u.get("is_active", True) == True)
    suspended_users = total_users - active_users
    locked_accounts = sum(
        1 for u in all_users
        if u.get("locked_until") and u["locked_until"] > now
    )
    users_with_mfa = sum(1 for u in all_users if u.get("mfa_enabled", False))
    failed_logins_24h = sum(
        1 for u in all_users
        if u.get("last_failed_at") and u["last_failed_at"] > yesterday
    )

    active_sessions = await db.refresh_tokens.count_documents({
        "revoked": False,
        "expires_at": {"$gt": now},
    })
    active_api_keys = await db.api_keys.count_documents({"revoked": False})

    return {
        "total_users": total_users,
        "active_users": active_users,
        "suspended_users": suspended_users,
        "locked_accounts": locked_accounts,
        "users_with_mfa": users_with_mfa,
        "active_sessions": active_sessions,
        "failed_logins_24h": failed_logins_24h,
        "active_api_keys": active_api_keys,
    }


@router.post("/users/{username}/unlock")
async def unlock_user(
    request: Request,
    username: str,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    user = await db.users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.users.update_one(
        {"username": username},
        {"$set": {"failed_login_count": 0, "locked_until": None, "last_failed_at": None}},
    )
    logger.info(f"Admin '{current_user['username']}' unlocked user '{username}'")
    ip = request.client.host if request.client else ""
    await log_action(db, user=current_user["username"], action="account_unlocked",
                     target=username, ip=ip, result="success")
    return {"message": f"User '{username}' has been unlocked."}


# ── Fine-grained permissions ─────────────────────────────────────────────────

class PermissionsUpdate(BaseModel):
    extra_permissions: List[str] = Field(default_factory=list)


@router.get("/permissions")
async def list_available_permissions(current_user: dict = Depends(require_role(["admin"]))):
    """Return the list of all defined fine-grained permissions."""
    return {"permissions": AVAILABLE_PERMISSIONS}


@router.put("/users/{username}/permissions")
async def update_user_permissions(
    request: Request,
    username: str,
    body: PermissionsUpdate,
    current_user: dict = Depends(require_role(["admin"])),
):
    """
    Set the extra_permissions list for a user.
    Admin role has all permissions implicitly — setting extra_permissions on an
    admin is a no-op in practice but is stored for audit purposes.
    Unknown permissions are silently filtered to prevent typos in production.
    """
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    user = await db.users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Filter to only known permissions
    valid_perms = [p for p in body.extra_permissions if p in AVAILABLE_PERMISSIONS]

    await db.users.update_one(
        {"username": username},
        {"$set": {"extra_permissions": valid_perms}},
    )

    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="permissions_updated",
        target=username,
        ip=ip,
        result="success",
        detail=str(valid_perms),
    )
    return {"username": username, "extra_permissions": valid_perms}


# ── User Import / Export ─────────────────────────────────────────────────────

_VALID_ROLES = {"admin", "manager", "tech"}
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_EXPORT_OMIT = {"password_hash", "mfa_secret_enc", "mfa_backup_codes", "password_history", "normalized_email"}
_IMPORT_COLUMNS = {"username", "name", "role", "email", "preferred_lang"}


class SMTPConfigUpdate(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = Field(None, ge=1, le=65535)
    username: Optional[str] = None
    password: Optional[str] = None
    from_email: Optional[str] = None
    tls: Optional[bool] = None


class SMTPTestRequest(BaseModel):
    to_email: Optional[str] = None


class MISPConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    display_name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    verify_tls: Optional[bool] = None
    poll_interval_minutes: Optional[int] = Field(None, ge=1, le=1440)


@router.get("/operational-config/smtp")
async def read_smtp_operational_config(current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    return (await get_public_operational_config(db))["smtp"]


@router.put("/operational-config/smtp")
async def update_smtp_operational_config(
    request: Request,
    body: SMTPConfigUpdate,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    patch = {}
    if body.host is not None:
        patch["smtp_host"] = body.host
    if body.port is not None:
        patch["smtp_port"] = body.port
    if body.username is not None:
        patch["smtp_user"] = body.username
    if body.password is not None:
        patch["smtp_pass"] = body.password
    if body.from_email is not None:
        normalized_from_email = normalize_email(body.from_email)
        if not normalized_from_email or not _EMAIL_RE.match(normalized_from_email):
            raise HTTPException(status_code=400, detail="Invalid SMTP from email.")
        patch["smtp_from"] = normalized_from_email
    if body.tls is not None:
        patch["smtp_tls"] = body.tls

    if not patch:
        raise HTTPException(status_code=400, detail="No SMTP fields provided.")

    try:
        public_view = await update_operational_config(
            db,
            patch,
            updated_by=current_user["username"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ip = request.client.host if request.client else ""
    detail_fields = sorted(patch.keys())
    await log_action(
        db,
        user=current_user["username"],
        action="smtp_config_updated",
        ip=ip,
        result="success",
        detail="fields=" + ",".join(detail_fields),
    )
    return public_view["smtp"]


@router.post("/operational-config/smtp/test")
@limiter.limit("3/minute", error_message="Too many SMTP test attempts. Try again later.")
async def test_smtp_operational_config(
    request: Request,
    body: SMTPTestRequest,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    to_email = normalize_email(body.to_email) if body.to_email else None
    if not to_email:
        current_user_record = await db.users.find_one({"username": current_user["username"]})
        to_email = normalize_email((current_user_record or {}).get("email"))
    if not to_email:
        raise HTTPException(status_code=400, detail="A target email is required for SMTP test.")
    if not _EMAIL_RE.match(to_email):
        raise HTTPException(status_code=400, detail="Invalid target email for SMTP test.")

    success = await send_smtp_test_email(to_email)
    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="smtp_test_sent" if success else "smtp_test_failed",
        target=to_email,
        ip=ip,
        result="success" if success else "failure",
    )
    if not success:
        raise HTTPException(status_code=502, detail="SMTP test failed.")
    return {"message": "SMTP test email sent.", "to_email": to_email}


@router.get("/operational-status")
async def read_operational_status(current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    return await get_operational_status_snapshot(db)


@router.get("/threat-sources")
async def read_threat_sources(current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    return {"sources": await get_public_threat_sources(db)}


@router.get("/threat-sources/misp")
async def read_misp_source(current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    return await get_public_threat_source(db, "misp_events")


@router.put("/threat-sources/misp")
async def update_misp_source(
    request: Request,
    body: MISPConfigUpdate,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(status_code=400, detail="No MISP fields provided.")

    try:
        public_view = await update_misp_source_config(
            db,
            patch,
            updated_by=current_user["username"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ip = request.client.host if request.client else ""
    detail_fields = sorted(patch.keys())
    await log_action(
        db,
        user=current_user["username"],
        action="misp_config_updated",
        ip=ip,
        result="success",
        detail="fields=" + ",".join(detail_fields),
    )
    return public_view


@router.post("/threat-sources/misp/test")
@limiter.limit("3/minute", error_message="Too many MISP test attempts. Try again later.")
async def test_misp_source(
    request: Request,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    source = await get_runtime_threat_source(db, "misp_events")
    config = source.get("config", {})
    if not config.get("base_url"):
        raise HTTPException(status_code=400, detail="MISP base URL is not configured.")
    if config.get("api_key_decryption_error"):
        raise HTTPException(status_code=502, detail="Stored MISP API key is unreadable. Save it again.")
    if not config.get("api_key"):
        raise HTTPException(status_code=400, detail="MISP API key is not configured.")

    client = MISPClient(
        base_url=config["base_url"],
        api_key=config["api_key"],
        verify_tls=bool(config.get("verify_tls", True)),
    )

    ip = request.client.host if request.client else ""
    try:
        result = await client.test_connection()
    except Exception as exc:
        await log_action(
            db,
            user=current_user["username"],
            action="misp_test_failed",
            ip=ip,
            result="failure",
            detail=str(exc),
        )
        raise HTTPException(status_code=502, detail="MISP connectivity test failed.") from exc

    await log_action(
        db,
        user=current_user["username"],
        action="misp_test_succeeded",
        ip=ip,
        result="success",
        detail=f"version={result.get('version', 'unknown')}",
    )
    return {"message": "MISP connectivity test succeeded.", **result}


def _generate_temporary_password(policy: dict) -> str:
    """
    Generate a temporary password that satisfies the active password policy.
    """
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()-_=+"
    min_length = max(int(policy.get("min_length", 12) or 12), 12)

    required_parts: list[str] = []
    if policy.get("require_uppercase", False):
        required_parts.append(secrets.choice(string.ascii_uppercase))
    if policy.get("require_numbers", False):
        required_parts.append(secrets.choice(string.digits))
    if policy.get("require_symbols", False):
        required_parts.append(secrets.choice("!@#$%^&*()-_=+"))
    required_parts.append(secrets.choice(string.ascii_lowercase))

    for _ in range(20):
        chars = required_parts[:]
        while len(chars) < min_length:
            chars.append(secrets.choice(alphabet))
        secrets.SystemRandom().shuffle(chars)
        password = "".join(chars)
        if not validate_password(password, policy):
            return password

    raise RuntimeError("Could not generate temporary password satisfying active policy.")


def _sanitize_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k not in _EXPORT_OMIT and k != "_id"}


def _serialize_export(items: list) -> list:
    for item in items:
        for key, val in item.items():
            if hasattr(val, "isoformat"):
                item[key] = val.isoformat()
    return items


@router.get("/users/export")
async def export_users(
    current_user: dict = Depends(require_role(["admin"])),
    format: str = Query("csv", pattern="^(csv|json)$"),
):
    """Export user list (sanitized) as CSV or JSON."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    users = await db.users.find({}).to_list(length=10000)
    safe = _serialize_export([_sanitize_user(u) for u in users])

    if format == "json":
        content = json.dumps(safe, ensure_ascii=False, indent=2)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=users_export.json"},
        )

    # CSV
    fieldnames = ["username", "name", "role", "email", "preferred_lang", "is_active",
                  "mfa_enabled", "last_login_at", "password_changed_at", "extra_permissions"]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    for row in safe:
        if isinstance(row.get("extra_permissions"), list):
            row["extra_permissions"] = "|".join(row["extra_permissions"])
        writer.writerow(row)
    return Response(
        content=output.getvalue().encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_export.csv"},
    )


@router.post("/users/import")
async def import_users(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role(["admin"])),
):
    """
    Bulk-import users from a CSV file.
    Required columns: username, name, role
    Optional columns: email, preferred_lang
    Passwords are auto-generated; force_password_reset is set to True.
    """
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    contents = await file.read()
    try:
        text = contents.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded.")

    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)

    if len(rows) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 users per import.")

    policy = await get_password_policy(db)
    now = datetime.now(timezone.utc)
    created = 0
    skipped = 0
    errors: list[dict] = []
    temporary_credentials: list[dict] = []
    batch_usernames: set[str] = set()
    batch_emails: set[str] = set()

    for i, row in enumerate(rows, start=2):  # row 1 is header
        username = (row.get("username") or "").strip().lower()
        name = (row.get("name") or "").strip()
        role = (row.get("role") or "tech").strip().lower()
        email = normalize_email(row.get("email"))
        preferred_lang = (row.get("preferred_lang") or "pt").strip().lower()

        # Validate
        if not username:
            errors.append({"row": i, "reason": "missing_username"})
            continue
        if not name:
            errors.append({"row": i, "reason": "missing_name", "username": username})
            continue
        if role not in _VALID_ROLES:
            errors.append({"row": i, "reason": f"invalid_role:{role}", "username": username})
            continue
        if email and not _EMAIL_RE.match(email):
            errors.append({"row": i, "reason": "invalid_email", "username": username})
            continue
        if preferred_lang not in {"pt", "en", "es"}:
            preferred_lang = "pt"
        if username in batch_usernames:
            errors.append({"row": i, "reason": "duplicate_username_in_file", "username": username})
            continue
        if email and email in batch_emails:
            errors.append({"row": i, "reason": "duplicate_email_in_file", "username": username})
            continue

        existing = await db.users.find_one({"username": username})
        if existing:
            skipped += 1
            continue
        if await email_in_use(db, email):
            errors.append({"row": i, "reason": "email_already_in_use", "username": username})
            continue

        raw_password = _generate_temporary_password(policy)
        hashed = get_password_hash(raw_password)

        await db.users.insert_one({
            "username": username,
            "name": name,
            "role": role,
            "email": email,
            "normalized_email": email,
            "preferred_lang": preferred_lang,
            "password_hash": hashed,
            "password_history": [hashed],
            "password_changed_at": now,
            "force_password_reset": True,
            "is_active": True,
            "failed_login_count": 0,
            "locked_until": None,
            "last_failed_at": None,
            "last_login_at": None,
            "mfa_enabled": False,
            "mfa_secret_enc": None,
            "mfa_backup_codes": [],
            "extra_permissions": [],
        })
        created += 1
        batch_usernames.add(username)
        if email:
            batch_emails.add(email)
        temporary_credentials.append({
            "username": username,
            "temporary_password": raw_password,
            "email": email,
        })

    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="bulk_import",
        ip=ip,
        result="success",
        detail=f"created={created}, skipped={skipped}, errors={len(errors)}",
    )
    return {
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "temporary_credentials": temporary_credentials,
    }


# ── PII masking (LGPD) ───────────────────────────────────────────────────────

_EMAIL_MASK_RE = re.compile(r"^(.)([^@]*)(@.+)$")


def _mask_pii_value(value: str) -> str:
    """Mask email-like targets: j***@example.com"""
    if not value or "@" not in value:
        return value
    m = _EMAIL_MASK_RE.match(value)
    if m:
        return f"{m.group(1)}***{m.group(3)}"
    return value


def _mask_audit_items(items: list) -> list:
    """Apply PII masking to target and detail fields in audit log entries."""
    for item in items:
        if item.get("target"):
            item["target"] = _mask_pii_value(item["target"])
        if item.get("detail"):
            item["detail"] = _mask_pii_value(item["detail"])
    return items


# ── Audit Log helpers ────────────────────────────────────────────────────────

def _build_audit_query(
    user: Optional[str],
    action: Optional[str],
    result: Optional[str],
    ip: Optional[str],
    from_date: Optional[str],
    to_date: Optional[str],
) -> dict:
    query: dict = {}
    if user:
        query["user"] = user
    if action:
        query["action"] = action
    if result:
        query["result"] = result
    if ip:
        query["ip"] = ip
    ts_filter: dict = {}
    if from_date:
        try:
            ts_filter["$gte"] = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid from_date format; use ISO 8601 (e.g. 2024-01-01T00:00:00Z)")
    if to_date:
        try:
            ts_filter["$lte"] = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid to_date format; use ISO 8601 (e.g. 2024-01-01T00:00:00Z)")
    if ts_filter:
        query["timestamp"] = ts_filter
    return query


def _serialize_items(items: list) -> list:
    for item in items:
        ts = item.get("timestamp")
        if hasattr(ts, "isoformat"):
            item["timestamp"] = ts.isoformat()
        item.pop("_id", None)
    return items


# ── Audit Log endpoints ──────────────────────────────────────────────────────

@router.get("/audit-logs")
async def get_audit_logs(
    current_user: dict = Depends(require_permission("audit_logs:read")),
    user: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = None,
    ip: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    """Paginated audit log for admins with optional filters."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    query = _build_audit_query(user, action, result, ip, from_date, to_date)
    skip = (page - 1) * page_size
    total = await db.audit_log.count_documents(query)
    items = await db.audit_log.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(page_size).to_list(length=page_size)
    pages = max(1, (total + page_size - 1) // page_size)
    serialized = _serialize_items(items)

    # Apply PII masking if enabled in policy
    policy = await get_password_policy(db)
    if policy.get("mask_pii", True):
        _mask_audit_items(serialized)

    return {"items": serialized, "total": total, "page": page, "pages": pages}


@router.get("/audit-logs/export")
async def export_audit_logs(
    current_user: dict = Depends(require_permission("audit_logs:read")),
    format: str = Query("csv", pattern="^(csv|json)$"),
    user: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = None,
    ip: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
):
    """Download audit log as CSV or JSON."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    query = _build_audit_query(user, action, result, ip, from_date, to_date)
    items = await db.audit_log.find(query, {"_id": 0}).sort("timestamp", -1).to_list(length=10000)
    _serialize_items(items)

    # Apply PII masking if enabled
    policy = await get_password_policy(db)
    if policy.get("mask_pii", True):
        _mask_audit_items(items)

    if format == "json":
        content = json.dumps(items, ensure_ascii=False, indent=2)
        return StreamingResponse(
            iter([content]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=audit_log.json"},
        )

    # CSV
    fieldnames = ["timestamp", "user", "action", "target", "result", "ip", "detail"]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(items)
    return StreamingResponse(
        iter([output.getvalue().encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
    )

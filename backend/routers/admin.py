import csv
import io
import json
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, Query, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List

from db import db_manager
from auth import require_role, require_permission, AVAILABLE_PERMISSIONS, get_password_hash
from policies import get_password_policy, DEFAULT_PASSWORD_POLICY
from audit import log_action
from logging_config import get_logger

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
_EXPORT_OMIT = {"password_hash", "mfa_secret_enc", "mfa_backup_codes", "password_history"}
_IMPORT_COLUMNS = {"username", "name", "role", "email", "preferred_lang"}


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
        return StreamingResponse(
            iter([content]),
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
    return StreamingResponse(
        iter([output.getvalue().encode("utf-8-sig")]),
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

    for i, row in enumerate(rows, start=2):  # row 1 is header
        username = (row.get("username") or "").strip().lower()
        name = (row.get("name") or "").strip()
        role = (row.get("role") or "tech").strip().lower()
        email = (row.get("email") or "").strip().lower() or None
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

        existing = await db.users.find_one({"username": username})
        if existing:
            skipped += 1
            continue

        # Generate a random password that satisfies basic policy
        raw_password = secrets.token_urlsafe(14)
        hashed = get_password_hash(raw_password)

        await db.users.insert_one({
            "username": username,
            "name": name,
            "role": role,
            "email": email,
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

    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="bulk_import",
        ip=ip,
        result="success",
        detail=f"created={created}, skipped={skipped}, errors={len(errors)}",
    )
    return {"created": created, "skipped": skipped, "errors": errors}


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
    return {"items": _serialize_items(items), "total": total, "page": page, "pages": pages}


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

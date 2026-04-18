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
from auth import get_current_user, require_role, require_permission, AVAILABLE_PERMISSIONS, get_password_hash
from extensions import get_configured_plugin_roots, get_extensions_catalog
from identity import email_in_use, normalize_email
from policies import get_password_policy, validate_password
from audit import log_action
from logging_config import get_logger
from limiters import limiter
from operational_config import get_public_operational_config, update_operational_config
from operational_status import (
    get_operational_event_stream,
    get_operational_status_history,
    get_operational_status_snapshot,
)
from mailer import SMTPDeliveryError, deliver_smtp_test_email
from threat_ingestion import (
    get_public_threat_source,
    get_public_threat_sources,
    get_runtime_threat_source,
    get_runtime_threat_sources,
    update_misp_source_config,
    create_custom_source,
    update_custom_source,
    delete_custom_source,
    update_threat_source,
    get_threat_source_history,
    estimate_threat_source_payload_bytes,
    CUSTOM_PREFIX,
)
from threat_misp import MISPClient
from threat_ingestion_runtime import sync_threat_source

logger = get_logger("AdminRouter")

router = APIRouter(prefix="/admin", tags=["admin"])
PASSWORD_RESET_REQUIRED = True
EMPTY_SECRET_VALUE = None

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
    prevent_common_passwords: Optional[bool] = None
    prevent_breached_passwords: Optional[bool] = None


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


@router.get("/security-policies/export")
async def export_security_policies(
    current_user: dict = Depends(require_role(["admin"])),
    format: str = Query("json", pattern="^(json|csv)$"),
):
    """Export the current password + lockout policy state."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    password_policy = await get_password_policy(db)
    lockout_policy = await get_lockout_policy(db)
    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "password_policy": password_policy,
        "lockout_policy": lockout_policy,
    }

    if format == "csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["scope", "key", "value"])
        for scope, values in (("password_policy", password_policy), ("lockout_policy", lockout_policy)):
            for key, value in values.items():
                writer.writerow([scope, key, value])
        return Response(
            content=buffer.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=security_policies.csv"},
        )

    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=security_policies.json"},
    )


@router.get("/security-policies/timeline")
async def get_security_policy_timeline(
    current_user: dict = Depends(require_role(["admin"])),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """Dedicated governance timeline for password and lockout policy changes."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    query = {"action": {"$in": ["password_policy_changed", "lockout_policy_changed"]}}
    skip = (page - 1) * page_size
    total = await db.audit_log.count_documents(query)
    items = (
        await db.audit_log.find(query, {"_id": 0}).sort("timestamp", -1).skip(skip).limit(page_size).to_list(length=page_size)
    )
    serialized = _serialize_items(items)
    policy = await get_password_policy(db)
    if policy.get("mask_pii", True):
        _mask_audit_items(serialized)
    pages = max(1, (total + page_size - 1) // page_size)
    return {"items": serialized, "total": total, "page": page, "pages": pages}


@router.get("/stats")
async def get_admin_stats(current_user: dict = Depends(require_role(["admin", "manager"]))):
    """IAM metrics for the admin dashboard."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(hours=24)

    total_users = await db.users.count_documents({})
    active_users = await db.users.count_documents({"is_active": True})
    suspended_users = total_users - active_users
    locked_accounts = await db.users.count_documents(
        {"locked_until": {"$gt": now}}
    )
    users_with_mfa = await db.users.count_documents({"mfa_enabled": True})
    failed_logins_24h = await db.users.count_documents(
        {"last_failed_at": {"$gt": yesterday}}
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


def _compute_extension_health_score(item: dict) -> int:
    status = str(item.get("status") or "").lower()
    base = 100
    if status == "disabled":
        base = 62
    elif status == "incompatible":
        base = 38
    elif status == "invalid":
        base = 25
    elif status == "detected":
        base = 72

    base -= min(15, len(item.get("requiredSecrets") or []) * 3)
    if item.get("requiresKali"):
        base -= 10
    if item.get("requiresBrowserAutomation"):
        base -= 8
    if item.get("requiresCustomBinaries"):
        base -= 6
    return max(15, min(100, base))


def _compute_extension_runtime_overhead(item: dict) -> str:
    weight = str(item.get("dependencyWeight") or "").lower()
    score = 0
    if weight == "heavy":
        score += 2
    elif weight == "medium":
        score += 1
    if item.get("requiresKali"):
        score += 2
    if item.get("requiresBrowserAutomation"):
        score += 2
    if item.get("requiresCustomBinaries"):
        score += 1
    if len(item.get("requiredSecrets") or []) >= 3:
        score += 1
    if score >= 4:
        return "high"
    if score >= 2:
        return "medium"
    return "low"


async def _read_extension_runtime_states(db) -> dict[str, dict]:
    if db is None:
        return {}
    items = await db.extension_catalog_state.find({}).to_list(length=500)
    return {item["key"]: item for item in items if item.get("key")}


def _merge_extension_catalog_state(catalog: list[dict], state_map: dict[str, dict]) -> list[dict]:
    merged: list[dict] = []
    for item in catalog:
        key = str(item.get("key") or "")
        state = state_map.get(key, {})
        if state.get("hidden"):
            continue

        next_item = {
            **item,
            "id": key or item.get("id"),
            "slug": key or item.get("slug"),
            "installState": "installed" if state.get("installed_at") else "detected",
            "operationalState": {
                "enabled": state.get("enabled", item.get("status") != "disabled"),
                "hidden": state.get("hidden", False),
                "last_action": state.get("last_action"),
                "last_action_at": state.get("last_action_at"),
                "installed_at": state.get("installed_at"),
                "last_updated_at": state.get("last_updated_at"),
            },
        }

        status = str(next_item.get("status") or "unknown").lower()
        if state.get("enabled") is False and status in {"enabled", "detected"}:
            next_item["status"] = "disabled"
        elif state.get("enabled") is True and status in {"disabled", "detected"}:
            next_item["status"] = "enabled"

        next_item["healthScore"] = _compute_extension_health_score(next_item)
        next_item["runtimeOverhead"] = _compute_extension_runtime_overhead(next_item)
        next_item["updateAvailable"] = status in {"deprecated"} or "rc" in str(next_item.get("version") or "").lower()
        merged.append(next_item)

    return merged


async def _set_extension_catalog_state(
    db,
    key: str,
    *,
    enabled: bool | None = None,
    hidden: bool | None = None,
    last_action: str,
    actor: str,
):
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    current = await db.extension_catalog_state.find_one({"key": key}) or {"key": key}
    now = datetime.now(timezone.utc)
    next_state = dict(current)
    if enabled is not None:
        next_state["enabled"] = enabled
    if hidden is not None:
        next_state["hidden"] = hidden
    if last_action == "install" and not next_state.get("installed_at"):
        next_state["installed_at"] = now
    if last_action == "update":
        next_state["last_updated_at"] = now
    next_state["last_action"] = last_action
    next_state["last_action_at"] = now
    next_state["updated_by"] = actor
    await db.extension_catalog_state.replace_one({"key": key}, next_state, upsert=True)
    return {field: value for field, value in next_state.items() if field != "_id"}


@router.get("/extensions")
async def read_extensions_catalog(
    request: Request,
    refresh: bool = Query(False),
    current_user: dict = Depends(require_role(["admin", "manager"])),
):
    """
    Read-only extension catalog for the extensibility MVP.
    """
    db = db_manager.db
    catalog = get_extensions_catalog(request.app, refresh=refresh)
    state_map = await _read_extension_runtime_states(db)
    return {
        "items": _merge_extension_catalog_state(catalog, state_map),
        "core_version": request.app.version,
        "search_roots": [
            {
                "scope": root["scope"],
                "label": root["label"],
                "repository_visibility": root["repositoryVisibility"],
            }
            for root in get_configured_plugin_roots()
        ],
    }


@router.post("/extensions/{extension_key}/install")
async def install_extension(
    extension_key: str,
    request: Request,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    catalog = get_extensions_catalog(request.app, refresh=True)
    if not any(item.get("key") == extension_key for item in catalog):
        raise HTTPException(status_code=404, detail="Extension not found")

    state = await _set_extension_catalog_state(
        db,
        extension_key,
        enabled=True,
        hidden=False,
        last_action="install",
        actor=current_user["username"],
    )
    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="extension_installed",
        target=extension_key,
        ip=ip,
        result="success",
    )
    return {"key": extension_key, "state": state}


@router.post("/extensions/{extension_key}/enable")
async def enable_extension(
    extension_key: str,
    request: Request,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    state = await _set_extension_catalog_state(
        db,
        extension_key,
        enabled=True,
        hidden=False,
        last_action="enable",
        actor=current_user["username"],
    )
    ip = request.client.host if request.client else ""
    await log_action(db, user=current_user["username"], action="extension_enabled", target=extension_key, ip=ip, result="success")
    return {"key": extension_key, "state": state}


@router.post("/extensions/{extension_key}/disable")
async def disable_extension(
    extension_key: str,
    request: Request,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    state = await _set_extension_catalog_state(
        db,
        extension_key,
        enabled=False,
        hidden=False,
        last_action="disable",
        actor=current_user["username"],
    )
    ip = request.client.host if request.client else ""
    await log_action(db, user=current_user["username"], action="extension_disabled", target=extension_key, ip=ip, result="success")
    return {"key": extension_key, "state": state}


@router.post("/extensions/{extension_key}/update")
async def update_extension_runtime(
    extension_key: str,
    request: Request,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    catalog = get_extensions_catalog(request.app, refresh=True)
    if not any(item.get("key") == extension_key for item in catalog):
        raise HTTPException(status_code=404, detail="Extension not found")

    state = await _set_extension_catalog_state(
        db,
        extension_key,
        last_action="update",
        actor=current_user["username"],
    )
    ip = request.client.host if request.client else ""
    await log_action(db, user=current_user["username"], action="extension_updated", target=extension_key, ip=ip, result="success")
    return {"key": extension_key, "state": state}


@router.delete("/extensions/{extension_key}")
async def remove_extension_from_catalog(
    extension_key: str,
    request: Request,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    state = await _set_extension_catalog_state(
        db,
        extension_key,
        enabled=False,
        hidden=True,
        last_action="remove",
        actor=current_user["username"],
    )
    ip = request.client.host if request.client else ""
    await log_action(db, user=current_user["username"], action="extension_removed", target=extension_key, ip=ip, result="success")
    return {"key": extension_key, "state": state}


@router.get("/extensions/features")
async def read_active_premium_features(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Lightweight endpoint returning which premium feature types are active.
    Available to any authenticated user (used by sidebar visibility).
    """
    db = db_manager.db
    catalog = get_extensions_catalog(request.app)
    state_map = await _read_extension_runtime_states(db)
    merged_catalog = _merge_extension_catalog_state(catalog, state_map)
    active = set()
    for ext in merged_catalog:
        if (
            ext.get("kind") == "premium_feature"
            and ext.get("status") == "enabled"
            and ext.get("premiumFeatureType")
        ):
            active.add(ext["premiumFeatureType"])
    return {"features": sorted(active)}


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


class CustomSourceCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    feed_url: str = Field(..., min_length=1)
    family: str = Field(default="custom", max_length=50)
    poll_interval_minutes: int = Field(default=60, ge=1, le=1440)
    default_tlp: str = Field(default="white", max_length=10)


class CustomSourceUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=200)
    feed_url: Optional[str] = None
    family: Optional[str] = Field(None, max_length=50)
    enabled: Optional[bool] = None
    poll_interval_minutes: Optional[int] = Field(None, ge=1, le=1440)
    default_tlp: Optional[str] = Field(None, max_length=10)


class BuiltinThreatSourceUpdate(BaseModel):
    display_name: Optional[str] = Field(None, max_length=200)
    feed_url: Optional[str] = None
    poll_interval_minutes: Optional[int] = Field(None, ge=1, le=1440)
    severity_floor: Optional[str] = Field(None, max_length=10)


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

    ip = request.client.host if request.client else ""
    try:
        result = await deliver_smtp_test_email(to_email)
    except SMTPDeliveryError as exc:
        smtp_public_config = (await get_public_operational_config(db))["smtp"]
        await log_action(
            db,
            user=current_user["username"],
            action="smtp_test_failed",
            target=to_email,
            ip=ip,
            result="failure",
            detail=f"code={exc.code}",
        )
        status_code = 400 if exc.code == "smtp_not_configured" else 502
        raise HTTPException(
            status_code=status_code,
            detail=exc.to_detail(smtp=smtp_public_config, to_email=to_email),
        ) from exc

    await log_action(
        db,
        user=current_user["username"],
        action="smtp_test_sent",
        target=to_email,
        ip=ip,
        result="success",
    )
    return result


@router.get("/operational-status")
async def read_operational_status(current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    return await get_operational_status_snapshot(db)


@router.get("/operational-status/history")
async def read_operational_status_history(
    current_user: dict = Depends(require_role(["admin"])),
    limit: int = Query(24, ge=6, le=96),
):
    db = db_manager.db
    return {"items": await get_operational_status_history(db, limit=limit)}


@router.get("/operational-events")
async def read_operational_events(
    current_user: dict = Depends(require_role(["admin"])),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
):
    db = db_manager.db
    return await get_operational_event_stream(db, page=page, page_size=page_size)


# ── Service restart (requires services:restart permission) ───────────────────

RESTARTABLE_SERVICES = {
    "scheduler": "APScheduler (daily scan of safe targets)",
    "worker": "Watchlist rescan worker",
    "recon": "Recon scheduled scan checker",
    "threat_ingestion": "Threat ingestion feed sync",
}


@router.post("/services/{service_name}/restart")
async def restart_service(
    service_name: str,
    request: Request,
    current_user: dict = Depends(require_permission("services:restart")),
):
    if service_name not in RESTARTABLE_SERVICES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown service: {service_name}. Valid: {', '.join(sorted(RESTARTABLE_SERVICES))}",
        )

    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    ip = request.client.host if request.client else ""

    try:
        if service_name == "scheduler":
            from worker import scan_safe_targets_job
            await scan_safe_targets_job()
        elif service_name == "worker":
            from worker import run_watchlist_scan
            await run_watchlist_scan()
        elif service_name == "recon":
            from worker import run_scheduled_recon
            await run_scheduled_recon()
        elif service_name == "threat_ingestion":
            from threat_ingestion_runtime import execute_threat_ingestion_worker_cycle
            await execute_threat_ingestion_worker_cycle(db)
    except Exception as exc:
        await log_action(
            db,
            user=current_user["username"],
            action="service_restart",
            ip=ip,
            result="failure",
            detail=f"service={service_name}, error={str(exc)[:200]}",
        )
        raise HTTPException(status_code=502, detail=f"Service restart failed: {str(exc)[:200]}") from exc

    await log_action(
        db,
        user=current_user["username"],
        action="service_restart",
        ip=ip,
        result="success",
        detail=f"service={service_name}",
    )
    return {
        "message": f"Service '{service_name}' restarted successfully.",
        "service": service_name,
        "description": RESTARTABLE_SERVICES[service_name],
    }


@router.get("/threat-sources")
async def read_threat_sources(current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    return {"sources": await get_public_threat_sources(db)}


@router.put("/threat-sources/{source_id}/config")
async def update_builtin_threat_source(
    source_id: str,
    request: Request,
    body: BuiltinThreatSourceUpdate,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    if source_id == "misp_events":
        raise HTTPException(status_code=400, detail="MISP uses a dedicated configuration endpoint.")
    if source_id.startswith(CUSTOM_PREFIX):
        raise HTTPException(status_code=400, detail="Custom sources use the custom source update endpoint.")

    body_data = body.model_dump(exclude_none=True)
    patch: dict = {}
    config_patch: dict = {}

    if "display_name" in body_data:
        patch["display_name"] = body_data["display_name"]
    if "feed_url" in body_data:
        config_patch["feed_url"] = body_data["feed_url"]
    if "poll_interval_minutes" in body_data:
        config_patch["poll_interval_minutes"] = body_data["poll_interval_minutes"]
    if "severity_floor" in body_data:
        config_patch["severity_floor"] = body_data["severity_floor"]
    if config_patch:
        patch["config"] = config_patch

    if not patch:
        raise HTTPException(status_code=400, detail="No fields provided.")

    try:
        await update_threat_source(
            db,
            source_id,
            patch,
            updated_by=current_user["username"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="threat_source_updated",
        target=source_id,
        ip=ip,
        result="success",
        detail=f"fields={','.join(sorted(body_data.keys()))}",
    )
    return await get_public_threat_source(db, source_id)


async def _update_source_enabled_state(db, source_id: str, enabled: bool, updated_by: str) -> dict:
    if source_id.startswith(CUSTOM_PREFIX):
        return await update_custom_source(db, source_id, {"enabled": enabled}, updated_by=updated_by)
    return await update_threat_source(db, source_id, {"enabled": enabled}, updated_by=updated_by)


@router.post("/threat-sources/{source_id}/sync")
async def sync_threat_source_now(
    source_id: str,
    request: Request,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    sources = await get_runtime_threat_sources(db)
    source = next((item for item in sources if item["source_id"] == source_id), None)
    if not source:
        raise HTTPException(status_code=404, detail="Threat source not found.")

    result = await sync_threat_source(db, source)
    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="threat_source_sync_requested",
        target=source_id,
        ip=ip,
        result="success" if result.get("status") == "success" else "partial",
        detail=f"status={result.get('status')}, items={result.get('items_ingested', 0)}",
    )
    return result


@router.post("/threat-sources/{source_id}/pause")
async def pause_threat_source(
    source_id: str,
    request: Request,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    try:
        updated = await _update_source_enabled_state(db, source_id, False, current_user["username"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="threat_source_paused",
        target=source_id,
        ip=ip,
        result="success",
    )
    return updated


@router.post("/threat-sources/{source_id}/resume")
async def resume_threat_source(
    source_id: str,
    request: Request,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    try:
        updated = await _update_source_enabled_state(db, source_id, True, current_user["username"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="threat_source_resumed",
        target=source_id,
        ip=ip,
        result="success",
    )
    return updated


@router.get("/threat-sources/{source_id}/metrics")
async def read_threat_source_metrics(
    source_id: str,
    current_user: dict = Depends(require_role(["admin"])),
    window_hours: int = Query(24, ge=1, le=168),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    sources = await get_runtime_threat_sources(db)
    source = next((item for item in sources if item["source_id"] == source_id), None)
    if not source:
        raise HTTPException(status_code=404, detail="Threat source not found.")

    history = await get_threat_source_history(db, source_id, limit=24)
    since = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    approx_bytes = await estimate_threat_source_payload_bytes(db, source_id, since=since)
    throughput_gb_per_day = 0.0
    if window_hours > 0:
        throughput_gb_per_day = round((approx_bytes * (24 / window_hours)) / (1024 ** 3), 4)

    duration_series = []
    for item in reversed(history):
        duration_series.append(
            {
                "timestamp": item.get("last_run_at") or item.get("recorded_at"),
                "duration_ms": item.get("duration_ms"),
                "status": item.get("status"),
                "items_ingested": item.get("items_ingested", 0),
            }
        )

    return {
        "source_id": source_id,
        "window_hours": window_hours,
        "throughput_gb_per_day": throughput_gb_per_day,
        "approx_payload_bytes": approx_bytes,
        "duration_series": duration_series,
        "recent_events": history[:6],
        "current_status": source.get("sync_status", {}),
    }


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


# ── Custom (manual) RSS sources ──────────────────────────────────────────────


@router.post("/threat-sources/custom", status_code=201)
async def create_custom_threat_source(
    request: Request,
    body: CustomSourceCreate,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    try:
        source = await create_custom_source(
            db,
            title=body.title,
            feed_url=body.feed_url,
            family=body.family,
            poll_interval_minutes=body.poll_interval_minutes,
            default_tlp=body.default_tlp,
            created_by=current_user["username"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="custom_source_created",
        ip=ip,
        result="success",
        detail=f"source_id={source['source_id']}, url={body.feed_url}",
    )
    return source


@router.put("/threat-sources/custom/{source_id}")
async def update_custom_threat_source(
    source_id: str,
    request: Request,
    body: CustomSourceUpdate,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(status_code=400, detail="No fields provided.")

    try:
        updated = await update_custom_source(
            db, source_id, patch, updated_by=current_user["username"]
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="custom_source_updated",
        ip=ip,
        result="success",
        detail=f"source_id={source_id}, fields={','.join(sorted(patch.keys()))}",
    )
    return updated


@router.delete("/threat-sources/custom/{source_id}")
async def delete_custom_threat_source(
    source_id: str,
    request: Request,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    try:
        deleted = await delete_custom_source(db, source_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not deleted:
        raise HTTPException(status_code=404, detail="Custom source not found.")

    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="custom_source_deleted",
        ip=ip,
        result="success",
        detail=f"source_id={source_id}",
    )
    return {"message": "Custom source deleted.", "source_id": source_id}


@router.delete("/threat-sources/orphaned-items")
async def purge_orphaned_threat_items(
    request: Request,
    current_user: dict = Depends(require_role(["admin"])),
):
    """Delete threat_items whose source_id no longer exists in any registered source."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    from threat_ingestion import SOURCE_CATALOG

    builtin_ids = set(SOURCE_CATALOG.keys())
    custom_cursor = db.custom_threat_sources.find({}, {"source_id": 1, "_id": 0})
    custom_ids = {doc["source_id"] async for doc in custom_cursor}
    active_ids = builtin_ids | custom_ids

    result = await db.threat_items.delete_many({"source_id": {"$nin": list(active_ids)}})
    deleted = result.deleted_count

    ip = request.client.host if request.client else ""
    await log_action(
        db,
        user=current_user["username"],
        action="orphaned_items_purged",
        ip=ip,
        result="success",
        detail=f"deleted={deleted}",
    )
    return {"deleted": deleted, "active_sources": sorted(active_ids)}


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
            "force_password_reset": PASSWORD_RESET_REQUIRED,
            "is_active": True,
            "failed_login_count": 0,
            "locked_until": None,
            "last_failed_at": None,
            "last_login_at": None,
            "mfa_enabled": False,
            "mfa_secret_enc": EMPTY_SECRET_VALUE,
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
    policy = await get_password_policy(db)
    mask = policy.get("mask_pii", True)
    batch_size = 500

    async def iter_batches():
        cursor = db.audit_log.find(query, {"_id": 0}).sort("timestamp", -1).batch_size(batch_size)
        buffer: list[dict] = []
        async for doc in cursor:
            buffer.append(doc)
            if len(buffer) >= batch_size:
                _serialize_items(buffer)
                if mask:
                    _mask_audit_items(buffer)
                yield buffer
                buffer = []
        if buffer:
            _serialize_items(buffer)
            if mask:
                _mask_audit_items(buffer)
            yield buffer

    if format == "json":
        async def json_stream():
            yield "["
            first = True
            async for batch in iter_batches():
                for item in batch:
                    prefix = "" if first else ","
                    first = False
                    yield prefix + json.dumps(item, ensure_ascii=False)
            yield "]"

        return StreamingResponse(
            json_stream(),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=audit_log.json"},
        )

    fieldnames = ["timestamp", "user", "action", "target", "result", "ip", "detail"]

    async def csv_stream():
        header_buf = io.StringIO()
        csv.DictWriter(header_buf, fieldnames=fieldnames, extrasaction="ignore").writeheader()
        yield header_buf.getvalue().encode("utf-8-sig")
        async for batch in iter_batches():
            chunk_buf = io.StringIO()
            writer = csv.DictWriter(chunk_buf, fieldnames=fieldnames, extrasaction="ignore")
            writer.writerows(batch)
            yield chunk_buf.getvalue().encode("utf-8")

    return StreamingResponse(
        csv_stream(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
    )

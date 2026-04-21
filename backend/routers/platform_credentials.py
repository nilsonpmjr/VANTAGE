"""
Admin endpoints for managing global platform API credentials.

Access: role=admin OR user has `apikeys:manage` permission.
"""

from __future__ import annotations

import re
from typing import Optional
from urllib.parse import urlparse

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from auth import require_permission
from audit import log_action
from db import db_manager
from logging_config import get_logger
import credential_manager as cm

logger = get_logger("PlatformCredentialsRouter")
router = APIRouter(prefix="/admin/platform-credentials", tags=["platform_credentials"])

AUTH_TYPES = {"header", "query_param", "bearer"}
SERVICE_ID_RE = re.compile(r"^[a-z][a-z0-9_]{1,31}$")


# ── Models ─────────────────────────────────────────────────────────────────────

class CredentialUpdate(BaseModel):
    value: str = Field(default="", description="Plaintext value; empty string clears")


class PlatformRegistration(BaseModel):
    service_id: str
    display_name: str
    env_var: str
    base_url: str
    auth_type: str
    auth_key_name: str
    rate_limit_calls: int = 10
    rate_limit_window_seconds: int = 60
    health_check_path: str = "/"

    @field_validator("service_id")
    @classmethod
    def _valid_service_id(cls, v: str) -> str:
        if not SERVICE_ID_RE.match(v):
            raise ValueError("service_id must be lowercase slug, start with letter, 2-32 chars")
        return v

    @field_validator("env_var")
    @classmethod
    def _valid_env_var(cls, v: str) -> str:
        if not re.match(r"^[A-Z][A-Z0-9_]{2,63}$", v):
            raise ValueError("env_var must be SCREAMING_SNAKE_CASE")
        return v

    @field_validator("base_url")
    @classmethod
    def _valid_base_url(cls, v: str) -> str:
        parsed = urlparse(v)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("base_url must be http(s)")
        if not parsed.netloc:
            raise ValueError("base_url must include a host")
        return v.rstrip("/")

    @field_validator("auth_type")
    @classmethod
    def _valid_auth_type(cls, v: str) -> str:
        if v not in AUTH_TYPES:
            raise ValueError(f"auth_type must be one of {sorted(AUTH_TYPES)}")
        return v

    @field_validator("rate_limit_calls", "rate_limit_window_seconds")
    @classmethod
    def _positive_int(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("must be positive")
        return v


class DisableToggle(BaseModel):
    disabled: bool


class RevealRequest(BaseModel):
    confirm: bool = False


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_platforms(
    current_user: dict = Depends(require_permission("apikeys:manage")),
):
    return {"platforms": await cm.list_platforms()}


@router.post("/sync-env")
async def sync_from_env(
    request: Request,
    current_user: dict = Depends(require_permission("apikeys:manage")),
):
    """Re-run bootstrap_from_env to import any credentials still only in .env."""
    await cm.bootstrap_from_env()
    platforms = await cm.list_platforms()
    db = db_manager.db
    if db is not None:
        ip = request.client.host if request.client else ""
        await log_action(
            db, user=current_user["username"], action="platform_credentials_synced",
            target="env", ip=ip, result="success",
        )
    return {"status": "success", "platforms": platforms}


@router.patch("/{service_id}")
async def update_credential(
    request: Request,
    service_id: str,
    body: CredentialUpdate,
    current_user: dict = Depends(require_permission("apikeys:manage")),
):
    actor = current_user["username"]
    try:
        await cm.set_credential(service_id, body.value, actor=actor)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    db = db_manager.db
    ip = request.client.host if request.client else ""
    action = "global_apikey_rotated" if body.value.strip() else "global_apikey_cleared"
    if db is not None:
        await log_action(db, user=actor, action=action, target=service_id, ip=ip, result="success")
    return {"status": "success"}


@router.post("/{service_id}/reveal")
async def reveal_credential(
    request: Request,
    service_id: str,
    body: RevealRequest,
    current_user: dict = Depends(require_permission("apikeys:manage")),
):
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm_required")

    actor = current_user["username"]
    if not await cm.check_reveal_rate(actor):
        raise HTTPException(status_code=429, detail="reveal_rate_limited")

    value = await cm.reveal_credential(service_id)
    if value is None:
        raise HTTPException(status_code=404, detail="not_configured")

    db = db_manager.db
    ip = request.client.host if request.client else ""
    if db is not None:
        await log_action(
            db, user=actor, action="credential_revealed",
            target=service_id, ip=ip, result="success",
        )
    return {"service_id": service_id, "value": value}


@router.patch("/{service_id}/disabled")
async def toggle_disabled(
    request: Request,
    service_id: str,
    body: DisableToggle,
    current_user: dict = Depends(require_permission("apikeys:manage")),
):
    await cm.set_disabled(service_id, body.disabled)
    db = db_manager.db
    ip = request.client.host if request.client else ""
    if db is not None:
        await log_action(
            db, user=current_user["username"],
            action="platform_disabled" if body.disabled else "platform_enabled",
            target=service_id, ip=ip, result="success",
        )
    return {"status": "success"}


@router.post("")
async def register_platform(
    request: Request,
    body: PlatformRegistration,
    current_user: dict = Depends(require_permission("apikeys:manage")),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    existing = await db[cm.PLATFORM_REGISTRY_COLLECTION].find_one({"_id": body.service_id})
    if existing:
        raise HTTPException(status_code=409, detail="service_id_exists")
    env_clash = await db[cm.PLATFORM_REGISTRY_COLLECTION].find_one({"env_var": body.env_var})
    if env_clash:
        raise HTTPException(status_code=409, detail="env_var_exists")

    entry = body.model_dump()
    entry["_id"] = entry.pop("service_id")
    doc = await cm.register_platform(entry, actor=current_user["username"])

    ip = request.client.host if request.client else ""
    await log_action(
        db, user=current_user["username"], action="platform_registered",
        target=body.service_id, ip=ip, result="success",
        detail=f"env_var={body.env_var}",
    )
    return {"status": "success", "platform": {**doc, "service_id": doc["_id"]}}


@router.delete("/{service_id}")
async def delete_platform(
    request: Request,
    service_id: str,
    current_user: dict = Depends(require_permission("apikeys:manage")),
):
    try:
        await cm.delete_platform(service_id)
    except ValueError as exc:
        msg = str(exc)
        if "Built-in" in msg:
            raise HTTPException(status_code=400, detail="builtin_cannot_delete")
        raise HTTPException(status_code=404, detail="unknown_service")

    db = db_manager.db
    ip = request.client.host if request.client else ""
    if db is not None:
        await log_action(
            db, user=current_user["username"], action="platform_deleted",
            target=service_id, ip=ip, result="success",
        )
    return {"status": "success"}


@router.post("/{service_id}/test")
async def test_platform(
    request: Request,
    service_id: str,
    current_user: dict = Depends(require_permission("apikeys:manage")),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    entry = await db[cm.PLATFORM_REGISTRY_COLLECTION].find_one({"_id": service_id})
    if not entry:
        raise HTTPException(status_code=404, detail="unknown_service")

    value = await cm.reveal_credential(service_id)

    url = entry["base_url"].rstrip("/") + entry.get("health_check_path", "/")
    headers: dict[str, str] = {}
    params: dict[str, str] = {}
    if value:
        auth_type = entry.get("auth_type", "header")
        auth_key = entry.get("auth_key_name") or ""
        if auth_type == "header":
            headers[auth_key] = value
        elif auth_type == "bearer":
            headers["Authorization"] = f"Bearer {value}"
        elif auth_type == "query_param":
            params[auth_key] = value

    status_code: Optional[int] = None
    body_preview: str = ""
    latency_ms: Optional[int] = None
    error: Optional[str] = None

    try:
        timeout = aiohttp.ClientTimeout(total=8)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            import time
            t0 = time.perf_counter()
            async with session.get(url, headers=headers, params=params) as resp:
                latency_ms = int((time.perf_counter() - t0) * 1000)
                status_code = resp.status
                text = await resp.text()
                body_preview = text[:240]
    except Exception as exc:
        error = str(exc)[:240]

    await cm.record_health_check(service_id, status_code or 0)

    ip = request.client.host if request.client else ""
    await log_action(
        db, user=current_user["username"], action="platform_test_run",
        target=service_id, ip=ip,
        result="success" if status_code and 200 <= status_code < 400 else "failure",
        detail=f"status={status_code} latency_ms={latency_ms}",
    )

    return {
        "service_id": service_id,
        "status_code": status_code,
        "latency_ms": latency_ms,
        "body_preview": body_preview,
        "error": error,
    }

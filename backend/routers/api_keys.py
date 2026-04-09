"""
API key endpoints.

Keys use the `vtg_` prefix. Only the SHA-256 digest is stored, and the raw key
is returned once at creation time.
"""

import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user, hash_api_key, require_role
from db import db_manager
from audit import log_action

VALID_SCOPES = ["analyze", "recon", "batch", "stats"]

router = APIRouter(prefix="/api-keys", tags=["api-keys"])

_KEY_PREFIX = "vtg_"
_KEY_RAND_BYTES = 24  # 48 hex chars -> 52-char total key


def _generate_raw_key() -> str:
    return _KEY_PREFIX + secrets.token_hex(_KEY_RAND_BYTES)


def _key_prefix_display(raw_key: str) -> str:
    """Return the first 12 chars of the key for safe display, e.g. 'vtg_a1b2c3d4'."""
    return raw_key[:12] + "…"


def _fmt(doc: dict) -> dict:
    """Serialize a key doc for API response (never expose key_hash)."""
    return {
        "key_id": doc["key_id"],
        "name": doc.get("name", ""),
        "prefix": doc.get("prefix", ""),
        "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at", ""),
        "expires_at": doc["expires_at"].isoformat() if isinstance(doc.get("expires_at"), datetime) else None,
        "last_used_at": doc["last_used_at"].isoformat() if isinstance(doc.get("last_used_at"), datetime) else None,
        "revoked": doc.get("revoked", False),
        "scopes": doc.get("scopes", ["analyze"]),
    }


# Request models

class CreateKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    expires_days: Optional[int] = Field(None, ge=1, le=3650)
    scopes: Optional[List[str]] = None  # Defaults to ["analyze"].


# Create an API key

@router.post("")
async def create_api_key(
    body: CreateKeyRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a new API key for the authenticated user.
    The raw key is returned ONCE — it cannot be retrieved again.
    """
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    raw_key = _generate_raw_key()
    key_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=body.expires_days) if body.expires_days else None

    # Keep only scopes supported by the current runtime.
    scopes = body.scopes or ["analyze"]
    scopes = [s for s in scopes if s in VALID_SCOPES]
    if not scopes:
        scopes = ["analyze"]

    await db.api_keys.insert_one({
        "key_id": key_id,
        "key_hash": hash_api_key(raw_key),
        "prefix": _key_prefix_display(raw_key),
        "name": body.name,
        "username": current_user["username"],
        "role": current_user["role"],
        "created_at": now,
        "expires_at": expires_at,
        "last_used_at": None,
        "revoked": False,
        "scopes": scopes,
    })

    ip = request.client.host if request.client else "unknown"
    await log_action(db, user=current_user["username"], action="api_key_created",
                     target=body.name, ip=ip)

    return {
        **_fmt({
            "key_id": key_id,
            "name": body.name,
            "prefix": _key_prefix_display(raw_key),
            "created_at": now,
            "expires_at": expires_at,
            "last_used_at": None,
            "revoked": False,
            "scopes": scopes,
        }),
        "key": raw_key,  # Returned once.
    }


# List the caller's API keys

@router.get("/me")
async def list_my_keys(current_user: dict = Depends(get_current_user)):
    """List all API keys for the authenticated user (no raw keys, no hashes)."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    cursor = db.api_keys.find({
        "username": current_user["username"],
        "revoked": False,
    })
    docs = await cursor.to_list(length=50)
    return [_fmt(d) for d in docs]


# Revoke an API key

@router.delete("/{key_id}")
async def revoke_api_key(
    key_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Revoke an API key by key_id.
    Users can only revoke their own keys; admins can revoke any key.
    """
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    doc = await db.api_keys.find_one({"key_id": key_id, "revoked": False})
    if not doc:
        raise HTTPException(status_code=404, detail="api_key_not_found")

    if current_user["role"] != "admin" and doc["username"] != current_user["username"]:
        raise HTTPException(status_code=403, detail="forbidden")

    await db.api_keys.update_one(
        {"key_id": key_id},
        {"$set": {"revoked": True}},
    )

    ip = request.client.host if request.client else "unknown"
    await log_action(db, user=current_user["username"], action="api_key_revoked",
                     target=doc.get("name", key_id), ip=ip)

    return {"revoked": True}


# List a user's API keys

@router.get("/admin/{username}")
async def list_user_keys(
    username: str,
    current_user: dict = Depends(require_role(["admin"])),
):
    """Admin: list all active API keys for any user."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    cursor = db.api_keys.find({"username": username, "revoked": False})
    docs = await cursor.to_list(length=50)
    return [_fmt(d) for d in docs]

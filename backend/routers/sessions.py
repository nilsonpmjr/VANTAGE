"""
Active session endpoints backed by the refresh token store.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from auth import get_current_user, require_role, hash_refresh_token
from db import db_manager
from audit import log_action
from session_revocation import revoke_refresh_session, revoke_user_refresh_tokens

router = APIRouter(prefix="/auth/sessions", tags=["sessions"])


def _parse_ua(user_agent: str) -> str:
    """Return a readable device/browser label from a User-Agent string."""
    if not user_agent:
        return "Dispositivo desconhecido"
    ua = user_agent.lower()
    # Browser
    if "edg/" in ua or "edge/" in ua:
        browser = "Edge"
    elif "opr/" in ua or "opera" in ua:
        browser = "Opera"
    elif "chrome" in ua and "chromium" not in ua:
        browser = "Chrome"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "safari" in ua and "chrome" not in ua:
        browser = "Safari"
    else:
        browser = "Navegador"
    # OS
    if "android" in ua:
        os_name = "Android"
    elif "iphone" in ua or "ipad" in ua:
        os_name = "iOS"
    elif "windows" in ua:
        os_name = "Windows"
    elif "macintosh" in ua or "mac os" in ua:
        os_name = "macOS"
    elif "linux" in ua:
        os_name = "Linux"
    else:
        os_name = ""
    return f"{browser}{' · ' + os_name if os_name else ''}"


def _fmt(doc: dict, current_token: str) -> dict:
    """Serialize a refresh_token doc into a safe session payload."""
    current_token_hash = hash_refresh_token(current_token) if current_token else None
    stored_hash = doc.get("token_hash")
    legacy_token = doc.get("token")
    return {
        "session_id": doc.get("session_id", ""),
        "ip": doc.get("ip") or "—",
        "device": _parse_ua(doc.get("user_agent", "")),
        "user_agent": doc.get("user_agent", ""),
        "created_at": doc["created_at"].isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at", ""),
        "expires_at": doc["expires_at"].isoformat() if isinstance(doc.get("expires_at"), datetime) else doc.get("expires_at", ""),
        "is_current": (stored_hash and stored_hash == current_token_hash) or (legacy_token and legacy_token == current_token),
    }


# List active sessions

@router.get("")
async def list_sessions(request: Request, current_user: dict = Depends(get_current_user)):
    """List all active (non-revoked, non-expired) sessions for the authenticated user."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    now = datetime.now(timezone.utc)
    current_token = request.cookies.get("refresh_token", "")

    cursor = db.refresh_tokens.find({
        "username": current_user["username"],
        "revoked": False,
        "expires_at": {"$gt": now},
    })
    docs = await cursor.to_list(length=100)
    # Skip legacy records created before session IDs were introduced.
    return [_fmt(d, current_token) for d in docs if d.get("session_id")]


# Revoke every other session

@router.delete("/others")
async def revoke_other_sessions(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Revoke all sessions for the current user except the one making this request."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    current_token = request.cookies.get("refresh_token", "")

    # Identify the current session before revoking the rest.
    cursor = db.refresh_tokens.find({
        "username": current_user["username"],
        "revoked": False,
    })
    docs = await cursor.to_list(length=200)

    current_token_hash = hash_refresh_token(current_token) if current_token else None
    current_session_id = None
    for doc in docs:
        stored_hash = doc.get("token_hash")
        legacy_token = doc.get("token")
        is_current = (stored_hash and stored_hash == current_token_hash) or (legacy_token and legacy_token == current_token)
        if is_current:
            current_session_id = doc.get("session_id")
            break

    revoked_count = await revoke_user_refresh_tokens(
        db,
        current_user["username"],
        exclude_session_id=current_session_id,
    )

    ip = request.client.host if request.client else "unknown"
    await log_action(
        db,
        user=current_user["username"],
        action="sessions_revoked_others",
        target=f"{revoked_count} sessão(ões)",
        ip=ip,
    )
    return {"revoked": revoked_count}


# Revoke one session

@router.delete("/{session_id}")
async def revoke_session(
    session_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Revoke a specific session by session_id.
    Users can only revoke their own sessions.
    Admins can revoke any session (for support purposes).
    """
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    doc = await db.refresh_tokens.find_one({"session_id": session_id, "revoked": False})
    if not doc:
        raise HTTPException(status_code=404, detail="session_not_found")

    # Non-admins can only revoke their own sessions.
    if current_user["role"] != "admin" and doc.get("username") != current_user["username"]:
        raise HTTPException(status_code=403, detail="forbidden")

    revoked = await revoke_refresh_session(db, session_id)
    if not revoked:
        raise HTTPException(status_code=404, detail="session_not_found")

    ip = request.client.host if request.client else "unknown"
    await log_action(
        db,
        user=current_user["username"],
        action="session_revoked",
        target=doc.get("username"),
        ip=ip,
    )
    return {"revoked": True}


# List a user's active sessions

@router.get("/admin/{username}", dependencies=[Depends(require_role(["admin"]))])
async def list_user_sessions(username: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Admin: list active sessions for any user."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    now = datetime.now(timezone.utc)
    cursor = db.refresh_tokens.find({
        "username": username,
        "revoked": False,
        "expires_at": {"$gt": now},
    })
    docs = await cursor.to_list(length=100)
    return [_fmt(d, "") for d in docs if d.get("session_id")]

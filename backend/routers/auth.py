import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional

from db import db_manager
from config import settings
from auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_current_user_allow_expired,
    _set_auth_cookies,
)
from limiters import limiter
from audit import log_action
from logging_config import get_logger
from mailer import send_password_reset_email
from policies import get_password_policy, validate_password

logger = get_logger("AuthRouter")

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    # Fetch lockout policy (defaults: 5 attempts / 15 min)
    lockout_cfg = await db.lockout_policy.find_one({"_id": "singleton"})
    max_attempts = lockout_cfg["max_attempts"] if lockout_cfg else 5
    lockout_minutes = lockout_cfg["lockout_minutes"] if lockout_cfg else 15

    user = await db.users.find_one({"username": form_data.username})

    # Check account lockout before password verification
    if user:
        locked_until = user.get("locked_until")
        if locked_until and locked_until > datetime.now(timezone.utc):
            raise HTTPException(
                status_code=423,
                detail={
                    "code": "account_locked",
                    "locked_until": locked_until.isoformat(),
                },
            )

    ip = request.client.host if request.client else ""

    # Verify credentials
    if not user or not verify_password(form_data.password, user["password_hash"]):
        if user:
            new_count = user.get("failed_login_count", 0) + 1
            update_fields = {
                "failed_login_count": new_count,
                "last_failed_at": datetime.now(timezone.utc),
            }
            if new_count >= max_attempts:
                update_fields["locked_until"] = (
                    datetime.now(timezone.utc) + timedelta(minutes=lockout_minutes)
                )
                await db.users.update_one(
                    {"username": user["username"]},
                    {"$set": update_fields},
                )
                await log_action(
                    db, user=form_data.username, action="account_locked",
                    target=form_data.username, ip=ip, result="failure",
                    detail=f"locked after {new_count} failed attempts",
                )
            else:
                await db.users.update_one(
                    {"username": user["username"]},
                    {"$set": update_fields},
                )
            await log_action(
                db, user=form_data.username, action="login_failed",
                target=form_data.username, ip=ip, result="failure",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.get("is_active", True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )

    # Successful login: reset lockout counters and record timestamp
    await db.users.update_one(
        {"username": user["username"]},
        {"$set": {
            "failed_login_count": 0,
            "locked_until": None,
            "last_failed_at": None,
            "last_login_at": datetime.now(timezone.utc),
        }},
    )

    role = user.get("role", "tech")

    # ── MFA gate ────────────────────────────────────────────────────────────
    if user.get("mfa_enabled"):
        # Issue a short-lived pre-auth token (5 min) to proceed to OTP verification
        pre_auth_token = create_access_token(
            data={"sub": user["username"], "role": role, "scope": "mfa_pending"},
            expires_delta=timedelta(minutes=5),
        )
        await log_action(db, user=user["username"], action="login_mfa_pending", ip=ip)
        return JSONResponse(content={"mfa_required": True, "pre_auth_token": pre_auth_token})

    # If role requires MFA but not yet enrolled, allow login but flag setup as required
    force_mfa_setup = role in settings.mfa_required_roles and not user.get("mfa_enabled")
    if force_mfa_setup:
        await log_action(db, user=user["username"], action="login_mfa_setup_required", ip=ip)
    # ── end MFA gate ─────────────────────────────────────────────────────────

    access_token = create_access_token(
        data={"sub": user["username"], "role": role}
    )
    refresh_token = create_refresh_token()
    user_agent = request.headers.get("user-agent", "")
    now = datetime.now(timezone.utc)

    # Revoke any existing active session from the same browser (same user_agent)
    # so re-login doesn't accumulate duplicate entries.
    if user_agent:
        await db.refresh_tokens.update_one(
            {"username": user["username"], "user_agent": user_agent, "revoked": False},
            {"$set": {"revoked": True}},
        )

    # Enforce max 10 active sessions per user — revoke oldest if exceeded.
    MAX_SESSIONS = 10
    active_cursor = db.refresh_tokens.find(
        {"username": user["username"], "revoked": False, "expires_at": {"$gt": now}},
    )
    active_sessions = await active_cursor.to_list(length=200)
    if len(active_sessions) >= MAX_SESSIONS:
        active_sessions.sort(key=lambda s: s.get("created_at", now))
        for old in active_sessions[: len(active_sessions) - MAX_SESSIONS + 1]:
            if old.get("session_id"):
                await db.refresh_tokens.update_one(
                    {"session_id": old["session_id"]},
                    {"$set": {"revoked": True}},
                )

    # Persist refresh token in MongoDB
    await db.refresh_tokens.insert_one({
        "session_id": str(uuid.uuid4()),
        "token": refresh_token,
        "username": user["username"],
        "role": role,
        "ip": ip,
        "user_agent": user_agent,
        "created_at": now,
        "expires_at": now + timedelta(days=settings.refresh_token_expire_days),
        "revoked": False,
    })

    user_payload = {
        "username": user["username"],
        "role": role,
        "name": user.get("name", ""),
        "preferred_lang": user.get("preferred_lang", "pt"),
        "is_active": user.get("is_active", True),
        "force_password_reset": user.get("force_password_reset", False),
        "mfa_enabled": user.get("mfa_enabled", False),
        "mfa_setup_required": force_mfa_setup,
    }

    response = JSONResponse(content={"user": user_payload, "token_type": "bearer"})
    _set_auth_cookies(response, access_token, refresh_token)
    logger.info(f"Login successful: {user['username']}")
    await log_action(db, user=user["username"], action="login", ip=ip)
    return response


@router.post("/refresh")
async def refresh_access_token(request: Request):
    """Issue a new access token from a valid refresh token cookie."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")

    stored = await db.refresh_tokens.find_one({"token": refresh_token, "revoked": False})
    if not stored:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if stored["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    new_access_token = create_access_token(
        data={"sub": stored["username"], "role": stored["role"]}
    )
    new_refresh_token = create_refresh_token()

    # Rotate: revoke old, insert new (preserving session context)
    await db.refresh_tokens.update_one(
        {"token": refresh_token},
        {"$set": {"revoked": True}},
    )
    await db.refresh_tokens.insert_one({
        "session_id": stored.get("session_id", str(uuid.uuid4())),
        "token": new_refresh_token,
        "username": stored["username"],
        "role": stored["role"],
        "ip": stored.get("ip", ""),
        "user_agent": stored.get("user_agent", ""),
        "created_at": stored.get("created_at", datetime.now(timezone.utc)),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
        "revoked": False,
    })

    response = JSONResponse(content={"token_type": "bearer"})
    _set_auth_cookies(response, new_access_token, new_refresh_token)
    return response


@router.post("/logout")
async def logout(request: Request, current_user: dict = Depends(get_current_user_allow_expired)):
    """Revoke refresh token and clear auth cookies."""
    db = db_manager.db

    refresh_token = request.cookies.get("refresh_token")
    if db is not None and refresh_token:
        await db.refresh_tokens.update_one(
            {"token": refresh_token},
            {"$set": {"revoked": True}},
        )

    response = JSONResponse(content={"message": "Logged out successfully"})
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token", path="/api/auth/refresh")
    logger.info(f"Logout: {current_user['username']}")
    ip = request.client.host if request.client else ""
    if db is not None:
        await log_action(db, user=current_user["username"], action="logout", ip=ip)
    return response


@router.get("/me")
async def read_users_me(current_user: dict = Depends(get_current_user_allow_expired)):
    return current_user


# ── Password Reset ────────────────────────────────────────────────────────────

_RESET_TOKEN_TTL_MINUTES = 15


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, body: ForgotPasswordRequest):
    """
    Request a password reset link by email.
    Always returns 200 to avoid revealing whether an email is registered.
    """
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    ip = request.client.host if request.client else ""
    email = body.email.strip().lower()

    # Look up user — silently succeed if not found
    user = await db.users.find_one({"email": email})
    if user and user.get("is_active", True) is not False:
        raw_token = uuid.uuid4().hex
        token_hash = _hash_token(raw_token)
        now = datetime.now(timezone.utc)

        await db.password_reset_tokens.update_one(
            {"username": user["username"]},
            {"$set": {
                "token_hash": token_hash,
                "username": user["username"],
                "email": email,
                "created_at": now,
                "expires_at": now + timedelta(minutes=_RESET_TOKEN_TTL_MINUTES),
                "used": False,
            }},
            upsert=True,
        )

        await send_password_reset_email(email, raw_token)
        await log_action(db, user=user["username"], action="password_reset_requested",
                         target=email, ip=ip, result="success")

    # Always return 200
    return {"message": "If this email is registered, a reset link has been sent."}


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, body: ResetPasswordRequest):
    """
    Consume a password reset token and set a new password.
    """
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    ip = request.client.host if request.client else ""
    token_hash = _hash_token(body.token.strip())

    record = await db.password_reset_tokens.find_one({"token_hash": token_hash})
    if not record:
        raise HTTPException(status_code=400, detail="invalid_or_expired_token")

    if record.get("used"):
        raise HTTPException(status_code=400, detail="token_already_used")

    if record["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="invalid_or_expired_token")

    username = record["username"]
    user = await db.users.find_one({"username": username})
    if not user or user.get("is_active", True) is False:
        raise HTTPException(status_code=400, detail="invalid_or_expired_token")

    # Validate new password against policy
    policy = await get_password_policy(db)
    errors = validate_password(body.new_password, policy)
    if errors:
        raise HTTPException(status_code=400, detail=errors[0])

    new_hash = get_password_hash(body.new_password)
    history = user.get("password_history", [])
    history_count = policy.get("history_count", 5)
    for old_hash in history[-history_count:]:
        if verify_password(body.new_password, old_hash):
            raise HTTPException(status_code=400, detail="password_reuse_denied")

    new_history = (history + [new_hash])[-history_count:]
    now = datetime.now(timezone.utc)

    await db.users.update_one(
        {"username": username},
        {"$set": {
            "password_hash": new_hash,
            "password_history": new_history,
            "password_changed_at": now,
            "force_password_reset": False,
        }},
    )

    # Mark token as used (TTL index will clean it up automatically)
    await db.password_reset_tokens.update_one(
        {"token_hash": token_hash},
        {"$set": {"used": True}},
    )

    await log_action(db, user=username, action="password_reset_completed",
                     target=username, ip=ip, result="success")

    return {"message": "Password reset successful. You can now log in."}

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm

from db import db_manager
from config import settings
from auth import (
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_current_user_allow_expired,
)
from limiters import limiter
from audit import log_action
from logging_config import get_logger

logger = get_logger("AuthRouter")

router = APIRouter(prefix="/auth", tags=["auth"])

_SECURE = settings.environment == "production"


def _set_auth_cookies(response: JSONResponse, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=_SECURE,
        samesite="strict",
        max_age=settings.access_token_expire_minutes * 60,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=_SECURE,
        samesite="strict",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/auth/refresh",
    )


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

    access_token = create_access_token(
        data={"sub": user["username"], "role": user.get("role", "tech")}
    )
    refresh_token = create_refresh_token()

    # Persist refresh token in MongoDB
    await db.refresh_tokens.insert_one({
        "token": refresh_token,
        "username": user["username"],
        "role": user.get("role", "tech"),
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
        "revoked": False,
    })

    user_payload = {
        "username": user["username"],
        "role": user.get("role", "tech"),
        "name": user.get("name", ""),
        "preferred_lang": user.get("preferred_lang", "pt"),
        "is_active": user.get("is_active", True),
        "force_password_reset": user.get("force_password_reset", False),
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

    # Rotate: revoke old, insert new
    await db.refresh_tokens.update_one(
        {"token": refresh_token},
        {"$set": {"revoked": True}},
    )
    await db.refresh_tokens.insert_one({
        "token": new_refresh_token,
        "username": stored["username"],
        "role": stored["role"],
        "created_at": datetime.now(timezone.utc),
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

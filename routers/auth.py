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
        path="/auth/refresh",  # restricted path for extra security
    )


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    user = await db.users.find_one({"username": form_data.username})
    if not user or not verify_password(form_data.password, user["password_hash"]):
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
    }

    response = JSONResponse(content={"user": user_payload, "token_type": "bearer"})
    _set_auth_cookies(response, access_token, refresh_token)
    logger.info(f"Login successful: {user['username']}")
    ip = request.client.host if request.client else ""
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
async def logout(request: Request, current_user: dict = Depends(get_current_user)):
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
    response.delete_cookie("refresh_token", path="/auth/refresh")
    logger.info(f"Logout: {current_user['username']}")
    ip = request.client.host if request.client else ""
    if db is not None:
        await log_action(db, user=current_user["username"], action="logout", ip=ip)
    return response


@router.get("/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user

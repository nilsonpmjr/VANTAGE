import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext

from config import settings
from db import db_manager
from policies import compute_expiry_days_left, get_password_policy

SECRET_KEY = settings.jwt_secret
ALGORITHM = settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# auto_error=False so the dependency doesn't raise 401 immediately;
# get_current_user will check both cookie and header.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token() -> str:
    """Generate a cryptographically secure opaque refresh token (64-byte URL-safe)."""
    return secrets.token_urlsafe(64)


async def _resolve_user(request: Request, bearer_token: Optional[str]) -> dict:
    """Decode the JWT and return the user document from the database."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = request.cookies.get("access_token") or bearer_token
    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    user = await db.users.find_one({"username": username})
    if user is None:
        raise credentials_exception

    if user.get("is_active", True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )

    return user


def _build_user_dict(user: dict, days_left: Optional[int]) -> dict:
    """Build the standard authenticated-user response dict."""
    result = {
        "username": user["username"],
        "role": user.get("role", "tech"),
        "name": user.get("name", ""),
        "preferred_lang": user.get("preferred_lang", "pt"),
        "is_active": user.get("is_active", True),
        "force_password_reset": user.get("force_password_reset", False),
    }
    if days_left is not None:
        result["password_expires_in_days"] = days_left
    return result


async def get_current_user(
    request: Request,
    bearer_token: Optional[str] = Depends(oauth2_scheme),
) -> dict:
    """
    Resolves the current authenticated user.

    Token resolution order:
    1. HttpOnly cookie `access_token` (web app)
    2. Authorization: Bearer <token> header (CLI / API clients)

    Raises HTTP 403 if force_password_reset is set or the password has expired.
    Use get_current_user_allow_expired for /me and password-change endpoints.
    """
    user = await _resolve_user(request, bearer_token)
    db = db_manager.db
    policy = await get_password_policy(db)
    days_left = compute_expiry_days_left(user, policy)

    if user.get("force_password_reset", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="password_reset_required",
        )

    if days_left is not None and days_left == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="password_expired",
        )

    return _build_user_dict(user, days_left)


async def get_current_user_allow_expired(
    request: Request,
    bearer_token: Optional[str] = Depends(oauth2_scheme),
) -> dict:
    """
    Resolves the current authenticated user WITHOUT enforcing password
    expiry or force_password_reset. Use for /me, /logout, and the
    password-change endpoint so users can always update their credentials.
    """
    user = await _resolve_user(request, bearer_token)
    db = db_manager.db
    policy = await get_password_policy(db)
    days_left = compute_expiry_days_left(user, policy)
    return _build_user_dict(user, days_left)


def require_role(allowed_roles: list):
    """
    Dependency to restrict endpoint access based on user role.
    Allowed roles: 'admin', 'manager', 'tech'
    """
    def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted for your user role",
            )
        return current_user
    return role_checker

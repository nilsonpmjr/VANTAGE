import hashlib
import ipaddress
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext

from config import settings
from db import db_manager
from logging_config import get_logger
from policies import compute_expiry_days_left, get_password_policy

SECRET_KEY = settings.jwt_secret
ALGORITHM = settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
logger = get_logger("Auth")

# auto_error=False so the dependency doesn't raise 401 immediately;
# get_current_user will check both cookie and header.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def default_notification_center(value: Optional[dict] = None) -> dict:
    stored = value or {}
    preferences = stored.get("preferences") if isinstance(stored.get("preferences"), dict) else {}
    return {
        "read_ids": [item for item in stored.get("read_ids", []) if isinstance(item, str)],
        "archived_ids": [item for item in stored.get("archived_ids", []) if isinstance(item, str)],
        "preferences": {
            "critical": preferences.get("critical", True) is not False,
            "system": preferences.get("system", True) is not False,
            "intelligence": preferences.get("intelligence", True) is not False,
        },
    }


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


def hash_refresh_token(raw_token: str) -> str:
    """Return SHA-256 hex digest of a raw refresh token."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


def hash_api_key(raw_key: str) -> str:
    """Return SHA-256 hex digest of a raw API key."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


_SECURE = settings.environment == "production"


def _set_auth_cookies(response: JSONResponse, access_token: str, refresh_token: str) -> None:
    """Set HttpOnly auth cookies on a response (shared by auth and mfa routers)."""
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


def _set_pre_auth_cookie(response: JSONResponse, pre_auth_token: str) -> None:
    """Set a short-lived HttpOnly cookie for MFA completion."""
    response.set_cookie(
        key="pre_auth_token",
        value=pre_auth_token,
        httponly=True,
        secure=_SECURE,
        samesite="strict",
        max_age=5 * 60,
        path="/api/mfa/verify",
    )


def _clear_pre_auth_cookie(response: JSONResponse) -> None:
    """Remove the temporary MFA pre-auth cookie."""
    response.delete_cookie("pre_auth_token", path="/api/mfa/verify")


async def _resolve_user(request: Request, bearer_token: Optional[str]) -> dict:
    """
    Decode the JWT (or validate an API key) and return the user document.

    Token resolution order:
    1. HttpOnly cookie `access_token` (web session)
    2. Authorization: Bearer <token> header
       – if token starts with 'vtg_' or legacy 'iti_' → treat as API key (hash & lookup)
       – otherwise → decode as JWT
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = request.cookies.get("access_token") or bearer_token
    if not token:
        raise credentials_exception

    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    # ── API Key path ─────────────────────────────────────────────────────────
    _api_key_scopes = None
    if token.startswith(("vtg_", "iti_")):
        key_hash = hash_api_key(token)
        key_doc = await db.api_keys.find_one({"key_hash": key_hash, "revoked": False})
        if not key_doc:
            raise credentials_exception
        # Check expiry (None = never expires)
        if key_doc.get("expires_at") and key_doc["expires_at"] < datetime.now(timezone.utc):
            raise credentials_exception
        # Update last_used_at (fire-and-forget; ignore errors)
        try:
            await db.api_keys.update_one(
                {"key_hash": key_hash},
                {"$set": {"last_used_at": datetime.now(timezone.utc)}},
            )
        except Exception as exc:
            logger.debug(f"Failed to update api_keys.last_used_at for {key_doc.get('username')}: {exc}")
        username = key_doc["username"]
        _api_key_scopes = key_doc.get("scopes", ["analyze"])
    else:
        # ── JWT path ──────────────────────────────────────────────────────────
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            username: str = payload.get("sub")
            if username is None:
                raise credentials_exception
            # Reject MFA pre-auth tokens (scope != None means limited token)
            if payload.get("scope") == "mfa_pending":
                raise credentials_exception
        except jwt.PyJWTError:
            raise credentials_exception

    user = await db.users.find_one({"username": username})
    if user is None:
        raise credentials_exception

    if user.get("is_active", True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )

    # IP allowlist check
    allowed_ips = user.get("allowed_ips", [])
    if allowed_ips:
        client_ip = request.client.host if request.client else ""
        if client_ip:
            try:
                client_addr = ipaddress.ip_address(client_ip)
                if not any(
                    client_addr in ipaddress.ip_network(cidr, strict=False)
                    for cidr in allowed_ips
                ):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access denied: IP not in allowlist",
                    )
            except ValueError:
                pass  # If client IP can't be parsed, skip check

    # Attach API key scopes if authenticated via API key
    if _api_key_scopes is not None:
        user["_api_key_scopes"] = _api_key_scopes

    return user


def _build_user_dict(
    user: dict,
    days_left: Optional[int],
    *,
    mfa_setup_required: bool = False,
) -> dict:
    """Build the standard authenticated-user response dict."""
    result = {
        "username": user["username"],
        "role": user.get("role", "tech"),
        "name": user.get("name", ""),
        "email": user.get("email"),
        "preferred_lang": user.get("preferred_lang", "pt"),
        "is_active": user.get("is_active", True),
        "force_password_reset": user.get("force_password_reset", False),
        "extra_permissions": user.get("extra_permissions", []),
        "mfa_enabled": user.get("mfa_enabled", False),
        "mfa_setup_required": mfa_setup_required,
        "avatar_base64": user.get("avatar_base64", ""),
        "avatar_fit": user.get("avatar_fit", "cover"),
        "bio": user.get("bio"),
        "recovery_email": user.get("recovery_email"),
        "notification_center": default_notification_center(user.get("notification_center")),
    }
    if "_api_key_scopes" in user:
        result["_api_key_scopes"] = user["_api_key_scopes"]
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
    async def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted for your user role",
            )
        return current_user
    return role_checker


# ── Fine-Grained Permissions ─────────────────────────────────────────────────

AVAILABLE_PERMISSIONS: list[str] = [
    "audit_logs:read",
    "users:export",
    "apikeys:manage",
    "stats:export",
    "services:restart",
]


def has_permission(user: dict, permission: str) -> bool:
    """
    Return True if the user has the given permission.

    Resolution order:
    1. admin role → always True (all permissions implicitly)
    2. extra_permissions[] on the user document
    """
    if user.get("role") == "admin":
        return True
    return permission in user.get("extra_permissions", [])


def require_permission(permission: str):
    """
    Dependency factory that enforces a fine-grained permission check.
    Passes if the user is admin OR has the permission in extra_permissions[].
    """
    async def checker(current_user: dict = Depends(get_current_user)):
        if not has_permission(current_user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"permission_required:{permission}",
            )
        return current_user
    return checker


def require_api_scope(scope: str):
    """
    Dependency factory that enforces API key scope restrictions.
    If the request is authenticated via JWT (no _api_key_scopes), it always passes.
    If via API key, the key must include the required scope.
    """
    async def checker(current_user: dict = Depends(get_current_user)):
        scopes = current_user.get("_api_key_scopes")
        if scopes is not None and scope not in scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key missing required scope: {scope}",
            )
        return current_user
    return checker

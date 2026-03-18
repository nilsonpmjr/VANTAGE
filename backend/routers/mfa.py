"""
MFA TOTP endpoints.

Enrollment flow (from Profile):
  1. POST /api/mfa/enroll   → returns {qr_uri, secret_preview, backup_codes}
  2. POST /api/mfa/confirm  → {otp} — activates MFA after first valid code

Login flow (when mfa_enabled):
  Login returns {mfa_required: true} and stores pre_auth_token in HttpOnly cookie
  3. POST /api/mfa/verify   → {otp} — issues full auth cookies

Admin management:
  4. DELETE /api/mfa/{username}  → admin revokes another user's MFA
  5. DELETE /api/mfa/me          → user self-disables (only if role not mandatory)
"""

import hashlib
import secrets
from datetime import timedelta, datetime, timezone

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from db import db_manager
from auth import (
    get_current_user,
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
    require_role,
    _set_auth_cookies,
    _clear_pre_auth_cookie,
)
from config import settings
from crypto import encrypt_secret, decrypt_secret
from audit import log_action
from logging_config import get_logger
from limiters import limiter

logger = get_logger("MFARouter")
router = APIRouter(prefix="/mfa", tags=["mfa"])

# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_backup_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _generate_backup_codes(n: int = 8) -> list[str]:
    """Generate N one-time backup codes in XXXXX-XXXXX format."""
    return [f"{secrets.token_hex(3).upper()}-{secrets.token_hex(3).upper()}" for _ in range(n)]


# ── Pydantic models ────────────────────────────────────────────────────────────

class OTPConfirm(BaseModel):
    otp: str


class MFAVerifyRequest(BaseModel):
    otp: str


# ── Enroll ────────────────────────────────────────────────────────────────────

@router.post("/enroll")
async def enroll_mfa(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a new TOTP secret and backup codes.
    Stores secret in pending state until /confirm is called.
    """
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    username = current_user["username"]
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)

    # Build provisioning URI (compatible with Google Authenticator, Authy, etc.)
    qr_uri = totp.provisioning_uri(name=username, issuer_name=settings.app_name)

    # Generate and store backup codes (hashed)
    backup_codes = _generate_backup_codes(8)
    backup_hashes = [_hash_backup_code(c) for c in backup_codes]

    # Store pending secret — not yet active
    await db.users.update_one(
        {"username": username},
        {"$set": {
            "mfa_pending_secret_enc": encrypt_secret(secret),
            "mfa_backup_codes": backup_hashes,
        }},
    )

    ip = request.client.host if request.client else ""
    logger.info(f"MFA enroll initiated for {username}")
    await log_action(db, user=username, action="mfa_enroll_started", ip=ip, result="success")

    return {
        "qr_uri": qr_uri,
        "secret_preview": secret[:4] + "..." + secret[-4:],
        "backup_codes": backup_codes,   # shown only once
    }


# ── Confirm enrollment ────────────────────────────────────────────────────────

@router.post("/confirm")
async def confirm_mfa(
    request: Request,
    body: OTPConfirm,
    current_user: dict = Depends(get_current_user),
):
    """Validate first OTP to activate MFA for the account."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    username = current_user["username"]
    user_doc = await db.users.find_one({"username": username})
    if not user_doc or not user_doc.get("mfa_pending_secret_enc"):
        raise HTTPException(status_code=400, detail="No pending MFA enrollment. Call /enroll first.")

    secret = decrypt_secret(user_doc["mfa_pending_secret_enc"])
    totp = pyotp.TOTP(secret)

    if not totp.verify(body.otp, valid_window=1):
        raise HTTPException(status_code=400, detail="invalid_otp")

    # Activate MFA
    await db.users.update_one(
        {"username": username},
        {"$set": {
            "mfa_enabled": True,
            "mfa_secret_enc": user_doc["mfa_pending_secret_enc"],
            "mfa_enrolled_at": datetime.now(timezone.utc),
        }, "$unset": {"mfa_pending_secret_enc": ""}},
    )

    ip = request.client.host if request.client else ""
    logger.info(f"MFA confirmed for {username}")
    await log_action(db, user=username, action="mfa_enrolled", ip=ip, result="success")

    return {"message": "MFA activated successfully"}


# ── Verify (login flow) ───────────────────────────────────────────────────────

@router.post("/verify")
@limiter.limit("5/minute", error_message="Too many MFA verification attempts. Try again later.")
async def verify_mfa(request: Request, body: MFAVerifyRequest):
    """
    Validate OTP using the pre_auth_token issued during password login.
    On success, issues full auth cookies and returns user data.
    """
    import jwt as pyjwt

    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    pre_auth_token = request.cookies.get("pre_auth_token")
    if not pre_auth_token:
        raise HTTPException(status_code=401, detail="invalid_pre_auth_token")

    # Decode pre_auth_token
    try:
        payload = pyjwt.decode(
            pre_auth_token,
            settings.jwt_secret,
            algorithms=[settings.algorithm],
        )
        if payload.get("scope") != "mfa_pending":
            raise HTTPException(status_code=401, detail="invalid_pre_auth_token")
        username = payload.get("sub")
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="invalid_pre_auth_token")

    user_doc = await db.users.find_one({"username": username})
    if not user_doc or not user_doc.get("mfa_secret_enc"):
        raise HTTPException(status_code=400, detail="MFA not configured for this user")
    if user_doc.get("is_active", True) is False:
        raise HTTPException(status_code=403, detail="Inactive user account")

    role = user_doc.get("role", "tech")

    secret = decrypt_secret(user_doc["mfa_secret_enc"])
    totp = pyotp.TOTP(secret)

    # Try TOTP first
    if not totp.verify(body.otp, valid_window=1):
        # Try backup codes
        otp_hash = _hash_backup_code(body.otp.upper().replace("-", ""))
        otp_hash_dash = _hash_backup_code(body.otp.upper())
        backup_codes = user_doc.get("mfa_backup_codes", [])
        matched_hash = None
        for h in backup_codes:
            if h in (otp_hash, otp_hash_dash):
                matched_hash = h
                break

        if not matched_hash:
            ip = request.client.host if request.client else ""
            await log_action(db, user=username, action="mfa_verify_failed",
                             ip=ip, result="failure")
            raise HTTPException(status_code=400, detail="invalid_otp")

        # Consume backup code (one-time use)
        new_codes = [h for h in backup_codes if h != matched_hash]
        await db.users.update_one(
            {"username": username}, {"$set": {"mfa_backup_codes": new_codes}}
        )

    # Issue full auth tokens
    import uuid as _uuid
    access_token = create_access_token(data={"sub": username, "role": role})
    refresh_token = create_refresh_token()
    user_agent = request.headers.get("user-agent", "")
    ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)

    # Revoke previous session from same browser to avoid accumulation
    if user_agent:
        await db.refresh_tokens.update_one(
            {"username": username, "user_agent": user_agent, "revoked": False},
            {"$set": {"revoked": True}},
        )

    await db.refresh_tokens.insert_one({
        "session_id": str(_uuid.uuid4()),
        "token_hash": hash_refresh_token(refresh_token),
        "username": username,
        "role": role,
        "ip": ip,
        "user_agent": user_agent,
        "created_at": now,
        "expires_at": now + timedelta(days=settings.refresh_token_expire_days),
        "revoked": False,
    })

    from policies import compute_expiry_days_left, get_password_policy
    policy = await get_password_policy(db)
    days_left = compute_expiry_days_left(user_doc, policy)

    user_payload = {
        "username": username,
        "role": role,
        "name": user_doc.get("name", ""),
        "preferred_lang": user_doc.get("preferred_lang", "pt"),
        "is_active": user_doc.get("is_active", True),
        "force_password_reset": user_doc.get("force_password_reset", False),
        "mfa_enabled": user_doc.get("mfa_enabled", False),
        **({"password_expires_in_days": days_left} if days_left is not None else {}),
    }

    response = JSONResponse(content={"user": user_payload, "token_type": "bearer"})
    _set_auth_cookies(response, access_token, refresh_token)
    _clear_pre_auth_cookie(response)

    ip = request.client.host if request.client else ""
    await log_action(db, user=username, action="login", ip=ip, detail="via_mfa")
    return response


# ── Disable own MFA ───────────────────────────────────────────────────────────

@router.delete("/me")
async def disable_my_mfa(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """User disables own MFA. Blocked if their role is in mfa_required_roles."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    if current_user["role"] in settings.mfa_required_roles:
        raise HTTPException(
            status_code=403,
            detail="mfa_mandatory_for_role",
        )

    await db.users.update_one(
        {"username": current_user["username"]},
        {"$set": {"mfa_enabled": False}, "$unset": {"mfa_secret_enc": "", "mfa_backup_codes": ""}},
    )

    ip = request.client.host if request.client else ""
    await log_action(db, user=current_user["username"], action="mfa_disabled",
                     target=current_user["username"], ip=ip, result="success")
    return {"message": "MFA disabled"}


# ── Admin revoke ──────────────────────────────────────────────────────────────

@router.delete("/{username}")
async def revoke_user_mfa(
    request: Request,
    username: str,
    current_user: dict = Depends(require_role(["admin"])),
):
    """Admin revokes MFA for any user and forces re-enrollment."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    user_doc = await db.users.find_one({"username": username})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    await db.users.update_one(
        {"username": username},
        {"$set": {"mfa_enabled": False},
         "$unset": {"mfa_secret_enc": "", "mfa_backup_codes": "", "mfa_pending_secret_enc": ""}},
    )

    ip = request.client.host if request.client else ""
    await log_action(db, user=current_user["username"], action="mfa_revoked",
                     target=username, ip=ip, result="success")
    return {"message": f"MFA revoked for {username}"}

"""
Tests for MFA TOTP endpoints.
"""

import pytest
import pyotp
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request

from auth import create_access_token
from crypto import encrypt_secret
from limiters import limiter


# ── Helpers ───────────────────────────────────────────────────────────────────

def _enable_mfa_for(fake_db, username="admin"):
    """Inject a live TOTP secret into a fake user."""
    secret = pyotp.random_base32()
    for u in fake_db.users._data:
        if u["username"] == username:
            u["mfa_enabled"] = True
            u["mfa_secret_enc"] = encrypt_secret(secret)
            u["mfa_backup_codes"] = []
    return secret


# ── POST /api/mfa/enroll ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_enroll_returns_qr_and_backup_codes(async_client, auth_headers, fake_db):
    resp = await async_client.post("/api/mfa/enroll", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "qr_uri" in data
    assert "secret_preview" in data
    assert "backup_codes" in data
    assert len(data["backup_codes"]) == 8


@pytest.mark.asyncio
async def test_enroll_requires_auth(async_client):
    resp = await async_client.post("/api/mfa/enroll")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_enroll_stores_pending_secret(async_client, auth_headers, fake_db):
    await async_client.post("/api/mfa/enroll", headers=auth_headers)
    admin_doc = await fake_db.users.find_one({"username": "admin"})
    assert admin_doc.get("mfa_pending_secret_enc") is not None


# ── POST /api/mfa/confirm ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_confirm_activates_mfa_with_valid_otp(async_client, auth_headers, fake_db):
    # Enroll first
    enroll_resp = await async_client.post("/api/mfa/enroll", headers=auth_headers)
    assert enroll_resp.status_code == 200

    # Get pending secret from fake_db
    admin_doc = await fake_db.users.find_one({"username": "admin"})
    from crypto import decrypt_secret
    secret = decrypt_secret(admin_doc["mfa_pending_secret_enc"])
    otp = pyotp.TOTP(secret).now()

    resp = await async_client.post("/api/mfa/confirm", json={"otp": otp}, headers=auth_headers)
    assert resp.status_code == 200

    # MFA should now be active
    admin_doc = await fake_db.users.find_one({"username": "admin"})
    assert admin_doc.get("mfa_enabled") is True
    assert admin_doc.get("mfa_secret_enc") is not None


@pytest.mark.asyncio
async def test_confirm_rejects_invalid_otp(async_client, auth_headers, fake_db):
    await async_client.post("/api/mfa/enroll", headers=auth_headers)
    resp = await async_client.post("/api/mfa/confirm", json={"otp": "000000"}, headers=auth_headers)
    assert resp.status_code == 400
    assert resp.json()["detail"] == "invalid_otp"


@pytest.mark.asyncio
async def test_confirm_without_enroll_fails(async_client, auth_headers):
    resp = await async_client.post("/api/mfa/confirm", json={"otp": "123456"}, headers=auth_headers)
    assert resp.status_code == 400


# ── Login MFA gate ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_with_mfa_enabled_returns_pre_auth_cookie(async_client, fake_db):
    _enable_mfa_for(fake_db, "admin")
    resp = await async_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "TestAdmin@1234"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("mfa_required") is True
    assert "pre_auth_token" not in data
    assert "pre_auth_token" in resp.cookies


@pytest.mark.asyncio
async def test_login_mfa_setup_required_for_mandatory_role(async_client, fake_db):
    """Admin role (in mfa_required_roles) without MFA enrolled → login succeeds with mfa_setup_required flag."""
    # Admin in fake_db has mfa_enabled=False and role=admin
    resp = await async_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "TestAdmin@1234"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["mfa_setup_required"] is True


@pytest.mark.asyncio
async def test_login_tech_without_mfa_succeeds(async_client, fake_db):
    """Tech role is not in mfa_required_roles; login proceeds normally."""
    resp = await async_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "TestTech@9876"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "user" in data
    assert data.get("mfa_required") is not True


# ── POST /api/mfa/verify ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_mfa_completes_login(async_client, fake_db):
    secret = _enable_mfa_for(fake_db, "admin")

    # Step 1: password login sets the pre_auth_token cookie
    login_resp = await async_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "TestAdmin@1234"},
    )
    assert login_resp.status_code == 200

    # Step 2: verify OTP
    otp = pyotp.TOTP(secret).now()
    verify_resp = await async_client.post(
        "/api/mfa/verify",
        json={"otp": otp},
    )
    assert verify_resp.status_code == 200
    data = verify_resp.json()
    assert "user" in data
    assert data["user"]["username"] == "admin"


@pytest.mark.asyncio
async def test_verify_mfa_rejects_wrong_otp(async_client, fake_db):
    _enable_mfa_for(fake_db, "admin")

    await async_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "TestAdmin@1234"},
    )

    resp = await async_client.post(
        "/api/mfa/verify",
        json={"otp": "000000"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "invalid_otp"


@pytest.mark.asyncio
async def test_verify_mfa_is_rate_limited(monkeypatch):
    limiter.reset()
    monkeypatch.setattr(limiter, "enabled", True)
    from routers.mfa import verify_mfa
    from main import app

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/mfa/verify",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "app": app,
        }
    )

    for _ in range(5):
        limiter._check_request_limit(request, verify_mfa.__wrapped__, False)

    with pytest.raises(RateLimitExceeded) as exc_info:
        limiter._check_request_limit(request, verify_mfa.__wrapped__, False)

    response = _rate_limit_exceeded_handler(request, exc_info.value)
    assert response.status_code == 429
    assert response.body == b'{"error":"Rate limit exceeded: Too many MFA verification attempts. Try again later."}'
    limiter.reset()


@pytest.mark.asyncio
async def test_verify_rejects_invalid_pre_auth_token(async_client, fake_db):
    _enable_mfa_for(fake_db, "admin")
    resp = await async_client.post(
        "/api/mfa/verify",
        json={"otp": "123456"},
        cookies={"pre_auth_token": "not.a.valid.token"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_verify_uses_current_role_from_user_doc(async_client, fake_db):
    secret = _enable_mfa_for(fake_db, "admin")

    login_resp = await async_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "TestAdmin@1234"},
    )
    assert login_resp.status_code == 200

    await fake_db.users.update_one(
        {"username": "admin"},
        {"$set": {"role": "tech"}},
    )

    otp = pyotp.TOTP(secret).now()
    verify_resp = await async_client.post("/api/mfa/verify", json={"otp": otp})
    assert verify_resp.status_code == 200
    assert verify_resp.json()["user"]["role"] == "tech"


@pytest.mark.asyncio
async def test_verify_rejects_inactive_user(async_client, fake_db):
    secret = _enable_mfa_for(fake_db, "admin")

    login_resp = await async_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "TestAdmin@1234"},
    )
    assert login_resp.status_code == 200

    await fake_db.users.update_one(
        {"username": "admin"},
        {"$set": {"is_active": False}},
    )

    otp = pyotp.TOTP(secret).now()
    verify_resp = await async_client.post("/api/mfa/verify", json={"otp": otp})
    assert verify_resp.status_code == 403
    assert verify_resp.json()["detail"] == "Inactive user account"


# ── DELETE /api/mfa/{username} ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_can_revoke_user_mfa(async_client, auth_headers, fake_db):
    _enable_mfa_for(fake_db, "techuser")
    resp = await async_client.delete("/api/mfa/techuser", headers=auth_headers)
    assert resp.status_code == 200
    techuser = await fake_db.users.find_one({"username": "techuser"})
    assert techuser.get("mfa_enabled") is False


@pytest.mark.asyncio
async def test_revoke_nonexistent_user_returns_404(async_client, auth_headers):
    resp = await async_client.delete("/api/mfa/nobody", headers=auth_headers)
    assert resp.status_code == 404


# ── DELETE /api/mfa/me ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tech_user_can_disable_own_mfa(async_client, fake_db):
    _enable_mfa_for(fake_db, "techuser")
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.delete(
        "/api/mfa/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    techuser = await fake_db.users.find_one({"username": "techuser"})
    assert techuser.get("mfa_enabled") is False


@pytest.mark.asyncio
async def test_admin_cannot_disable_own_mfa_mandatory(async_client, auth_headers, fake_db):
    """Admin role is in mfa_required_roles — cannot self-disable."""
    _enable_mfa_for(fake_db, "admin")
    resp = await async_client.delete("/api/mfa/me", headers=auth_headers)
    assert resp.status_code == 403
    assert resp.json()["detail"] == "mfa_mandatory_for_role"

"""
Regression tests for Session B — lifecycle-driven session revocation.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from auth import create_access_token, get_password_hash, hash_refresh_token
from main import app


@pytest_asyncio.fixture
async def client_pair(fake_db, monkeypatch):
    from db import db_manager

    monkeypatch.setattr(db_manager, "db", fake_db)
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://test") as subject_client,
        AsyncClient(transport=transport, base_url="http://test") as admin_client,
    ):
        yield subject_client, admin_client


def _admin_headers() -> dict:
    token = create_access_token({"sub": "admin", "role": "admin"})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_suspend_user_revokes_refresh_tokens(client_pair, fake_db):
    subject_client, admin_client = client_pair

    login_resp = await subject_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "tech123"},
    )
    assert login_resp.status_code == 200
    token_hash = hash_refresh_token(login_resp.cookies["refresh_token"])

    suspend_resp = await admin_client.put(
        "/api/users/techuser",
        json={"is_active": False},
        headers=_admin_headers(),
    )
    assert suspend_resp.status_code == 200

    refresh_resp = await subject_client.post("/api/auth/refresh")
    assert refresh_resp.status_code == 401
    assert refresh_resp.json()["detail"] == "Invalid refresh token"

    stored = await fake_db.refresh_tokens.find_one({"token_hash": token_hash})
    assert stored["revoked"] is True


@pytest.mark.asyncio
async def test_delete_user_revokes_refresh_tokens(client_pair, fake_db):
    subject_client, admin_client = client_pair

    login_resp = await subject_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "tech123"},
    )
    assert login_resp.status_code == 200

    delete_resp = await admin_client.delete(
        "/api/users/techuser",
        headers=_admin_headers(),
    )
    assert delete_resp.status_code == 200

    refresh_resp = await subject_client.post("/api/auth/refresh")
    assert refresh_resp.status_code == 401
    assert refresh_resp.json()["detail"] == "Invalid refresh token"
    assert await fake_db.users.find_one({"username": "techuser"}) is None


@pytest.mark.asyncio
async def test_self_password_change_revokes_refresh_tokens(async_client, fake_db):
    login_resp = await async_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "tech123"},
    )
    assert login_resp.status_code == 200
    token_hash = hash_refresh_token(login_resp.cookies["refresh_token"])

    change_resp = await async_client.put(
        "/api/users/me",
        json={"password": "NewPass123!"},
    )
    assert change_resp.status_code == 200

    refresh_resp = await async_client.post("/api/auth/refresh")
    assert refresh_resp.status_code == 401
    assert refresh_resp.json()["detail"] == "Invalid refresh token"

    stored = await fake_db.refresh_tokens.find_one({"token_hash": token_hash})
    assert stored["revoked"] is True


@pytest.mark.asyncio
async def test_reset_password_revokes_refresh_tokens(async_client, fake_db):
    login_resp = await async_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "tech123"},
    )
    assert login_resp.status_code == 200
    token_hash = hash_refresh_token(login_resp.cookies["refresh_token"])

    raw_token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    await fake_db.password_reset_tokens.insert_one(
        {
            "token_hash": hash_refresh_token(raw_token),
            "username": "techuser",
            "email": "tech@soc.local",
            "created_at": now,
            "expires_at": now + timedelta(minutes=15),
            "used": False,
        }
    )

    reset_resp = await async_client.post(
        "/api/auth/reset-password",
        json={"token": raw_token, "new_password": "ResetPass123!"},
    )
    assert reset_resp.status_code == 200

    refresh_resp = await async_client.post("/api/auth/refresh")
    assert refresh_resp.status_code == 401
    assert refresh_resp.json()["detail"] == "Invalid refresh token"

    stored = await fake_db.refresh_tokens.find_one({"token_hash": token_hash})
    assert stored["revoked"] is True


@pytest.mark.asyncio
async def test_force_password_reset_revokes_refresh_tokens(client_pair, fake_db):
    subject_client, admin_client = client_pair

    login_resp = await subject_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "tech123"},
    )
    assert login_resp.status_code == 200
    token_hash = hash_refresh_token(login_resp.cookies["refresh_token"])

    force_resp = await admin_client.put(
        "/api/users/techuser",
        json={"force_password_reset": True},
        headers=_admin_headers(),
    )
    assert force_resp.status_code == 200

    refresh_resp = await subject_client.post("/api/auth/refresh")
    assert refresh_resp.status_code == 401
    assert refresh_resp.json()["detail"] == "Invalid refresh token"

    stored = await fake_db.refresh_tokens.find_one({"token_hash": token_hash})
    assert stored["revoked"] is True


@pytest.mark.asyncio
async def test_sensitive_role_downgrade_revokes_refresh_tokens(client_pair, fake_db):
    subject_client, admin_client = client_pair

    manager_hash = get_password_hash("Manager123!")
    await fake_db.users.insert_one(
        {
            "username": "manager1",
            "password_hash": manager_hash,
            "role": "manager",
            "name": "Manager One",
            "email": "manager1@soc.local",
            "preferred_lang": "pt",
            "is_active": True,
            "failed_login_count": 0,
            "locked_until": None,
            "last_failed_at": None,
            "password_history": [manager_hash],
            "password_changed_at": datetime.now(timezone.utc),
            "force_password_reset": False,
            "last_login_at": None,
            "mfa_enabled": False,
            "mfa_secret_enc": None,
            "mfa_backup_codes": [],
            "extra_permissions": [],
        }
    )

    login_resp = await subject_client.post(
        "/api/auth/login",
        data={"username": "manager1", "password": "Manager123!"},
    )
    assert login_resp.status_code == 200
    token_hash = hash_refresh_token(login_resp.cookies["refresh_token"])

    downgrade_resp = await admin_client.put(
        "/api/users/manager1",
        json={"role": "tech"},
        headers=_admin_headers(),
    )
    assert downgrade_resp.status_code == 200

    refresh_resp = await subject_client.post("/api/auth/refresh")
    assert refresh_resp.status_code == 401
    assert refresh_resp.json()["detail"] == "Invalid refresh token"

    stored = await fake_db.refresh_tokens.find_one({"token_hash": token_hash})
    assert stored["revoked"] is True

"""Tests for account lockout and brute-force protection (FASE 1a)."""

import pytest
from datetime import datetime, timedelta, timezone

from httpx import AsyncClient

from auth import create_access_token


@pytest.mark.asyncio
async def test_lockout_after_n_failures(async_client: AsyncClient, fake_db):
    """User should be locked after max_attempts (5) consecutive failures."""
    for _ in range(5):
        resp = await async_client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "wrongpassword"},
        )
        assert resp.status_code == 401

    # 6th attempt must return HTTP 423
    resp = await async_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "wrongpassword"},
    )
    assert resp.status_code == 423
    data = resp.json()
    assert data["detail"]["code"] == "account_locked"
    assert "locked_until" in data["detail"]


@pytest.mark.asyncio
async def test_locked_user_denied_even_with_correct_password(async_client: AsyncClient, fake_db):
    """A locked user must be denied even when the correct password is supplied."""
    user_doc = await fake_db.users.find_one({"username": "admin"})
    user_doc["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=15)
    user_doc["failed_login_count"] = 5

    resp = await async_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "admin123"},
    )
    assert resp.status_code == 423


@pytest.mark.asyncio
async def test_successful_login_resets_counter(async_client: AsyncClient, fake_db):
    """A successful login must clear failed_login_count and locked_until."""
    # Use techuser (non-mandatory-MFA role) to avoid 403 mfa_setup_required
    user_doc = await fake_db.users.find_one({"username": "techuser"})
    user_doc["failed_login_count"] = 3

    resp = await async_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "tech123"},
    )
    assert resp.status_code == 200

    updated = await fake_db.users.find_one({"username": "techuser"})
    assert updated.get("failed_login_count") == 0
    assert updated.get("locked_until") is None


@pytest.mark.asyncio
async def test_admin_can_unlock_user(async_client: AsyncClient, fake_db):
    """Admin should be able to manually unlock a locked user."""
    user_doc = await fake_db.users.find_one({"username": "admin"})
    user_doc["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=15)
    user_doc["failed_login_count"] = 5

    token = create_access_token({"sub": "admin", "role": "admin"})
    resp = await async_client.post(
        "/api/admin/users/admin/unlock",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200

    updated = await fake_db.users.find_one({"username": "admin"})
    assert updated.get("failed_login_count") == 0
    assert updated.get("locked_until") is None


@pytest.mark.asyncio
async def test_non_admin_cannot_unlock(async_client: AsyncClient, fake_db):
    """Non-admin users must receive 403 when calling the unlock endpoint."""
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.post(
        "/api/admin/users/admin/unlock",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_unlock_nonexistent_user_returns_404(async_client: AsyncClient, fake_db):
    """Attempting to unlock a user that doesn't exist must return 404."""
    token = create_access_token({"sub": "admin", "role": "admin"})
    resp = await async_client.post(
        "/api/admin/users/ghost/unlock",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_lockout_policy_defaults(async_client: AsyncClient, fake_db):
    """GET /admin/lockout-policy must return defaults when no policy is configured."""
    token = create_access_token({"sub": "admin", "role": "admin"})
    resp = await async_client.get(
        "/api/admin/lockout-policy",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["max_attempts"] == 5
    assert data["lockout_minutes"] == 15


@pytest.mark.asyncio
async def test_update_lockout_policy(async_client: AsyncClient, fake_db):
    """Admin should be able to update the lockout policy."""
    token = create_access_token({"sub": "admin", "role": "admin"})
    resp = await async_client.put(
        "/api/admin/lockout-policy",
        json={"max_attempts": 3, "lockout_minutes": 30},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["max_attempts"] == 3
    assert data["lockout_minutes"] == 30

    # Confirm persisted
    resp2 = await async_client.get(
        "/api/admin/lockout-policy",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp2.status_code == 200
    assert resp2.json()["max_attempts"] == 3


@pytest.mark.asyncio
async def test_custom_policy_takes_effect(async_client: AsyncClient, fake_db):
    """After changing max_attempts to 2, lockout should happen on the 3rd failure."""
    token = create_access_token({"sub": "admin", "role": "admin"})
    await async_client.put(
        "/api/admin/lockout-policy",
        json={"max_attempts": 2, "lockout_minutes": 5},
        headers={"Authorization": f"Bearer {token}"},
    )

    for _ in range(2):
        resp = await async_client.post(
            "/api/auth/login",
            data={"username": "admin", "password": "wrongpassword"},
        )
        assert resp.status_code == 401

    resp = await async_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "wrongpassword"},
    )
    assert resp.status_code == 423

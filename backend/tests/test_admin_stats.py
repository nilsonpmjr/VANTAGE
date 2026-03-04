"""
Tests for Phase 1c — GET /api/admin/stats and last_login_at field.
"""

import pytest
from datetime import datetime, timedelta, timezone


@pytest.mark.asyncio
async def test_admin_stats_returns_expected_fields(async_client, auth_headers):
    """Admin stats endpoint returns all required IAM metric fields."""
    resp = await async_client.get("/api/admin/stats", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    for field in ("total_users", "active_users", "suspended_users",
                  "locked_accounts", "users_with_mfa",
                  "active_sessions", "failed_logins_24h", "active_api_keys"):
        assert field in data, f"Missing field: {field}"


@pytest.mark.asyncio
async def test_admin_stats_correct_counts(async_client, auth_headers):
    """FakeDB has 3 users: 2 active, 1 suspended — stats must reflect that."""
    resp = await async_client.get("/api/admin/stats", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_users"] == 3
    assert data["active_users"] == 2
    assert data["suspended_users"] == 1
    assert data["locked_accounts"] == 0
    assert data["users_with_mfa"] == 0
    assert data["active_sessions"] == 0
    assert data["active_api_keys"] == 0


@pytest.mark.asyncio
async def test_admin_stats_locked_counted(async_client, auth_headers, fake_db):
    """A user with locked_until in the future must be counted in locked_accounts."""
    future = datetime.now(timezone.utc) + timedelta(minutes=10)
    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"locked_until": future}},
    )
    resp = await async_client.get("/api/admin/stats", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["locked_accounts"] == 1


@pytest.mark.asyncio
async def test_admin_stats_requires_auth(async_client):
    """Unauthenticated request must return 401."""
    resp = await async_client.get("/api/admin/stats")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_admin_stats_forbidden_for_tech(async_client, fake_db):
    """Tech role must not access admin stats."""
    from auth import create_access_token
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.get(
        "/api/admin/stats",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_last_login_at_set_on_login(async_client, fake_db):
    """Successful login must persist last_login_at on the user document."""
    # Use techuser (non-mandatory-MFA role) to avoid 403 mfa_setup_required
    resp = await async_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "tech123"},
    )
    assert resp.status_code == 200
    user_doc = await fake_db.users.find_one({"username": "techuser"})
    assert user_doc.get("last_login_at") is not None


@pytest.mark.asyncio
async def test_delete_user_via_api(async_client, auth_headers, fake_db):
    """Admin can delete a user via DELETE /api/users/{username}."""
    # First create a temporary user
    await fake_db.users.insert_one({
        "username": "todelete",
        "password_hash": "x",
        "role": "tech",
        "name": "To Delete",
        "is_active": True,
    })
    resp = await async_client.delete("/api/users/todelete", headers=auth_headers)
    assert resp.status_code == 200
    deleted = await fake_db.users.find_one({"username": "todelete"})
    assert deleted is None


@pytest.mark.asyncio
async def test_delete_own_account_forbidden(async_client, auth_headers):
    """Admin must not be able to delete their own account."""
    resp = await async_client.delete("/api/users/admin", headers=auth_headers)
    assert resp.status_code == 400

"""
Tests for Phase 1b — Password Policies.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock


# ── Unit tests for policies.py ────────────────────────────────────────────────

def test_validate_password_too_short():
    from policies import validate_password
    policy = {"min_length": 10, "require_uppercase": False,
               "require_numbers": False, "require_symbols": False}
    errors = validate_password("short", policy)
    assert any("password_too_short" in e for e in errors)


def test_validate_password_needs_uppercase():
    from policies import validate_password
    policy = {"min_length": 6, "require_uppercase": True,
               "require_numbers": False, "require_symbols": False}
    errors = validate_password("alllower", policy)
    assert "password_needs_uppercase" in errors


def test_validate_password_needs_number():
    from policies import validate_password
    policy = {"min_length": 6, "require_uppercase": False,
               "require_numbers": True, "require_symbols": False}
    errors = validate_password("NoNumbers!", policy)
    assert "password_needs_number" in errors


def test_validate_password_needs_symbol():
    from policies import validate_password
    policy = {"min_length": 6, "require_uppercase": False,
               "require_numbers": False, "require_symbols": True}
    errors = validate_password("NoSymbol1", policy)
    assert "password_needs_symbol" in errors


def test_validate_password_all_pass():
    from policies import validate_password
    policy = {"min_length": 8, "require_uppercase": True,
               "require_numbers": True, "require_symbols": True}
    errors = validate_password("Secure1!", policy)
    assert errors == []


def test_validate_password_blocks_common_password():
    from policies import validate_password
    policy = {"min_length": 8, "prevent_common_passwords": True}
    errors = validate_password("password123", policy)
    assert "password_common_word_blocked" in errors


def test_validate_password_blocks_breached_password():
    from policies import validate_password
    policy = {"min_length": 6, "prevent_breached_passwords": True}
    errors = validate_password("123456", policy)
    assert "password_breached_blocked" in errors


def test_compute_expiry_days_left_disabled():
    from policies import compute_expiry_days_left
    user = {"password_changed_at": datetime.now(timezone.utc) - timedelta(days=999)}
    policy = {"expiry_days": 0}
    assert compute_expiry_days_left(user, policy) is None


def test_compute_expiry_days_left_not_expired():
    from policies import compute_expiry_days_left
    user = {"password_changed_at": datetime.now(timezone.utc) - timedelta(days=10)}
    policy = {"expiry_days": 90}
    days = compute_expiry_days_left(user, policy)
    assert days == 80


def test_compute_expiry_days_left_expired():
    from policies import compute_expiry_days_left
    user = {"password_changed_at": datetime.now(timezone.utc) - timedelta(days=100)}
    policy = {"expiry_days": 90}
    assert compute_expiry_days_left(user, policy) == 0


def test_compute_expiry_no_changed_at():
    from policies import compute_expiry_days_left
    user = {}  # no password_changed_at
    policy = {"expiry_days": 30}
    assert compute_expiry_days_left(user, policy) == 0


# ── Integration tests via HTTP ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_password_complexity_rejected(async_client, auth_headers, fake_db):
    """Creating a user with a short password should be rejected when policy demands longer."""
    # Set a strict policy in the fake db
    await fake_db.password_policy.update_one(
        {"_id": "singleton"},
        {"$set": {"_id": "singleton", "min_length": 12, "require_uppercase": False,
                  "require_numbers": False, "require_symbols": False,
                  "history_count": 5, "expiry_days": 0, "expiry_warning_days": 7}},
        upsert=True,
    )
    resp = await async_client.post(
        "/api/users",
        json={"username": "newuser", "password": "short", "role": "tech", "name": "New"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert "password_too_short" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_password_complexity_accepted(async_client, auth_headers, fake_db):
    """Creating a user with a compliant password should succeed."""
    await fake_db.password_policy.update_one(
        {"_id": "singleton"},
        {"$set": {"_id": "singleton", "min_length": 6, "require_uppercase": False,
                  "require_numbers": False, "require_symbols": False,
                  "history_count": 5, "expiry_days": 0, "expiry_warning_days": 7}},
        upsert=True,
    )
    resp = await async_client.post(
        "/api/users",
        json={"username": "newuser2", "password": "goodpassword", "role": "tech", "name": "New2"},
        headers=auth_headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_get_password_policy_defaults(async_client, auth_headers):
    """When no policy document exists, defaults should be returned."""
    resp = await async_client.get("/api/admin/password-policy", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["min_length"] == 8
    assert data["expiry_days"] == 0
    assert data["history_count"] == 5


@pytest.mark.asyncio
async def test_update_password_policy(async_client, auth_headers):
    """Admin should be able to update the password policy."""
    resp = await async_client.put(
        "/api/admin/password-policy",
        json={"min_length": 12, "require_uppercase": True, "expiry_days": 90},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["min_length"] == 12
    assert data["require_uppercase"] is True
    assert data["expiry_days"] == 90


@pytest.mark.asyncio
async def test_export_security_policies_json(async_client, auth_headers):
    resp = await async_client.get("/api/admin/security-policies/export?format=json", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")
    data = resp.json()
    assert "password_policy" in data
    assert "lockout_policy" in data


@pytest.mark.asyncio
async def test_force_reset_field_in_me(async_client, auth_headers):
    """/me should include force_password_reset field."""
    resp = await async_client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert "force_password_reset" in resp.json()


@pytest.mark.asyncio
async def test_force_reset_blocks_regular_endpoints(async_client, fake_db):
    """A user with force_password_reset=True should get 403 on protected endpoints."""
    from auth import create_access_token
    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"force_password_reset": True}},
    )
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.get(
        "/api/analyze?target=8.8.8.8",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "password_reset_required"


@pytest.mark.asyncio
async def test_force_reset_allows_me_endpoint(async_client, fake_db):
    """A user with force_password_reset=True should still reach /me."""
    from auth import create_access_token
    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"force_password_reset": True}},
    )
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["force_password_reset"] is True


@pytest.mark.asyncio
async def test_admin_can_set_force_reset_on_user(async_client, auth_headers, fake_db):
    """Admin can set force_password_reset on another user via PUT /api/users/{username}."""
    resp = await async_client.put(
        "/api/users/techuser",
        json={"force_password_reset": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    user_doc = await fake_db.users.find_one({"username": "techuser"})
    assert user_doc["force_password_reset"] is True

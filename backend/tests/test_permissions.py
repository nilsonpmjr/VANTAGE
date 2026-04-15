"""Tests for FASE 3b — Fine-grained permissions."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from main import app
from auth import create_access_token, has_permission, AVAILABLE_PERMISSIONS


# ── Unit tests for has_permission() ──────────────────────────────────────────

def test_admin_has_all_permissions():
    user = {"role": "admin", "extra_permissions": []}
    for perm in AVAILABLE_PERMISSIONS:
        assert has_permission(user, perm) is True


def test_tech_without_extra_permissions():
    user = {"role": "tech", "extra_permissions": []}
    for perm in AVAILABLE_PERMISSIONS:
        assert has_permission(user, perm) is False


def test_tech_with_explicit_permission():
    user = {"role": "tech", "extra_permissions": ["audit_logs:read"]}
    assert has_permission(user, "audit_logs:read") is True
    assert has_permission(user, "users:export") is False


def test_manager_with_extra_permissions():
    user = {"role": "manager", "extra_permissions": ["stats:export", "users:export"]}
    assert has_permission(user, "stats:export") is True
    assert has_permission(user, "users:export") is True
    assert has_permission(user, "audit_logs:read") is False


def test_has_permission_missing_field():
    # User doc with no extra_permissions key
    user = {"role": "tech"}
    assert has_permission(user, "audit_logs:read") is False


def test_available_permissions_list():
    assert "audit_logs:read" in AVAILABLE_PERMISSIONS
    assert "users:export" in AVAILABLE_PERMISSIONS
    assert "apikeys:manage" in AVAILABLE_PERMISSIONS
    assert "stats:export" in AVAILABLE_PERMISSIONS


# ── HTTP fixtures ─────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client(fake_db, monkeypatch):
    import app_state
    from db import db_manager
    monkeypatch.setattr(db_manager, "db", fake_db)
    monkeypatch.setattr(app_state, "APP_INITIALIZED", True)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def admin_headers():
    token = create_access_token({"sub": "admin", "role": "admin"})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def tech_headers():
    token = create_access_token({"sub": "techuser", "role": "tech"})
    return {"Authorization": f"Bearer {token}"}


# ── GET /api/admin/permissions ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_available_permissions(client, admin_headers):
    resp = await client.get("/api/admin/permissions", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "permissions" in data
    assert set(AVAILABLE_PERMISSIONS).issubset(set(data["permissions"]))


@pytest.mark.asyncio
async def test_list_permissions_requires_admin(client, tech_headers):
    resp = await client.get("/api/admin/permissions", headers=tech_headers)
    assert resp.status_code == 403


# ── PUT /api/admin/users/{username}/permissions ───────────────────────────────

@pytest.mark.asyncio
async def test_admin_can_grant_permission(client, admin_headers, fake_db):
    resp = await client.put(
        "/api/admin/users/techuser/permissions",
        json={"extra_permissions": ["audit_logs:read"]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "techuser"
    assert "audit_logs:read" in data["extra_permissions"]

    # Verify stored in DB
    user = await fake_db.users.find_one({"username": "techuser"})
    assert "audit_logs:read" in user["extra_permissions"]


@pytest.mark.asyncio
async def test_admin_can_clear_permissions(client, admin_headers, fake_db):
    # First grant a permission
    await client.put(
        "/api/admin/users/techuser/permissions",
        json={"extra_permissions": ["stats:export"]},
        headers=admin_headers,
    )
    # Then clear it
    resp = await client.put(
        "/api/admin/users/techuser/permissions",
        json={"extra_permissions": []},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["extra_permissions"] == []


@pytest.mark.asyncio
async def test_unknown_permissions_are_filtered(client, admin_headers):
    resp = await client.put(
        "/api/admin/users/techuser/permissions",
        json={"extra_permissions": ["audit_logs:read", "nonexistent:perm"]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    perms = resp.json()["extra_permissions"]
    assert "audit_logs:read" in perms
    assert "nonexistent:perm" not in perms


@pytest.mark.asyncio
async def test_tech_cannot_grant_permissions(client, tech_headers):
    resp = await client.put(
        "/api/admin/users/techuser/permissions",
        json={"extra_permissions": ["audit_logs:read"]},
        headers=tech_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_permission_update_user_not_found(client, admin_headers):
    resp = await client.put(
        "/api/admin/users/ghost/permissions",
        json={"extra_permissions": []},
        headers=admin_headers,
    )
    assert resp.status_code == 404


# ── Permission-gated endpoint: GET /api/admin/audit-logs ─────────────────────

@pytest.mark.asyncio
async def test_admin_can_access_audit_logs(client, admin_headers):
    resp = await client.get("/api/admin/audit-logs", headers=admin_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_tech_without_permission_blocked_from_audit_logs(client, tech_headers):
    resp = await client.get("/api/admin/audit-logs", headers=tech_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_tech_with_audit_permission_can_access_logs(client, fake_db, admin_headers):
    # Grant permission
    await client.put(
        "/api/admin/users/techuser/permissions",
        json={"extra_permissions": ["audit_logs:read"]},
        headers=admin_headers,
    )
    # Now tech can access audit logs using a fresh token that goes to DB
    # We need to use cookie/bearer that triggers DB lookup. The token carries sub=techuser.
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await client.get(
        "/api/admin/audit-logs",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200


# ── extra_permissions in /api/auth/me ────────────────────────────────────────

@pytest.mark.asyncio
async def test_me_includes_extra_permissions(client, tech_headers):
    resp = await client.get("/api/auth/me", headers=tech_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "extra_permissions" in data
    assert isinstance(data["extra_permissions"], list)


@pytest.mark.asyncio
async def test_me_shows_granted_permissions(client, fake_db, admin_headers):
    await client.put(
        "/api/admin/users/techuser/permissions",
        json={"extra_permissions": ["stats:export"]},
        headers=admin_headers,
    )
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert "stats:export" in resp.json()["extra_permissions"]

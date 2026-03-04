"""
Tests for audit log endpoints and event emission.
"""

import pytest
from datetime import datetime, timezone

from auth import create_access_token


# ── Helpers ───────────────────────────────────────────────────────────────────

def _seed(fake_db, **kwargs):
    """Append an audit entry to fake_db.audit_log."""
    entry = {
        "timestamp": datetime.now(timezone.utc),
        "user": "admin",
        "action": "login",
        "target": "",
        "ip": "127.0.0.1",
        "result": "success",
        "detail": "",
    }
    entry.update(kwargs)
    fake_db.audit_log._data.append(entry)


# ── Endpoint auth / RBAC ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_log_requires_auth(async_client):
    resp = await async_client.get("/api/admin/audit-logs")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_audit_log_requires_admin(async_client):
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.get(
        "/api/admin/audit-logs", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403


# ── GET /api/admin/audit-logs ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_log_returns_structure(async_client, auth_headers, fake_db):
    _seed(fake_db, action="login")
    resp = await async_client.get("/api/admin/audit-logs", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "pages" in data
    assert data["total"] >= 1
    assert data["page"] == 1


@pytest.mark.asyncio
async def test_audit_log_filter_by_action(async_client, auth_headers, fake_db):
    _seed(fake_db, action="login", user="admin")
    _seed(fake_db, action="user_created", user="admin")
    resp = await async_client.get(
        "/api/admin/audit-logs?action=user_created", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert all(item["action"] == "user_created" for item in data["items"])


@pytest.mark.asyncio
async def test_audit_log_filter_by_user(async_client, auth_headers, fake_db):
    _seed(fake_db, action="login", user="admin")
    _seed(fake_db, action="login", user="techuser")
    resp = await async_client.get(
        "/api/admin/audit-logs?user=techuser", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert all(item["user"] == "techuser" for item in data["items"])


@pytest.mark.asyncio
async def test_audit_log_pagination(async_client, auth_headers, fake_db):
    for i in range(10):
        _seed(fake_db, action="login", user=f"user{i}")
    resp = await async_client.get(
        "/api/admin/audit-logs?page=1&page_size=3", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 3
    assert data["total"] >= 10


# ── Event emission ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_failure_creates_audit_entry(async_client, fake_db):
    resp = await async_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "WRONG"},
    )
    assert resp.status_code == 401
    actions = [e["action"] for e in fake_db.audit_log._data]
    assert "login_failed" in actions


@pytest.mark.asyncio
async def test_user_created_audit_event(async_client, auth_headers, fake_db):
    resp = await async_client.post(
        "/api/users",
        json={"username": "newaudit", "password": "pass1234", "role": "tech", "name": "Audit Test"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    actions = [e["action"] for e in fake_db.audit_log._data]
    assert "user_created" in actions


@pytest.mark.asyncio
async def test_user_deleted_audit_event(async_client, auth_headers, fake_db):
    # First create a user to delete
    fake_db.users._data.append({
        "username": "todel", "password_hash": "x", "role": "tech",
        "name": "To Delete", "is_active": True,
        "failed_login_count": 0, "locked_until": None,
        "password_history": [], "password_changed_at": None,
        "force_password_reset": False, "last_login_at": None,
    })
    resp = await async_client.delete("/api/users/todel", headers=auth_headers)
    assert resp.status_code == 200
    actions = [e["action"] for e in fake_db.audit_log._data]
    assert "user_deleted" in actions


@pytest.mark.asyncio
async def test_account_unlocked_audit_event(async_client, auth_headers, fake_db):
    from datetime import timedelta
    fake_db.users._data[0]["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=10)
    resp = await async_client.post(
        "/api/admin/users/admin/unlock", headers=auth_headers
    )
    assert resp.status_code == 200
    actions = [e["action"] for e in fake_db.audit_log._data]
    assert "account_unlocked" in actions


# ── GET /api/users/me/audit-logs ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_my_audit_logs_returns_own_entries(async_client, auth_headers, fake_db):
    _seed(fake_db, user="admin", action="login")
    _seed(fake_db, user="techuser", action="login")
    resp = await async_client.get("/api/users/me/audit-logs", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert all(item["user"] == "admin" for item in data)


@pytest.mark.asyncio
async def test_my_audit_logs_requires_auth(async_client):
    resp = await async_client.get("/api/users/me/audit-logs")
    assert resp.status_code == 401


# ── Export ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_json(async_client, auth_headers, fake_db):
    _seed(fake_db, action="login")
    resp = await async_client.get(
        "/api/admin/audit-logs/export?format=json", headers=auth_headers
    )
    assert resp.status_code == 200
    assert "application/json" in resp.headers["content-type"]


@pytest.mark.asyncio
async def test_export_csv(async_client, auth_headers, fake_db):
    _seed(fake_db, action="login")
    resp = await async_client.get(
        "/api/admin/audit-logs/export?format=csv", headers=auth_headers
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "timestamp" in resp.text

"""Tests for the API Keys router (FASE 3a)."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone, timedelta

from main import app
from auth import create_access_token, hash_api_key


@pytest_asyncio.fixture
async def client(fake_db, monkeypatch):
    from db import db_manager
    monkeypatch.setattr(db_manager, "db", fake_db)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def tech_headers():
    token = create_access_token({"sub": "techuser", "role": "tech"})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers():
    token = create_access_token({"sub": "admin", "role": "admin"})
    return {"Authorization": f"Bearer {token}"}


# ── POST /api/api-keys ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_api_key_returns_raw_key(client, tech_headers):
    resp = await client.post("/api/api-keys", json={"name": "my-key"}, headers=tech_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["key"].startswith("vtg_")
    assert len(data["key"]) == 52  # vtg_ + 48 hex chars
    assert data["prefix"] == data["key"][:12] + "…"
    assert data["name"] == "my-key"
    assert data["revoked"] is False
    assert data["expires_at"] is None


@pytest.mark.asyncio
async def test_create_api_key_with_expiry(client, tech_headers):
    resp = await client.post("/api/api-keys", json={"name": "expiring", "expires_days": 30}, headers=tech_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["expires_at"] is not None


@pytest.mark.asyncio
async def test_create_api_key_requires_auth(client):
    resp = await client.post("/api/api-keys", json={"name": "k"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_api_key_name_required(client, tech_headers):
    resp = await client.post("/api/api-keys", json={}, headers=tech_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_api_key_raw_key_not_stored(client, fake_db, tech_headers):
    """Raw key must not appear in the stored document."""
    resp = await client.post("/api/api-keys", json={"name": "secret-key"}, headers=tech_headers)
    assert resp.status_code == 200
    raw_key = resp.json()["key"]

    # Check the stored document
    doc = await fake_db.api_keys.find_one({"name": "secret-key"})
    assert doc is not None
    assert "key_hash" in doc
    assert doc["key_hash"] != raw_key
    assert doc["key_hash"] == hash_api_key(raw_key)
    # Make sure the raw key is not stored
    for v in doc.values():
        assert v != raw_key


# ── GET /api/api-keys/me ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_my_keys_empty(client, tech_headers):
    resp = await client.get("/api/api-keys/me", headers=tech_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_my_keys_after_create(client, tech_headers):
    await client.post("/api/api-keys", json={"name": "k1"}, headers=tech_headers)
    await client.post("/api/api-keys", json={"name": "k2"}, headers=tech_headers)

    resp = await client.get("/api/api-keys/me", headers=tech_headers)
    assert resp.status_code == 200
    keys = resp.json()
    assert len(keys) == 2
    names = {k["name"] for k in keys}
    assert names == {"k1", "k2"}
    # No raw key or hash in response
    for k in keys:
        assert "key" not in k
        assert "key_hash" not in k


@pytest.mark.asyncio
async def test_list_my_keys_requires_auth(client):
    resp = await client.get("/api/api-keys/me")
    assert resp.status_code == 401


# ── DELETE /api/api-keys/{key_id} ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_revoke_own_key(client, tech_headers):
    create_resp = await client.post("/api/api-keys", json={"name": "to-revoke"}, headers=tech_headers)
    key_id = create_resp.json()["key_id"]

    resp = await client.delete(f"/api/api-keys/{key_id}", headers=tech_headers)
    assert resp.status_code == 200
    assert resp.json() == {"revoked": True}

    # Should no longer appear in list
    list_resp = await client.get("/api/api-keys/me", headers=tech_headers)
    assert all(k["key_id"] != key_id for k in list_resp.json())


@pytest.mark.asyncio
async def test_revoke_key_not_found(client, tech_headers):
    resp = await client.delete("/api/api-keys/nonexistent-id", headers=tech_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tech_cannot_revoke_other_users_key(client, fake_db, tech_headers, admin_headers):
    # Admin creates a key
    create_resp = await client.post("/api/api-keys", json={"name": "admin-key"}, headers=admin_headers)
    key_id = create_resp.json()["key_id"]

    # Tech user tries to revoke it
    resp = await client.delete(f"/api/api-keys/{key_id}", headers=tech_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_revoke_any_key(client, tech_headers, admin_headers):
    # Tech creates a key
    create_resp = await client.post("/api/api-keys", json={"name": "tech-key"}, headers=tech_headers)
    key_id = create_resp.json()["key_id"]

    # Admin revokes it
    resp = await client.delete(f"/api/api-keys/{key_id}", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json() == {"revoked": True}


# ── GET /api/api-keys/admin/{username} ───────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_list_user_keys(client, tech_headers, admin_headers):
    await client.post("/api/api-keys", json={"name": "key-a"}, headers=tech_headers)

    resp = await client.get("/api/api-keys/admin/techuser", headers=admin_headers)
    assert resp.status_code == 200
    keys = resp.json()
    assert len(keys) >= 1
    assert keys[0]["name"] == "key-a"


@pytest.mark.asyncio
async def test_tech_blocked_from_admin_list(client, tech_headers):
    resp = await client.get("/api/api-keys/admin/techuser", headers=tech_headers)
    assert resp.status_code == 403


# ── API key authentication ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_api_key_authenticates_endpoint(client, tech_headers):
    """A vtg_ key can be used as a Bearer token for authenticated endpoints."""
    create_resp = await client.post("/api/api-keys", json={"name": "bearer-test"}, headers=tech_headers)
    raw_key = create_resp.json()["key"]

    # Use the raw key to call /api/auth/me
    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {raw_key}"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "techuser"


@pytest.mark.asyncio
async def test_legacy_iti_api_key_still_authenticates(client, fake_db):
    """Legacy iti_ keys remain valid so existing integrations do not break."""
    import uuid

    raw_key = "iti_" + "ab" * 24
    now = datetime.now(timezone.utc)
    await fake_db.api_keys.insert_one({
        "key_id": str(uuid.uuid4()),
        "key_hash": hash_api_key(raw_key),
        "prefix": raw_key[:12] + "…",
        "name": "legacy-key",
        "username": "techuser",
        "role": "tech",
        "created_at": now,
        "expires_at": None,
        "last_used_at": None,
        "revoked": False,
    })

    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {raw_key}"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "techuser"


@pytest.mark.asyncio
async def test_revoked_api_key_rejected(client, tech_headers):
    create_resp = await client.post("/api/api-keys", json={"name": "revoke-test"}, headers=tech_headers)
    data = create_resp.json()
    raw_key = data["key"]
    key_id = data["key_id"]

    # Revoke it
    await client.delete(f"/api/api-keys/{key_id}", headers=tech_headers)

    # Now try to use it
    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {raw_key}"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_expired_api_key_rejected(client, fake_db, tech_headers):
    """An API key with expires_at in the past should be rejected."""
    from auth import hash_api_key
    import uuid

    raw_key = "vtg_" + "ab" * 24
    now = datetime.now(timezone.utc)
    await fake_db.api_keys.insert_one({
        "key_id": str(uuid.uuid4()),
        "key_hash": hash_api_key(raw_key),
        "prefix": raw_key[:12] + "…",
        "name": "expired",
        "username": "techuser",
        "role": "tech",
        "created_at": now - timedelta(days=10),
        "expires_at": now - timedelta(days=1),  # already expired
        "last_used_at": None,
        "revoked": False,
    })

    resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {raw_key}"})
    assert resp.status_code == 401

"""
Tests for active sessions management endpoints (FASE 2b).
"""

import uuid
import pytest
from datetime import datetime, timedelta, timezone

from auth import create_access_token, hash_refresh_token


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_session(username="techuser", role="tech", revoked=False, expired=False, session_id=None):
    """Build a fake refresh_token document."""
    now = datetime.now(timezone.utc)
    raw_token = f"tok-{uuid.uuid4()}"
    return {
        "session_id": session_id or str(uuid.uuid4()),
        "token_hash": hash_refresh_token(raw_token),
        "_raw_token": raw_token,
        "username": username,
        "role": role,
        "ip": "127.0.0.1",
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
        "created_at": now - timedelta(hours=1),
        "expires_at": now - timedelta(hours=1) if expired else now + timedelta(days=6),
        "revoked": revoked,
    }


# ── GET /api/auth/sessions ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_sessions_returns_active_only(async_client, fake_db):
    """Only non-revoked, non-expired sessions should be listed."""
    token = create_access_token({"sub": "techuser", "role": "tech"})
    active = _make_session("techuser")
    revoked = _make_session("techuser", revoked=True)
    expired = _make_session("techuser", expired=True)
    for s in [active, revoked, expired]:
        await fake_db.refresh_tokens.insert_one(s)

    resp = await async_client.get(
        "/api/auth/sessions",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["session_id"] == active["session_id"]


@pytest.mark.asyncio
async def test_list_sessions_requires_auth(async_client):
    resp = await async_client.get("/api/auth/sessions")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_sessions_shows_device_and_ip(async_client, fake_db):
    """Sessions list must include device label and IP."""
    token = create_access_token({"sub": "techuser", "role": "tech"})
    s = _make_session("techuser")
    await fake_db.refresh_tokens.insert_one(s)

    resp = await async_client.get(
        "/api/auth/sessions",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    item = resp.json()[0]
    assert "device" in item
    assert item["ip"] == "127.0.0.1"
    assert "created_at" in item
    assert "expires_at" in item
    assert "is_current" in item


@pytest.mark.asyncio
async def test_list_sessions_only_own(async_client, fake_db):
    """Users must not see sessions belonging to other users."""
    token = create_access_token({"sub": "techuser", "role": "tech"})
    own = _make_session("techuser")
    other = _make_session("admin")
    for s in [own, other]:
        await fake_db.refresh_tokens.insert_one(s)

    resp = await async_client.get(
        "/api/auth/sessions",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    ids = [i["session_id"] for i in resp.json()]
    assert own["session_id"] in ids
    assert other["session_id"] not in ids


# ── DELETE /api/auth/sessions/{session_id} ───────────────────────────────────

@pytest.mark.asyncio
async def test_revoke_own_session(async_client, fake_db):
    """User can revoke their own session."""
    token = create_access_token({"sub": "techuser", "role": "tech"})
    s = _make_session("techuser")
    await fake_db.refresh_tokens.insert_one(s)

    resp = await async_client.delete(
        f"/api/auth/sessions/{s['session_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["revoked"] is True

    stored = await fake_db.refresh_tokens.find_one({"session_id": s["session_id"]})
    assert stored["revoked"] is True


@pytest.mark.asyncio
async def test_revoke_nonexistent_session_returns_404(async_client, fake_db):
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.delete(
        "/api/auth/sessions/nonexistent-id",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_user_cannot_revoke_other_user_session(async_client, fake_db):
    """Tech user must not be able to revoke an admin's session."""
    token = create_access_token({"sub": "techuser", "role": "tech"})
    s = _make_session("admin", role="admin")
    await fake_db.refresh_tokens.insert_one(s)

    resp = await async_client.delete(
        f"/api/auth/sessions/{s['session_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_revoke_any_session(async_client, auth_headers, fake_db):
    """Admin can revoke any user's session."""
    s = _make_session("techuser")
    await fake_db.refresh_tokens.insert_one(s)

    resp = await async_client.delete(
        f"/api/auth/sessions/{s['session_id']}",
        headers=auth_headers,
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_revoked_session_rejects_bound_access_token(async_client):
    login_resp = await async_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "tech123"},
    )
    assert login_resp.status_code == 200
    access_token = login_resp.cookies["access_token"]

    sessions_resp = await async_client.get("/api/auth/sessions")
    assert sessions_resp.status_code == 200
    session_id = sessions_resp.json()[0]["session_id"]

    revoke_resp = await async_client.delete(f"/api/auth/sessions/{session_id}")
    assert revoke_resp.status_code == 200

    async_client.cookies.clear()
    me_resp = await async_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_resp.status_code == 401


# ── DELETE /api/auth/sessions/others ────────────────────────────────────────

@pytest.mark.asyncio
async def test_revoke_other_sessions(async_client, fake_db):
    """Revoking 'others' must keep the current session and revoke the rest."""
    token = create_access_token({"sub": "techuser", "role": "tech"})
    current_sid = str(uuid.uuid4())
    current_tok = f"tok-current-{uuid.uuid4()}"
    current = {
        "session_id": current_sid,
        "token_hash": hash_refresh_token(current_tok),
        "username": "techuser",
        "role": "tech",
        "ip": "127.0.0.1",
        "user_agent": "Chrome",
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=6),
        "revoked": False,
    }
    other1 = _make_session("techuser")
    other2 = _make_session("techuser")
    for s in [current, other1, other2]:
        await fake_db.refresh_tokens.insert_one(s)

    resp = await async_client.delete(
        "/api/auth/sessions/others",
        headers={"Authorization": f"Bearer {token}"},
        cookies={"refresh_token": current_tok},
    )
    assert resp.status_code == 200
    assert resp.json()["revoked"] == 2

    # Current session must still be active
    stored_current = await fake_db.refresh_tokens.find_one({"session_id": current_sid})
    assert stored_current["revoked"] is False

    # Others must be revoked
    for s in [other1, other2]:
        stored = await fake_db.refresh_tokens.find_one({"session_id": s["session_id"]})
        assert stored["revoked"] is True


# ── GET /api/auth/sessions/admin/{username} ──────────────────────────────────

@pytest.mark.asyncio
async def test_admin_can_list_any_user_sessions(async_client, auth_headers, fake_db):
    s = _make_session("techuser")
    await fake_db.refresh_tokens.insert_one(s)

    resp = await async_client.get(
        "/api/auth/sessions/admin/techuser",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    ids = [i["session_id"] for i in resp.json()]
    assert s["session_id"] in ids


@pytest.mark.asyncio
async def test_tech_cannot_access_admin_sessions_view(async_client, fake_db):
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.get(
        "/api/auth/sessions/admin/admin",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403

"""Tests for FASE 3c — Password reset via email (forgot-password / reset-password)."""

import pytest
import pytest_asyncio
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport

from main import app
from auth import create_access_token, get_password_hash, verify_password


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


@pytest_asyncio.fixture
async def client(fake_db, monkeypatch):
    from db import db_manager
    monkeypatch.setattr(db_manager, "db", fake_db)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def mock_mailer(monkeypatch):
    """Always mock the mailer so tests don't need SMTP."""
    import mailer
    monkeypatch.setattr(mailer, "send_password_reset_email", lambda *a, **kw: _fake_send(*a, **kw))


async def _fake_send(to_email: str, reset_token: str) -> bool:
    return True  # pretend email was sent


# ── POST /api/auth/forgot-password ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_forgot_password_known_email_returns_200(client):
    resp = await client.post("/api/auth/forgot-password", json={"email": "admin@soc.local"})
    assert resp.status_code == 200
    assert "message" in resp.json()


@pytest.mark.asyncio
async def test_forgot_password_unknown_email_still_200(client):
    """Never reveal whether an email is registered."""
    resp = await client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_forgot_password_creates_token_in_db(client, fake_db):
    await client.post("/api/auth/forgot-password", json={"email": "admin@soc.local"})
    record = await fake_db.password_reset_tokens.find_one({"username": "admin"})
    assert record is not None
    assert "token_hash" in record
    assert record["used"] is False
    assert record["expires_at"] > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_forgot_password_uses_normalized_email_lookup(client, fake_db):
    await fake_db.users.update_one(
        {"username": "admin"},
        {"$set": {"normalized_email": "admin@soc.local"}},
    )
    resp = await client.post("/api/auth/forgot-password", json={"email": "  ADMIN@SOC.LOCAL  "})
    assert resp.status_code == 200
    record = await fake_db.password_reset_tokens.find_one({"username": "admin"})
    assert record is not None
    assert record["email"] == "admin@soc.local"


@pytest.mark.asyncio
async def test_forgot_password_accepts_recovery_email_lookup(client, fake_db, monkeypatch):
    sent = {}

    async def _capture_send(to_email: str, reset_token: str) -> bool:
        sent["to_email"] = to_email
        sent["reset_token"] = reset_token
        return True

    import routers.auth as auth_router
    monkeypatch.setattr(auth_router, "send_password_reset_email", _capture_send)

    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {
            "recovery_email": "soc-recovery@example.com",
            "normalized_recovery_email": "soc-recovery@example.com",
        }},
    )

    resp = await client.post("/api/auth/forgot-password", json={"email": "SOC-RECOVERY@EXAMPLE.COM"})
    assert resp.status_code == 200

    record = await fake_db.password_reset_tokens.find_one({"username": "techuser"})
    assert record is not None
    assert record["email"] == "soc-recovery@example.com"
    assert sent["to_email"] == "soc-recovery@example.com"


@pytest.mark.asyncio
async def test_forgot_password_prefers_recovery_email_as_delivery_target(client, fake_db, monkeypatch):
    sent = {}

    async def _capture_send(to_email: str, reset_token: str) -> bool:
        sent["to_email"] = to_email
        sent["reset_token"] = reset_token
        return True

    import routers.auth as auth_router
    monkeypatch.setattr(auth_router, "send_password_reset_email", _capture_send)

    await fake_db.users.update_one(
        {"username": "admin"},
        {"$set": {
            "recovery_email": "recover-admin@soc.local",
            "normalized_recovery_email": "recover-admin@soc.local",
        }},
    )

    resp = await client.post("/api/auth/forgot-password", json={"email": "admin@soc.local"})
    assert resp.status_code == 200

    record = await fake_db.password_reset_tokens.find_one({"username": "admin"})
    assert record is not None
    assert record["email"] == "recover-admin@soc.local"
    assert sent["to_email"] == "recover-admin@soc.local"


@pytest.mark.asyncio
async def test_forgot_password_inactive_user_no_token(client, fake_db):
    # inactive user has no email, but even if they did — inactive should be skipped
    await client.post("/api/auth/forgot-password", json={"email": "inactive@soc.local"})
    record = await fake_db.password_reset_tokens.find_one({"username": "inactive"})
    assert record is None


# ── POST /api/auth/reset-password ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reset_password_valid_token(client, fake_db):
    # Create a valid token manually
    raw_token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    await fake_db.password_reset_tokens.insert_one({
        "token_hash": _hash_token(raw_token),
        "username": "techuser",
        "email": "tech@soc.local",
        "created_at": now,
        "expires_at": now + timedelta(minutes=15),
        "used": False,
    })

    resp = await client.post("/api/auth/reset-password", json={
        "token": raw_token,
        "new_password": "NewPassword123!",
    })
    assert resp.status_code == 200
    assert "message" in resp.json()

    # Verify password was actually changed
    user = await fake_db.users.find_one({"username": "techuser"})
    assert verify_password("NewPassword123!", user["password_hash"])


@pytest.mark.asyncio
async def test_reset_password_marks_token_used(client, fake_db):
    raw_token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    await fake_db.password_reset_tokens.insert_one({
        "token_hash": _hash_token(raw_token),
        "username": "techuser",
        "email": "tech@soc.local",
        "created_at": now,
        "expires_at": now + timedelta(minutes=15),
        "used": False,
    })

    await client.post("/api/auth/reset-password", json={
        "token": raw_token,
        "new_password": "NewPass123!",
    })

    record = await fake_db.password_reset_tokens.find_one({"token_hash": _hash_token(raw_token)})
    assert record["used"] is True


@pytest.mark.asyncio
async def test_reset_password_token_used_twice_rejected(client, fake_db):
    raw_token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    await fake_db.password_reset_tokens.insert_one({
        "token_hash": _hash_token(raw_token),
        "username": "techuser",
        "email": "tech@soc.local",
        "created_at": now,
        "expires_at": now + timedelta(minutes=15),
        "used": True,  # already used
    })

    resp = await client.post("/api/auth/reset-password", json={
        "token": raw_token,
        "new_password": "NewPass123!",
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "token_already_used"


@pytest.mark.asyncio
async def test_reset_password_expired_token_rejected(client, fake_db):
    raw_token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    await fake_db.password_reset_tokens.insert_one({
        "token_hash": _hash_token(raw_token),
        "username": "techuser",
        "email": "tech@soc.local",
        "created_at": now - timedelta(minutes=20),
        "expires_at": now - timedelta(minutes=5),  # expired
        "used": False,
    })

    resp = await client.post("/api/auth/reset-password", json={
        "token": raw_token,
        "new_password": "NewPass123!",
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "invalid_or_expired_token"


@pytest.mark.asyncio
async def test_reset_password_invalid_token_rejected(client):
    resp = await client.post("/api/auth/reset-password", json={
        "token": "completely-fake-token",
        "new_password": "NewPass123!",
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "invalid_or_expired_token"


@pytest.mark.asyncio
async def test_reset_password_clears_force_reset_flag(client, fake_db):
    # Set force_password_reset on the user
    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"force_password_reset": True}},
    )

    raw_token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    await fake_db.password_reset_tokens.insert_one({
        "token_hash": _hash_token(raw_token),
        "username": "techuser",
        "email": "tech@soc.local",
        "created_at": now,
        "expires_at": now + timedelta(minutes=15),
        "used": False,
    })

    await client.post("/api/auth/reset-password", json={
        "token": raw_token,
        "new_password": "NewPass123!",
    })

    user = await fake_db.users.find_one({"username": "techuser"})
    assert user["force_password_reset"] is False


@pytest.mark.asyncio
async def test_reset_password_reuse_denied(client, fake_db):
    """Cannot reset to the current password (history check)."""
    # Use a password that satisfies the policy (≥8 chars) but is in history
    reused_password = "Tech1234!"
    current_hash = get_password_hash(reused_password)
    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"password_history": [current_hash]}},
    )

    raw_token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    await fake_db.password_reset_tokens.insert_one({
        "token_hash": _hash_token(raw_token),
        "username": "techuser",
        "email": "tech@soc.local",
        "created_at": now,
        "expires_at": now + timedelta(minutes=15),
        "used": False,
    })

    resp = await client.post("/api/auth/reset-password", json={
        "token": raw_token,
        "new_password": reused_password,  # same as history entry
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "password_reuse_denied"


# ── Email field in user CRUD ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_user_with_email(client, fake_db):
    admin_token = create_access_token({"sub": "admin", "role": "admin"})
    resp = await client.post("/api/users", json={
        "username": "newuser",
        "password": "Pass123!",
        "role": "tech",
        "name": "New User",
        "email": "newuser@soc.local",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200

    user = await fake_db.users.find_one({"username": "newuser"})
    assert user["email"] == "newuser@soc.local"
    assert user["normalized_email"] == "newuser@soc.local"


@pytest.mark.asyncio
async def test_update_my_preferences_persists_normalized_recovery_email(async_client, fake_db):
    tech_token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.put(
        "/api/users/me",
        json={"recovery_email": "  Recovery+Ops@Example.com  "},
        headers={"Authorization": f"Bearer {tech_token}"},
    )
    assert resp.status_code == 200

    user = await fake_db.users.find_one({"username": "techuser"})
    assert user["recovery_email"] == "recovery+ops@example.com"
    assert user["normalized_recovery_email"] == "recovery+ops@example.com"


@pytest.mark.asyncio
async def test_update_my_preferences_rejects_duplicate_recovery_email(async_client, fake_db):
    tech_token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.put(
        "/api/users/me",
        json={"recovery_email": "admin@soc.local"},
        headers={"Authorization": f"Bearer {tech_token}"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Email already in use"


@pytest.mark.asyncio
async def test_update_my_preferences_persists_bio_and_avatar(async_client, fake_db):
    tech_token = create_access_token({"sub": "techuser", "role": "tech"})
    avatar_data = "data:image/png;base64,ZmFrZV9hdmF0YXI="
    resp = await async_client.put(
        "/api/users/me",
        json={
            "bio": "SOC lead for regional operations",
            "avatar_base64": avatar_data,
            "avatar_fit": "contain",
        },
        headers={"Authorization": f"Bearer {tech_token}"},
    )
    assert resp.status_code == 200

    user = await fake_db.users.find_one({"username": "techuser"})
    assert user["bio"] == "SOC lead for regional operations"
    assert user["avatar_base64"] == avatar_data
    assert user["avatar_fit"] == "contain"


@pytest.mark.asyncio
async def test_update_my_preferences_can_clear_avatar(async_client, fake_db):
    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"avatar_base64": "data:image/png;base64,abc", "avatar_fit": "contain"}},
    )
    tech_token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.put(
        "/api/users/me",
        json={"avatar_base64": None, "avatar_fit": "cover"},
        headers={"Authorization": f"Bearer {tech_token}"},
    )
    assert resp.status_code == 200

    user = await fake_db.users.find_one({"username": "techuser"})
    assert user["avatar_base64"] is None
    assert user["avatar_fit"] == "cover"


@pytest.mark.asyncio
async def test_auth_me_returns_avatar_fit(async_client, fake_db):
    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"avatar_fit": "contain", "avatar_base64": "data:image/png;base64,abc"}},
    )
    tech_token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {tech_token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["avatar_fit"] == "contain"
    assert body["avatar_base64"] == "data:image/png;base64,abc"


@pytest.mark.asyncio
async def test_update_my_preferences_persists_notification_center(async_client, fake_db):
    tech_token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.put(
        "/api/users/me",
        json={
            "notification_center": {
                "read_ids": ["note-1"],
                "archived_ids": ["note-2"],
                "preferences": {
                    "critical": False,
                    "system": True,
                    "intelligence": False,
                },
            }
        },
        headers={"Authorization": f"Bearer {tech_token}"},
    )
    assert resp.status_code == 200

    user = await fake_db.users.find_one({"username": "techuser"})
    assert user["notification_center"]["read_ids"] == ["note-1"]
    assert user["notification_center"]["archived_ids"] == ["note-2"]
    assert user["notification_center"]["preferences"] == {
        "critical": False,
        "system": True,
        "intelligence": False,
    }


@pytest.mark.asyncio
async def test_create_user_rejects_duplicate_email_case_insensitive(client):
    admin_token = create_access_token({"sub": "admin", "role": "admin"})
    resp = await client.post("/api/users", json={
        "username": "newuser",
        "password": "Pass123!",
        "role": "tech",
        "name": "New User",
        "email": "ADMIN@SOC.LOCAL",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Email already in use"


@pytest.mark.asyncio
async def test_update_user_email(client, fake_db):
    admin_token = create_access_token({"sub": "admin", "role": "admin"})
    resp = await client.put("/api/users/techuser", json={
        "email": "updated@soc.local",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200

    user = await fake_db.users.find_one({"username": "techuser"})
    assert user["email"] == "updated@soc.local"
    assert user["normalized_email"] == "updated@soc.local"


@pytest.mark.asyncio
async def test_update_user_email_rejects_duplicate_case_insensitive(client):
    admin_token = create_access_token({"sub": "admin", "role": "admin"})
    resp = await client.put("/api/users/techuser", json={
        "email": " ADMIN@SOC.LOCAL ",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Email already in use"

"""
Integration tests for /api/auth endpoints.
"""

import pytest

from auth import hash_refresh_token


@pytest.mark.asyncio
async def test_login_success(async_client):
    # Use techuser (non-mandatory-MFA role) to test normal login flow
    response = await async_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "TestTech@9876"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["username"] == "techuser"
    assert body["token_type"] == "bearer"
    # HttpOnly cookies must be set
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


@pytest.mark.asyncio
async def test_login_stores_refresh_token_as_hash(async_client, fake_db):
    response = await async_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "TestTech@9876"},
    )
    assert response.status_code == 200

    stored = await fake_db.refresh_tokens.find_one({"username": "techuser", "revoked": False})
    assert stored is not None
    assert stored["token_hash"] == hash_refresh_token(response.cookies["refresh_token"])
    assert "token" not in stored


@pytest.mark.asyncio
async def test_login_wrong_password(async_client):
    response = await async_client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "wrongpass"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_inactive_user(async_client):
    response = await async_client.post(
        "/api/auth/login",
        data={"username": "inactive", "password": "pass"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_me_authenticated(async_client, auth_headers):
    response = await async_client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "admin"
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_get_me_unauthenticated(async_client):
    response = await async_client.get("/api/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout(async_client, auth_headers):
    response = await async_client.post("/api/auth/logout", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["message"] == "Logged out successfully"


@pytest.mark.asyncio
async def test_refresh_rotates_hashed_token_and_uses_current_role(async_client, fake_db):
    login_resp = await async_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "TestTech@9876"},
    )
    assert login_resp.status_code == 200
    old_refresh_token = login_resp.cookies["refresh_token"]
    old_hash = hash_refresh_token(old_refresh_token)

    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"role": "manager"}},
    )

    refresh_resp = await async_client.post("/api/auth/refresh")
    assert refresh_resp.status_code == 200
    new_refresh_token = refresh_resp.cookies["refresh_token"]
    new_hash = hash_refresh_token(new_refresh_token)
    assert new_hash != old_hash

    old_doc = await fake_db.refresh_tokens.find_one({"token_hash": old_hash})
    new_doc = await fake_db.refresh_tokens.find_one({"token_hash": new_hash})
    assert old_doc["revoked"] is True
    assert new_doc["revoked"] is False
    assert new_doc["role"] == "manager"

    me_resp = await async_client.get("/api/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["role"] == "manager"


@pytest.mark.asyncio
async def test_refresh_rejects_reuse_of_rotated_refresh_token(async_client):
    login_resp = await async_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "TestTech@9876"},
    )
    assert login_resp.status_code == 200
    old_refresh_token = login_resp.cookies["refresh_token"]

    refresh_resp = await async_client.post("/api/auth/refresh")
    assert refresh_resp.status_code == 200

    reuse_resp = await async_client.post(
        "/api/auth/refresh",
        cookies={"refresh_token": old_refresh_token},
    )
    assert reuse_resp.status_code == 401
    assert reuse_resp.json()["detail"] == "Invalid refresh token"


@pytest.mark.asyncio
async def test_refresh_rejects_inactive_user(async_client, fake_db):
    login_resp = await async_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "TestTech@9876"},
    )
    assert login_resp.status_code == 200

    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"is_active": False}},
    )

    refresh_resp = await async_client.post("/api/auth/refresh")
    assert refresh_resp.status_code == 403
    assert refresh_resp.json()["detail"] == "Inactive user account"

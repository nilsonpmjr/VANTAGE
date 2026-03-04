"""
Integration tests for /api/auth endpoints.
"""

import pytest


@pytest.mark.asyncio
async def test_login_success(async_client):
    # Use techuser (non-mandatory-MFA role) to test normal login flow
    response = await async_client.post(
        "/api/auth/login",
        data={"username": "techuser", "password": "tech123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["username"] == "techuser"
    assert body["token_type"] == "bearer"
    # HttpOnly cookies must be set
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


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

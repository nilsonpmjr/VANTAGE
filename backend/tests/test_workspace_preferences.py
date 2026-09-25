"""HTTP coverage for authenticated workspace preference changes."""

import pytest


@pytest.fixture
def tech_headers(tech_token):
    return {"Authorization": f"Bearer {tech_token}"}


@pytest.mark.asyncio
async def test_user_can_switch_to_authorized_offensive_workspace(
    async_client,
    fake_db,
    tech_headers,
):
    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"extra_permissions": ["redmode:access"]}},
    )

    response = await async_client.put(
        "/api/users/me/workspace",
        json={"workspace": "offensive"},
        headers=tech_headers,
    )

    assert response.status_code == 200
    assert response.json()["workspace"] == "offensive"
    assert response.json()["user"]["preferred_workspace"] == "offensive"
    stored_user = await fake_db.users.find_one({"username": "techuser"})
    assert stored_user["preferred_workspace"] == "offensive"


@pytest.mark.asyncio
async def test_workspace_switch_rejects_invalid_value(async_client, tech_headers):
    response = await async_client.put(
        "/api/users/me/workspace",
        json={"workspace": "unknown"},
        headers=tech_headers,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid workspace"


@pytest.mark.asyncio
async def test_workspace_switch_requires_offensive_permission(
    async_client,
    fake_db,
    tech_headers,
):
    response = await async_client.put(
        "/api/users/me/workspace",
        json={"workspace": "offensive"},
        headers=tech_headers,
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "permission_required:redmode:access"
    stored_user = await fake_db.users.find_one({"username": "techuser"})
    assert stored_user.get("preferred_workspace", "soc") == "soc"


@pytest.mark.asyncio
async def test_session_validation_falls_back_after_offensive_access_is_revoked(
    async_client,
    fake_db,
    tech_headers,
):
    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {
            "preferred_workspace": "offensive",
            "extra_permissions": [],
        }},
    )

    response = await async_client.get("/api/auth/me", headers=tech_headers)

    assert response.status_code == 200
    assert response.json()["preferred_workspace"] == "soc"
    stored_user = await fake_db.users.find_one({"username": "techuser"})
    assert stored_user["preferred_workspace"] == "soc"


@pytest.mark.asyncio
async def test_user_can_switch_back_to_soc(async_client, fake_db, tech_headers):
    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {
            "preferred_workspace": "offensive",
            "extra_permissions": ["redmode:access"],
        }},
    )

    response = await async_client.put(
        "/api/users/me/workspace",
        json={"workspace": "soc"},
        headers=tech_headers,
    )

    assert response.status_code == 200
    assert response.json()["workspace"] == "soc"
    stored_user = await fake_db.users.find_one({"username": "techuser"})
    assert stored_user["preferred_workspace"] == "soc"

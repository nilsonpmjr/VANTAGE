"""Integration tests for OM4-02: Server-side querying, filtering, and sorting of engagements."""

from datetime import datetime, timezone, timedelta
import pytest
from auth import create_access_token


def headers_for(username: str, role: str = "tech") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


async def grant_redmode(fake_db, username: str) -> None:
    await fake_db.users.insert_one({
        "username": username,
        "name": username.title(),
        "role": "tech",
        "is_active": True,
        "extra_permissions": ["redmode:access"],
    })


@pytest.fixture
async def sample_projects(fake_db):
    await grant_redmode(fake_db, "alice")
    await grant_redmode(fake_db, "bob")

    now = datetime(2026, 9, 29, 12, 0, 0, tzinfo=timezone.utc)
    docs = [
        {
            "_id": "alpha-corp",
            "display_name": "Alpha Corporation Red Team",
            "phase": "reconnaissance",
            "status": "active",
            "responsible": "alice",
            "members": ["alice"],
            "created_at": now - timedelta(days=10),
            "last_activity_at": now - timedelta(days=1),
        },
        {
            "_id": "beta-bank",
            "display_name": "Beta Bank Security Assessment",
            "phase": "vulnerability-analysis",
            "status": "completed",
            "responsible": "bob",
            "members": ["bob"],
            "created_at": now - timedelta(days=20),
            "last_activity_at": now - timedelta(days=5),
        },
        {
            "_id": "gamma-tech",
            "display_name": "Gamma Tech External PenTest",
            "phase": "exploitation",
            "status": "active",
            "responsible": "alice",
            "members": ["alice", "bob"],
            "created_at": now - timedelta(days=5),
            "last_activity_at": now,
        },
        {
            "_id": "delta-health",
            "display_name": "Delta Health Archival",
            "phase": "reporting",
            "status": "archived",
            "responsible": "bob",
            "members": ["bob"],
            "created_at": now - timedelta(days=30),
            "last_activity_at": now - timedelta(days=15),
        },
    ]
    for doc in docs:
        await fake_db.redmode_projects.insert_one(doc)
    return docs


@pytest.mark.asyncio
async def test_query_engagements_backward_compatible(async_client, sample_projects):
    response = await async_client.get("/api/redmode/projects", headers=headers_for("alice"))
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 4
    items = data["items"]
    assert len(items) == 4
    # Default order by last_activity_at descending: gamma-tech (now), alpha-corp (-1d), beta-bank (-5d), delta-health (-15d)
    assert [item["slug"] for item in items] == ["gamma-tech", "alpha-corp", "beta-bank", "delta-health"]
    # Check can_open derived from membership
    assert items[0]["can_open"] is True   # gamma-tech: alice is member
    assert items[1]["can_open"] is True   # alpha-corp: alice is member
    assert items[2]["can_open"] is False  # beta-bank: alice is not member
    assert items[3]["can_open"] is False  # delta-health: alice is not member


@pytest.mark.asyncio
async def test_query_engagements_search(async_client, sample_projects):
    # Search by display name
    response = await async_client.get("/api/redmode/projects?search=Bank", headers=headers_for("alice"))
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["slug"] == "beta-bank"

    # Search by slug
    response = await async_client.get("/api/redmode/projects?search=alpha-corp", headers=headers_for("alice"))
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["slug"] == "alpha-corp"

    # Search with regex special characters (should be safely escaped)
    response = await async_client.get("/api/redmode/projects?search=[alpha]*", headers=headers_for("alice"))
    assert response.status_code == 200
    assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_query_engagements_access_filter(async_client, sample_projects):
    # Alice's projects (mine)
    response = await async_client.get("/api/redmode/projects?access=mine", headers=headers_for("alice"))
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert {item["slug"] for item in data["items"]} == {"alpha-corp", "gamma-tech"}
    assert all(item["can_open"] is True for item in data["items"])

    # Discoverable projects (where Alice is not a member)
    response = await async_client.get("/api/redmode/projects?access=discoverable", headers=headers_for("alice"))
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert {item["slug"] for item in data["items"]} == {"beta-bank", "delta-health"}
    assert all(item["can_open"] is False for item in data["items"])


@pytest.mark.asyncio
async def test_query_engagements_status_and_phase_filters(async_client, sample_projects):
    # Filter by status active
    response = await async_client.get("/api/redmode/projects?status=active", headers=headers_for("alice"))
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert {item["slug"] for item in data["items"]} == {"alpha-corp", "gamma-tech"}

    # Filter by status archived
    response = await async_client.get("/api/redmode/projects?status=archived", headers=headers_for("alice"))
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["slug"] == "delta-health"

    # Filter by phase reconnaissance
    response = await async_client.get("/api/redmode/projects?phase=reconnaissance", headers=headers_for("alice"))
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["slug"] == "alpha-corp"


@pytest.mark.asyncio
async def test_query_engagements_sorting(async_client, sample_projects):
    # Sort by created_at ascending
    response = await async_client.get("/api/redmode/projects?sort_by=created_at&order=asc", headers=headers_for("alice"))
    assert response.status_code == 200
    items = response.json()["items"]
    # Created dates: delta-health (-30d), beta-bank (-20d), alpha-corp (-10d), gamma-tech (-5d)
    assert [item["slug"] for item in items] == ["delta-health", "beta-bank", "alpha-corp", "gamma-tech"]

    # Sort by display_name ascending
    response = await async_client.get("/api/redmode/projects?sort_by=display_name&order=asc", headers=headers_for("alice"))
    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["slug"] for item in items] == ["alpha-corp", "beta-bank", "delta-health", "gamma-tech"]


@pytest.mark.asyncio
async def test_query_engagements_pagination(async_client, sample_projects):
    # Limit 2, offset 0
    res1 = await async_client.get("/api/redmode/projects?limit=2&offset=0", headers=headers_for("alice"))
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["total"] == 4
    assert len(data1["items"]) == 2

    # Limit 2, offset 2
    res2 = await async_client.get("/api/redmode/projects?limit=2&offset=2", headers=headers_for("alice"))
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["total"] == 4
    assert len(data2["items"]) == 2

    # Verify no overlap
    slugs1 = [item["slug"] for item in data1["items"]]
    slugs2 = [item["slug"] for item in data2["items"]]
    assert set(slugs1).isdisjoint(set(slugs2))


@pytest.mark.asyncio
async def test_query_engagements_invalid_params(async_client, sample_projects):
    # Invalid access parameter
    res = await async_client.get("/api/redmode/projects?access=invalid", headers=headers_for("alice"))
    assert res.status_code == 422

    # Invalid status parameter
    res = await async_client.get("/api/redmode/projects?status=destroyed", headers=headers_for("alice"))
    assert res.status_code == 422

    # Invalid sort_by parameter
    res = await async_client.get("/api/redmode/projects?sort_by=password", headers=headers_for("alice"))
    assert res.status_code == 422

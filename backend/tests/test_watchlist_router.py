from datetime import datetime, timezone

import pytest
from bson import ObjectId


@pytest.mark.asyncio
async def test_add_watchlist_item_persists_notification_route(async_client, auth_headers):
    response = await async_client.post(
        "/api/watchlist/",
        headers=auth_headers,
        json={
            "target": "8.8.8.8",
            "notify_on_change": True,
            "notification_route": "both",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["notification_route"] == "both"


@pytest.mark.asyncio
async def test_bulk_watchlist_action_updates_routes(fake_db, async_client, auth_headers):
    first_id = ObjectId()
    second_id = ObjectId()
    await fake_db.watchlist.insert_one(
        {
            "_id": first_id,
            "user": "admin",
            "target": "alpha.example",
            "target_type": "domain",
            "notify_on_change": True,
            "notification_route": "email",
            "created_at": datetime.now(timezone.utc),
        }
    )
    await fake_db.watchlist.insert_one(
        {
            "_id": second_id,
            "user": "admin",
            "target": "beta.example",
            "target_type": "domain",
            "notify_on_change": True,
            "notification_route": "email",
            "created_at": datetime.now(timezone.utc),
        }
    )

    response = await async_client.post(
        "/api/watchlist/bulk",
        headers=auth_headers,
        json={
            "item_ids": [str(first_id), str(second_id)],
            "action": "set_route",
            "notification_route": "in_app",
        },
    )

    assert response.status_code == 200
    assert response.json()["updated"] == 2
    assert fake_db.watchlist._data[0]["notification_route"] == "in_app"
    assert fake_db.watchlist._data[1]["notification_route"] == "in_app"


@pytest.mark.asyncio
async def test_manual_watchlist_scan_records_history(fake_db, async_client, auth_headers, monkeypatch):
    item_id = ObjectId()
    await fake_db.watchlist.insert_one(
        {
            "_id": item_id,
            "user": "admin",
            "target": "malicious.example",
            "target_type": "domain",
            "notify_on_change": True,
            "notification_route": "email",
            "last_verdict": "SAFE",
            "created_at": datetime.now(timezone.utc),
        }
    )

    async def _fake_eval(_client, target, target_type):
        assert target == "malicious.example"
        assert target_type == "domain"
        return {"verdict": "HIGH RISK", "total_sources": 4}

    monkeypatch.setattr("routers.watchlist.evaluate_watchlist_target", _fake_eval)

    response = await async_client.post(
        f"/api/watchlist/{item_id}/scan",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["changed"] is True
    assert data["verdict"] == "HIGH RISK"
    assert len(fake_db.watchlist_history._data) == 1
    assert fake_db.watchlist_history._data[0]["previous_verdict"] == "SAFE"

    history_response = await async_client.get(
        f"/api/watchlist/{item_id}/history?limit=12",
        headers=auth_headers,
    )
    assert history_response.status_code == 200
    history_data = history_response.json()
    assert history_data["total"] == 1
    assert history_data["items"][0]["verdict"] == "HIGH RISK"

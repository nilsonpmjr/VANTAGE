from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId


@pytest.mark.asyncio
async def test_shift_handoffs_filter_by_visibility_days(async_client, auth_headers, fake_db):
    now = datetime.now(timezone.utc)
    fake_db.shift_handoffs._data = [
        {
            "_id": ObjectId(),
            "shift_date": "2026-04-07",
            "team_members": ["alpha"],
            "body": "four day handoff",
            "visibility_days": 4,
            "expires_at": now + timedelta(days=2),
            "created_by": "admin",
            "created_at": now - timedelta(hours=3),
            "updated_at": now - timedelta(hours=3),
            "incidents": [],
            "tools_status": [],
            "observations": "",
            "shift_focus": "",
            "acknowledged_by": "",
            "acknowledged_at": None,
            "attachments": [],
            "edit_history": [],
        },
        {
            "_id": ObjectId(),
            "shift_date": "2026-04-07",
            "team_members": ["bravo"],
            "body": "seven day handoff",
            "visibility_days": 7,
            "expires_at": now + timedelta(days=5),
            "created_by": "admin",
            "created_at": now - timedelta(hours=1),
            "updated_at": now - timedelta(hours=1),
            "incidents": [],
            "tools_status": [],
            "observations": "",
            "shift_focus": "",
            "acknowledged_by": "",
            "acknowledged_at": None,
            "attachments": [],
            "edit_history": [],
        },
    ]

    response = await async_client.get("/api/shift-handoffs?days=4", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["visibility_days"] == 4
    assert body[0]["body"] == "four day handoff"


@pytest.mark.asyncio
async def test_shift_handoffs_are_sorted_by_created_at_desc(async_client, auth_headers, fake_db):
    now = datetime.now(timezone.utc)
    older_id = ObjectId()
    newer_id = ObjectId()
    fake_db.shift_handoffs._data = [
        {
            "_id": older_id,
            "shift_date": "2026-04-08",
            "team_members": ["older"],
            "body": "older entry",
            "visibility_days": 4,
            "expires_at": now + timedelta(days=3),
            "created_by": "admin",
            "created_at": now - timedelta(hours=2),
            "updated_at": now - timedelta(hours=2),
            "incidents": [],
            "tools_status": [],
            "observations": "",
            "shift_focus": "",
            "acknowledged_by": "",
            "acknowledged_at": None,
            "attachments": [],
            "edit_history": [],
        },
        {
            "_id": newer_id,
            "shift_date": "2026-04-08",
            "team_members": ["newer"],
            "body": "newer entry",
            "visibility_days": 4,
            "expires_at": now + timedelta(days=3),
            "created_by": "admin",
            "created_at": now - timedelta(minutes=5),
            "updated_at": now - timedelta(minutes=5),
            "incidents": [],
            "tools_status": [],
            "observations": "",
            "shift_focus": "",
            "acknowledged_by": "",
            "acknowledged_at": None,
            "attachments": [],
            "edit_history": [],
        },
    ]

    response = await async_client.get("/api/shift-handoffs", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body] == [str(newer_id), str(older_id)]


@pytest.mark.asyncio
async def test_shift_handoff_incident_status_can_be_updated(async_client, auth_headers, fake_db):
    now = datetime.now(timezone.utc)
    handoff_id = ObjectId()
    incident_id = ObjectId()
    fake_db.shift_handoffs._data = [
        {
            "_id": handoff_id,
            "shift_date": "2026-04-08",
            "team_members": ["analyst"],
            "body": "incident lifecycle",
            "visibility_days": 4,
            "expires_at": now + timedelta(days=3),
            "created_by": "admin",
            "created_at": now - timedelta(hours=1),
            "updated_at": now - timedelta(hours=1),
            "incidents": [
                {
                    "incident_id": str(incident_id),
                    "title": "Malicious domain triage",
                    "status": "active",
                    "severity": "high",
                    "action_needed": "Contain and validate",
                }
            ],
            "tools_status": [],
            "observations": "",
            "shift_focus": "",
            "acknowledged_by": "",
            "acknowledged_at": None,
            "attachments": [],
            "edit_history": [],
        }
    ]
    fake_db.shift_handoff_incidents._data = [
        {
            "_id": incident_id,
            "handoff_id": handoff_id,
            "handoff_shift_date": "2026-04-08",
            "team_members": ["analyst"],
            "created_at": now - timedelta(hours=1),
            "created_by": "admin",
            "updated_at": now - timedelta(hours=1),
            "updated_by": "admin",
            "resolved_at": None,
            "resolved_by": "",
            "title": "Malicious domain triage",
            "severity": "high",
            "status": "active",
            "action_needed": "Contain and validate",
        }
    ]

    response = await async_client.post(
        f"/api/shift-handoffs/{handoff_id}/incidents/{incident_id}/status",
        headers=auth_headers,
        json={"status": "resolved", "action_needed": "Resolved by day shift"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["incidents"][0]["status"] == "resolved"
    assert body["incidents"][0]["action_needed"] == "Resolved by day shift"


@pytest.mark.asyncio
async def test_shift_handoff_attachment_rejects_mismatched_image_payload(
    async_client,
    auth_headers,
    fake_db,
):
    now = datetime.now(timezone.utc)
    handoff_id = ObjectId()
    fake_db.shift_handoffs._data = [
        {
            "_id": handoff_id,
            "shift_date": "2026-04-08",
            "team_members": ["analyst"],
            "body": "attachment test",
            "visibility_days": 4,
            "expires_at": now + timedelta(days=3),
            "created_by": "admin",
            "created_at": now - timedelta(hours=1),
            "updated_at": now - timedelta(hours=1),
            "incidents": [],
            "tools_status": [],
            "observations": "",
            "shift_focus": "",
            "acknowledged_by": "",
            "acknowledged_at": None,
            "attachments": [],
            "edit_history": [],
        }
    ]

    response = await async_client.post(
        f"/api/shift-handoffs/{handoff_id}/attachments",
        headers=auth_headers,
        files={"file": ("fake.png", b"not-a-real-png", "image/png")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "invalid_image_payload"


@pytest.mark.asyncio
async def test_shift_handoff_create_writes_audit_row(async_client, auth_headers, fake_db):
    response = await async_client.post(
        "/api/shift-handoffs",
        headers=auth_headers,
        json={
            "shift_date": "2026-04-08",
            "team_members": ["admin"],
            "body": "audit test",
            "visibility_days": 4,
        },
    )

    assert response.status_code == 200
    audit = await fake_db.audit_log.find_one({"action": "shift_handoff_create"})
    assert audit is not None
    assert audit["user"] == "admin"

"""
Regression tests for Session C — recon authorization parity.
"""

from datetime import datetime, timedelta, timezone

import pytest

from auth import create_access_token, hash_api_key
from worker import run_scheduled_recon


def _auth_headers(username: str, role: str) -> dict:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


def _module_catalog():
    return [
        {"name": "dns", "target_types": ["domain", "both"]},
        {"name": "whois", "target_types": ["domain", "both"]},
    ]


@pytest.mark.asyncio
async def test_recon_history_is_self_only_for_non_admin(async_client, fake_db):
    now = datetime.now(timezone.utc)
    await fake_db.recon_jobs.insert_one(
        {
            "_id": "job-tech",
            "target": "example.com",
            "modules": ["dns"],
            "analyst": "techuser",
            "status": "done",
            "created_at": now,
            "completed_at": now,
        }
    )
    await fake_db.recon_jobs.insert_one(
        {
            "_id": "job-admin",
            "target": "example.com",
            "modules": ["dns"],
            "analyst": "admin",
            "status": "done",
            "created_at": now - timedelta(minutes=5),
            "completed_at": now - timedelta(minutes=4),
        }
    )

    resp = await async_client.get(
        "/api/recon/history/example.com",
        headers=_auth_headers("techuser", "tech"),
    )
    assert resp.status_code == 200
    jobs = resp.json()["jobs"]
    assert len(jobs) == 1
    assert jobs[0]["analyst"] == "techuser"


@pytest.mark.asyncio
async def test_recon_history_admin_can_view_cross_user(async_client, fake_db):
    now = datetime.now(timezone.utc)
    await fake_db.recon_jobs.insert_one(
        {
            "_id": "job-tech",
            "target": "example.com",
            "modules": ["dns"],
            "analyst": "techuser",
            "status": "done",
            "created_at": now,
            "completed_at": now,
        }
    )
    await fake_db.recon_jobs.insert_one(
        {
            "_id": "job-admin",
            "target": "example.com",
            "modules": ["dns"],
            "analyst": "admin",
            "status": "done",
            "created_at": now - timedelta(minutes=5),
            "completed_at": now - timedelta(minutes=4),
        }
    )

    resp = await async_client.get(
        "/api/recon/history/example.com",
        headers=_auth_headers("admin", "admin"),
    )
    assert resp.status_code == 200
    analysts = {job["analyst"] for job in resp.json()["jobs"]}
    assert analysts == {"techuser", "admin"}


@pytest.mark.asyncio
async def test_schedule_scan_requires_recon_scope_for_api_key(async_client, fake_db, monkeypatch):
    monkeypatch.setattr("routers.recon.get_available_modules", _module_catalog)

    raw_key = "vtg_no_recon_scope"
    await fake_db.api_keys.insert_one(
        {
            "key_hash": hash_api_key(raw_key),
            "username": "techuser",
            "revoked": False,
            "expires_at": None,
            "scopes": ["analyze"],
        }
    )

    run_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    resp = await async_client.post(
        "/api/recon/scheduled",
        json={"target": "example.com", "modules": ["dns"], "run_at": run_at},
        headers={"Authorization": f"Bearer {raw_key}"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "API key missing required scope: recon"


@pytest.mark.asyncio
async def test_schedule_scan_accepts_recon_scoped_api_key(async_client, fake_db, monkeypatch):
    monkeypatch.setattr("routers.recon.get_available_modules", _module_catalog)

    raw_key = "vtg_with_recon_scope"
    await fake_db.api_keys.insert_one(
        {
            "key_hash": hash_api_key(raw_key),
            "username": "techuser",
            "revoked": False,
            "expires_at": None,
            "scopes": ["recon"],
        }
    )

    run_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    resp = await async_client.post(
        "/api/recon/scheduled",
        json={"target": "example.com", "modules": ["dns"], "run_at": run_at},
        headers={"Authorization": f"Bearer {raw_key}"},
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "pending"


@pytest.mark.asyncio
async def test_scheduled_recon_worker_fails_for_inactive_user(fake_db, monkeypatch):
    from db import db_manager

    monkeypatch.setattr(db_manager, "db", fake_db)

    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"is_active": False}},
    )
    await fake_db.recon_scheduled.insert_one(
        {
            "_id": "sched-1",
            "target": "example.com",
            "target_type": "domain",
            "modules": ["dns"],
            "analyst": "techuser",
            "status": "pending",
            "run_at": datetime.now(timezone.utc) - timedelta(minutes=1),
            "created_at": datetime.now(timezone.utc) - timedelta(minutes=2),
        }
    )

    await run_scheduled_recon()

    item = await fake_db.recon_scheduled.find_one({"_id": "sched-1"})
    assert item["status"] == "failed"
    assert item["error"] == "user_inactive"
    assert await fake_db.recon_jobs.find_one({"scheduled_id": "sched-1"}) is None

    audit = await fake_db.audit_log.find_one({"action": "recon_scheduled_denied"})
    assert audit is not None
    assert audit["detail"] == "user_inactive"


@pytest.mark.asyncio
async def test_scheduled_recon_worker_fails_for_ineligible_user(fake_db, monkeypatch):
    from db import db_manager

    monkeypatch.setattr(db_manager, "db", fake_db)

    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"force_password_reset": True}},
    )
    await fake_db.recon_scheduled.insert_one(
        {
            "_id": "sched-2",
            "target": "example.com",
            "target_type": "domain",
            "modules": ["dns"],
            "analyst": "techuser",
            "status": "pending",
            "run_at": datetime.now(timezone.utc) - timedelta(minutes=1),
            "created_at": datetime.now(timezone.utc) - timedelta(minutes=2),
        }
    )

    await run_scheduled_recon()

    item = await fake_db.recon_scheduled.find_one({"_id": "sched-2"})
    assert item["status"] == "failed"
    assert item["error"] == "password_reset_required"
    assert await fake_db.recon_jobs.find_one({"scheduled_id": "sched-2"}) is None

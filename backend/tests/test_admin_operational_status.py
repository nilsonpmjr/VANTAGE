from datetime import datetime, timezone

import pytest


@pytest.mark.asyncio
async def test_read_operational_status_requires_admin(async_client):
    resp = await async_client.get("/api/admin/operational-status")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_read_operational_status_returns_aggregated_services(async_client, auth_headers, fake_db, monkeypatch):
    await fake_db.system_status.insert_one(
        {
            "module": "worker",
            "last_run": datetime.now(timezone.utc),
            "status": "Healthy",
            "altered_targets": 2,
        }
    )
    await fake_db.operational_config.insert_one(
        {
            "_id": "singleton",
            "values": {
                "smtp_host": "smtp.control.local",
                "smtp_port": 2525,
                "smtp_from": "control@soc.local",
                "smtp_tls": True,
            },
            "secret_values": {"smtp_pass": "hidden"},
        }
    )

    monkeypatch.setattr(
        "operational_status._get_scheduler_runtime_state",
        lambda: {"running": True, "scheduled_jobs": 3},
    )

    resp = await async_client.get("/api/admin/operational-status", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"]["healthy"] == 5
    assert data["services"]["backend"]["consumption"]["pending_recon_jobs"] == 0
    assert data["services"]["mongodb"]["details"]["ping"] == "ok"
    assert data["services"]["scheduler"]["consumption"]["scheduled_jobs"] == 3
    assert data["services"]["worker"]["status"] == "healthy"
    assert data["services"]["worker"]["consumption"]["altered_targets"] == 2
    assert data["services"]["mailer"]["details"]["configured"] is True
    assert data["services"]["mailer"]["details"]["host"] == "smtp.control.local"


@pytest.mark.asyncio
async def test_read_operational_status_degrades_missing_worker_and_mailer(async_client, auth_headers, monkeypatch):
    monkeypatch.setattr(
        "operational_status._get_scheduler_runtime_state",
        lambda: {"running": False, "scheduled_jobs": 0},
    )

    resp = await async_client.get("/api/admin/operational-status", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["services"]["scheduler"]["status"] == "degraded"
    assert data["services"]["worker"]["status"] == "degraded"
    assert data["services"]["mailer"]["status"] == "degraded"
    assert data["summary"]["degraded"] >= 3


@pytest.mark.asyncio
async def test_operational_status_snapshot_tolerates_collector_failure(fake_db, monkeypatch):
    from operational_status import (
        collect_backend_status,
        collect_mailer_status,
        collect_scheduler_status,
        collect_worker_status,
        get_operational_status_snapshot,
    )

    async def _boom(_db):
        raise RuntimeError("ping failed")

    monkeypatch.setattr(
        "operational_status.SERVICE_COLLECTORS",
        {
            "backend": collect_backend_status,
            "mongodb": _boom,
            "scheduler": collect_scheduler_status,
            "worker": collect_worker_status,
            "mailer": collect_mailer_status,
        },
    )

    snapshot = await get_operational_status_snapshot(fake_db)

    assert snapshot["services"]["mongodb"]["status"] == "error"
    assert snapshot["services"]["mongodb"]["error"] == "ping failed"
    assert snapshot["summary"]["error"] >= 1


@pytest.mark.asyncio
async def test_operational_status_history_returns_snapshot_series(async_client, auth_headers, fake_db):
    now = datetime.now(timezone.utc)
    await fake_db.operational_status_history.insert_one(
        {
            "recorded_at": now,
            "summary": {"healthy": 4, "degraded": 1, "error": 0},
            "services": {"backend": {"status": "healthy", "consumption": {"active_sessions": 12}}},
        }
    )

    resp = await async_client.get("/api/admin/operational-status/history?limit=12", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["services"]["backend"]["consumption"]["active_sessions"] == 12


@pytest.mark.asyncio
async def test_operational_events_filters_runtime_actions(async_client, auth_headers, fake_db):
    now = datetime.now(timezone.utc)
    await fake_db.audit_log.insert_one(
        {
            "timestamp": now,
            "user": "admin",
            "action": "service_restart",
            "result": "success",
            "detail": "service=scheduler",
        }
    )
    await fake_db.audit_log.insert_one(
        {
            "timestamp": now,
            "user": "admin",
            "action": "password_policy_changed",
            "result": "success",
        }
    )

    resp = await async_client.get("/api/admin/operational-events?page=1&page_size=10", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["service"] == "scheduler"
    assert data["items"][0]["category"] == "runtime"

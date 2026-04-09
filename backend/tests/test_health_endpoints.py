import types

import pytest

import main
from db import db_manager


class _RunningTask:
    def cancelled(self):
        return False

    def done(self):
        return False


@pytest.mark.asyncio
async def test_live_health_returns_ok(async_client):
    response = await async_client.get("/api/health/live")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "VANTAGE"


@pytest.mark.asyncio
async def test_ready_health_returns_ok_when_runtime_is_bootstrapped(
    async_client,
    fake_db,
    monkeypatch,
):
    monkeypatch.setattr(main, "scheduler", types.SimpleNamespace(running=True))
    monkeypatch.setattr(db_manager, "db", fake_db)
    main.app.state.extensions_registry = [{"key": "core"}]
    main.app.state.background_tasks = {
        "watchlist_worker": _RunningTask(),
        "recon_scheduler": _RunningTask(),
        "threat_ingestion_worker": _RunningTask(),
    }

    response = await async_client.get("/api/health/ready")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["services"]["database"] == "ok"
    assert data["services"]["scheduler"] == "ok"
    assert data["services"]["extensions_registry"] == "ok"


@pytest.mark.asyncio
async def test_ready_health_returns_503_when_database_is_missing(
    async_client,
    monkeypatch,
):
    monkeypatch.setattr(main, "scheduler", types.SimpleNamespace(running=True))
    monkeypatch.setattr(db_manager, "db", None)
    main.app.state.extensions_registry = [{"key": "core"}]
    main.app.state.background_tasks = {
        "watchlist_worker": _RunningTask(),
        "recon_scheduler": _RunningTask(),
        "threat_ingestion_worker": _RunningTask(),
    }

    response = await async_client.get("/api/health/ready")

    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "degraded"
    assert data["services"]["database"] == "disconnected"


@pytest.mark.asyncio
async def test_ready_health_returns_503_when_background_task_is_dead(
    async_client,
    fake_db,
    monkeypatch,
):
    class _DeadTask:
        def cancelled(self):
            return False

        def done(self):
            return True

        def exception(self):
            return RuntimeError("worker died")

    monkeypatch.setattr(main, "scheduler", types.SimpleNamespace(running=True))
    monkeypatch.setattr(db_manager, "db", fake_db)
    main.app.state.extensions_registry = [{"key": "core"}]
    main.app.state.background_tasks = {
        "watchlist_worker": _RunningTask(),
        "recon_scheduler": _RunningTask(),
        "threat_ingestion_worker": _DeadTask(),
    }

    response = await async_client.get("/api/health/ready")

    assert response.status_code == 503
    data = response.json()
    assert data["services"]["background_tasks"]["threat_ingestion_worker"] == "error"

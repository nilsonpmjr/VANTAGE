"""
Operational status snapshot helpers for the admin control plane.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from time import monotonic

from operational_config import get_public_operational_config


_scheduler_runtime_provider = lambda: {"running": False, "scheduled_jobs": 0}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _base_service(status: str, *, last_checked=None, error=None, details=None, consumption=None) -> dict:
    return {
        "status": status,
        "last_checked": last_checked or _now(),
        "error": error,
        "details": details or {},
        "consumption": consumption or {},
    }


async def collect_backend_status(db) -> dict:
    if db is None:
        return _base_service("error", error="Database not connected")

    now = _now()
    active_sessions = await db.refresh_tokens.count_documents({
        "revoked": False,
        "expires_at": {"$gt": now},
    })
    pending_recon = await db.recon_scheduled.count_documents({"status": "pending"})
    return _base_service(
        "healthy",
        details={"api_prefix": "/api", "database_connected": True},
        consumption={
            "active_sessions": active_sessions,
            "pending_recon_jobs": pending_recon,
        },
    )


async def collect_mongodb_status(db) -> dict:
    if db is None:
        return _base_service("error", error="Database not connected")

    latency_ms = None
    if hasattr(db, "command"):
        started = monotonic()
        await db.command("ping")
        latency_ms = max(int((monotonic() - started) * 1000), 0)

    return _base_service(
        "healthy",
        details={"ping": "ok"},
        consumption={
            "latency_ms": latency_ms,
            "users": await db.users.count_documents({}),
            "scans": await db.scans.count_documents({}),
        },
    )


def set_scheduler_runtime_provider(provider) -> None:
    global _scheduler_runtime_provider
    _scheduler_runtime_provider = provider


def _get_scheduler_runtime_state() -> dict:
    try:
        runtime = _scheduler_runtime_provider() or {}
    except Exception as exc:
        return {
            "running": False,
            "scheduled_jobs": 0,
            "error": str(exc),
        }

    return {
        "running": bool(runtime.get("running", False)),
        "scheduled_jobs": int(runtime.get("scheduled_jobs", 0) or 0),
        "error": runtime.get("error"),
    }


async def collect_scheduler_status(_db) -> dict:
    runtime = _get_scheduler_runtime_state()
    return _base_service(
        "healthy" if runtime["running"] else "degraded",
        details={"running": runtime["running"]},
        consumption={"scheduled_jobs": runtime["scheduled_jobs"]},
        error=None if runtime["running"] else runtime.get("error") or "Scheduler is not running",
    )


async def collect_worker_status(db) -> dict:
    if db is None:
        return _base_service("error", error="Database not connected")

    doc = await db.system_status.find_one({"module": "worker"}) or {}
    last_run = doc.get("last_run")
    if not last_run:
        return _base_service(
            "degraded",
            error="Worker has not reported status yet",
            details={"reported": False},
        )

    stale_after = _now() - timedelta(hours=36)
    status = "healthy" if last_run >= stale_after else "degraded"
    return _base_service(
        status,
        last_checked=last_run,
        error=doc.get("error") if status != "healthy" else None,
        details={
            "reported": True,
            "reported_status": str(doc.get("status", "unknown")).lower(),
        },
        consumption={"altered_targets": int(doc.get("altered_targets", 0) or 0)},
    )


async def collect_mailer_status(db) -> dict:
    public_config = await get_public_operational_config(db)
    smtp = public_config["smtp"]
    configured = bool(smtp["host"]["value"])
    return _base_service(
        "healthy" if configured else "degraded",
        error=None if configured else "SMTP is not configured",
        details={
            "configured": configured,
            "host": smtp["host"]["value"],
            "port": smtp["port"]["value"],
            "from_email": smtp["from"]["value"],
            "tls": smtp["tls"]["value"],
        },
        consumption={},
    )


SERVICE_COLLECTORS = {
    "backend": collect_backend_status,
    "mongodb": collect_mongodb_status,
    "scheduler": collect_scheduler_status,
    "worker": collect_worker_status,
    "mailer": collect_mailer_status,
}


async def get_operational_status_snapshot(db) -> dict:
    services: dict[str, dict] = {}
    summary = {"healthy": 0, "degraded": 0, "error": 0}

    for name, collector in SERVICE_COLLECTORS.items():
        try:
            service = await collector(db)
        except Exception as exc:
            service = _base_service("error", error=str(exc))
        services[name] = service
        summary[service["status"]] = summary.get(service["status"], 0) + 1

    return {
        "checked_at": _now(),
        "summary": summary,
        "services": services,
    }

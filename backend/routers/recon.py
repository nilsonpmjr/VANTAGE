"""
Recon Engine router.

Endpoints:
  GET  /recon/modules               — list available modules
  POST /recon/scan                  — create job (202)
  GET  /recon/stream/{job_id}       — SSE real-time progress
  GET  /recon/{job_id}              — polling fallback + JSON export
  GET  /recon/history/{target}      — previous scans for a target
  POST /recon/scheduled             — schedule a scan for a future time
  DELETE /recon/scheduled/{id}      — cancel a scheduled scan
  GET  /recon/scheduled/mine        — list user's scheduled scans
  GET  /recon/admin/jobs            — admin: list all recent jobs
"""

import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from audit import log_action
from auth import get_current_user, require_api_scope
from config import settings
from db import db_manager
from logging_config import get_logger
from network_security import UnsafeTargetError, validate_public_scan_target
from policies import compute_expiry_days_left, get_password_policy
from recon.engine import get_available_modules, run_module
from recon.correlator import correlate, extract_risks

logger = get_logger("ReconRouter")

router = APIRouter(prefix="/recon", tags=["recon"])

# In-memory SSE queue registry — same pattern as batch.py
_job_queues: dict[str, asyncio.Queue] = {}


def _validate_target(raw: str) -> tuple[str, str]:
    """
    Returns (sanitized_target, target_type) or raises HTTPException 400.
    target_type: "ip" | "domain"
    """
    try:
        validated = validate_public_scan_target(raw)
    except UnsafeTargetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return validated.sanitized, validated.target_type


# ── models ───────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    target: str
    modules: Optional[List[str]] = None   # None = all available

    @field_validator("target")
    @classmethod
    def strip_target(cls, v: str) -> str:
        return v.strip()


class ScheduleRequest(BaseModel):
    target: str
    modules: Optional[List[str]] = None
    run_at: str  # ISO 8601 datetime string

    @field_validator("target")
    @classmethod
    def strip_target(cls, v: str) -> str:
        return v.strip()


# ── cache helpers ─────────────────────────────────────────────────────────────

def _cache_key(target: str, module: str) -> str:
    return hashlib.sha256(f"{target}:{module}".encode()).hexdigest()


async def _cache_get(target: str, module: str) -> Optional[dict]:
    if db_manager.db is None:
        return None
    try:
        ttl = settings.recon_cache_ttl_hours
        cutoff = datetime.now(timezone.utc) - timedelta(hours=ttl)
        doc = await db_manager.db.recon_results.find_one(
            {"cache_key": _cache_key(target, module), "scanned_at": {"$gte": cutoff}}
        )
        return doc
    except Exception as e:
        logger.error(f"Recon cache get error: {e}")
        return None


async def _cache_set(target: str, module: str, data: dict) -> None:
    if db_manager.db is None:
        return
    try:
        key = _cache_key(target, module)
        now = datetime.now(timezone.utc)
        await db_manager.db.recon_results.replace_one(
            {"cache_key": key},
            {"cache_key": key, "target": target, "module": module, "data": data, "scanned_at": now},
            upsert=True,
        )
    except Exception as e:
        logger.error(f"Recon cache set error: {e}")


async def get_recon_eligibility_failure(db, username: str) -> tuple[Optional[dict], Optional[str]]:
    """
    Return `(user_doc, None)` when the user is currently eligible to run recon,
    otherwise `(None, reason_code)`.
    """
    user = await db.users.find_one({"username": username})
    if not user:
        return None, "user_not_found"
    if user.get("is_active", True) is False:
        return None, "user_inactive"
    if user.get("force_password_reset", False):
        return None, "password_reset_required"

    policy = await get_password_policy(db)
    days_left = compute_expiry_days_left(user, policy)
    if days_left is not None and days_left == 0:
        return None, "password_expired"

    return user, None


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/modules")
async def list_modules(current_user: dict = Depends(get_current_user)):
    """List all available recon modules."""
    return {"modules": get_available_modules()}


@router.post("/scan", status_code=202)
async def submit_scan(
    request: Request,
    body: ScanRequest,
    current_user: dict = Depends(require_api_scope("recon")),
):
    """Create a recon job and start async processing. Returns job_id."""
    target, target_type = _validate_target(body.target)

    available = {m["name"]: m for m in get_available_modules()}
    if not available:
        raise HTTPException(status_code=503, detail="No recon modules available in this environment.")

    # Filter requested modules to those available and compatible
    if body.modules:
        requested = [m for m in body.modules if m in available]
    else:
        requested = list(available.keys())

    # Filter by target type compatibility
    requested = [
        m for m in requested
        if "both" in available[m]["target_types"] or target_type in available[m]["target_types"]
    ]

    if not requested:
        raise HTTPException(status_code=400, detail="No compatible modules available for this target type.")

    # Rate limit: max concurrent scans per user
    if db_manager.db is not None:
        active = await db_manager.db.recon_jobs.count_documents({
            "analyst": current_user["username"],
            "status": {"$in": ["pending", "running"]},
        })
        if active >= settings.recon_max_concurrent:
            raise HTTPException(
                status_code=429,
                detail=f"You already have {active} active scans. Wait for them to complete.",
            )

        # Rate limit: max 10 scans per hour per user
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        scans_last_hour = await db_manager.db.recon_jobs.count_documents({
            "analyst": current_user["username"],
            "created_at": {"$gte": one_hour_ago},
        })
        if scans_last_hour >= 10:
            raise HTTPException(
                status_code=429,
                detail="Hourly scan limit reached (10/h). Please wait before submitting new scans.",
            )

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    job_doc = {
        "_id": job_id,
        "target": target,
        "target_type": target_type,
        "modules": requested,
        "analyst": current_user["username"],
        "status": "pending",
        "results": {},
        "created_at": now,
        "completed_at": None,
    }

    if db_manager.db is not None:
        try:
            await db_manager.db.recon_jobs.insert_one(job_doc)
        except Exception as e:
            logger.error(f"Failed to persist recon job {job_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to create scan job.")

    queue: asyncio.Queue = asyncio.Queue()
    _job_queues[job_id] = queue

    ip = request.client.host if request.client else ""
    asyncio.create_task(
        _process_scan(job_id, target, target_type, requested, current_user["username"], ip, queue)
    )

    return {"job_id": job_id, "status": "pending", "target": target, "modules": requested}


@router.get("/stream/{job_id}")
async def stream_scan(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """SSE stream delivering real-time module progress."""
    if db_manager.db is not None:
        job = await db_manager.db.recon_jobs.find_one({"_id": job_id})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        if job["analyst"] != current_user["username"] and current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Access denied.")

        # Job already complete — replay snapshot
        if job["status"] in ("done", "error"):
            async def _snapshot():
                for module, entry in job.get("results", {}).items():
                    payload = {"type": "module_done", "module": module, **entry}
                    yield f"data: {json.dumps(payload)}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'job_id': job_id})}\n\n"

            return StreamingResponse(_snapshot(), media_type="text/event-stream")

    queue = _job_queues.get(job_id)
    if queue is None:
        raise HTTPException(
            status_code=404,
            detail="Job stream unavailable. Use GET /recon/{job_id} for polling.",
        )

    async def _event_gen():
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") in ("done", "error"):
                    break
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"
            except Exception as e:
                logger.error(f"SSE error for {job_id}: {e}")
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                break

    return StreamingResponse(_event_gen(), media_type="text/event-stream")


@router.get("/history/{target}")
async def get_history(
    target: str,
    current_user: dict = Depends(get_current_user),
):
    """Return the 10 most recent scans for a given target."""
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    sanitized, _ = _validate_target(target)
    query = {"target": sanitized}
    if current_user.get("role") != "admin":
        query["analyst"] = current_user["username"]

    jobs = await (
        db_manager.db.recon_jobs.find(
            query,
            {"_id": 1, "modules": 1, "status": 1, "analyst": 1, "created_at": 1, "completed_at": 1},
        )
        .sort("created_at", -1)
        .limit(10)
        .to_list(10)
    )

    for j in jobs:
        j["job_id"] = str(j.pop("_id"))

    return {"target": sanitized, "jobs": jobs}


@router.get("/{job_id}")
async def get_scan(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Return current snapshot of a scan job (polling fallback / JSON export)."""
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    job = await db_manager.db.recon_jobs.find_one({"_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job["analyst"] != current_user["username"] and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied.")

    job["job_id"] = str(job.pop("_id"))

    # Enrich done jobs with attack surface + risk indicators
    if job.get("status") == "done" and job.get("results"):
        try:
            job["attack_surface"] = correlate(job["results"])
            job["risk_indicators"] = extract_risks(job["results"])
        except Exception as e:
            logger.warning(f"Correlator failed for {job_id}: {e}")

    return job


# ── scheduled scans ───────────────────────────────────────────────────────────

@router.post("/scheduled", status_code=201)
async def schedule_scan(
    body: ScheduleRequest,
    current_user: dict = Depends(require_api_scope("recon")),
):
    """Schedule a recon scan for a future time."""
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    target, target_type = _validate_target(body.target)

    # Parse and validate run_at
    try:
        run_at = datetime.fromisoformat(body.run_at.replace("Z", "+00:00"))
        if run_at.tzinfo is None:
            run_at = run_at.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid run_at datetime format.")

    min_time = datetime.now(timezone.utc) + timedelta(minutes=2)
    if run_at < min_time:
        raise HTTPException(status_code=400, detail="run_at must be at least 2 minutes in the future.")

    # Validate modules
    available = {m["name"]: m for m in get_available_modules()}
    if body.modules:
        requested = [m for m in body.modules if m in available]
    else:
        requested = list(available.keys())
    requested = [
        m for m in requested
        if "both" in available[m]["target_types"] or target_type in available[m]["target_types"]
    ]
    if not requested:
        raise HTTPException(status_code=400, detail="No compatible modules for this target type.")

    # Limit: max 5 pending scheduled scans per user
    pending_count = await db_manager.db.recon_scheduled.count_documents({
        "analyst": current_user["username"],
        "status": "pending",
    })
    if pending_count >= 5:
        raise HTTPException(status_code=422, detail="Maximum 5 pending scheduled scans allowed.")

    doc_id = str(uuid.uuid4())
    doc = {
        "_id": doc_id,
        "target": target,
        "target_type": target_type,
        "modules": requested,
        "analyst": current_user["username"],
        "status": "pending",
        "run_at": run_at,
        "created_at": datetime.now(timezone.utc),
    }
    await db_manager.db.recon_scheduled.insert_one(doc)

    return {"id": doc_id, "target": target, "modules": requested, "run_at": run_at.isoformat(), "status": "pending"}


@router.get("/scheduled/mine")
async def list_my_scheduled(
    current_user: dict = Depends(get_current_user),
):
    """List the current user's pending scheduled scans."""
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    items = await (
        db_manager.db.recon_scheduled.find(
            {"analyst": current_user["username"], "status": "pending"},
            {"_id": 1, "target": 1, "modules": 1, "run_at": 1, "created_at": 1},
        )
        .sort("run_at", 1)
        .limit(10)
        .to_list(10)
    )
    for item in items:
        item["id"] = str(item.pop("_id"))
    return {"items": items}


@router.delete("/scheduled/{item_id}")
async def cancel_scheduled(
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Cancel a pending scheduled scan."""
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    result = await db_manager.db.recon_scheduled.delete_one({
        "_id": item_id,
        "analyst": current_user["username"],
        "status": "pending",
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Scheduled scan not found or already executed.")
    return {"ok": True}


# ── admin endpoints ──────────────────────────────────────────────────────────

@router.get("/admin/jobs")
async def admin_list_jobs(
    current_user: dict = Depends(get_current_user),
    analyst: Optional[str] = None,
    status: Optional[str] = None,
):
    """Admin-only: list all recon jobs from the last 7 days."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    query: dict = {"created_at": {"$gte": datetime.now(timezone.utc) - timedelta(days=7)}}
    if analyst:
        query["analyst"] = analyst
    if status:
        query["status"] = status

    jobs = await (
        db_manager.db.recon_jobs.find(
            query,
            {"_id": 1, "target": 1, "modules": 1, "analyst": 1, "status": 1, "created_at": 1, "completed_at": 1},
        )
        .sort("created_at", -1)
        .limit(100)
        .to_list(100)
    )

    for j in jobs:
        j["job_id"] = str(j.pop("_id"))

    # Also get distinct analysts for the filter dropdown
    analysts = await db_manager.db.recon_jobs.distinct(
        "analyst",
        {"created_at": {"$gte": datetime.now(timezone.utc) - timedelta(days=7)}},
    )

    return {"jobs": jobs, "analysts": sorted(analysts)}


# ── worker ────────────────────────────────────────────────────────────────────

async def _process_scan(
    job_id: str,
    target: str,
    target_type: str,
    modules: list[str],
    analyst: str,
    ip: str,
    queue: asyncio.Queue,
) -> None:
    logger.info(f"Recon {job_id}: starting {modules} on '{target}' for '{analyst}'")

    if db_manager.db is not None:
        try:
            await db_manager.db.recon_jobs.update_one(
                {"_id": job_id}, {"$set": {"status": "running"}}
            )
        except Exception as e:
            logger.error(f"Recon {job_id}: failed to mark running: {e}")

    try:
        for module_name in modules:
            # Check cache first
            cached_doc = await _cache_get(target, module_name)
            from_cache = cached_doc is not None
            start_ms = _now_ms()

            if from_cache:
                data = cached_doc["data"]
                duration_ms = 0
            else:
                data = await run_module(module_name, target, target_type)
                duration_ms = _now_ms() - start_ms
                if "error" not in data and "skipped" not in data:
                    await _cache_set(target, module_name, data)

            entry = {
                "status": "error" if "error" in data else "done",
                "data": data,
                "duration_ms": duration_ms,
                "from_cache": from_cache,
            }

            if db_manager.db is not None:
                try:
                    await db_manager.db.recon_jobs.update_one(
                        {"_id": job_id},
                        {"$set": {f"results.{module_name}": entry}},
                    )
                except Exception as e:
                    logger.error(f"Recon {job_id}: persist {module_name} failed: {e}")

            await queue.put({"type": "module_done", "module": module_name, **entry})
            await asyncio.sleep(0)  # yield to event loop

        # Mark done
        completed_at = datetime.now(timezone.utc)
        if db_manager.db is not None:
            try:
                await db_manager.db.recon_jobs.update_one(
                    {"_id": job_id},
                    {"$set": {"status": "done", "completed_at": completed_at}},
                )
                await log_action(
                    db_manager.db,
                    user=analyst,
                    action="recon_scan",
                    target=target,
                    ip=ip,
                    result="completed",
                )
            except Exception as e:
                logger.error(f"Recon {job_id}: finalize failed: {e}")

        logger.info(f"Recon {job_id}: completed")

    except Exception as e:
        logger.error(f"Recon {job_id}: unexpected failure: {e}")
        if db_manager.db is not None:
            try:
                await db_manager.db.recon_jobs.update_one(
                    {"_id": job_id},
                    {"$set": {"status": "error", "error": str(e)}},
                )
            except Exception as persist_exc:
                logger.warning(f"Recon {job_id}: could not persist failure state: {persist_exc}")
        await queue.put({"type": "error", "message": str(e)})

    finally:
        await queue.put({"type": "done", "job_id": job_id})
        await asyncio.sleep(60)   # retain queue for SSE reconnects
        _job_queues.pop(job_id, None)


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)

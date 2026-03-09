"""
Recon Engine router.

Endpoints:
  GET  /recon/modules               — list available modules
  POST /recon/scan                  — create job (202)
  GET  /recon/stream/{job_id}       — SSE real-time progress
  GET  /recon/{job_id}              — polling fallback + JSON export
  GET  /recon/history/{target}      — previous scans for a target
"""

import asyncio
import hashlib
import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from audit import log_action
from auth import get_current_user
from config import settings
from db import db_manager
from logging_config import get_logger
from recon.engine import get_available_modules, run_module
from recon.correlator import correlate, extract_risks

logger = get_logger("ReconRouter")

router = APIRouter(prefix="/recon", tags=["recon"])

# In-memory SSE queue registry — same pattern as batch.py
_job_queues: dict[str, asyncio.Queue] = {}

# Target validation: allow IPv4, IPv6, hostname/domain, CIDR /24 or smaller
_TARGET_RE = re.compile(
    r"^(?:"
    r"(?:\d{1,3}\.){3}\d{1,3}(?:/(?:2[0-4]|[0-9]))?"  # IPv4 or CIDR
    r"|(?:[0-9a-fA-F:]{2,39})"                           # IPv6 (simplified)
    r"|(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9\-]{1,63})*)"  # domain
    r")$"
)

# RFC-1918 / loopback ranges — forbidden as scan targets
_PRIVATE_PREFIXES = (
    "127.", "10.", "192.168.",
    "::1", "localhost",
)
_PRIVATE_172 = re.compile(r"^172\.(1[6-9]|2\d|3[01])\.")


def _validate_target(raw: str) -> tuple[str, str]:
    """
    Returns (sanitized_target, target_type) or raises HTTPException 400.
    target_type: "ip" | "domain"
    """
    target = raw.strip().lower()

    if not target or not _TARGET_RE.match(target):
        raise HTTPException(status_code=400, detail=f"Invalid target: '{raw}'")

    # Block private/loopback
    if any(target.startswith(p) for p in _PRIVATE_PREFIXES):
        raise HTTPException(status_code=400, detail="Private/loopback targets are not allowed")
    if _PRIVATE_172.match(target):
        raise HTTPException(status_code=400, detail="Private network targets are not allowed")

    # Classify
    ipv4_re = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}(?:/\d+)?$")
    if ipv4_re.match(target) or ":" in target:
        return target, "ip"
    return target, "domain"


# ── models ───────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    target: str
    modules: Optional[List[str]] = None   # None = all available

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


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/modules")
async def list_modules(current_user: dict = Depends(get_current_user)):
    """List all available recon modules."""
    return {"modules": get_available_modules()}


@router.post("/scan", status_code=202)
async def submit_scan(
    request: Request,
    body: ScanRequest,
    current_user: dict = Depends(get_current_user),
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
    jobs = await (
        db_manager.db.recon_jobs.find(
            {"target": sanitized},
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
            except Exception:
                pass
        await queue.put({"type": "error", "message": str(e)})

    finally:
        await queue.put({"type": "done", "job_id": job_id})
        await asyncio.sleep(60)   # retain queue for SSE reconnects
        _job_queues.pop(job_id, None)


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)

import asyncio
import uuid
import json
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from clients.api_client_async import AsyncThreatIntelClient
from validators import validate_target, ValidationError
from analyzer import generate_heuristic_report, format_report_to_markdown
from scoring import compute_risk_score, compute_verdict
from db import db_manager
from auth import get_current_user
from audit import log_action
from logging_config import get_logger
from config import settings

logger = get_logger("BatchRouter")

router = APIRouter(prefix="/analyze", tags=["batch"])

# In-memory SSE queue registry — sufficient for single-process MVP
_job_queues: dict[str, asyncio.Queue] = {}

# MongoDB int64 ceiling (same constraint as analyze.py)
_MONGO_MAX_INT = (2 ** 63) - 1


# ── models ──────────────────────────────────────────────────────────────────

class BatchRequest(BaseModel):
    targets: List[str]
    lang: str = "pt"


# ── helpers ─────────────────────────────────────────────────────────────────

def _sanitize_for_mongo(obj):
    if isinstance(obj, dict):
        return {k: _sanitize_for_mongo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_mongo(v) for v in obj]
    if isinstance(obj, int) and abs(obj) > _MONGO_MAX_INT:
        return str(obj)
    return obj


def _parse_targets(raw: List[str]) -> tuple[list, list]:
    """Validate and deduplicate targets. Returns (valid, errors)."""
    valid: list = []
    errors: list = []
    seen: set[str] = set()
    for raw_t in raw:
        t = raw_t.strip()
        if not t:
            continue
        if t in seen:
            continue
        seen.add(t)
        try:
            v = validate_target(t)
            valid.append({"sanitized": v.sanitized, "type": v.target_type})
        except ValidationError as e:
            errors.append({"target": t, "error": str(e)})
    return valid, errors


async def _cache_lookup(sanitized: str) -> Optional[dict]:
    """Return a valid cached scan doc or None."""
    if db_manager.db is None:
        return None
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(
            hours=settings.cache_ttl_hours
        )
        return await db_manager.db.scans.find_one(
            {"target": sanitized, "timestamp": {"$gte": cutoff}},
            sort=[("timestamp", -1)],
        )
    except Exception as e:
        logger.error(f"Cache lookup error for {sanitized}: {e}")
        return None


# ── estimate ─────────────────────────────────────────────────────────────────

@router.post("/batch/estimate")
async def estimate_batch(
    body: BatchRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Pre-flight check: count cache hits and external calls without executing
    the batch. Returns quota impact data for the confirmation modal.
    """
    valid, errors = _parse_targets(body.targets)
    if not valid:
        raise HTTPException(
            status_code=400,
            detail=errors or [{"error": "No valid targets provided."}],
        )

    cache_hits = 0
    for item in valid:
        if await _cache_lookup(item["sanitized"]):
            cache_hits += 1

    external_calls = len(valid) - cache_hits
    delay_s = settings.batch_inter_target_delay_ms / 1000
    estimated_seconds = round(external_calls * delay_s, 1)

    services_impacted: list = []
    if external_calls > 0:
        async with AsyncThreatIntelClient() as client:
            services_impacted = [s for s, ok in client.services.items() if ok]

    return {
        "total": len(valid),
        "cache_hits": cache_hits,
        "external_calls": external_calls,
        "estimated_seconds": estimated_seconds,
        "services_impacted": services_impacted,
        "quota_warning": None,
        "validation_errors": errors,
    }


# ── submit ───────────────────────────────────────────────────────────────────

@router.post("/batch", status_code=202)
async def submit_batch(
    request: Request,
    body: BatchRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create a batch job and start async processing. Returns job_id."""
    valid, errors = _parse_targets(body.targets)
    if not valid:
        raise HTTPException(
            status_code=400,
            detail=errors or [{"error": "No valid targets provided."}],
        )

    if len(valid) > settings.batch_max_targets:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Batch size ({len(valid)}) exceeds the maximum "
                f"of {settings.batch_max_targets} targets."
            ),
        )

    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    job_doc = {
        "_id": job_id,
        "created_at": now,
        "analyst": current_user["username"],
        "lang": body.lang,
        "status": "pending",
        "targets": [t["sanitized"] for t in valid],
        "results": [],
        "progress": {"done": 0, "total": len(valid)},
        "error": None,
    }

    if db_manager.db is not None:
        try:
            await db_manager.db.batch_jobs.insert_one(job_doc)
        except Exception as e:
            logger.error(f"Failed to persist batch job {job_id}: {e}")
            raise HTTPException(
                status_code=500, detail="Failed to create batch job."
            )

    queue: asyncio.Queue = asyncio.Queue()
    _job_queues[job_id] = queue

    ip = request.client.host if request.client else ""
    asyncio.create_task(
        _process_batch(
            job_id, valid, body.lang, current_user["username"], ip, queue
        )
    )

    return {"job_id": job_id, "status": "pending", "total": len(valid)}


# ── SSE stream ───────────────────────────────────────────────────────────────

@router.get("/batch/{job_id}/stream")
async def stream_batch(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Server-Sent Events stream delivering real-time batch progress.
    If the job is already complete, replays a snapshot and closes.
    Falls back to GET /batch/{job_id} if the queue is gone (process restart).
    """
    if db_manager.db is not None:
        job = await db_manager.db.batch_jobs.find_one({"_id": job_id})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        if (
            job["analyst"] != current_user["username"]
            and current_user.get("role") != "admin"
        ):
            raise HTTPException(status_code=403, detail="Access denied.")

        if job["status"] == "done":
            total = job["progress"]["total"]

            async def _snapshot():
                for i, r in enumerate(job.get("results", []), 1):
                    payload = {"type": "progress", **r, "done": i, "total": total}
                    yield f"data: {json.dumps(payload)}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'job_id': job_id})}\n\n"

            return StreamingResponse(_snapshot(), media_type="text/event-stream")

    queue = _job_queues.get(job_id)
    if queue is None:
        raise HTTPException(
            status_code=404,
            detail="Job stream not available. Use GET /batch/{job_id} for polling.",
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
                logger.error(f"SSE generator error for {job_id}: {e}")
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                break

    return StreamingResponse(_event_gen(), media_type="text/event-stream")


# ── polling fallback ─────────────────────────────────────────────────────────

@router.get("/batch/{job_id}")
async def get_batch_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Return the current snapshot of a batch job (SSE reconnect / polling)."""
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    job = await db_manager.db.batch_jobs.find_one({"_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if (
        job["analyst"] != current_user["username"]
        and current_user.get("role") != "admin"
    ):
        raise HTTPException(status_code=403, detail="Access denied.")

    job["_id"] = str(job["_id"])
    return job


# ── worker ───────────────────────────────────────────────────────────────────

async def _process_batch(
    job_id: str,
    targets: list,
    lang: str,
    analyst: str,
    ip: str,
    queue: asyncio.Queue,
) -> None:
    """
    Sequential batch processor:
      1. Cache-first: return hits without consuming external quota.
      2. Throttle: wait batch_inter_target_delay_ms between external calls.
      3. Emit an SSE progress event after each target.
      4. Persist each non-cached scan to the scans collection.
    """
    logger.info(
        f"Batch {job_id}: starting {len(targets)} target(s) for '{analyst}'"
    )
    total = len(targets)
    done_count = 0

    if db_manager.db is not None:
        try:
            await db_manager.db.batch_jobs.update_one(
                {"_id": job_id}, {"$set": {"status": "running"}}
            )
        except Exception as e:
            logger.error(f"Batch {job_id}: failed to mark running: {e}")

    try:
        for item in targets:
            sanitized = item["sanitized"]
            target_type = item["type"]
            entry: dict = {
                "target": sanitized,
                "target_type": target_type,
                "status": "done",
                "verdict": "UNKNOWN",
                "risk_score": 0,
                "from_cache": False,
            }

            try:
                cached = await _cache_lookup(sanitized)
                if cached:
                    entry["from_cache"] = True
                    entry["verdict"] = cached.get("verdict", "UNKNOWN")
                    entry["risk_score"] = cached.get("risk_score", 0)
                else:
                    await asyncio.sleep(
                        settings.batch_inter_target_delay_ms / 1000
                    )
                    async with AsyncThreatIntelClient() as client:
                        raw_results = await client.query_all(
                            sanitized, target_type
                        )

                    service_results: dict = {}
                    for svc, resp in raw_results.items():
                        if resp.success and resp.data is not None:
                            service_results[svc] = resp.data
                        else:
                            service_results[svc] = {
                                "_meta_error": resp.error or "service unavailable",
                                "_meta_error_type": (
                                    resp.error_type or "api_error"
                                ),
                            }

                    risk_score, total_sources = compute_risk_score(
                        service_results
                    )
                    verdict = compute_verdict(risk_score)
                    summary = {
                        "risk_sources": risk_score,
                        "total_sources": total_sources,
                        "verdict": verdict,
                    }

                    report_pt = generate_heuristic_report(
                        sanitized, target_type, summary, service_results,
                        lang="pt",
                    )
                    report_en = generate_heuristic_report(
                        sanitized, target_type, summary, service_results,
                        lang="en",
                    )
                    report_es = generate_heuristic_report(
                        sanitized, target_type, summary, service_results,
                        lang="es",
                    )

                    scan_data = {
                        "target": sanitized,
                        "type": target_type,
                        "results": service_results,
                        "summary": summary,
                        "analysis_report": format_report_to_markdown(
                            report_pt if lang == "pt"
                            else (report_en if lang == "en" else report_es)
                        ),
                        "analysis_reports": {
                            "pt": format_report_to_markdown(report_pt),
                            "en": format_report_to_markdown(report_en),
                            "es": format_report_to_markdown(report_es),
                        },
                    }

                    entry["verdict"] = verdict
                    entry["risk_score"] = risk_score

                    if db_manager.db is not None:
                        try:
                            await db_manager.db.scans.insert_one({
                                "target": sanitized,
                                "type": target_type,
                                "timestamp": datetime.now(timezone.utc),
                                "risk_score": risk_score,
                                "verdict": verdict,
                                "analyst": analyst,
                                "data": _sanitize_for_mongo(scan_data),
                            })
                        except Exception as e:
                            logger.error(
                                f"Batch {job_id}: persist scan "
                                f"for {sanitized} failed: {e}"
                            )

            except Exception as e:
                logger.error(
                    f"Batch {job_id}: error on target {sanitized}: {e}"
                )
                entry["status"] = "error"
                entry["verdict"] = "ERROR"

            done_count += 1

            if db_manager.db is not None:
                try:
                    await db_manager.db.batch_jobs.update_one(
                        {"_id": job_id},
                        {
                            "$push": {"results": entry},
                            "$set": {"progress.done": done_count},
                        },
                    )
                except Exception as e:
                    logger.error(
                        f"Batch {job_id}: job update failed for "
                        f"{sanitized}: {e}"
                    )

            await queue.put({
                "type": "progress",
                **entry,
                "done": done_count,
                "total": total,
            })
            await asyncio.sleep(0)  # yield to event loop

        if db_manager.db is not None:
            try:
                await log_action(
                    db_manager.db,
                    user=analyst,
                    action="batch_analyze",
                    target=f"{total} targets",
                    ip=ip,
                    result="completed",
                )
            except Exception as e:
                logger.error(f"Batch {job_id}: audit log failed: {e}")

            try:
                await db_manager.db.batch_jobs.update_one(
                    {"_id": job_id}, {"$set": {"status": "done"}}
                )
            except Exception as e:
                logger.error(f"Batch {job_id}: failed to mark done: {e}")

        logger.info(f"Batch {job_id}: completed {done_count}/{total}")

    except Exception as e:
        logger.error(f"Batch {job_id}: unexpected failure: {e}")
        if db_manager.db is not None:
            try:
                await db_manager.db.batch_jobs.update_one(
                    {"_id": job_id},
                    {"$set": {"status": "failed", "error": str(e)}},
                )
            except Exception:
                pass
        await queue.put({"type": "error", "message": str(e)})

    finally:
        await queue.put({"type": "done", "job_id": job_id})
        # Keep queue alive for 60 s to allow SSE reconnects, then clean up
        await asyncio.sleep(60)
        _job_queues.pop(job_id, None)

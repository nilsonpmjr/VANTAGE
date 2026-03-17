import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Query, Depends, Request

from clients.api_client_async import AsyncThreatIntelClient
from validators import validate_target, ValidationError
from analyzer import generate_heuristic_report, format_report_to_markdown
from scoring import compute_risk_score, compute_verdict
from db import db_manager
from auth import get_current_user, require_api_scope
from limiters import limiter
from audit import log_action
from logging_config import get_logger
from db import inc_service_quota
from config import settings
from crypto import decrypt_secret
from scans import build_scan_document, build_scan_payload, extract_scan_payload

logger = get_logger("AnalyzeRouter")

router = APIRouter(prefix="", tags=["analyze"])

# MongoDB supports integers up to int64 (8 bytes)
_MONGO_MAX_INT = (2 ** 63) - 1


def _sanitize_for_mongo(obj: Any) -> Any:
    """Recursively convert integers that exceed MongoDB's int64 limit to strings.

    Shodan's ssl.cert.serial can be a 128-bit integer which causes
    OverflowError when Motor tries to BSON-encode it.
    """
    if isinstance(obj, dict):
        return {k: _sanitize_for_mongo(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_mongo(v) for v in obj]
    if isinstance(obj, int) and abs(obj) > _MONGO_MAX_INT:
        return str(obj)
    return obj


# Semaphore limits concurrent external API bursts to avoid server exhaustion
_semaphore = asyncio.Semaphore(20)


def _fire_and_log(coro, description: str):
    """Schedule an async task and log errors instead of silently swallowing them."""
    task = asyncio.create_task(coro)
    task.add_done_callback(
        lambda t: logger.error(f"{description}: {t.exception()}") if t.exception() else None
    )


async def _get_user_keys(username: str) -> dict | None:
    """Load and decrypt user's third-party API keys from MongoDB."""
    if db_manager.db is None:
        return None
    user_doc = await db_manager.db.users.find_one(
        {"username": username},
        {"third_party_keys": 1}
    )
    if not user_doc or not user_doc.get("third_party_keys"):
        return None
    decrypted = {}
    for svc, enc_key in user_doc["third_party_keys"].items():
        try:
            decrypted[svc] = decrypt_secret(enc_key)
        except Exception:
            pass
    return decrypted if decrypted else None


@router.get("/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    """Returns the initialization status of all services based on API keys."""
    user_keys = await _get_user_keys(current_user["username"])
    async with AsyncThreatIntelClient(user_keys=user_keys) as client:
        return {"status": "ok", "services": client.services}


@router.get("/analyze")
@limiter.limit("10/minute")
async def analyze_target(
    request: Request,
    target: str = Query(..., description="IP address, Domain, or File Hash"),
    lang: str = Query("pt", description="Language for heuristic report (pt, en, es)"),
    current_user: dict = Depends(require_api_scope("analyze")),
):
    """
    Analyzes a target using all configured Threat Intelligence services.
    Results are cached in MongoDB for 24 hours.
    """
    try:
        validated = validate_target(target)
        sanitized = validated.sanitized
        target_type = validated.target_type
        logger.info(f"Analyze request: {sanitized} ({target_type}) by {current_user['username']}")
    except ValidationError as e:
        logger.warning(f"Validation error for '{target}': {e}")
        raise HTTPException(status_code=400, detail=str(e))

    # Check MongoDB cache (TTL controlled by CACHE_TTL_HOURS env var, default 24 h)
    if db_manager.db is not None:
        try:
            cache_cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.cache_ttl_hours)
            cached_scan = await db_manager.db.scans.find_one(
                {"target": sanitized, "timestamp": {"$gte": cache_cutoff}},
                sort=[("timestamp", -1)],
            )
            cached_payload = extract_scan_payload(cached_scan)
            if cached_scan and cached_payload:
                logger.info(f"Cache hit: {sanitized}")
                # Record scan for current user so each analyst appears in history
                if cached_scan.get("analyst") != current_user["username"]:
                    _fire_and_log(
                        db_manager.db.scans.insert_one(
                            build_scan_document(
                                target=sanitized,
                                target_type=cached_scan.get("type", target_type),
                                risk_score=cached_scan.get("risk_score", 0),
                                verdict=cached_scan.get("verdict", "UNKNOWN"),
                                analyst=current_user["username"],
                                payload=cached_payload,
                                extra_fields={"_cache_ref": cached_scan["_id"]},
                            )
                        ),
                        f"Failed to persist cache-hit scan for {sanitized}",
                    )
                return cached_payload
        except Exception as e:
            logger.error(f"Cache check failed: {e}")

    # Fetch all services in parallel (rate-limited by the async client)
    async with _semaphore:
        user_keys = await _get_user_keys(current_user["username"])
        async with AsyncThreatIntelClient(user_keys=user_keys) as async_client:
            raw_results = await async_client.query_all(sanitized, target_type)

    # Separate successful results from errors
    service_results: Dict[str, Any] = {}
    analyst_name = current_user.get("username", "")
    for svc, resp in raw_results.items():
        if resp.success and resp.data is not None:
            service_results[svc] = resp.data
            await inc_service_quota(svc, analyst_name)
        else:
            service_results[svc] = {
                "_meta_error": resp.error or "service unavailable",
                "_meta_error_type": resp.error_type or "api_error",
            }

    if not service_results:
        logger.warning("No services available or no API keys configured.")

    # If ALL services failed (network outage, DNS failure, no API keys), try to
    # return the most recent cached result regardless of age (stale fallback).
    all_failed = all("_meta_error" in v for v in service_results.values()) if service_results else True
    if all_failed and db_manager.db is not None:
        try:
            stale_scan = await db_manager.db.scans.find_one(
                {"target": sanitized},
                sort=[("timestamp", -1)],
            )
            stale_payload = extract_scan_payload(stale_scan)
            if stale_scan and stale_payload:
                logger.info(f"Stale cache fallback: {sanitized} (all APIs unavailable)")
                stale_data = dict(stale_payload)
                stale_data["_stale_cache"] = True
                return stale_data
        except Exception as e:
            logger.error(f"Stale cache fallback failed: {e}")

    risk_score, total_sources = compute_risk_score(service_results)
    verdict = compute_verdict(risk_score)

    summary = {
        "risk_sources": risk_score,
        "total_sources": total_sources,
        "verdict": verdict,
    }

    # Heuristic reports for all 3 languages
    report_pt = generate_heuristic_report(sanitized, target_type, summary, service_results, lang="pt")
    report_en = generate_heuristic_report(sanitized, target_type, summary, service_results, lang="en")
    report_es = generate_heuristic_report(sanitized, target_type, summary, service_results, lang="es")

    analysis_report = format_report_to_markdown(
        report_pt if lang == "pt" else (report_en if lang == "en" else report_es)
    )
    analysis_reports = {
        "pt": format_report_to_markdown(report_pt),
        "en": format_report_to_markdown(report_en),
        "es": format_report_to_markdown(report_es),
    }
    results = build_scan_payload(
        target=sanitized,
        target_type=target_type,
        results=service_results,
        summary=summary,
        analysis_report=analysis_report,
        analysis_reports=analysis_reports,
    )

    # Fire-and-forget persist to MongoDB
    if db_manager.db is not None:
        try:
            document = build_scan_document(
                target=sanitized,
                target_type=target_type,
                risk_score=risk_score,
                verdict=verdict,
                analyst=current_user["username"],
                payload=_sanitize_for_mongo(results),
            )
            _fire_and_log(
                db_manager.db.scans.insert_one(document),
                f"Failed to persist scan for {sanitized}",
            )
            ip = request.client.host if request.client else ""
            _fire_and_log(
                log_action(
                    db_manager.db,
                    user=current_user["username"],
                    action="analyze",
                    target=sanitized,
                    ip=ip,
                    result=verdict.lower().replace(" ", "_"),
                ),
                f"Failed to log audit for {sanitized}",
            )
        except Exception as e:
            logger.error(f"Failed to persist scan: {e}")

    return results

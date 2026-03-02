import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Query, Depends, Request

from api_client_async import AsyncThreatIntelClient
from validators import validate_target, ValidationError
from analyzer import generate_heuristic_report, format_report_to_markdown
from db import db_manager
from auth import get_current_user
from limiters import limiter
from audit import log_action
from logging_config import get_logger

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


def _compute_risk_score(service_results: Dict[str, Any]) -> tuple:
    """Compute (risk_score, total_sources) from aggregated API results."""
    risk_score = 0
    total_sources = len(service_results)

    for svc, data in service_results.items():
        if not data or "error" in data or "_meta_error" in data:
            continue
        if svc == "virustotal":
            malicious = (
                data.get("data", {})
                .get("attributes", {})
                .get("last_analysis_stats", {})
                .get("malicious", 0)
            )
            if malicious >= 3:
                risk_score += 1
        elif svc == "abuseipdb":
            if data.get("data", {}).get("abuseConfidenceScore", 0) >= 25:
                risk_score += 1
        elif svc == "alienvault":
            if data.get("pulse_info", {}).get("count", 0) > 0:
                risk_score += 1
        elif svc == "urlscan":
            if data.get("data", {}).get("verdict", {}).get("score", 0) > 0:
                risk_score += 1
        elif svc == "greynoise":
            if data.get("classification") == "malicious":
                risk_score += 1
        elif svc == "blacklistmaster":
            if not isinstance(data, dict) or data.get("_meta_msg") != "No content returned":
                risk_score += 1
        elif svc == "abusech":
            if (
                data.get("query_status") == "ok"
                and isinstance(data.get("data"), list)
                and len(data["data"]) > 0
            ):
                risk_score += 1
        elif svc == "pulsedive":
            if data.get("risk") in ["high", "critical"]:
                risk_score += 1

    return risk_score, total_sources


@router.get("/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    """Returns the initialization status of all services based on API keys."""
    async with AsyncThreatIntelClient() as client:
        return {"status": "ok", "services": client.services}


@router.get("/analyze")
@limiter.limit("10/minute")
async def analyze_target(
    request: Request,
    target: str = Query(..., description="IP address, Domain, or File Hash"),
    lang: str = Query("pt", description="Language for heuristic report (pt, en, es)"),
    current_user: dict = Depends(get_current_user),
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

    # Check MongoDB cache (24 h)
    if db_manager.db is not None:
        try:
            one_day_ago = datetime.now(timezone.utc) - timedelta(days=1)
            cached_scan = await db_manager.db.scans.find_one(
                {"target": sanitized, "timestamp": {"$gte": one_day_ago}},
                sort=[("timestamp", -1)],
            )
            if cached_scan and "data" in cached_scan:
                logger.info(f"Cache hit: {sanitized}")
                return cached_scan["data"]
        except Exception as e:
            logger.error(f"Cache check failed: {e}")

    # Fetch all services in parallel (rate-limited by the async client)
    async with _semaphore:
        async with AsyncThreatIntelClient() as async_client:
            raw_results = await async_client.query_all(sanitized, target_type)

    # Separate successful results from errors
    service_results: Dict[str, Any] = {}
    for svc, resp in raw_results.items():
        if resp.success and resp.data is not None:
            service_results[svc] = resp.data
        else:
            service_results[svc] = {
                "_meta_error": resp.error or "service unavailable",
                "_meta_error_type": resp.error_type or "api_error",
            }

    if not service_results:
        logger.warning("No services available or no API keys configured.")

    risk_score, total_sources = _compute_risk_score(service_results)
    verdict = "HIGH RISK" if risk_score >= 2 else ("SUSPICIOUS" if risk_score == 1 else "SAFE")

    summary = {
        "risk_sources": risk_score,
        "total_sources": total_sources,
        "verdict": verdict,
    }

    results = {
        "target": sanitized,
        "type": target_type,
        "results": service_results,
        "summary": summary,
    }

    # Heuristic reports for all 3 languages
    report_pt = generate_heuristic_report(sanitized, target_type, summary, service_results, lang="pt")
    report_en = generate_heuristic_report(sanitized, target_type, summary, service_results, lang="en")
    report_es = generate_heuristic_report(sanitized, target_type, summary, service_results, lang="es")

    results["analysis_report"] = format_report_to_markdown(
        report_pt if lang == "pt" else (report_en if lang == "en" else report_es)
    )
    results["analysis_reports"] = {
        "pt": format_report_to_markdown(report_pt),
        "en": format_report_to_markdown(report_en),
        "es": format_report_to_markdown(report_es),
    }

    # Fire-and-forget persist to MongoDB
    if db_manager.db is not None:
        try:
            document = {
                "target": sanitized,
                "type": target_type,
                "timestamp": datetime.now(timezone.utc),
                "risk_score": risk_score,
                "verdict": verdict,
                "analyst": current_user["username"],
                "data": _sanitize_for_mongo(results),
            }
            asyncio.ensure_future(db_manager.db.scans.insert_one(document))
            ip = request.client.host if request.client else ""
            asyncio.ensure_future(
                log_action(
                    db_manager.db,
                    user=current_user["username"],
                    action="analyze",
                    target=sanitized,
                    ip=ip,
                    result=verdict.lower().replace(" ", "_"),
                )
            )
        except Exception as e:
            logger.error(f"Failed to persist scan: {e}")

    return results

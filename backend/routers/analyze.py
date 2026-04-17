import asyncio
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Depends, Request
from pymongo.errors import DuplicateKeyError

from clients.api_client_async import AsyncThreatIntelClient
from validators import validate_target, ValidationError
from analyzer import (
    analysis_meta,
    build_geo_summary,
    format_report_sections_to_text,
    generate_analysis_sections,
)
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
_semaphore = asyncio.Semaphore(settings.analyze_max_concurrent)
_analysis_inflight: dict[str, asyncio.Task] = {}
_analysis_inflight_lock = asyncio.Lock()


def _fire_and_log(coro, description: str):
    """Schedule an async task and log errors instead of silently swallowing them."""
    task = asyncio.ensure_future(coro)
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
        except Exception as exc:
            logger.debug(f"Could not decrypt third-party key for service {svc}: {exc}")
    return decrypted if decrypted else None


def _cache_rank(scan_doc: dict[str, Any], payload: dict[str, Any]) -> tuple[int, datetime]:
    summary = payload.get("summary", {}) if isinstance(payload, dict) else {}
    total_sources = int(summary.get("total_sources") or 0)
    timestamp = scan_doc.get("timestamp") or datetime.min.replace(tzinfo=timezone.utc)
    return total_sources, timestamp


async def _find_best_cached_scan(
    *,
    target: str,
    cutoff: datetime | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if db_manager.db is None:
        return None, None

    query: dict[str, Any] = {"target": target}
    if cutoff is not None:
        query["timestamp"] = {"$gte": cutoff}

    scans = await db_manager.db.scans.find(query).to_list(length=100)
    best_scan: dict[str, Any] | None = None
    best_payload: dict[str, Any] | None = None
    best_rank: tuple[int, datetime] | None = None

    for scan_doc in scans:
        payload = extract_scan_payload(scan_doc)
        if not payload:
            continue
        rank = _cache_rank(scan_doc, payload)
        if best_rank is None or rank > best_rank:
            best_scan = scan_doc
            best_payload = payload
            best_rank = rank

    return best_scan, best_payload


async def _try_acquire_distributed_lease(
    request_key: str,
    owner_id: str,
    target: str,
    service_signature: str,
) -> bool:
    if db_manager.db is None:
        return True

    now = datetime.now(timezone.utc)
    existing = await db_manager.db.analysis_runtime.find_one({"_id": request_key})
    if existing and existing.get("expires_at") and existing["expires_at"] > now:
        return False
    if existing:
        await db_manager.db.analysis_runtime.delete_one({"_id": request_key})

    try:
        await db_manager.db.analysis_runtime.insert_one({
            "_id": request_key,
            "owner": owner_id,
            "target": target,
            "service_signature": service_signature,
            "created_at": now,
            "expires_at": now + timedelta(seconds=settings.analyze_runtime_lease_seconds),
        })
        return True
    except DuplicateKeyError:
        return False


async def _release_distributed_lease(request_key: str, owner_id: str) -> None:
    if db_manager.db is None:
        return
    await db_manager.db.analysis_runtime.delete_one({"_id": request_key, "owner": owner_id})


async def _wait_for_shared_scan_result(
    *,
    target: str,
    lang: str,
    current_username: str,
    not_before: datetime,
) -> dict[str, Any] | None:
    if db_manager.db is None:
        return None

    deadline = datetime.now(timezone.utc) + timedelta(seconds=settings.analyze_shared_wait_seconds)
    while datetime.now(timezone.utc) < deadline:
        shared_scan, shared_payload = await _find_best_cached_scan(target=target, cutoff=not_before)
        if shared_scan and shared_payload:
            if shared_scan.get("analyst") != current_username:
                _fire_and_log(
                    db_manager.db.scans.insert_one(
                        build_scan_document(
                            target=target,
                            target_type=shared_scan.get("type", shared_payload.get("type", "")),
                            risk_score=shared_scan.get("risk_score", 0),
                            verdict=shared_scan.get("verdict", "UNKNOWN"),
                            analyst=current_username,
                            payload=shared_payload,
                            extra_fields={"_cache_ref": shared_scan["_id"], "_shared_result": True},
                        )
                    ),
                    f"Failed to persist waited shared-result scan for {target}",
                )
            return _materialize_payload_language(shared_payload, lang)
        await asyncio.sleep(0.25)

    return None


def _materialize_payload_language(payload: dict[str, Any], lang: str) -> dict[str, Any]:
    preferred_lang = (lang or "pt").lower()
    if preferred_lang not in {"pt", "en", "es"}:
        preferred_lang = "pt"

    analysis_reports = payload.get("analysis_reports") or {}
    analysis_section_sets = payload.get("analysis_section_sets") or {}

    materialized = dict(payload)
    materialized["analysis_report"] = (
        analysis_reports.get(preferred_lang)
        or payload.get("analysis_report")
        or ""
    )
    materialized["analysis_sections"] = (
        analysis_section_sets.get(preferred_lang)
        or payload.get("analysis_sections")
        or []
    )
    return materialized


def _analysis_service_signature(user_keys: dict | None) -> str:
    active_services: list[str] = []
    for service, config in AsyncThreatIntelClient.SERVICES_CONFIG.items():
        if user_keys and user_keys.get(service):
            active_services.append(service)
            continue
        if config.get("optional_key"):
            active_services.append(service)
            continue
        if os.getenv(config["env_var"]):
            active_services.append(service)

    return ",".join(sorted(active_services))


def _analysis_request_key(target: str, service_signature: str) -> str:
    return f"{target.lower()}::{service_signature}"


@router.get("/status")
async def get_status(request: Request, current_user: dict = Depends(get_current_user)):
    """Returns the initialization status of all services based on API keys."""
    user_keys = await _get_user_keys(current_user["username"])
    shared_session = getattr(request.app.state, "http_session", None)
    async with AsyncThreatIntelClient(user_keys=user_keys, shared_session=shared_session) as client:
        return {"status": "ok", "services": client.services}


@router.get("/analyze")
@limiter.limit(settings.rate_limit_analyze)
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

    user_keys = await _get_user_keys(current_user["username"])

    # Check MongoDB cache (TTL controlled by CACHE_TTL_HOURS env var, default 24 h)
    if db_manager.db is not None:
        try:
            cache_cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.cache_ttl_hours)
            cached_scan, cached_payload = await _find_best_cached_scan(
                target=sanitized,
                cutoff=cache_cutoff,
            )
            if cached_scan and cached_payload:
                logger.info(
                    "Cache hit: %s (sources=%s)",
                    sanitized,
                    cached_payload.get("summary", {}).get("total_sources", 0),
                )
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
                return _materialize_payload_language(cached_payload, lang)
        except Exception as e:
            logger.error(f"Cache check failed: {e}")

    async def _run_live_analysis() -> dict[str, Any]:
        # Fetch all services in parallel (rate-limited by the async client)
        shared_session = getattr(request.app.state, "http_session", None)
        async with _semaphore:
            async with AsyncThreatIntelClient(user_keys=user_keys, shared_session=shared_session) as async_client:
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
        # return the richest cached result regardless of age (stale fallback).
        all_failed = all("_meta_error" in v for v in service_results.values()) if service_results else True
        if all_failed and db_manager.db is not None:
            try:
                stale_scan, stale_payload = await _find_best_cached_scan(target=sanitized)
                if stale_scan and stale_payload:
                    logger.info(
                        "Stale cache fallback: %s (sources=%s)",
                        sanitized,
                        stale_payload.get("summary", {}).get("total_sources", 0),
                    )
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

        geo_summary = build_geo_summary(sanitized, target_type, service_results)
        sections_pt = generate_analysis_sections(
            sanitized, target_type, summary, service_results, lang="pt", geo_summary=geo_summary
        )
        sections_en = generate_analysis_sections(
            sanitized, target_type, summary, service_results, lang="en", geo_summary=geo_summary
        )
        sections_es = generate_analysis_sections(
            sanitized, target_type, summary, service_results, lang="es", geo_summary=geo_summary
        )

        analysis_report = format_report_sections_to_text(
            sections_pt if lang == "pt" else (sections_en if lang == "en" else sections_es)
        )
        analysis_reports = {
            "pt": format_report_sections_to_text(sections_pt),
            "en": format_report_sections_to_text(sections_en),
            "es": format_report_sections_to_text(sections_es),
        }
        results = build_scan_payload(
            target=sanitized,
            target_type=target_type,
            results=service_results,
            summary=summary,
            analysis_report=analysis_report,
            analysis_reports=analysis_reports,
            analysis_sections=sections_pt if lang == "pt" else (sections_en if lang == "en" else sections_es),
            analysis_section_sets={
                "pt": sections_pt,
                "en": sections_en,
                "es": sections_es,
            },
            geo_summary=geo_summary,
            analysis_meta=analysis_meta(),
        )

        # Persist before releasing distributed lease so other processes can reuse immediately.
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
                await db_manager.db.scans.insert_one(document)
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

    request_key = _analysis_request_key(
        sanitized,
        _analysis_service_signature(user_keys),
    )
    request_started_at = datetime.now(timezone.utc)
    distributed_owner_id = f"{current_user['username']}:{uuid4().hex}"

    # Minimize critical section: only check/set the inflight dict under lock
    async with _analysis_inflight_lock:
        existing_task = _analysis_inflight.get(request_key)
        owner = existing_task is None

    if not owner:
        # Another coroutine is already running this analysis — wait for it
        task = existing_task
    else:
        # We are the owner — try distributed lease (outside the lock)
        lease_acquired = await _try_acquire_distributed_lease(
            request_key,
            distributed_owner_id,
            sanitized,
            _analysis_service_signature(user_keys),
        )

        if lease_acquired:
            async def _run_with_lease() -> dict[str, Any]:
                try:
                    return await _run_live_analysis()
                finally:
                    await _release_distributed_lease(request_key, distributed_owner_id)

            task = asyncio.create_task(_run_with_lease())
        else:
            shared_payload = await _wait_for_shared_scan_result(
                target=sanitized,
                lang=lang,
                current_username=current_user["username"],
                not_before=request_started_at,
            )
            if shared_payload is not None:
                return shared_payload

            retry_acquired = await _try_acquire_distributed_lease(
                request_key,
                distributed_owner_id,
                sanitized,
                _analysis_service_signature(user_keys),
            )
            if retry_acquired:
                async def _run_with_lease_retry() -> dict[str, Any]:
                    try:
                        return await _run_live_analysis()
                    finally:
                        await _release_distributed_lease(request_key, distributed_owner_id)

                task = asyncio.create_task(_run_with_lease_retry())
            else:
                task = asyncio.create_task(_run_live_analysis())

        # Register the task in the inflight dict
        async with _analysis_inflight_lock:
            _analysis_inflight[request_key] = task

    try:
        results = await task
        if not owner and db_manager.db is not None:
            try:
                summary = results.get("summary", {})
                document = build_scan_document(
                    target=sanitized,
                    target_type=results.get("type", target_type),
                    risk_score=int(summary.get("risk_sources") or 0),
                    verdict=summary.get("verdict", "UNKNOWN"),
                    analyst=current_user["username"],
                    payload=_sanitize_for_mongo(results),
                    extra_fields={"_shared_result": True},
                )
                _fire_and_log(
                    db_manager.db.scans.insert_one(document),
                    f"Failed to persist shared-result scan for {sanitized}",
                )
                ip = request.client.host if request.client else ""
                _fire_and_log(
                    log_action(
                        db_manager.db,
                        user=current_user["username"],
                        action="analyze",
                        target=sanitized,
                        ip=ip,
                        result=str(summary.get("verdict", "unknown")).lower().replace(" ", "_"),
                    ),
                    f"Failed to log shared-result audit for {sanitized}",
                )
            except Exception as e:
                logger.error(f"Failed to persist shared-result scan: {e}")

        return _materialize_payload_language(results, lang)
    finally:
        if owner:
            async with _analysis_inflight_lock:
                if _analysis_inflight.get(request_key) is task:
                    _analysis_inflight.pop(request_key, None)

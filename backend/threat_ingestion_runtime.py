"""
Runtime scheduler and sync orchestration for threat ingestion sources.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from inspect import isawaitable
from typing import Any, Callable

from db import db_manager
from logging_config import get_logger
from threat_ingestion import get_runtime_threat_sources, record_threat_sync_status, CUSTOM_PREFIX

logger = get_logger("ThreatIngestionRuntime")

_THREAT_FETCHERS: dict[str, Callable[[dict[str, Any]], Any]] = {}
_THREAT_INGESTION_CYCLE_LOCK = asyncio.Lock()


def register_threat_fetcher(source_id: str, fetcher: Callable[[dict[str, Any]], Any]) -> None:
    _THREAT_FETCHERS[source_id] = fetcher


def clear_threat_fetchers() -> None:
    _THREAT_FETCHERS.clear()


def register_builtin_fetchers() -> None:
    """Register fetchers for all builtin sources (CVE, Fortinet, MISP)."""
    import httpx
    from threat_feed_adapters import parse_rss_items, adapt_cve_rss_items, adapt_fortinet_rss_items
    from threat_misp import fetch_and_adapt_misp_items

    async def _fetch_rss(source: dict[str, Any], adapter, **adapter_kwargs) -> list[dict[str, Any]]:
        feed_url = source.get("config", {}).get("feed_url", "")
        if not feed_url:
            return []
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(feed_url)
            resp.raise_for_status()
        raw_items = parse_rss_items(resp.text)
        return adapter(source["source_id"], raw_items, **adapter_kwargs)

    register_threat_fetcher(
        "cve_recent",
        lambda src: _fetch_rss(src, adapt_cve_rss_items, source_name="CVE Recent", tlp="white"),
    )
    register_threat_fetcher(
        "fortinet_outbreakalert",
        lambda src: _fetch_rss(src, adapt_fortinet_rss_items, source_name="FortiGuard Outbreak Alert", tlp="white"),
    )
    register_threat_fetcher(
        "fortinet_threatsignal",
        lambda src: _fetch_rss(src, adapt_fortinet_rss_items, source_name="FortiGuard Threat Signal", tlp="white"),
    )
    register_threat_fetcher("misp_events", fetch_and_adapt_misp_items)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_source_configured(source: dict[str, Any]) -> tuple[bool, str | None]:
    config = source.get("config", {})
    if source["source_type"] == "rss":
        if not config.get("feed_url"):
            return False, "Feed URL is not configured."
        return True, None

    if source["source_type"] == "misp":
        if not config.get("base_url"):
            return False, "MISP base URL is not configured."
        if not config.get("api_key_configured"):
            return False, "MISP API key is not configured."
        return True, None

    return False, "Unsupported threat ingestion source type."


def _is_source_due(source: dict[str, Any]) -> bool:
    sync_status = source.get("sync_status", {})
    last_run_at = sync_status.get("last_run_at")
    if not last_run_at:
        return True

    interval_minutes = int(source.get("config", {}).get("poll_interval_minutes", 60) or 60)
    return last_run_at <= (_now() - timedelta(minutes=interval_minutes))


async def _resolve_items(fetcher_result) -> list[dict[str, Any]]:
    if isawaitable(fetcher_result):
        return await fetcher_result
    return fetcher_result


def _make_custom_rss_fetcher(source: dict[str, Any]) -> Callable[[dict[str, Any]], Any]:
    """Build a one-shot fetcher for a manually-added RSS source."""
    import httpx
    from threat_feed_adapters import parse_rss_items, adapt_generic_rss_items

    async def _fetch(src: dict[str, Any]) -> list[dict[str, Any]]:
        feed_url = src.get("config", {}).get("feed_url", "")
        if not feed_url:
            return []
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(feed_url)
            resp.raise_for_status()
        raw_items = parse_rss_items(resp.text)
        return adapt_generic_rss_items(
            src["source_id"],
            src.get("family", "custom"),
            raw_items,
            source_name=src.get("name", src.get("family", "Custom")),
            tlp=src.get("config", {}).get("default_tlp", "white"),
        )

    return _fetch


async def sync_threat_source(db, source: dict[str, Any]) -> dict[str, Any]:
    source_id = source["source_id"]
    started_at = _now()

    configured, config_error = _is_source_configured(source)
    if not configured:
        await record_threat_sync_status(
            db,
            source_id,
            status="not_configured",
            items_ingested=0,
            last_error=config_error,
            duration_ms=0,
        )
        return {"source_id": source_id, "status": "not_configured", "items_ingested": 0}

    fetcher = _THREAT_FETCHERS.get(source_id)
    if fetcher is None and source_id.startswith(CUSTOM_PREFIX) and source.get("source_type") == "rss":
        fetcher = _make_custom_rss_fetcher(source)
    if fetcher is None:
        await record_threat_sync_status(
            db,
            source_id,
            status="unsupported",
            items_ingested=0,
            last_error="No fetcher registered for this source.",
            duration_ms=0,
        )
        return {"source_id": source_id, "status": "unsupported", "items_ingested": 0}

    try:
        items = await _resolve_items(fetcher(source))
        count = 0
        for item in items:
            if db is not None:
                await db.threat_items.replace_one(
                    {
                        "source_id": item["source_id"],
                        "external_id": item["external_id"],
                    },
                    item,
                    upsert=True,
                )
            count += 1

        await record_threat_sync_status(
            db,
            source_id,
            status="success",
            items_ingested=count,
            last_error=None,
            duration_ms=int((_now() - started_at).total_seconds() * 1000),
        )
        return {"source_id": source_id, "status": "success", "items_ingested": count}
    except Exception as exc:
        logger.error(f"Threat ingestion failed for {source_id}: {exc}")
        await record_threat_sync_status(
            db,
            source_id,
            status="error",
            items_ingested=0,
            last_error=str(exc),
            duration_ms=int((_now() - started_at).total_seconds() * 1000),
        )
        return {"source_id": source_id, "status": "error", "items_ingested": 0, "error": str(exc)}


async def run_threat_ingestion_cycle(db) -> list[dict[str, Any]]:
    sources = await get_runtime_threat_sources(db)
    results = []

    for source in sources:
        if not source.get("enabled", False):
            results.append({"source_id": source["source_id"], "status": "disabled"})
            continue
        if not _is_source_due(source):
            results.append({"source_id": source["source_id"], "status": "skipped"})
            continue

        results.append(await sync_threat_source(db, source))

    return results


async def execute_threat_ingestion_worker_cycle(db) -> bool:
    if _THREAT_INGESTION_CYCLE_LOCK.locked():
        logger.warning("Threat ingestion cycle skipped because a previous cycle is still running.")
        return False

    async with _THREAT_INGESTION_CYCLE_LOCK:
        await run_threat_ingestion_cycle(db)
    return True


async def start_threat_ingestion_worker(interval_seconds: int = 300, initial_delay_seconds: int = 15):
    register_builtin_fetchers()
    logger.info("Threat ingestion worker started")
    await asyncio.sleep(initial_delay_seconds)
    while True:
        try:
            await execute_threat_ingestion_worker_cycle(db_manager.db)
        except Exception as exc:
            logger.error("Threat ingestion worker error: %s", exc, exc_info=True)
        await asyncio.sleep(interval_seconds)

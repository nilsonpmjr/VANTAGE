"""
Foundation helpers for threat ingestion sources and sync status.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import ipaddress
import json
from urllib.parse import urlparse

from crypto import decrypt_secret, encrypt_secret
from network_security import UnsafeTargetError, validate_public_url


INTEL_SOURCES_DOC_ID = "singleton"

SOURCE_CATALOG = {
    "cve_recent": {
        "source_type": "rss",
        "family": "cve",
        "display_name": "CVE Recent",
        "description": "Canonical CVE feed configured for recent vulnerabilities.",
        "enabled_by_default": True,
        "config": {
            "feed_url": "",
            "poll_interval_minutes": 60,
            "severity_floor": "",
        },
    },
    "fortinet_outbreakalert": {
        "source_type": "rss",
        "family": "fortinet",
        "vendor": "Fortinet",
        "collection": "fortiguard_rss",
        "channel": "outbreak_alert",
        "display_name": "Fortinet Outbreak Alert",
        "description": "Curated Fortinet outbreak intelligence feed.",
        "enabled_by_default": True,
        "config": {
            "feed_url": "",
            "poll_interval_minutes": 60,
            "category": "outbreakalert",
        },
    },
    "fortinet_threatsignal": {
        "source_type": "rss",
        "family": "fortinet",
        "vendor": "Fortinet",
        "collection": "fortiguard_rss",
        "channel": "threat_signal",
        "display_name": "Fortinet Threat Signal",
        "description": "Curated Fortinet threat signal feed.",
        "enabled_by_default": True,
        "config": {
            "feed_url": "",
            "poll_interval_minutes": 60,
            "category": "threatsignal",
        },
    },
    "misp_events": {
        "source_type": "misp",
        "family": "misp",
        "display_name": "MISP Events",
        "description": "Structured event and attribute ingestion via MISP.",
        "enabled_by_default": False,
        "config": {
            "base_url": "",
            "api_key_configured": False,
            "verify_tls": True,
            "poll_interval_minutes": 30,
        },
    },
}

SYNC_STATUS_DEFAULT = {
    "status": "never_run",
    "last_run_at": None,
    "last_error": None,
    "items_ingested": 0,
    "duration_ms": None,
}

MISP_SOURCE_ID = "misp_events"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _build_default_source(source_id: str) -> dict:
    if source_id not in SOURCE_CATALOG:
        raise ValueError(f"Unknown threat ingestion source: {source_id}")

    spec = SOURCE_CATALOG[source_id]
    return {
        "source_id": source_id,
        "source_type": spec["source_type"],
        "family": spec["family"],
        "vendor": spec.get("vendor", ""),
        "collection": spec.get("collection", ""),
        "channel": spec.get("channel", ""),
        "display_name": spec["display_name"],
        "description": spec["description"],
        "enabled": bool(spec["enabled_by_default"]),
        "config": deepcopy(spec["config"]),
    }


def _normalize_source_patch(patch: dict) -> dict:
    if not isinstance(patch, dict):
        raise ValueError("Threat ingestion patch must be an object.")

    normalized: dict = {}
    if "enabled" in patch:
        normalized["enabled"] = bool(patch["enabled"])

    if "display_name" in patch:
        value = str(patch["display_name"]).strip()
        if not value:
            raise ValueError("display_name cannot be empty.")
        normalized["display_name"] = value

    if "config" in patch:
        if not isinstance(patch["config"], dict):
            raise ValueError("config must be an object.")
        normalized_config = {}
        for key, value in patch["config"].items():
            if isinstance(value, str):
                normalized_config[key] = value.strip()
            else:
                normalized_config[key] = value
        normalized["config"] = normalized_config

    unknown_fields = set(patch) - {"enabled", "display_name", "config"}
    if unknown_fields:
        raise ValueError(f"Unknown threat ingestion fields: {', '.join(sorted(unknown_fields))}")

    return normalized


def _normalize_misp_url(value: str) -> str:
    normalized = str(value or "").strip().rstrip("/")
    if not normalized:
        return ""

    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Invalid MISP base URL.")
    return normalized


def _apply_source_override(
    source_id: str,
    effective: dict,
    override: dict,
    *,
    include_secrets: bool,
) -> dict:
    if "enabled" in override:
        effective["enabled"] = bool(override["enabled"])
    if override.get("display_name"):
        effective["display_name"] = override["display_name"]
    if isinstance(override.get("config"), dict):
        effective["config"].update(override["config"])

    if source_id != MISP_SOURCE_ID:
        return effective

    api_key_enc = ((override.get("secret_config") or {}).get("api_key_enc") or "").strip()
    effective["config"]["api_key_configured"] = bool(api_key_enc)
    if include_secrets:
        if api_key_enc:
            try:
                effective["config"]["api_key"] = decrypt_secret(api_key_enc)
            except Exception:
                effective["config"]["api_key"] = ""
                effective["config"]["api_key_decryption_error"] = "Stored MISP API key could not be decrypted."
        else:
            effective["config"]["api_key"] = ""

    return effective


async def get_threat_sources_document(db) -> dict:
    if db is None:
        return {"_id": INTEL_SOURCES_DOC_ID, "sources": {}}

    doc = await db.threat_sources.find_one({"_id": INTEL_SOURCES_DOC_ID})
    if not doc:
        return {"_id": INTEL_SOURCES_DOC_ID, "sources": {}}

    doc.setdefault("sources", {})
    return doc


async def get_effective_threat_sources(db) -> list[dict]:
    doc = await get_threat_sources_document(db)
    sources = []

    for source_id in SOURCE_CATALOG:
        effective = _build_default_source(source_id)
        override = doc["sources"].get(source_id, {})
        sources.append(
            _apply_source_override(
                source_id,
                effective,
                override,
                include_secrets=False,
            )
        )

    return sources


async def get_runtime_threat_sources(db) -> list[dict]:
    doc = await get_threat_sources_document(db)
    statuses = {}
    if db is not None:
        for source in await db.threat_sync_status.find({}).to_list(length=200):
            statuses[source["source_id"]] = source
    sources = []

    for source_id in SOURCE_CATALOG:
        effective = _build_default_source(source_id)
        override = doc["sources"].get(source_id, {})
        effective = _apply_source_override(
            source_id,
            effective,
            override,
            include_secrets=True,
        )
        status = statuses.get(source_id, SYNC_STATUS_DEFAULT)
        effective["sync_status"] = {
            "status": status["status"],
            "last_run_at": status["last_run_at"],
            "last_error": status["last_error"],
            "items_ingested": status["items_ingested"],
            "duration_ms": status.get("duration_ms"),
        }
        sources.append(effective)

    # Include custom (manual) sources
    custom = await get_custom_threat_sources(db)
    for cs in custom:
        status = statuses.get(cs["source_id"], SYNC_STATUS_DEFAULT)
        cs["sync_status"] = {
            "status": status["status"],
            "last_run_at": status["last_run_at"],
            "last_error": status["last_error"],
            "items_ingested": status["items_ingested"],
            "duration_ms": status.get("duration_ms"),
        }
        sources.append(cs)

    return sources


async def get_public_threat_source(db, source_id: str) -> dict:
    if source_id not in SOURCE_CATALOG:
        raise ValueError(f"Unknown threat ingestion source: {source_id}")
    sources = await get_public_threat_sources(db)
    return next(source for source in sources if source["source_id"] == source_id)


async def get_runtime_threat_source(db, source_id: str) -> dict:
    if source_id not in SOURCE_CATALOG:
        raise ValueError(f"Unknown threat ingestion source: {source_id}")
    sources = await get_runtime_threat_sources(db)
    return next(source for source in sources if source["source_id"] == source_id)


async def update_threat_source(db, source_id: str, patch: dict, updated_by: str | None = None) -> dict:
    if source_id not in SOURCE_CATALOG:
        raise ValueError(f"Unknown threat ingestion source: {source_id}")

    normalized = _normalize_source_patch(patch)
    doc = await get_threat_sources_document(db)
    next_doc = deepcopy(doc)
    current = deepcopy(next_doc["sources"].get(source_id, {}))

    if "enabled" in normalized:
        current["enabled"] = normalized["enabled"]
    if "display_name" in normalized:
        current["display_name"] = normalized["display_name"]
    if "config" in normalized:
        current.setdefault("config", {})
        current["config"].update(normalized["config"])

    next_doc["sources"][source_id] = current
    next_doc["updated_at"] = _now()
    next_doc["updated_by"] = updated_by

    if db is not None:
        await db.threat_sources.replace_one(
            {"_id": INTEL_SOURCES_DOC_ID},
            next_doc,
            upsert=True,
        )

    effective = await get_effective_threat_sources(db)
    return next(source for source in effective if source["source_id"] == source_id)


async def record_threat_sync_status(
    db,
    source_id: str,
    *,
    status: str,
    items_ingested: int = 0,
    last_error: str | None = None,
    last_run_at: datetime | None = None,
    duration_ms: int | None = None,
) -> dict:

    document = {
        "source_id": source_id,
        "status": status,
        "items_ingested": int(items_ingested),
        "last_error": last_error,
        "last_run_at": last_run_at or _now(),
        "updated_at": _now(),
        "duration_ms": int(duration_ms) if duration_ms is not None else None,
    }

    if db is not None:
        await db.threat_sync_status.replace_one(
            {"source_id": source_id},
            document,
            upsert=True,
        )
        history_entry = {
            "source_id": source_id,
            "status": status,
            "items_ingested": int(items_ingested),
            "last_error": last_error,
            "last_run_at": document["last_run_at"],
            "duration_ms": int(duration_ms) if duration_ms is not None else None,
            "recorded_at": _now(),
        }
        await db.threat_sync_history.insert_one(history_entry)

    return document


async def get_public_threat_sources(db) -> list[dict]:
    sources = await get_effective_threat_sources(db)
    statuses = {}

    if db is not None:
        for source in await db.threat_sync_status.find({}).to_list(length=200):
            statuses[source["source_id"]] = source

    public_sources = []
    for source in sources:
        status = statuses.get(source["source_id"], SYNC_STATUS_DEFAULT)
        public_sources.append(
            {
                **source,
                "origin": "core",
                "sync_status": {
                    "status": status["status"],
                    "last_run_at": status["last_run_at"],
                    "last_error": status["last_error"],
                    "items_ingested": status["items_ingested"],
                    "duration_ms": status.get("duration_ms"),
                },
            }
        )

    # Append custom (manual) sources
    custom = await get_custom_threat_sources(db)
    for cs in custom:
        status = statuses.get(cs["source_id"], SYNC_STATUS_DEFAULT)
        public_sources.append(_serialize_custom_source(cs, status=status))

    return public_sources


async def update_misp_source_config(db, patch: dict, updated_by: str | None = None) -> dict:
    if not isinstance(patch, dict):
        raise ValueError("MISP config patch must be an object.")

    doc = await get_threat_sources_document(db)
    next_doc = deepcopy(doc)
    current = deepcopy(next_doc["sources"].get(MISP_SOURCE_ID, {}))
    current.setdefault("config", {})
    current.setdefault("secret_config", {})

    if "enabled" in patch:
        current["enabled"] = bool(patch["enabled"])

    if "display_name" in patch:
        display_name = str(patch["display_name"]).strip()
        if not display_name:
            raise ValueError("display_name cannot be empty.")
        current["display_name"] = display_name

    if "base_url" in patch:
        current["config"]["base_url"] = _normalize_misp_url(patch["base_url"])

    if "verify_tls" in patch:
        current["config"]["verify_tls"] = bool(patch["verify_tls"])

    if "poll_interval_minutes" in patch:
        try:
            interval = int(patch["poll_interval_minutes"])
        except (TypeError, ValueError) as exc:
            raise ValueError("poll_interval_minutes must be an integer.") from exc
        if interval < 1 or interval > 1440:
            raise ValueError("poll_interval_minutes must be between 1 and 1440.")
        current["config"]["poll_interval_minutes"] = interval

    if "api_key" in patch:
        api_key = str(patch["api_key"] or "").strip()
        if api_key:
            current["secret_config"]["api_key_enc"] = encrypt_secret(api_key)
        else:
            current["secret_config"].pop("api_key_enc", None)

    next_doc["sources"][MISP_SOURCE_ID] = current
    next_doc["updated_at"] = _now()
    next_doc["updated_by"] = updated_by

    if db is not None:
        await db.threat_sources.replace_one(
            {"_id": INTEL_SOURCES_DOC_ID},
            next_doc,
            upsert=True,
        )

    return await get_public_threat_source(db, MISP_SOURCE_ID)


async def get_threat_source_history(
    db,
    source_id: str,
    *,
    limit: int = 24,
) -> list[dict]:
    if db is None:
        return []
    items = (
        await db.threat_sync_history.find({"source_id": source_id}).sort("recorded_at", -1).limit(limit).to_list(length=limit)
    )
    for item in items:
        item.pop("_id", None)
    return items


async def estimate_threat_source_payload_bytes(
    db,
    source_id: str,
    *,
    since: datetime,
) -> int:
    if db is None:
        return 0
    items = (
        await db.threat_items.find({"source_id": source_id, "timestamp": {"$gte": since}}).to_list(length=5000)
    )
    total = 0
    for item in items:
        total += len(json.dumps(item, default=str, ensure_ascii=False))
    return total


# ── Custom (manual) RSS sources ──────────────────────────────────────────────

CUSTOM_PREFIX = "custom_"


def _serialize_custom_source(source: dict, status: dict | None = None) -> dict:
    sync_status = status or SYNC_STATUS_DEFAULT
    return {
        "source_id": source["source_id"],
        "source_type": source["source_type"],
        "family": source["family"],
        "display_name": source["display_name"],
        "description": source.get("description", ""),
        "enabled": source.get("enabled", True),
        "origin": "manual",
        "config": source.get("config", {}),
        "created_by": source.get("created_by"),
        "created_at": source.get("created_at"),
        "updated_at": source.get("updated_at"),
        "updated_by": source.get("updated_by"),
        "sync_status": {
            "status": sync_status["status"],
            "last_run_at": sync_status["last_run_at"],
            "last_error": sync_status["last_error"],
            "items_ingested": sync_status["items_ingested"],
            "duration_ms": sync_status.get("duration_ms"),
        },
    }


def _validate_feed_url(url: str) -> str:
    """Validate and normalize a feed URL. Rejects non-HTTP(S) and private IPs."""
    normalized = str(url or "").strip()
    if not normalized:
        raise ValueError("feed_url is required.")

    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("feed_url must use http or https.")
    if not parsed.netloc:
        raise ValueError("feed_url must have a valid hostname.")

    hostname = parsed.hostname or ""
    if hostname.lower() == "localhost":
        raise ValueError("feed_url cannot point to localhost.")

    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        ip = None

    if ip is not None and ip.is_unspecified:
        raise ValueError("feed_url cannot point to an unspecified address.")

    try:
        return validate_public_url(normalized)
    except UnsafeTargetError as exc:
        raise ValueError(str(exc)) from exc

    return normalized


def _make_custom_source_id(title: str) -> str:
    """Generate a deterministic source_id from a title."""
    import hashlib
    slug = title.lower().strip().replace(" ", "_")[:30]
    short_hash = hashlib.sha256(slug.encode()).hexdigest()[:8]
    return f"{CUSTOM_PREFIX}{slug}_{short_hash}"


async def create_custom_source(
    db,
    *,
    title: str,
    feed_url: str,
    family: str = "custom",
    poll_interval_minutes: int = 60,
    default_tlp: str = "white",
    created_by: str | None = None,
) -> dict:
    """Create a new manually-added RSS feed source."""
    from threat_items import normalize_tlp

    title = str(title or "").strip()
    if not title:
        raise ValueError("title is required.")
    if len(title) > 200:
        raise ValueError("title must be 200 characters or fewer.")

    feed_url = _validate_feed_url(feed_url)

    family = str(family or "custom").strip().lower()[:50] or "custom"

    if not isinstance(poll_interval_minutes, int) or poll_interval_minutes < 1 or poll_interval_minutes > 1440:
        raise ValueError("poll_interval_minutes must be between 1 and 1440.")

    default_tlp = normalize_tlp(default_tlp) or "white"

    source_id = _make_custom_source_id(title)

    # Check for duplicate URL
    if db is not None:
        existing = await db.custom_threat_sources.find_one({"config.feed_url": feed_url})
        if existing:
            raise ValueError("A custom source with this feed URL already exists.")

    document = {
        "source_id": source_id,
        "source_type": "rss",
        "family": family,
        "display_name": title,
        "description": f"Manually added RSS feed: {title}",
        "enabled": True,
        "origin": "manual",
        "config": {
            "feed_url": feed_url,
            "poll_interval_minutes": poll_interval_minutes,
            "default_tlp": default_tlp,
        },
        "created_by": created_by,
        "created_at": _now(),
        "updated_at": _now(),
    }

    if db is not None:
        await db.custom_threat_sources.replace_one(
            {"source_id": source_id},
            document,
            upsert=True,
        )

    return document


async def get_custom_threat_sources(db) -> list[dict]:
    """Return all manually-added sources."""
    if db is None:
        return []
    docs = await db.custom_threat_sources.find({}).to_list(length=200)
    return [{k: v for k, v in doc.items() if k != "_id"} for doc in docs]


async def update_custom_source(
    db,
    source_id: str,
    patch: dict,
    updated_by: str | None = None,
) -> dict:
    """Update a manually-added source. Only title, feed_url, family, enabled, poll_interval allowed."""
    if not source_id.startswith(CUSTOM_PREFIX):
        raise ValueError("Only custom sources can be updated via this endpoint.")

    if db is None:
        raise ValueError("Database not connected.")

    existing = await db.custom_threat_sources.find_one({"source_id": source_id})
    if not existing:
        raise ValueError(f"Custom source not found: {source_id}")

    if "display_name" in patch:
        title = str(patch["display_name"]).strip()
        if not title:
            raise ValueError("display_name cannot be empty.")
        existing["display_name"] = title

    if "feed_url" in patch:
        existing["config"]["feed_url"] = _validate_feed_url(patch["feed_url"])

    if "family" in patch:
        existing["family"] = str(patch["family"]).strip().lower()[:50] or "custom"

    if "enabled" in patch:
        existing["enabled"] = bool(patch["enabled"])

    if "poll_interval_minutes" in patch:
        try:
            interval = int(patch["poll_interval_minutes"])
        except (TypeError, ValueError) as exc:
            raise ValueError("poll_interval_minutes must be an integer.") from exc
        if interval < 1 or interval > 1440:
            raise ValueError("poll_interval_minutes must be between 1 and 1440.")
        existing["config"]["poll_interval_minutes"] = interval

    if "default_tlp" in patch:
        from threat_items import normalize_tlp
        existing["config"]["default_tlp"] = normalize_tlp(patch["default_tlp"]) or "white"

    existing["updated_at"] = _now()
    existing["updated_by"] = updated_by

    await db.custom_threat_sources.replace_one(
        {"source_id": source_id},
        existing,
        upsert=True,
    )
    status = await db.threat_sync_status.find_one({"source_id": source_id}) if db is not None else None
    return _serialize_custom_source(existing, status=status)


async def delete_custom_source(db, source_id: str) -> bool:
    """Delete a manually-added source and its sync status."""
    if not source_id.startswith(CUSTOM_PREFIX):
        raise ValueError("Only custom sources can be deleted.")

    if db is None:
        return False

    result = await db.custom_threat_sources.delete_one({"source_id": source_id})
    await db.threat_sync_status.delete_one({"source_id": source_id})
    return result.deleted_count > 0

"""
Foundation helpers for threat ingestion sources and sync status.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import urlparse

from crypto import decrypt_secret, encrypt_secret


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
        for source in await db.threat_sync_status.find({}).to_list(length=100):
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
        }
        sources.append(effective)

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
) -> dict:
    if source_id not in SOURCE_CATALOG:
        raise ValueError(f"Unknown threat ingestion source: {source_id}")

    document = {
        "source_id": source_id,
        "status": status,
        "items_ingested": int(items_ingested),
        "last_error": last_error,
        "last_run_at": last_run_at or _now(),
        "updated_at": _now(),
    }

    if db is not None:
        await db.threat_sync_status.replace_one(
            {"source_id": source_id},
            document,
            upsert=True,
        )

    return document


async def get_public_threat_sources(db) -> list[dict]:
    sources = await get_effective_threat_sources(db)
    statuses = {}

    if db is not None:
        for source in await db.threat_sync_status.find({}).to_list(length=100):
            statuses[source["source_id"]] = source

    public_sources = []
    for source in sources:
        status = statuses.get(source["source_id"], SYNC_STATUS_DEFAULT)
        public_sources.append(
            {
                **source,
                "sync_status": {
                    "status": status["status"],
                    "last_run_at": status["last_run_at"],
                    "last_error": status["last_error"],
                    "items_ingested": status["items_ingested"],
                },
            }
        )

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

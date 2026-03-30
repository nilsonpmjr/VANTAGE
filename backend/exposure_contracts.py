"""
Canonical contracts for premium exposure intelligence providers and findings.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


VALID_EXPOSURE_ASSET_TYPES = {
    "domain",
    "subdomain",
    "email_domain",
    "brand_keyword",
}
VALID_EXPOSURE_PROVIDER_SCOPES = {
    "credential",
    "brand",
    "surface",
    "leak",
    "correlation",
}
VALID_EXPOSURE_FINDING_KINDS = {
    "credential_exposure",
    "data_leak",
    "brand_abuse",
    "phishing_signal",
    "shadow_asset",
    "public_reference",
}
VALID_EXPOSURE_SCHEDULE_MODES = {
    "manual",
    "daily",
    "continuous",
}


def normalize_exposure_asset_type(value: str | None) -> str:
    if not value:
        return "domain"

    normalized = str(value).strip().lower()
    aliases = {
        "hostname": "domain",
        "root_domain": "domain",
        "mail_domain": "email_domain",
        "keyword": "brand_keyword",
        "brand": "brand_keyword",
    }
    normalized = aliases.get(normalized, normalized)
    if normalized not in VALID_EXPOSURE_ASSET_TYPES:
        raise ValueError(f"unsupported_exposure_asset_type:{normalized}")
    return normalized


def _normalize_scope(values: list[str] | tuple[str, ...] | None) -> list[str]:
    if not values:
        raise ValueError("exposure_provider_scope_required")

    normalized = sorted({str(value).strip().lower() for value in values if str(value).strip()})
    invalid = [value for value in normalized if value not in VALID_EXPOSURE_PROVIDER_SCOPES]
    if invalid:
        raise ValueError(f"unsupported_exposure_provider_scope:{','.join(invalid)}")
    return normalized


def normalize_exposure_schedule_mode(value: str | None) -> str:
    normalized = str(value or "manual").strip().lower()
    if normalized not in VALID_EXPOSURE_SCHEDULE_MODES:
        raise ValueError(f"unsupported_exposure_schedule_mode:{normalized}")
    return normalized


def build_exposure_provider_descriptor(
    *,
    key: str,
    name: str,
    version: str,
    asset_types: list[str],
    provider_scope: list[str],
    entrypoint: str,
    runtime: str = "plugin_premium",
    capabilities: list[str] | None = None,
    required_secrets: list[str] | None = None,
    recommended_schedule: str = "daily",
) -> dict[str, Any]:
    if not asset_types:
        raise ValueError("exposure_asset_types_required")
    normalized_asset_types = sorted({normalize_exposure_asset_type(value) for value in asset_types})
    if not entrypoint:
        raise ValueError("exposure_provider_entrypoint_required")

    return {
        "key": key,
        "name": name,
        "version": version,
        "kind": "premium_feature",
        "premiumFeatureType": "exposure_provider",
        "distributionTier": "premium",
        "assetTypes": normalized_asset_types,
        "providerScope": _normalize_scope(provider_scope),
        "entrypoint": entrypoint,
        "runtime": runtime,
        "capabilities": sorted({str(value).strip() for value in (capabilities or []) if str(value).strip()}),
        "requiredSecrets": sorted({str(value).strip() for value in (required_secrets or []) if str(value).strip()}),
        "recommendedSchedule": normalize_exposure_schedule_mode(recommended_schedule),
        "productSurface": ["exposure"],
    }


def build_exposure_asset_payload(
    *,
    asset_type: str,
    value: str,
    owner: str | None = None,
    schedule_mode: str = "manual",
    tags: list[str] | None = None,
) -> dict[str, Any]:
    normalized_value = str(value or "").strip().lower()
    if not normalized_value:
        raise ValueError("exposure_asset_value_required")

    return {
        "asset_type": normalize_exposure_asset_type(asset_type),
        "value": normalized_value,
        "owner": owner,
        "schedule_mode": normalize_exposure_schedule_mode(schedule_mode),
        "tags": sorted({str(tag).strip().lower() for tag in (tags or []) if str(tag).strip()}),
    }


def build_exposure_finding_payload(
    *,
    title: str,
    summary: str,
    kind: str,
    severity: str,
    confidence: float | int,
    evidence: list[dict[str, Any]] | None = None,
    attributes: dict[str, Any] | None = None,
    raw: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_kind = str(kind or "").strip().lower()
    if normalized_kind not in VALID_EXPOSURE_FINDING_KINDS:
        raise ValueError(f"unsupported_exposure_finding_kind:{normalized_kind}")

    normalized_severity = str(severity or "").strip().lower()
    if normalized_severity not in {"critical", "high", "medium", "low", "info"}:
        raise ValueError(f"unsupported_exposure_severity:{normalized_severity}")

    normalized_confidence = float(confidence)
    if normalized_confidence < 0 or normalized_confidence > 1:
        raise ValueError("exposure_confidence_must_be_between_0_and_1")

    return {
        "title": str(title or "").strip(),
        "summary": str(summary or "").strip(),
        "kind": normalized_kind,
        "severity": normalized_severity,
        "confidence": normalized_confidence,
        "evidence": evidence or [],
        "attributes": attributes or {},
        "raw": raw or {},
    }


def build_exposure_finding_document(
    *,
    provider_key: str,
    asset_payload: dict[str, Any],
    payload: dict[str, Any],
    timestamp: datetime | None = None,
    extra_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    document = {
        "provider_key": provider_key,
        "asset_type": asset_payload["asset_type"],
        "asset_value": asset_payload["value"],
        "owner": asset_payload.get("owner"),
        "schedule_mode": asset_payload.get("schedule_mode"),
        "timestamp": timestamp or datetime.now(timezone.utc),
        "title": payload["title"],
        "summary": payload["summary"],
        "kind": payload["kind"],
        "severity": payload["severity"],
        "confidence": payload["confidence"],
        "data": payload,
    }
    if extra_fields:
        document.update(extra_fields)
    return document


def extract_exposure_finding_payload(document: dict[str, Any] | None) -> dict[str, Any] | None:
    if not document:
        return None
    payload = document.get("data")
    if isinstance(payload, dict):
        return payload
    return None

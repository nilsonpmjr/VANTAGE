"""
Canonical storage helpers for premium exposure monitored assets, findings, and incidents.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any

from exposure_contracts import (
    build_exposure_finding_document,
    normalize_exposure_asset_type,
    normalize_exposure_schedule_mode,
)


EXPOSURE_MONITORED_ASSETS_COLLECTION = "exposure_monitored_assets"
EXPOSURE_FINDINGS_COLLECTION = "exposure_findings"
EXPOSURE_INCIDENTS_COLLECTION = "exposure_incidents"
EXPOSURE_DATA_BOUNDARY = "premium_customer_exposure"
EXPOSURE_PRODUCT_SURFACE = "exposure"

VALID_EXPOSURE_DOC_KINDS = {
    "monitored_asset",
    "finding",
    "incident",
}
VALID_EXPOSURE_RECURRENCE_STATUSES = {
    "never_run",
    "success",
    "error",
    "running",
}
VALID_EXPOSURE_INCIDENT_STATUSES = {
    "open",
    "investigating",
    "resolved",
    "dismissed",
}
VALID_EXPOSURE_SEVERITIES = {
    "critical",
    "high",
    "medium",
    "low",
    "info",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_customer_key(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if not normalized:
        raise ValueError("customer_key_required")
    return normalized


def _normalize_doc_kind(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized not in VALID_EXPOSURE_DOC_KINDS:
        raise ValueError(f"unsupported_exposure_doc_kind:{normalized}")
    return normalized


def _normalize_incident_status(value: str | None) -> str:
    normalized = str(value or "open").strip().lower()
    if normalized not in VALID_EXPOSURE_INCIDENT_STATUSES:
        raise ValueError(f"unsupported_exposure_incident_status:{normalized}")
    return normalized


def _normalize_severity(value: str | None) -> str:
    normalized = str(value or "medium").strip().lower()
    if normalized not in VALID_EXPOSURE_SEVERITIES:
        raise ValueError(f"unsupported_exposure_incident_severity:{normalized}")
    return normalized


def _build_boundary_metadata(*, customer_key: str, doc_kind: str, collection_hint: str) -> dict[str, Any]:
    return {
        "doc_kind": _normalize_doc_kind(doc_kind),
        "data_boundary": EXPOSURE_DATA_BOUNDARY,
        "product_surface": EXPOSURE_PRODUCT_SURFACE,
        "storage_scope": "customer",
        "customer_key": _normalize_customer_key(customer_key),
        "collection_hint": collection_hint,
    }


def build_exposure_recurrence_state(
    *,
    schedule_mode: str = "manual",
    last_run_at: datetime | None = None,
    next_run_at: datetime | None = None,
    last_status: str = "never_run",
    consecutive_failures: int = 0,
) -> dict[str, Any]:
    normalized_mode = normalize_exposure_schedule_mode(schedule_mode)
    normalized_status = str(last_status or "never_run").strip().lower()
    if normalized_status not in VALID_EXPOSURE_RECURRENCE_STATUSES:
        raise ValueError(f"unsupported_exposure_recurrence_status:{normalized_status}")

    normalized_failures = int(consecutive_failures or 0)
    if normalized_failures < 0:
        raise ValueError("consecutive_failures_must_be_positive")

    return {
        "mode": normalized_mode,
        "last_run_at": last_run_at,
        "next_run_at": None if normalized_mode == "manual" else next_run_at,
        "last_status": normalized_status,
        "consecutive_failures": normalized_failures,
    }


def update_exposure_recurrence_state(
    recurrence: dict[str, Any] | None,
    *,
    timestamp: datetime | None = None,
    status: str,
) -> dict[str, Any]:
    current = dict(recurrence or {})
    mode = normalize_exposure_schedule_mode(current.get("mode") or "manual")
    normalized_timestamp = timestamp or _now()
    normalized_status = str(status or "").strip().lower()
    if normalized_status not in VALID_EXPOSURE_RECURRENCE_STATUSES:
        raise ValueError(f"unsupported_exposure_recurrence_status:{normalized_status}")

    if mode == "manual":
        next_run_at = None
    elif mode == "daily":
        next_run_at = normalized_timestamp + timedelta(days=1)
    else:
        next_run_at = normalized_timestamp + timedelta(hours=1)

    consecutive_failures = 0 if normalized_status == "success" else int(current.get("consecutive_failures") or 0) + 1

    return {
        "mode": mode,
        "last_run_at": normalized_timestamp,
        "next_run_at": next_run_at,
        "last_status": normalized_status,
        "consecutive_failures": consecutive_failures,
    }


def build_exposure_monitored_asset_document(
    *,
    customer_key: str,
    asset_payload: dict[str, Any],
    created_by: str | None = None,
    provider_keys: list[str] | None = None,
    is_active: bool = True,
    recurrence: dict[str, Any] | None = None,
    timestamp: datetime | None = None,
    extra_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_timestamp = timestamp or _now()
    normalized_recurrence = recurrence or build_exposure_recurrence_state(
        schedule_mode=asset_payload.get("schedule_mode", "manual")
    )
    document = {
        **_build_boundary_metadata(
            customer_key=customer_key,
            doc_kind="monitored_asset",
            collection_hint=EXPOSURE_MONITORED_ASSETS_COLLECTION,
        ),
        "asset_type": normalize_exposure_asset_type(asset_payload.get("asset_type")),
        "value": str(asset_payload.get("value") or "").strip().lower(),
        "owner": asset_payload.get("owner"),
        "tags": sorted({tag for tag in (asset_payload.get("tags") or []) if tag}),
        "provider_keys": sorted({str(key).strip() for key in (provider_keys or []) if str(key).strip()}),
        "is_active": bool(is_active),
        "created_by": created_by,
        "created_at": normalized_timestamp,
        "updated_at": normalized_timestamp,
        "recurrence": normalized_recurrence,
        "data": asset_payload,
    }
    if extra_fields:
        document.update(extra_fields)
    return document


def build_monitored_exposure_finding_document(
    *,
    customer_key: str,
    monitored_asset_id: str,
    provider_key: str,
    asset_payload: dict[str, Any],
    payload: dict[str, Any],
    timestamp: datetime | None = None,
    extra_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    document = build_exposure_finding_document(
        provider_key=provider_key,
        asset_payload=asset_payload,
        payload=payload,
        timestamp=timestamp,
        extra_fields={
            **_build_boundary_metadata(
                customer_key=customer_key,
                doc_kind="finding",
                collection_hint=EXPOSURE_FINDINGS_COLLECTION,
            ),
            "monitored_asset_id": monitored_asset_id,
            "incident_id": None,
            **(extra_fields or {}),
        },
    )
    return document


def build_exposure_incident_document(
    *,
    customer_key: str,
    title: str,
    summary: str,
    severity: str,
    source_finding_ids: list[str],
    related_assets: list[dict[str, Any]],
    status: str = "open",
    timestamp: datetime | None = None,
    extra_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_timestamp = timestamp or _now()
    document = {
        **_build_boundary_metadata(
            customer_key=customer_key,
            doc_kind="incident",
            collection_hint=EXPOSURE_INCIDENTS_COLLECTION,
        ),
        "title": str(title or "").strip(),
        "summary": str(summary or "").strip(),
        "severity": _normalize_severity(severity),
        "status": _normalize_incident_status(status),
        "source_finding_ids": sorted({str(value).strip() for value in source_finding_ids if str(value).strip()}),
        "related_assets": [
            {
                "asset_type": normalize_exposure_asset_type(asset.get("asset_type")),
                "value": str(asset.get("value") or "").strip().lower(),
                "monitored_asset_id": asset.get("monitored_asset_id"),
            }
            for asset in related_assets
            if asset
        ],
        "opened_at": normalized_timestamp,
        "updated_at": normalized_timestamp,
        "last_seen_at": normalized_timestamp,
        "data": {
            "finding_count": len(source_finding_ids),
        },
    }
    if extra_fields:
        document.update(extra_fields)
    return document

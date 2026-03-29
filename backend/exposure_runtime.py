"""
Reference runtime helpers for premium exposure providers.
"""

from __future__ import annotations

from typing import Any

from exposure_contracts import (
    build_exposure_asset_payload,
    build_exposure_finding_payload,
    build_exposure_provider_descriptor,
)
from exposure_monitoring import build_monitored_exposure_finding_document


SURFACE_MONITOR_SUPPORTED_ASSET_TYPES = {
    "domain",
    "subdomain",
    "brand_keyword",
}
SURFACE_MONITOR_SUPPORTED_FINDING_KINDS = {
    "shadow_asset",
    "brand_abuse",
    "phishing_signal",
    "public_reference",
}
SURFACE_MONITOR_KIND_ALIASES = {
    "brand_abuse_signal": "brand_abuse",
    "phishing": "phishing_signal",
    "shadow": "shadow_asset",
    "reference": "public_reference",
}


def build_surface_monitor_provider_descriptor() -> dict[str, Any]:
    return build_exposure_provider_descriptor(
        key="premium-exposure-surface-monitor",
        name="Surface Monitor",
        version="0.1.0",
        asset_types=["domain", "subdomain", "brand_keyword"],
        provider_scope=["surface", "brand", "correlation"],
        entrypoint="premium.exposure.surface_monitor",
        capabilities=[
            "shadow_asset_detection",
            "brand_abuse_signal",
            "public_reference_collection",
        ],
        recommended_schedule="daily",
    )


def build_surface_monitor_asset(
    *,
    asset_type: str,
    value: str,
    owner: str | None = None,
    schedule_mode: str = "daily",
    tags: list[str] | None = None,
) -> dict[str, Any]:
    return build_exposure_asset_payload(
        asset_type=asset_type,
        value=value,
        owner=owner,
        schedule_mode=schedule_mode,
        tags=tags or [],
    )


async def run_surface_monitor_query(
    asset_payload: dict[str, Any],
    fetch_runner=None,
) -> list[dict[str, Any]]:
    asset_type = str(asset_payload.get("asset_type") or "").strip().lower()
    if asset_type not in SURFACE_MONITOR_SUPPORTED_ASSET_TYPES:
        raise ValueError(f"unsupported_surface_monitor_asset_type:{asset_type}")

    if fetch_runner is None:
        async def default_fetcher(payload: dict[str, Any]) -> list[dict[str, Any]]:
            _ = payload
            return []

        fetch_runner = default_fetcher

    raw_output = await fetch_runner(asset_payload)
    if not isinstance(raw_output, list):
        raise ValueError("surface_monitor_invalid_payload")
    return raw_output


def normalize_surface_monitor_findings(
    *,
    customer_key: str,
    monitored_asset_id: str,
    asset_payload: dict[str, Any],
    raw_findings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    normalized_results: list[dict[str, Any]] = []

    for raw_item in raw_findings or []:
        if not isinstance(raw_item, dict):
            continue

        raw_kind = str(raw_item.get("kind") or "").strip().lower()
        kind = SURFACE_MONITOR_KIND_ALIASES.get(raw_kind, raw_kind)
        if kind not in SURFACE_MONITOR_SUPPORTED_FINDING_KINDS:
            continue

        severity = str(raw_item.get("severity") or "medium").strip().lower()
        confidence = raw_item.get("confidence", 0.6)
        title = str(raw_item.get("title") or "").strip() or f"Surface finding: {kind}"
        summary = str(raw_item.get("summary") or "").strip() or "Potential surface exposure finding."
        external_ref = str(raw_item.get("external_ref") or raw_item.get("url") or "").strip() or None

        payload = build_exposure_finding_payload(
            title=title,
            summary=summary,
            kind=kind,
            severity=severity,
            confidence=confidence,
            evidence=raw_item.get("evidence") or [],
            attributes={
                "source_type": raw_item.get("source_type", "surface_monitor"),
                "asset_value": asset_payload["value"],
                **(raw_item.get("attributes") or {}),
            },
            raw=raw_item,
        )
        normalized_results.append(
            build_monitored_exposure_finding_document(
                customer_key=customer_key,
                monitored_asset_id=monitored_asset_id,
                provider_key="premium-exposure-surface-monitor",
                asset_payload=asset_payload,
                payload=payload,
                extra_fields={
                    "provider_family": "surface_monitor",
                    "external_ref": external_ref,
                },
            )
        )

    return normalized_results

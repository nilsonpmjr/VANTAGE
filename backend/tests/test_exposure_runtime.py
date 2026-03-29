from __future__ import annotations

import pytest

from exposure_runtime import (
    build_surface_monitor_asset,
    build_surface_monitor_provider_descriptor,
    normalize_surface_monitor_findings,
    run_surface_monitor_query,
)


def test_build_surface_monitor_provider_descriptor_targets_daily_surface_monitoring():
    descriptor = build_surface_monitor_provider_descriptor()

    assert descriptor["key"] == "premium-exposure-surface-monitor"
    assert descriptor["premiumFeatureType"] == "exposure_provider"
    assert descriptor["assetTypes"] == ["brand_keyword", "domain", "subdomain"]
    assert descriptor["providerScope"] == ["brand", "correlation", "surface"]
    assert descriptor["recommendedSchedule"] == "daily"


@pytest.mark.asyncio
async def test_run_surface_monitor_query_uses_injected_fetcher():
    asset_payload = build_surface_monitor_asset(asset_type="domain", value="example.com")

    async def fake_fetcher(payload):
        assert payload["asset_type"] == "domain"
        assert payload["value"] == "example.com"
        return [{"kind": "shadow_asset"}]

    result = await run_surface_monitor_query(asset_payload, fetch_runner=fake_fetcher)

    assert result == [{"kind": "shadow_asset"}]


def test_normalize_surface_monitor_findings_returns_canonical_documents():
    asset_payload = build_surface_monitor_asset(
        asset_type="brand_keyword",
        value="vantage",
        owner="customer-a",
    )
    raw_findings = [
        {
            "kind": "brand_abuse_signal",
            "title": "Suspicious brand impersonation",
            "summary": "A public page is using the monitored brand keyword.",
            "severity": "high",
            "confidence": 0.8,
            "url": "https://example.test/brand-vantage",
            "attributes": {"channel": "web"},
        },
        {
            "kind": "public_reference",
            "title": "Open reference to monitored domain",
            "summary": "A public asset references the monitored brand.",
            "severity": "medium",
            "confidence": 0.6,
            "external_ref": "ref-123",
        },
        {
            "kind": "unsupported_kind",
            "title": "Ignore me",
            "summary": "This should not pass.",
            "severity": "low",
            "confidence": 0.4,
        },
    ]

    results = normalize_surface_monitor_findings(
        customer_key="customer-a",
        monitored_asset_id="asset-1",
        asset_payload=asset_payload,
        raw_findings=raw_findings,
    )

    assert len(results) == 2
    assert results[0]["provider_key"] == "premium-exposure-surface-monitor"
    assert results[0]["doc_kind"] == "finding"
    assert results[0]["kind"] == "brand_abuse"
    assert results[0]["external_ref"] == "https://example.test/brand-vantage"
    assert results[1]["kind"] == "public_reference"


@pytest.mark.asyncio
async def test_run_surface_monitor_query_rejects_unsupported_asset_types():
    asset_payload = build_surface_monitor_asset(asset_type="email_domain", value="example.com")

    with pytest.raises(ValueError, match="unsupported_surface_monitor_asset_type:email_domain"):
        await run_surface_monitor_query(asset_payload)

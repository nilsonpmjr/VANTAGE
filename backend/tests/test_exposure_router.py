from __future__ import annotations

import pytest

from main import app


@pytest.mark.asyncio
async def test_exposure_router_creates_asset_and_lists_it(async_client, auth_headers, fake_db):
    response = await async_client.post(
        "/api/exposure/assets",
        headers=auth_headers,
        json={
            "asset_type": "domain",
            "value": "example.com",
            "schedule_mode": "daily",
            "tags": ["Priority"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["item"]["asset_type"] == "domain"
    assert payload["item"]["value"] == "example.com"
    assert payload["item"]["recurrence"]["mode"] == "daily"

    list_response = await async_client.get("/api/exposure/assets", headers=auth_headers)
    assert list_response.status_code == 200
    list_payload = list_response.json()
    assert len(list_payload["items"]) == 1
    assert list_payload["items"][0]["finding_count"] == 0
    audit = await fake_db.audit_log.find_one({"action": "premium_exposure_asset_create"})
    assert audit is not None
    assert audit["result"] == "success"


@pytest.mark.asyncio
async def test_exposure_router_runs_scan_and_returns_recent_findings(async_client, auth_headers, fake_db):
    create_response = await async_client.post(
        "/api/exposure/assets",
        headers=auth_headers,
        json={
            "asset_type": "brand_keyword",
            "value": "vantage",
            "schedule_mode": "continuous",
        },
    )
    asset_id = create_response.json()["item"]["_id"]

    async def fake_fetcher(asset_payload):
        assert asset_payload["value"] == "vantage"
        return [
            {
                "kind": "brand_abuse_signal",
                "title": "Suspicious brand page",
                "summary": "A suspicious page references the monitored brand.",
                "severity": "high",
                "confidence": 0.8,
                "url": "https://example.test/brand-vantage",
            }
        ]

    app.state.exposure_fetch_runner = fake_fetcher
    try:
        scan_response = await async_client.post(
            f"/api/exposure/assets/{asset_id}/scan",
            headers=auth_headers,
        )
    finally:
        app.state.exposure_fetch_runner = None

    assert scan_response.status_code == 200
    payload = scan_response.json()
    assert payload["total_results"] == 1
    assert payload["items"][0]["kind"] == "brand_abuse"
    assert payload["asset"]["recurrence"]["last_status"] == "success"
    audit = await fake_db.audit_log.find_one({"action": "premium_exposure_scan"})
    assert audit is not None
    assert audit["result"] == "success"

    list_response = await async_client.get("/api/exposure/assets", headers=auth_headers)
    recent = list_response.json()["items"][0]["recent_findings"]
    assert len(recent) == 1
    assert recent[0]["provider_key"] == "premium-exposure-surface-monitor"


@pytest.mark.asyncio
async def test_exposure_router_rejects_duplicate_asset(async_client, auth_headers, fake_db):
    body = {
        "asset_type": "domain",
        "value": "example.com",
        "schedule_mode": "daily",
    }
    first = await async_client.post("/api/exposure/assets", headers=auth_headers, json=body)
    second = await async_client.post("/api/exposure/assets", headers=auth_headers, json=body)

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["detail"] == "exposure_asset_already_exists"
    audits = [entry for entry in fake_db.audit_log._data if entry["action"] == "premium_exposure_asset_create"]
    assert len(audits) == 2
    assert audits[-1]["result"] == "denied"

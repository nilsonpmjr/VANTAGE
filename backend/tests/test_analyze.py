"""
Integration tests for /api/analyze endpoint.
"""

import asyncio
from datetime import datetime, timedelta, timezone
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from auth import create_access_token
from routers.analyze import (
    _analysis_inflight,
    _analysis_request_key,
    _analysis_service_signature,
    _fire_and_log,
)


@pytest.mark.asyncio
async def test_analyze_unauthenticated(async_client):
    response = await async_client.get("/api/analyze?target=8.8.8.8")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_analyze_invalid_input(async_client, auth_headers):
    response = await async_client.get("/api/analyze?target=not_a_valid_target!!!", headers=auth_headers)
    assert response.status_code == 400


@pytest.mark.asyncio
@patch("routers.analyze.AsyncThreatIntelClient")
async def test_analyze_valid_ip(MockClient, async_client, auth_headers):
    """Verify analyze endpoint returns expected structure for a valid IP."""
    vt_resp = MagicMock()
    vt_resp.success = True
    vt_resp.data = {"data": {"attributes": {"last_analysis_stats": {"malicious": 0}}}}
    vt_resp.error = None
    geo_resp = MagicMock()
    geo_resp.success = True
    geo_resp.data = {
        "ip": "8.8.8.8",
        "country_code": "US",
        "country_name": "United States of America",
        "region_name": "California",
        "city_name": "Mountain View",
        "asn": "15169",
        "as": "Google LLC",
        "isp": "Google LLC",
    }
    geo_resp.error = None

    mock_instance = AsyncMock()
    mock_instance.query_all = AsyncMock(return_value={"virustotal": vt_resp, "ip2location": geo_resp})
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=False)
    MockClient.return_value = mock_instance

    response = await async_client.get("/api/analyze?target=8.8.8.8", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["target"] == "8.8.8.8"
    assert body["type"] == "ip"
    assert "summary" in body
    assert "results" in body
    assert "geo_summary" in body
    assert "analysis_sections" in body
    assert body["geo_summary"]["source"] == "IP2Location"


@pytest.mark.asyncio
@patch("routers.analyze.AsyncThreatIntelClient")
async def test_analyze_valid_domain(MockClient, async_client, auth_headers):
    mock_resp = MagicMock()
    mock_resp.success = True
    mock_resp.data = {}
    mock_resp.error = None

    mock_instance = AsyncMock()
    mock_instance.query_all = AsyncMock(return_value={"virustotal": mock_resp})
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=False)
    MockClient.return_value = mock_instance

    response = await async_client.get("/api/analyze?target=google.com", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["type"] == "domain"


@pytest.mark.asyncio
@patch("routers.analyze.AsyncThreatIntelClient")
async def test_analyze_valid_hash(MockClient, async_client, auth_headers):
    mock_resp = MagicMock()
    mock_resp.success = True
    mock_resp.data = {}
    mock_resp.error = None

    mock_instance = AsyncMock()
    mock_instance.query_all = AsyncMock(return_value={"virustotal": mock_resp})
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=False)
    MockClient.return_value = mock_instance

    sha256 = "a" * 64  # valid SHA-256 format
    response = await async_client.get(f"/api/analyze?target={sha256}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["type"] == "hash"


@pytest.mark.asyncio
@patch("routers.analyze.AsyncThreatIntelClient")
async def test_analyze_respects_language_param(MockClient, async_client, auth_headers):
    vt_resp = MagicMock()
    vt_resp.success = True
    vt_resp.data = {"data": {"attributes": {"last_analysis_stats": {"malicious": 1, "undetected": 50}}}}
    vt_resp.error = None

    mock_instance = AsyncMock()
    mock_instance.query_all = AsyncMock(return_value={"virustotal": vt_resp})
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=False)
    MockClient.return_value = mock_instance

    response = await async_client.get(
        "/api/analyze?target=8.8.8.8&lang=en",
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert "analysis_reports" in body
    assert "analysis_section_sets" in body
    assert "en" in body["analysis_reports"]
    assert "pt" in body["analysis_reports"]
    assert body["analysis_report"] == body["analysis_reports"]["en"]
    assert body["analysis_sections"] == body["analysis_section_sets"]["en"]


@pytest.mark.asyncio
@patch("routers.analyze.AsyncThreatIntelClient")
async def test_analyze_verdict_high_risk(MockClient, async_client, auth_headers):
    """When 2+ services flag the target, verdict must be HIGH RISK."""
    vt_resp = MagicMock(
        success=True,
        error=None,
        data={"data": {"attributes": {"last_analysis_stats": {"malicious": 10}}}},
    )
    abuse_resp = MagicMock(
        success=True,
        error=None,
        data={"data": {"abuseConfidenceScore": 80}},
    )

    mock_instance = AsyncMock()
    mock_instance.query_all = AsyncMock(return_value={
        "virustotal": vt_resp,
        "abuseipdb": abuse_resp,
    })
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=False)
    MockClient.return_value = mock_instance

    response = await async_client.get("/api/analyze?target=1.2.3.4", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["summary"]["verdict"] == "HIGH RISK"


@pytest.mark.asyncio
async def test_fire_and_log_accepts_future_objects():
    loop = asyncio.get_running_loop()
    future = loop.create_future()
    future.set_result(None)

    _fire_and_log(future, "future smoke")

    await asyncio.sleep(0)


@pytest.mark.asyncio
@patch("routers.analyze.AsyncThreatIntelClient")
async def test_analyze_prefers_richer_fresh_cache(MockClient, async_client, auth_headers, fake_db):
    richer_payload = {
        "target": "8.8.8.8",
        "type": "ip",
        "results": {"virustotal": {"ok": True}, "shodan": {"ok": True}, "abuseipdb": {"ok": True}},
        "summary": {"risk_sources": 1, "total_sources": 3, "verdict": "SUSPICIOUS"},
        "analysis_report": "rich",
        "analysis_reports": {"pt": "rich"},
        "analysis_sections": [],
        "analysis_section_sets": {},
        "geo_summary": {},
        "analysis_meta": {},
    }
    poorer_payload = {
        "target": "8.8.8.8",
        "type": "ip",
        "results": {"virustotal": {"ok": True}},
        "summary": {"risk_sources": 0, "total_sources": 1, "verdict": "SAFE"},
        "analysis_report": "poor",
        "analysis_reports": {"pt": "poor"},
        "analysis_sections": [],
        "analysis_section_sets": {},
        "geo_summary": {},
        "analysis_meta": {},
    }

    now = datetime.now(timezone.utc)
    await fake_db.scans.insert_one({
        "target": "8.8.8.8",
        "type": "ip",
        "timestamp": now - timedelta(minutes=20),
        "risk_score": 1,
        "verdict": "SUSPICIOUS",
        "analyst": "admin",
        "data": richer_payload,
    })
    await fake_db.scans.insert_one({
        "target": "8.8.8.8",
        "type": "ip",
        "timestamp": now - timedelta(minutes=5),
        "risk_score": 0,
        "verdict": "SAFE",
        "analyst": "admin",
        "data": poorer_payload,
    })

    response = await async_client.get("/api/analyze?target=8.8.8.8", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["analysis_report"] == "rich"
    assert body["summary"]["total_sources"] == 3
    MockClient.assert_not_called()


@pytest.mark.asyncio
@patch("routers.analyze.AsyncThreatIntelClient")
async def test_analyze_deduplicates_same_user_concurrent_requests(MockClient, async_client, auth_headers, fake_db):
    _analysis_inflight.clear()

    vt_resp = MagicMock()
    vt_resp.success = True
    vt_resp.data = {"data": {"attributes": {"last_analysis_stats": {"malicious": 0}}}}
    vt_resp.error = None

    async def _query_all(_target, _type):
        await asyncio.sleep(0.05)
        return {"virustotal": vt_resp}

    mock_instance = AsyncMock()
    mock_instance.query_all = AsyncMock(side_effect=_query_all)
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=False)
    MockClient.return_value = mock_instance

    first, second = await asyncio.gather(
        async_client.get("/api/analyze?target=8.8.8.8", headers=auth_headers),
        async_client.get("/api/analyze?target=8.8.8.8", headers=auth_headers),
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert mock_instance.query_all.await_count == 1


@pytest.mark.asyncio
async def test_analyze_cache_hit_materializes_requested_language(async_client, auth_headers, fake_db):
    payload = {
        "target": "8.8.8.8",
        "type": "ip",
        "results": {"virustotal": {"ok": True}},
        "summary": {"risk_sources": 1, "total_sources": 2, "verdict": "SUSPICIOUS"},
        "analysis_report": "relatorio-pt",
        "analysis_reports": {"pt": "relatorio-pt", "en": "report-en", "es": "informe-es"},
        "analysis_sections": [{"id": "pt", "title": "PT", "body": ["pt"]}],
        "analysis_section_sets": {
            "pt": [{"id": "pt", "title": "PT", "body": ["pt"]}],
            "en": [{"id": "en", "title": "EN", "body": ["en"]}],
        },
        "geo_summary": {},
        "analysis_meta": {},
    }
    await fake_db.scans.insert_one({
        "target": "8.8.8.8",
        "type": "ip",
        "timestamp": datetime.now(timezone.utc),
        "risk_score": 1,
        "verdict": "SUSPICIOUS",
        "analyst": "admin",
        "data": payload,
    })

    response = await async_client.get("/api/analyze?target=8.8.8.8&lang=en", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["analysis_report"] == "report-en"
    assert body["analysis_sections"] == payload["analysis_section_sets"]["en"]


@pytest.mark.asyncio
@patch("routers.analyze.AsyncThreatIntelClient")
async def test_analyze_deduplicates_cross_user_when_service_coverage_matches(MockClient, async_client, fake_db):
    _analysis_inflight.clear()

    vt_resp = MagicMock()
    vt_resp.success = True
    vt_resp.data = {"data": {"attributes": {"last_analysis_stats": {"malicious": 0}}}}
    vt_resp.error = None

    async def _query_all(_target, _type):
        await asyncio.sleep(0.05)
        return {"virustotal": vt_resp}

    mock_instance = AsyncMock()
    mock_instance.query_all = AsyncMock(side_effect=_query_all)
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=False)
    MockClient.return_value = mock_instance

    admin_headers = {"Authorization": f"Bearer {create_access_token({'sub': 'admin', 'role': 'admin'})}"}
    tech_headers = {"Authorization": f"Bearer {create_access_token({'sub': 'techuser', 'role': 'tech'})}"}

    first, second = await asyncio.gather(
        async_client.get("/api/analyze?target=8.8.8.8&lang=pt", headers=admin_headers),
        async_client.get("/api/analyze?target=8.8.8.8&lang=en", headers=tech_headers),
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["analysis_report"] != ""
    assert second.json()["analysis_report"] != ""
    assert mock_instance.query_all.await_count == 1


@pytest.mark.asyncio
@patch("routers.analyze.AsyncThreatIntelClient")
async def test_analyze_waits_for_shared_result_from_other_process(MockClient, async_client, auth_headers, fake_db):
    _analysis_inflight.clear()

    request_key = _analysis_request_key(
        "8.8.8.8",
        _analysis_service_signature(None),
    )
    await fake_db.analysis_runtime.insert_one({
        "_id": request_key,
        "owner": "other-process",
        "target": "8.8.8.8",
        "service_signature": _analysis_service_signature(None),
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(seconds=5),
    })

    async def _insert_shared_scan():
        await asyncio.sleep(0.05)
        await fake_db.scans.insert_one({
            "target": "8.8.8.8",
            "type": "ip",
            "timestamp": datetime.now(timezone.utc),
            "risk_score": 1,
            "verdict": "SUSPICIOUS",
            "analyst": "other-analyst",
            "data": {
                "target": "8.8.8.8",
                "type": "ip",
                "results": {"virustotal": {"ok": True}},
                "summary": {"risk_sources": 1, "total_sources": 2, "verdict": "SUSPICIOUS"},
                "analysis_report": "shared-pt",
                "analysis_reports": {"pt": "shared-pt", "en": "shared-en"},
                "analysis_sections": [{"id": "pt", "title": "PT", "body": ["pt"]}],
                "analysis_section_sets": {
                    "pt": [{"id": "pt", "title": "PT", "body": ["pt"]}],
                    "en": [{"id": "en", "title": "EN", "body": ["en"]}],
                },
                "geo_summary": {},
                "analysis_meta": {},
            },
        })

    insert_task = asyncio.create_task(_insert_shared_scan())
    try:
        response = await async_client.get("/api/analyze?target=8.8.8.8&lang=en", headers=auth_headers)
    finally:
        await insert_task

    assert response.status_code == 200
    body = response.json()
    assert body["analysis_report"] == "shared-en"
    MockClient.assert_not_called()

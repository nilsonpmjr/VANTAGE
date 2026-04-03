"""
Integration tests for /api/analyze endpoint.
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from routers.analyze import _fire_and_log


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

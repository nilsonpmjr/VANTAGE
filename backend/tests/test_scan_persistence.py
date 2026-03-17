"""
Regression tests for Session E — canonical scans envelope.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def test_extract_scan_payload_supports_legacy_shape():
    from scans import extract_scan_payload

    doc = {
        "target": "8.8.8.8",
        "type": "ip",
        "verdict": "SAFE",
        "risk_score": 0,
        "results": {"virustotal": {"ok": True}},
        "analysis_report": "legacy report",
        "analysis_reports": {"pt": "legacy report"},
    }

    payload = extract_scan_payload(doc)
    assert payload["target"] == "8.8.8.8"
    assert payload["type"] == "ip"
    assert payload["results"]["virustotal"]["ok"] is True
    assert payload["summary"]["verdict"] == "SAFE"


@pytest.mark.asyncio
@patch("routers.analyze.AsyncThreatIntelClient")
async def test_analyze_stale_fallback_supports_legacy_scan_doc(MockClient, async_client, auth_headers, fake_db):
    stale_doc = {
        "target": "8.8.8.8",
        "type": "ip",
        "timestamp": datetime.now(timezone.utc) - timedelta(days=10),
        "risk_score": 0,
        "verdict": "SAFE",
        "analyst": "techuser",
        "results": {"virustotal": {"legacy": True}},
        "analysis_report": "legacy report",
        "analysis_reports": {"pt": "legacy report"},
    }
    await fake_db.scans.insert_one(stale_doc)

    mock_resp = MagicMock()
    mock_resp.success = False
    mock_resp.data = None
    mock_resp.error = "timeout"
    mock_resp.error_type = "timeout"

    mock_instance = AsyncMock()
    mock_instance.query_all = AsyncMock(return_value={"virustotal": mock_resp})
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=False)
    MockClient.return_value = mock_instance

    response = await async_client.get("/api/analyze?target=8.8.8.8", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["_stale_cache"] is True
    assert body["target"] == "8.8.8.8"
    assert body["results"]["virustotal"]["legacy"] is True


@pytest.mark.asyncio
@patch("routers.batch.log_action", new_callable=AsyncMock)
@patch("routers.batch.inc_service_quota", new_callable=AsyncMock)
@patch("routers.batch.AsyncThreatIntelClient")
async def test_batch_persists_canonical_scan_document(MockClient, _quota, _log_action):
    from db import db_manager
    from routers.batch import _process_batch

    original_db = db_manager.db
    mock_db = MagicMock()
    mock_db.scans = MagicMock()
    mock_db.scans.insert_one = AsyncMock()
    mock_db.batch_jobs = MagicMock()
    mock_db.batch_jobs.update_one = AsyncMock()
    mock_db.batch_jobs.find_one = AsyncMock(return_value={"results": []})
    db_manager.db = mock_db

    mock_resp = MagicMock()
    mock_resp.success = True
    mock_resp.data = {"data": {"attributes": {"last_analysis_stats": {"malicious": 0}}}}
    mock_resp.error = None

    mock_instance = AsyncMock()
    mock_instance.query_all = AsyncMock(return_value={"virustotal": mock_resp})
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=False)
    MockClient.return_value = mock_instance

    queue = asyncio.Queue()
    try:
        with (
            patch("routers.batch.settings.batch_inter_target_delay_ms", 0),
            patch("routers.batch.asyncio.sleep", new=AsyncMock()),
        ):
            await _process_batch(
                "job-1",
                [{"sanitized": "8.8.8.8", "type": "ip"}],
                "pt",
                "techuser",
                "127.0.0.1",
                queue,
            )
    finally:
        db_manager.db = original_db

    inserted = mock_db.scans.insert_one.call_args[0][0]
    assert inserted["target"] == "8.8.8.8"
    assert inserted["type"] == "ip"
    assert "data" in inserted
    assert inserted["data"]["target"] == "8.8.8.8"
    assert inserted["data"]["type"] == "ip"
    assert "summary" in inserted["data"]

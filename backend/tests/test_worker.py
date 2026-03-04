"""
Tests for worker.py — ensuring the rescan job targets the correct DB collection.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone


@pytest.mark.asyncio
async def test_process_single_target_uses_scans_collection():
    """
    The worker must read from and write to db.scans (not db.analyses).
    This verifies the critical bug fix from Phase 1.
    """
    from worker import process_single_target

    mock_scan = {
        "_id": "fake_id",
        "target": "8.8.8.8",
        "type": "ip",
        "verdict": "SAFE",
        "risk_score": 0,
        "analyst": "worker",
        "timestamp": datetime.now(timezone.utc),
        "data": {"results": {}, "summary": {"verdict": "SAFE", "risk_sources": 0, "total_sources": 1}},
    }

    mock_db = MagicMock()
    mock_db.scans = MagicMock()
    mock_db.scans.update_one = AsyncMock()

    mock_result = MagicMock()
    mock_result.success = True
    mock_result.data = {"data": {"attributes": {"last_analysis_stats": {"malicious": 0}}}}
    mock_result.error = None

    mock_client = AsyncMock()
    mock_client.query_all = AsyncMock(return_value={"virustotal": mock_result})
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    await process_single_target(
        mock_client,
        mock_db,
        mock_scan["target"],
        mock_scan["type"],
        mock_scan["_id"],
    )

    # Verify update_one was called on db.scans (not db.analyses)
    mock_db.scans.update_one.assert_called_once()
    call_args = mock_db.scans.update_one.call_args
    # First arg is the filter — must use _id
    assert "_id" in call_args[0][0]


@pytest.mark.asyncio
async def test_worker_verdict_computation():
    """Verify compute_risk_score + compute_verdict return correct verdicts for known inputs."""
    from scoring import compute_risk_score, compute_verdict

    # Zero risk sources → SAFE
    risk, _ = compute_risk_score({})
    assert compute_verdict(risk) == "SAFE"
    assert risk == 0

    # One source with high abuse score → SUSPICIOUS
    one_risky = {
        "abuseipdb": {"data": {"abuseConfidenceScore": 80}},
    }
    risk, _ = compute_risk_score(one_risky)
    assert compute_verdict(risk) == "SUSPICIOUS"
    assert risk == 1

    # Two risky sources → HIGH RISK
    two_risky = {
        "abuseipdb": {"data": {"abuseConfidenceScore": 80}},
        "greynoise": {"classification": "malicious"},
    }
    risk, _ = compute_risk_score(two_risky)
    assert compute_verdict(risk) == "HIGH RISK"
    assert risk == 2

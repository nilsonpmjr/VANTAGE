"""Regression tests for /api/stats pagination (skip parameter)."""

from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId


@pytest.mark.asyncio
async def test_stats_returns_recent_scans_with_default_limit(async_client, tech_token):
    """GET /api/stats should return recentScans array (empty DB → empty list)."""
    resp = await async_client.get(
        "/api/stats?period=month",
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "recentScans" in data
    assert "totalScans" in data
    assert isinstance(data["recentScans"], list)


@pytest.mark.asyncio
async def test_stats_accepts_skip_parameter(async_client, tech_token):
    """GET /api/stats?skip=20 should be accepted and not error."""
    resp = await async_client.get(
        "/api/stats?period=month&limit=20&skip=20",
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["recentScans"], list)


@pytest.mark.asyncio
async def test_stats_skip_out_of_range_returns_empty(async_client, tech_token):
    """GET /api/stats?skip=9999 should return empty recentScans, not error."""
    resp = await async_client.get(
        "/api/stats?period=month&skip=9999",
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["recentScans"] == []


@pytest.mark.asyncio
async def test_stats_skip_negative_is_rejected(async_client, tech_token):
    """GET /api/stats?skip=-1 should return 422 (validation error)."""
    resp = await async_client.get(
        "/api/stats?period=month&skip=-1",
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 422


# ── Unified artifact history (analyze + recon) ──────────────────────────────


@pytest.mark.asyncio
async def test_stats_response_exposes_unified_artifact_fields(async_client, tech_token):
    """Response must include recentArtifacts and totalArtifacts fields."""
    resp = await async_client.get(
        "/api/stats?period=month",
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "recentArtifacts" in data
    assert "totalArtifacts" in data
    assert isinstance(data["recentArtifacts"], list)
    assert isinstance(data["totalArtifacts"], int)


def _seed_scan(fake_db, *, target, timestamp, verdict="SAFE", analyst="tech"):
    fake_db.scans._data.append({
        "target": target,
        "type": "ip",
        "verdict": verdict,
        "risk_score": 10,
        "analyst": analyst,
        "timestamp": timestamp,
    })


def _seed_recon(fake_db, *, target, created_at, status="done", analyst="tech"):
    fake_db.recon_jobs._data.append({
        "_id": ObjectId(),
        "target": target,
        "target_type": "domain",
        "modules": ["dns", "whois"],
        "analyst": analyst,
        "status": status,
        "created_at": created_at,
    })


@pytest.mark.asyncio
async def test_stats_merges_analyze_and_recon_in_recent_artifacts(
    async_client, tech_token, fake_db
):
    """recentArtifacts should contain items from both scans and recon_jobs."""
    now = datetime.now(timezone.utc)
    _seed_scan(fake_db, target="1.1.1.1", timestamp=now - timedelta(hours=5))
    _seed_scan(fake_db, target="2.2.2.2", timestamp=now - timedelta(hours=3))
    _seed_recon(fake_db, target="example.com", created_at=now - timedelta(hours=4))
    _seed_recon(fake_db, target="evil.com", created_at=now - timedelta(hours=1))

    resp = await async_client.get(
        "/api/stats?period=month&limit=10",
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()

    kinds = [item["kind"] for item in data["recentArtifacts"]]
    assert kinds.count("analyze") == 2
    assert kinds.count("recon") == 2
    assert data["totalArtifacts"] == 4


@pytest.mark.asyncio
async def test_stats_recent_artifacts_sorted_desc_by_timestamp(
    async_client, tech_token, fake_db
):
    """Merged list must be sorted by timestamp descending (newest first)."""
    now = datetime.now(timezone.utc)
    _seed_scan(fake_db, target="scan-oldest", timestamp=now - timedelta(hours=10))
    _seed_recon(fake_db, target="recon-mid", created_at=now - timedelta(hours=5))
    _seed_scan(fake_db, target="scan-newest", timestamp=now - timedelta(minutes=30))

    resp = await async_client.get(
        "/api/stats?period=month&limit=10",
        cookies={"access_token": tech_token},
    )
    data = resp.json()
    targets = [item["target"] for item in data["recentArtifacts"]]
    assert targets == ["scan-newest", "recon-mid", "scan-oldest"]


@pytest.mark.asyncio
async def test_stats_recent_artifacts_kind_specific_fields(
    async_client, tech_token, fake_db
):
    """Analyze items expose verdict; recon items expose status, job_id, modules."""
    now = datetime.now(timezone.utc)
    _seed_scan(
        fake_db,
        target="1.2.3.4",
        timestamp=now - timedelta(hours=1),
        verdict="HIGH RISK",
    )
    _seed_recon(
        fake_db,
        target="bad.example",
        created_at=now - timedelta(hours=2),
        status="done",
    )

    resp = await async_client.get(
        "/api/stats?period=month&limit=10",
        cookies={"access_token": tech_token},
    )
    data = resp.json()
    items = {item["target"]: item for item in data["recentArtifacts"]}

    analyze_item = items["1.2.3.4"]
    assert analyze_item["kind"] == "analyze"
    assert analyze_item["verdict"] == "HIGH RISK"
    assert "job_id" not in analyze_item or analyze_item.get("job_id") is None

    recon_item = items["bad.example"]
    assert recon_item["kind"] == "recon"
    assert recon_item["status"] == "done"
    assert recon_item["job_id"]  # string, non-empty
    assert recon_item["modules"] == ["dns", "whois"]


@pytest.mark.asyncio
async def test_stats_recent_artifacts_respects_skip_and_limit(
    async_client, tech_token, fake_db
):
    """Pagination over the merged list must produce correct page slices."""
    now = datetime.now(timezone.utc)
    # Seed 5 scans and 5 recons, interleaved across 10 distinct timestamps
    for i in range(5):
        _seed_scan(
            fake_db,
            target=f"scan-{i}",
            timestamp=now - timedelta(minutes=(i * 2)),
        )
        _seed_recon(
            fake_db,
            target=f"recon-{i}",
            created_at=now - timedelta(minutes=(i * 2) + 1),
        )

    # Page 1: items 0-2
    resp_page1 = await async_client.get(
        "/api/stats?period=month&limit=3&skip=0",
        cookies={"access_token": tech_token},
    )
    page1 = resp_page1.json()["recentArtifacts"]
    assert len(page1) == 3

    # Page 2: items 3-5
    resp_page2 = await async_client.get(
        "/api/stats?period=month&limit=3&skip=3",
        cookies={"access_token": tech_token},
    )
    page2 = resp_page2.json()["recentArtifacts"]
    assert len(page2) == 3

    # No overlap between pages
    page1_targets = {item["target"] for item in page1}
    page2_targets = {item["target"] for item in page2}
    assert page1_targets.isdisjoint(page2_targets)

    # Combined 6 items represent strictly descending timestamps
    combined = page1 + page2
    timestamps = [item["timestamp"] for item in combined]
    assert timestamps == sorted(timestamps, reverse=True)

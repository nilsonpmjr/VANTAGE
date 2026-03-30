"""Regression tests for /api/stats pagination (skip parameter)."""

import pytest


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

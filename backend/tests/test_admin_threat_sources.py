import pytest

from auth import create_access_token
from threat_ingestion import record_threat_sync_status


@pytest.mark.asyncio
async def test_read_threat_sources_requires_admin(async_client):
    tech_headers = {"Authorization": f"Bearer {create_access_token({'sub': 'techuser', 'role': 'tech'})}"}
    resp = await async_client.get(
        "/api/admin/threat-sources",
        headers=tech_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_read_threat_sources_returns_catalog_and_sync_status(async_client, auth_headers, fake_db):
    await record_threat_sync_status(
        fake_db,
        "cve_recent",
        status="success",
        items_ingested=4,
    )

    resp = await async_client.get("/api/admin/threat-sources", headers=auth_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert "sources" in body
    assert len(body["sources"]) == 4

    cve_source = next(source for source in body["sources"] if source["source_id"] == "cve_recent")
    assert cve_source["sync_status"]["status"] == "success"
    assert cve_source["sync_status"]["items_ingested"] == 4

    misp_source = next(source for source in body["sources"] if source["source_id"] == "misp_events")
    assert misp_source["sync_status"]["status"] == "never_run"


@pytest.mark.asyncio
async def test_threat_source_metrics_returns_recent_history(async_client, auth_headers, fake_db):
    await record_threat_sync_status(
        fake_db,
        "cve_recent",
        status="success",
        items_ingested=12,
        duration_ms=4200,
    )

    resp = await async_client.get("/api/admin/threat-sources/cve_recent/metrics", headers=auth_headers)

    assert resp.status_code == 200
    body = resp.json()
    assert body["source_id"] == "cve_recent"
    assert len(body["recent_events"]) >= 1
    assert body["duration_series"][-1]["duration_ms"] == 4200


@pytest.mark.asyncio
async def test_custom_threat_source_update_returns_serializable_payload(async_client, auth_headers, monkeypatch):
    monkeypatch.setattr("network_security.resolve_hostname_ips", lambda _hostname: ["93.184.216.34"])
    created = await async_client.post(
        "/api/admin/threat-sources/custom",
        headers=auth_headers,
        json={
            "title": "Mutation Smoke Feed",
            "feed_url": "https://example.com/security/rss.xml",
            "family": "custom",
            "poll_interval_minutes": 60,
            "default_tlp": "amber",
        },
    )
    assert created.status_code == 201
    source_id = created.json()["source_id"]

    updated = await async_client.put(
        f"/api/admin/threat-sources/custom/{source_id}",
        headers=auth_headers,
        json={"enabled": False, "display_name": "Mutation Smoke Feed Disabled"},
    )

    assert updated.status_code == 200
    body = updated.json()
    assert body["source_id"] == source_id
    assert body["enabled"] is False
    assert body["display_name"] == "Mutation Smoke Feed Disabled"
    assert "_id" not in body
    assert body["origin"] == "manual"
    assert "sync_status" in body


@pytest.mark.asyncio
async def test_builtin_threat_source_update_returns_serializable_payload(async_client, auth_headers, monkeypatch):
    monkeypatch.setattr("network_security.resolve_hostname_ips", lambda _hostname: ["93.184.216.34"])
    updated = await async_client.put(
        "/api/admin/threat-sources/cve_recent/config",
        headers=auth_headers,
        json={
            "display_name": "CVE Priority Feed",
            "feed_url": "https://example.com/cve/rss.xml",
            "poll_interval_minutes": 45,
            "severity_floor": "high",
        },
    )

    assert updated.status_code == 200
    body = updated.json()
    assert body["source_id"] == "cve_recent"
    assert body["display_name"] == "CVE Priority Feed"
    assert body["config"]["feed_url"] == "https://example.com/cve/rss.xml"
    assert body["config"]["poll_interval_minutes"] == 45
    assert body["config"]["severity_floor"] == "high"
    assert "_id" not in body
    assert "sync_status" in body

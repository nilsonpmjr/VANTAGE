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

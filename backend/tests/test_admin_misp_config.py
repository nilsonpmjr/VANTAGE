import pytest

from auth import create_access_token


@pytest.mark.asyncio
async def test_read_misp_source_requires_admin(async_client):
    tech_headers = {"Authorization": f"Bearer {create_access_token({'sub': 'techuser', 'role': 'tech'})}"}

    resp = await async_client.get("/api/admin/threat-sources/misp", headers=tech_headers)

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_misp_source_masks_secret(async_client, auth_headers):
    resp = await async_client.put(
        "/api/admin/threat-sources/misp",
        headers=auth_headers,
        json={
            "enabled": True,
            "base_url": "https://misp.example.test/",
            "api_key": "super-secret-key",
            "verify_tls": False,
            "poll_interval_minutes": 20,
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is True
    assert body["config"]["base_url"] == "https://misp.example.test"
    assert body["config"]["api_key_configured"] is True
    assert "api_key" not in body["config"]


@pytest.mark.asyncio
async def test_update_misp_source_rejects_invalid_url(async_client, auth_headers):
    resp = await async_client.put(
        "/api/admin/threat-sources/misp",
        headers=auth_headers,
        json={"base_url": "not-a-url"},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid MISP base URL."


@pytest.mark.asyncio
async def test_test_misp_source_requires_configured_secret(async_client, auth_headers):
    resp = await async_client.post(
        "/api/admin/threat-sources/misp/test",
        headers=auth_headers,
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "MISP base URL is not configured."


@pytest.mark.asyncio
async def test_test_misp_source_uses_connector(async_client, auth_headers, monkeypatch):
    await async_client.put(
        "/api/admin/threat-sources/misp",
        headers=auth_headers,
        json={
            "enabled": True,
            "base_url": "https://misp.example.test",
            "api_key": "super-secret-key",
            "verify_tls": True,
        },
    )

    async def _fake_test_connection(self):
        assert self.base_url == "https://misp.example.test"
        assert self.api_key == "super-secret-key"
        return {"ok": True, "version": "2.4.999"}

    monkeypatch.setattr("routers.admin.MISPClient.test_connection", _fake_test_connection)

    resp = await async_client.post(
        "/api/admin/threat-sources/misp/test",
        headers=auth_headers,
    )

    assert resp.status_code == 200
    assert resp.json()["version"] == "2.4.999"


@pytest.mark.asyncio
async def test_test_misp_source_returns_explicit_error_for_unreadable_secret(async_client, auth_headers, fake_db):
    await fake_db.threat_sources.insert_one(
        {
            "_id": "singleton",
            "sources": {
                "misp_events": {
                    "config": {"base_url": "https://misp.example.test", "verify_tls": True},
                    "secret_config": {"api_key_enc": "not-a-valid-ciphertext"},
                }
            },
        }
    )

    resp = await async_client.post(
        "/api/admin/threat-sources/misp/test",
        headers=auth_headers,
    )

    assert resp.status_code == 502
    assert resp.json()["detail"] == "Stored MISP API key is unreadable. Save it again."

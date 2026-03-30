from datetime import datetime, timezone

import pytest

from crypto import decrypt_secret
from threat_ingestion import (
    _validate_feed_url,
    create_custom_source,
    get_custom_threat_sources,
    get_public_threat_sources,
    get_runtime_threat_source,
    record_threat_sync_status,
    update_misp_source_config,
    update_threat_source,
)


def test_validate_feed_url_rejects_private_destinations(monkeypatch):
    monkeypatch.setattr("network_security.resolve_hostname_ips", lambda _hostname: ["127.0.0.1"])

    with pytest.raises(ValueError):
        _validate_feed_url("https://feeds.example.test/rss.xml")


def test_validate_feed_url_accepts_public_destinations(monkeypatch):
    monkeypatch.setattr("network_security.resolve_hostname_ips", lambda _hostname: ["93.184.216.34"])

    assert _validate_feed_url("https://feeds.example.test/rss.xml") == "https://feeds.example.test/rss.xml"


@pytest.mark.asyncio
async def test_public_threat_sources_return_catalog_defaults(fake_db):
    sources = await get_public_threat_sources(fake_db)

    ids = [source["source_id"] for source in sources]
    assert ids == [
        "cve_recent",
        "fortinet_outbreakalert",
        "fortinet_threatsignal",
        "misp_events",
    ]
    assert sources[0]["enabled"] is True
    assert sources[-1]["enabled"] is False
    assert sources[0]["sync_status"]["status"] == "never_run"
    fortinet = next(source for source in sources if source["source_id"] == "fortinet_outbreakalert")
    assert fortinet["vendor"] == "Fortinet"
    assert fortinet["collection"] == "fortiguard_rss"
    assert fortinet["channel"] == "outbreak_alert"


@pytest.mark.asyncio
async def test_update_threat_source_persists_override(fake_db, monkeypatch):
    monkeypatch.setattr("network_security.resolve_hostname_ips", lambda _hostname: ["93.184.216.34"])
    source = await update_threat_source(
        fake_db,
        "cve_recent",
        {
            "enabled": False,
            "display_name": "CVE Curated",
            "config": {"feed_url": "https://example.test/feed.xml"},
        },
        updated_by="admin",
    )

    assert source["enabled"] is False
    assert source["display_name"] == "CVE Curated"
    assert source["config"]["feed_url"] == "https://example.test/feed.xml"

    doc = await fake_db.threat_sources.find_one({"_id": "singleton"})
    assert doc["updated_by"] == "admin"
    assert doc["sources"]["cve_recent"]["enabled"] is False


@pytest.mark.asyncio
async def test_record_threat_sync_status_is_reflected_in_public_view(fake_db):
    timestamp = datetime(2026, 3, 19, 12, 0, tzinfo=timezone.utc)
    await record_threat_sync_status(
        fake_db,
        "fortinet_outbreakalert",
        status="success",
        items_ingested=12,
        last_run_at=timestamp,
    )

    sources = await get_public_threat_sources(fake_db)
    fortinet = next(source for source in sources if source["source_id"] == "fortinet_outbreakalert")

    assert fortinet["sync_status"]["status"] == "success"
    assert fortinet["sync_status"]["items_ingested"] == 12
    assert fortinet["sync_status"]["last_run_at"] == timestamp


@pytest.mark.asyncio
async def test_create_custom_source_allows_duplicate_titles_without_overwrite(fake_db, monkeypatch):
    monkeypatch.setattr("network_security.resolve_hostname_ips", lambda _hostname: ["93.184.216.34"])

    first = await create_custom_source(
        fake_db,
        title="Partner Feed",
        feed_url="https://feeds.example.test/partner-a.xml",
        created_by="admin",
    )
    second = await create_custom_source(
        fake_db,
        title="Partner Feed",
        feed_url="https://feeds.example.test/partner-b.xml",
        created_by="admin",
    )

    assert first["source_id"] != second["source_id"]
    docs = await get_custom_threat_sources(fake_db)
    assert len(docs) == 2


@pytest.mark.asyncio
async def test_update_threat_source_rejects_unknown_fields(fake_db):
    with pytest.raises(ValueError):
        await update_threat_source(fake_db, "cve_recent", {"unexpected": True})


@pytest.mark.asyncio
async def test_update_misp_source_config_encrypts_api_key_and_masks_public_view(fake_db):
    source = await update_misp_source_config(
        fake_db,
        {
            "enabled": True,
            "base_url": "https://misp.example.test/",
            "api_key": "super-secret-key",
            "verify_tls": False,
            "poll_interval_minutes": 15,
        },
        updated_by="admin",
    )

    assert source["enabled"] is True
    assert source["config"]["base_url"] == "https://misp.example.test"
    assert source["config"]["api_key_configured"] is True
    assert "api_key" not in source["config"]

    doc = await fake_db.threat_sources.find_one({"_id": "singleton"})
    stored = doc["sources"]["misp_events"]["secret_config"]["api_key_enc"]
    assert stored != "super-secret-key"
    assert decrypt_secret(stored) == "super-secret-key"

    runtime_source = await get_runtime_threat_source(fake_db, "misp_events")
    assert runtime_source["config"]["api_key"] == "super-secret-key"


@pytest.mark.asyncio
async def test_update_misp_source_config_can_clear_api_key(fake_db):
    await update_misp_source_config(
        fake_db,
        {
            "base_url": "https://misp.example.test",
            "api_key": "super-secret-key",
        },
        updated_by="admin",
    )

    source = await update_misp_source_config(
        fake_db,
        {"api_key": ""},
        updated_by="admin",
    )

    assert source["config"]["api_key_configured"] is False

    runtime_source = await get_runtime_threat_source(fake_db, "misp_events")
    assert runtime_source["config"]["api_key"] == ""

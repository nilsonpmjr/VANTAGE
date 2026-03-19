import pytest

from threat_feed_adapters import adapt_cve_rss_items, adapt_fortinet_rss_items, parse_rss_items
from threat_ingestion import record_threat_sync_status, update_threat_source
from threat_ingestion_runtime import (
    _THREAT_INGESTION_CYCLE_LOCK,
    clear_threat_fetchers,
    execute_threat_ingestion_worker_cycle,
    register_threat_fetcher,
    run_threat_ingestion_cycle,
)


@pytest.mark.asyncio
async def test_threat_ingestion_cycle_persists_items_and_status(fake_db):
    clear_threat_fetchers()
    await update_threat_source(
        fake_db,
        "cve_recent",
        {"config": {"feed_url": "https://example.test/cve.xml"}},
    )

    xml = """
    <rss>
      <channel>
        <item>
          <title>Critical update for CVE-2026-1234</title>
          <description>Critical remote code execution vulnerability.</description>
          <link>https://example.test/cve-2026-1234</link>
          <guid>cve-2026-1234</guid>
          <pubDate>Wed, 19 Mar 2026 12:00:00 GMT</pubDate>
          <category>Critical</category>
        </item>
      </channel>
    </rss>
    """

    register_threat_fetcher(
        "cve_recent",
        lambda _source: adapt_cve_rss_items("cve_recent", parse_rss_items(xml)),
    )

    try:
        results = await run_threat_ingestion_cycle(fake_db)
    finally:
        clear_threat_fetchers()

    result = next(item for item in results if item["source_id"] == "cve_recent")
    assert result["status"] == "success"
    assert result["items_ingested"] == 1

    stored = await fake_db.threat_items.find_one({"source_id": "cve_recent", "external_id": "cve-2026-1234"})
    assert stored is not None

    sync_status = await fake_db.threat_sync_status.find_one({"source_id": "cve_recent"})
    assert sync_status["status"] == "success"
    assert sync_status["items_ingested"] == 1


@pytest.mark.asyncio
async def test_threat_ingestion_cycle_isolates_source_failures(fake_db):
    clear_threat_fetchers()
    await update_threat_source(
        fake_db,
        "cve_recent",
        {"config": {"feed_url": "https://example.test/cve.xml"}},
    )
    await update_threat_source(
        fake_db,
        "fortinet_outbreakalert",
        {"config": {"feed_url": "https://example.test/fortinet.xml"}},
    )

    fortinet_xml = """
    <rss>
      <channel>
        <item>
          <title>Fortinet Threat Signal for CVE-2026-9876</title>
          <description>High severity exploitation observed in the wild.</description>
          <link>https://fortinet.test/threat</link>
          <guid>fortinet-threat-1</guid>
          <pubDate>Wed, 19 Mar 2026 13:00:00 GMT</pubDate>
          <category>Threat Signal</category>
        </item>
      </channel>
    </rss>
    """

    def _broken_fetcher(_source):
        raise RuntimeError("feed timeout")

    register_threat_fetcher("cve_recent", _broken_fetcher)
    register_threat_fetcher(
        "fortinet_outbreakalert",
        lambda _source: adapt_fortinet_rss_items("fortinet_outbreakalert", parse_rss_items(fortinet_xml)),
    )

    try:
        results = await run_threat_ingestion_cycle(fake_db)
    finally:
        clear_threat_fetchers()

    by_source = {item["source_id"]: item for item in results}
    assert by_source["cve_recent"]["status"] == "error"
    assert by_source["fortinet_outbreakalert"]["status"] == "success"
    assert by_source["fortinet_threatsignal"]["status"] == "not_configured"

    fortinet_item = await fake_db.threat_items.find_one({"source_id": "fortinet_outbreakalert"})
    assert fortinet_item is not None
    cve_status = await fake_db.threat_sync_status.find_one({"source_id": "cve_recent"})
    assert cve_status["last_error"] == "feed timeout"


@pytest.mark.asyncio
async def test_threat_ingestion_cycle_skips_sources_not_due(fake_db):
    clear_threat_fetchers()
    await update_threat_source(
        fake_db,
        "cve_recent",
        {"config": {"feed_url": "https://example.test/cve.xml"}},
    )
    await record_threat_sync_status(
        fake_db,
        "cve_recent",
        status="success",
        items_ingested=1,
    )

    register_threat_fetcher("cve_recent", lambda _source: [])

    try:
        results = await run_threat_ingestion_cycle(fake_db)
    finally:
        clear_threat_fetchers()

    result = next(item for item in results if item["source_id"] == "cve_recent")
    assert result["status"] == "skipped"


@pytest.mark.asyncio
async def test_execute_worker_cycle_skips_when_previous_cycle_is_running(fake_db):
    await _THREAT_INGESTION_CYCLE_LOCK.acquire()
    try:
        executed = await execute_threat_ingestion_worker_cycle(fake_db)
    finally:
        _THREAT_INGESTION_CYCLE_LOCK.release()

    assert executed is False

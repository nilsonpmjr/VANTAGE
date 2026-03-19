from threat_feed_adapters import adapt_cve_rss_items, adapt_fortinet_rss_items, parse_rss_items
from threat_items import build_threat_item_document, build_threat_item_payload, extract_threat_item_payload


def test_parse_rss_items_returns_empty_for_malformed_xml():
    assert parse_rss_items("<rss><channel><item></rss>") == []


def test_adapt_cve_rss_items_builds_canonical_document():
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

    items = parse_rss_items(xml)
    documents = adapt_cve_rss_items("cve_recent", items)

    assert len(documents) == 1
    document = documents[0]
    assert document["source_id"] == "cve_recent"
    assert document["family"] == "cve"
    assert document["external_id"] == "cve-2026-1234"
    assert document["severity"] == "critical"
    assert "CVE-2026-1234" in document["tags"]
    assert document["data"]["attributes"]["cve_ids"] == ["CVE-2026-1234"]


def test_adapt_fortinet_rss_items_normalizes_categories_and_cves():
    xml = """
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

    items = parse_rss_items(xml)
    documents = adapt_fortinet_rss_items("fortinet_threatsignal", items)

    assert len(documents) == 1
    document = documents[0]
    assert document["family"] == "fortinet"
    assert document["severity"] == "high"
    assert "fortinet" in document["tags"]
    assert "threat_signal" in document["tags"]
    assert "CVE-2026-9876" in document["tags"]


def test_extract_threat_item_payload_supports_legacy_shape():
    payload = build_threat_item_payload(
        title="Legacy item",
        summary="Legacy summary",
        link="https://example.test/legacy",
        published_at=None,
        severity="medium",
        tags=["legacy"],
        attributes={"kind": "legacy"},
        raw={"id": "legacy-1"},
    )
    document = build_threat_item_document(
        source_id="cve_recent",
        source_type="rss",
        family="cve",
        external_id="legacy-1",
        origin="rss",
        payload=payload,
    )

    extracted = extract_threat_item_payload(document)

    assert extracted["title"] == "Legacy item"
    assert extracted["severity"] == "medium"

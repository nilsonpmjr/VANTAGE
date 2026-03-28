from threat_feed_adapters import (
    adapt_cve_rss_items,
    adapt_fortinet_rss_items,
    adapt_generic_rss_items,
    build_editorial_metadata,
    infer_sectors,
    infer_topics,
    parse_rss_items,
)
from threat_items import build_threat_item_document, build_threat_item_payload, extract_threat_item_payload, normalize_tlp


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
    assert document["editorial"]["is_newsworthy"] is True
    assert document["editorial"]["story_kind"] == "advisory"


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
    assert document["editorial"]["headline_score"] >= 20


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


# ── infer_sectors tests ──────────────────────────────────────────────────────


def test_infer_sectors_matches_infrastructure_keywords():
    result = infer_sectors("Cisco router vulnerability", "", ["cve"])
    assert "infrastructure" in result


def test_infer_sectors_matches_multiple_sectors():
    result = infer_sectors("Hospital VPN breach", "medical data exposed via network", ["health"])
    assert "healthcare" in result
    assert "infrastructure" in result


def test_infer_sectors_returns_empty_for_generic_text():
    result = infer_sectors("Update released", "Minor patch applied", ["patch"])
    assert result == []


def test_infer_sectors_matches_from_tags():
    result = infer_sectors("Alert", "New event", ["scada", "ics"])
    assert "energy" in result


def test_infer_topics_detects_ransomware_and_vulnerability():
    result = infer_topics("Critical ransomware campaign", "Zero-day vulnerability exploited", ["cve"])
    assert "ransomware" in result
    assert "vulnerability" in result


def test_build_editorial_metadata_marks_high_severity_story_as_newsworthy():
    editorial = build_editorial_metadata(
        title="Critical ransomware campaign",
        summary="Active exploitation in the wild",
        severity="critical",
        tags=["cve", "CVE-2026-7777"],
        categories=["Threat Signal"],
    )

    assert editorial["story_kind"] == "campaign"
    assert editorial["is_newsworthy"] is True
    assert editorial["headline_score"] >= 20


# ── normalize_tlp tests ──────────────────────────────────────────────────────


def test_normalize_tlp_strips_prefix():
    assert normalize_tlp("tlp:amber") == "amber"
    assert normalize_tlp("TLP:RED") == "red"


def test_normalize_tlp_accepts_bare_values():
    assert normalize_tlp("white") == "white"
    assert normalize_tlp("green") == "green"


def test_normalize_tlp_rejects_invalid():
    assert normalize_tlp("purple") == ""
    assert normalize_tlp("") == ""
    assert normalize_tlp(None) == ""


# ── source_name, tlp, sector in adapter output ───────────────────────────────


def test_adapt_cve_rss_items_includes_source_name_and_tlp():
    xml = """
    <rss><channel>
      <item>
        <title>CVE-2026-5555 cloud API flaw</title>
        <description>Kubernetes API vulnerability</description>
        <link>https://example.test/cve</link>
        <guid>cve-5555</guid>
        <pubDate>Wed, 19 Mar 2026 12:00:00 GMT</pubDate>
      </item>
    </channel></rss>
    """
    items = parse_rss_items(xml)
    docs = adapt_cve_rss_items("cve_recent", items, source_name="NVD", tlp="green")

    assert len(docs) == 1
    doc = docs[0]
    assert doc["source_name"] == "NVD"
    assert doc["tlp"] == "green"
    assert "technology" in doc["sector"]


def test_adapt_generic_rss_items_includes_sector():
    items = [
        {
            "external_id": "item-1",
            "title": "Bank phishing campaign",
            "summary": "Financial sector targeted",
            "link": "https://example.test",
            "published_at": None,
            "categories": [],
            "raw": {},
        }
    ]
    docs = adapt_generic_rss_items("custom_test", "custom", items, source_name="Custom", tlp="amber")

    assert len(docs) == 1
    doc = docs[0]
    assert doc["source_name"] == "Custom"
    assert doc["tlp"] == "amber"
    assert "finance" in doc["sector"]

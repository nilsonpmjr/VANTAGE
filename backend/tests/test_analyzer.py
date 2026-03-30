"""
Unit tests for analyzer.py — structured report and geo enrichment.
"""

from analyzer import (
    build_geo_summary,
    format_report_sections_to_text,
    format_report_to_markdown,
    generate_analysis_sections,
    generate_heuristic_report,
)


SUMMARY_HIGH_RISK = {"risk_sources": 3, "total_sources": 5, "verdict": "HIGH RISK"}
SUMMARY_SAFE = {"risk_sources": 0, "total_sources": 5, "verdict": "SAFE"}
SUMMARY_SUSPICIOUS = {"risk_sources": 1, "total_sources": 5, "verdict": "SUSPICIOUS"}

MOCK_RESULTS = {
    "virustotal": {
        "data": {
            "attributes": {
                "last_analysis_stats": {"malicious": 5, "harmless": 60, "suspicious": 1},
                "as_owner": "Example ISP",
                "country": "US",
            }
        }
    },
    "abuseipdb": {
        "data": {
            "abuseConfidenceScore": 85,
            "totalReports": 12,
            "usageType": "Data Center/Web Hosting/Transit",
            "countryCode": "US",
        }
    },
}

MOCK_RESULTS_WITH_IP2LOCATION = {
    **MOCK_RESULTS,
    "ip2location": {
        "ip": "8.8.8.8",
        "country_code": "US",
        "country_name": "United States of America",
        "region_name": "California",
        "city_name": "Mountain View",
        "latitude": 37.38605,
        "longitude": -122.08385,
        "asn": "15169",
        "as": "Google LLC",
        "isp": "Google LLC",
    },
}


def test_generate_report_high_risk_pt():
    report = generate_heuristic_report("8.8.8.8", "ip", SUMMARY_HIGH_RISK, MOCK_RESULTS, lang="pt")
    assert isinstance(report, list)
    assert len(report) > 0
    full_text = "\n".join(report)
    assert "ALTO RISCO" in full_text or "alto risco" in full_text.lower() or "risco" in full_text.lower()
    assert "**" not in full_text


def test_generate_report_safe_pt():
    report = generate_heuristic_report("8.8.8.8", "ip", SUMMARY_SAFE, {}, lang="pt")
    full_text = "\n".join(report)
    assert "seguro" in full_text.lower() or "limpo" in full_text.lower()


def test_generate_report_suspicious_pt():
    report = generate_heuristic_report("1.2.3.4", "ip", SUMMARY_SUSPICIOUS, {}, lang="pt")
    assert isinstance(report, list)


def test_generate_report_en():
    report = generate_heuristic_report("evil.com", "domain", SUMMARY_HIGH_RISK, MOCK_RESULTS, lang="en")
    full_text = "\n".join(report)
    assert "HIGH RISK" in full_text or "malicious" in full_text.lower()


def test_generate_report_es():
    report = generate_heuristic_report("1.2.3.4", "ip", SUMMARY_HIGH_RISK, MOCK_RESULTS, lang="es")
    assert isinstance(report, list)


def test_format_to_markdown():
    lines = ["# Header", "Some text", "- bullet"]
    result = format_report_to_markdown(lines)
    assert "# Header" in result
    assert "Some text" in result


def test_generate_report_unknown_lang_falls_back():
    # Unknown lang should fall back gracefully (not crash)
    report = generate_heuristic_report("1.2.3.4", "ip", SUMMARY_SAFE, {}, lang="xx")
    assert isinstance(report, list)


def test_build_geo_summary_extracts_country_and_entity():
    summary = build_geo_summary("8.8.8.8", "ip", MOCK_RESULTS)
    assert summary["available"] is True
    assert summary["country"] == "United States"
    assert summary["display_entity"] == "Example ISP"


def test_build_geo_summary_prefers_ip2location_when_available():
    summary = build_geo_summary("8.8.8.8", "ip", MOCK_RESULTS_WITH_IP2LOCATION)
    assert summary["available"] is True
    assert summary["source"] == "IP2Location"
    assert summary["display_location"] == "Mountain View, California, United States of America"
    assert summary["display_entity"] == "Google LLC"


def test_generate_analysis_sections_includes_infrastructure_and_actions():
    geo_summary = build_geo_summary("8.8.8.8", "ip", MOCK_RESULTS_WITH_IP2LOCATION)
    sections = generate_analysis_sections(
        "8.8.8.8",
        "ip",
        SUMMARY_HIGH_RISK,
        MOCK_RESULTS_WITH_IP2LOCATION,
        lang="pt",
        geo_summary=geo_summary,
    )
    titles = [section["title"] for section in sections]
    assert "Infrastructure & Geolocation" in titles
    assert "Recommended Actions" in titles
    assert any(section["body"] for section in sections)
    signals = next(section for section in sections if section["id"] == "threat_signals")
    actions = next(section for section in sections if section["id"] == "recommended_actions")
    assert len(signals["body"]) <= 3
    assert len(actions["body"]) <= 2


def test_format_report_sections_to_text_returns_plain_text():
    text = format_report_sections_to_text(
        [{"id": "executive", "title": "Executive Assessment", "body": ["Line one", "Line two"]}]
    )
    assert "Executive Assessment" in text
    assert "• Line one" in text
    assert "**" not in text

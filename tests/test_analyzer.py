"""
Unit tests for analyzer.py — heuristic report generation.
"""

import pytest
from analyzer import generate_heuristic_report, format_report_to_markdown


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


def test_generate_report_high_risk_pt():
    report = generate_heuristic_report("8.8.8.8", "ip", SUMMARY_HIGH_RISK, MOCK_RESULTS, lang="pt")
    assert isinstance(report, list)
    assert len(report) > 0
    full_text = "\n".join(report)
    assert "ALTO RISCO" in full_text or "alto risco" in full_text.lower() or "risco" in full_text.lower()


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
    full_text = "\n".join(report)
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

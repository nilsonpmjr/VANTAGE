"""
Shared risk-scoring logic for VANTAGE.

Used by both the /analyze endpoint and the background worker to ensure
consistent verdicts across all paths.
"""

from typing import Any, Dict, Tuple


def compute_risk_score(service_results: Dict[str, Any]) -> Tuple[int, int]:
    """Compute (risk_score, total_valid_sources) from aggregated API results.

    Only sources that returned valid data (no errors) are counted toward
    ``total_sources``.  Each service contributes at most 1 point to
    ``risk_score`` based on its own heuristic threshold.
    """
    risk_score = 0
    total_sources = 0

    for svc, data in service_results.items():
        if not data or "error" in data or "_meta_error" in data:
            continue
        total_sources += 1

        if svc == "virustotal":
            malicious = (
                data.get("data", {})
                .get("attributes", {})
                .get("last_analysis_stats", {})
                .get("malicious", 0)
            )
            if malicious >= 3:
                risk_score += 1
        elif svc == "abuseipdb":
            if data.get("data", {}).get("abuseConfidenceScore", 0) >= 25:
                risk_score += 1
        elif svc == "alienvault":
            if data.get("pulse_info", {}).get("count", 0) > 0:
                risk_score += 1
        elif svc == "urlscan":
            if data.get("data", {}).get("verdict", {}).get("score", 0) > 0:
                risk_score += 1
        elif svc == "greynoise":
            if data.get("classification") == "malicious":
                risk_score += 1
        elif svc == "blacklistmaster":
            if not isinstance(data, dict) or data.get("_meta_msg") != "No content returned":
                risk_score += 1
        elif svc == "abusech":
            if (
                data.get("query_status") == "ok"
                and isinstance(data.get("data"), list)
                and len(data["data"]) > 0
            ):
                risk_score += 1
        elif svc == "pulsedive":
            if data.get("risk") in ["high", "critical"]:
                risk_score += 1

    return risk_score, total_sources


def compute_verdict(risk_score: int) -> str:
    """Return a human-readable verdict string from a numeric risk score."""
    if risk_score >= 2:
        return "HIGH RISK"
    if risk_score == 1:
        return "SUSPICIOUS"
    return "SAFE"

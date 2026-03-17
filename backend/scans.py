"""
Canonical helpers for `db.scans` documents.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def build_scan_payload(
    target: str,
    target_type: str,
    results: dict[str, Any],
    summary: dict[str, Any],
    analysis_report: str,
    analysis_reports: dict[str, str],
) -> dict[str, Any]:
    return {
        "target": target,
        "type": target_type,
        "results": results,
        "summary": summary,
        "analysis_report": analysis_report,
        "analysis_reports": analysis_reports,
    }


def build_scan_document(
    *,
    target: str,
    target_type: str,
    risk_score: int,
    verdict: str,
    analyst: str,
    payload: dict[str, Any],
    timestamp: datetime | None = None,
    extra_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    document = {
        "target": target,
        "type": target_type,
        "timestamp": timestamp or datetime.now(timezone.utc),
        "risk_score": risk_score,
        "verdict": verdict,
        "analyst": analyst,
        "data": payload,
    }
    if extra_fields:
        document.update(extra_fields)
    return document


def extract_scan_payload(scan_doc: dict[str, Any] | None) -> dict[str, Any] | None:
    """
    Return the canonical payload for a scan document, with legacy fallback.
    """
    if not scan_doc:
        return None
    payload = scan_doc.get("data")
    if isinstance(payload, dict):
        return payload

    if {"results", "analysis_report", "analysis_reports"} & set(scan_doc.keys()):
        summary = {
            "verdict": scan_doc.get("verdict", "UNKNOWN"),
            "risk_sources": scan_doc.get("risk_score", 0),
            "total_sources": scan_doc.get("total_sources", 0),
        }
        return build_scan_payload(
            target=scan_doc.get("target", ""),
            target_type=scan_doc.get("type", ""),
            results=scan_doc.get("results", {}),
            summary=scan_doc.get("summary", summary),
            analysis_report=scan_doc.get("analysis_report", ""),
            analysis_reports=scan_doc.get("analysis_reports", {}),
        )

    return None

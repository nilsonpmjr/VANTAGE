"""
Canonical helpers for threat ingestion items persisted outside `db.scans`.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


SEVERITY_ORDER = {"critical", "high", "medium", "low", "info", "unknown"}


def normalize_severity(value: str | None) -> str:
    if not value:
        return "unknown"

    normalized = str(value).strip().lower()
    if normalized in SEVERITY_ORDER:
        return normalized

    aliases = {
        "crit": "critical",
        "severe": "high",
        "moderate": "medium",
        "informational": "info",
    }
    return aliases.get(normalized, "unknown")


def build_threat_item_payload(
    *,
    title: str,
    summary: str,
    link: str,
    published_at: datetime | None,
    severity: str,
    tags: list[str],
    attributes: dict[str, Any],
    raw: dict[str, Any],
) -> dict[str, Any]:
    return {
        "title": title,
        "summary": summary,
        "link": link,
        "published_at": published_at,
        "severity": normalize_severity(severity),
        "tags": sorted({tag for tag in tags if tag}),
        "attributes": attributes,
        "raw": raw,
    }


def build_threat_item_document(
    *,
    source_id: str,
    source_type: str,
    family: str,
    external_id: str,
    origin: str,
    payload: dict[str, Any],
    timestamp: datetime | None = None,
    extra_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    document = {
        "source_id": source_id,
        "source_type": source_type,
        "family": family,
        "external_id": external_id,
        "origin": origin,
        "timestamp": timestamp or datetime.now(timezone.utc),
        "title": payload["title"],
        "summary": payload["summary"],
        "severity": payload["severity"],
        "published_at": payload["published_at"],
        "tags": payload["tags"],
        "data": payload,
    }
    if extra_fields:
        document.update(extra_fields)
    return document


def extract_threat_item_payload(item_doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if not item_doc:
        return None

    payload = item_doc.get("data")
    if isinstance(payload, dict):
        return payload

    if {"title", "summary", "link"} <= set(item_doc.keys()):
        return build_threat_item_payload(
            title=item_doc.get("title", ""),
            summary=item_doc.get("summary", ""),
            link=item_doc.get("link", ""),
            published_at=item_doc.get("published_at"),
            severity=item_doc.get("severity", "unknown"),
            tags=item_doc.get("tags", []),
            attributes=item_doc.get("attributes", {}),
            raw=item_doc.get("raw", {}),
        )

    return None

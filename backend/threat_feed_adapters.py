"""
RSS/XML adapters for threat ingestion sources.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from typing import Any

from threat_items import build_threat_item_document, build_threat_item_payload, normalize_severity


_CVE_RE = re.compile(r"\bCVE-\d{4}-\d{4,}\b", re.IGNORECASE)


def _text(element: ET.Element | None, tag: str) -> str:
    if element is None:
        return ""
    child = element.find(tag)
    if child is None or child.text is None:
        return ""
    return child.text.strip()


def _parse_datetime(value: str) -> Any:
    if not value:
        return None
    try:
        return parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        return None


def _severity_from_text(*parts: str) -> str:
    haystack = " ".join(part.lower() for part in parts if part)
    for keyword, severity in (
        ("critical", "critical"),
        ("high", "high"),
        ("medium", "medium"),
        ("moderate", "medium"),
        ("low", "low"),
        ("info", "info"),
        ("informational", "info"),
    ):
        if keyword in haystack:
            return severity
    return "unknown"


def parse_rss_items(xml_text: str) -> list[dict[str, Any]]:
    if not xml_text or not xml_text.strip():
        return []

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []

    items = []
    for item in root.findall(".//item"):
        title = _text(item, "title")
        summary = _text(item, "description")
        link = _text(item, "link")
        guid = _text(item, "guid") or link or title
        pub_date = _text(item, "pubDate")
        categories = [category.text.strip() for category in item.findall("category") if category.text]
        items.append(
            {
                "external_id": guid,
                "title": title,
                "summary": summary,
                "link": link,
                "published_at": _parse_datetime(pub_date),
                "categories": categories,
                "raw": {
                    "guid": guid,
                    "pub_date": pub_date,
                    "categories": categories,
                },
            }
        )
    return items


def adapt_cve_rss_items(source_id: str, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    documents = []
    for item in items:
        cves = sorted({match.upper() for match in _CVE_RE.findall(f"{item['title']} {item['summary']}")})
        severity = _severity_from_text(item["title"], item["summary"], *item["categories"])
        tags = ["cve", *cves]
        payload = build_threat_item_payload(
            title=item["title"],
            summary=item["summary"],
            link=item["link"],
            published_at=item["published_at"],
            severity=severity,
            tags=tags,
            attributes={"cve_ids": cves},
            raw=item["raw"],
        )
        documents.append(
            build_threat_item_document(
                source_id=source_id,
                source_type="rss",
                family="cve",
                external_id=item["external_id"],
                origin="rss",
                payload=payload,
            )
        )
    return documents


def adapt_generic_rss_items(source_id: str, family: str, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Generic adapter for manually-added RSS feeds."""
    documents = []
    for item in items:
        cves = sorted({match.upper() for match in _CVE_RE.findall(f"{item['title']} {item['summary']}")})
        category_tags = [c.lower().replace(" ", "_") for c in item.get("categories", [])]
        severity = normalize_severity(_severity_from_text(item["title"], item["summary"], *category_tags))
        tags = [family, *category_tags, *cves]
        payload = build_threat_item_payload(
            title=item["title"],
            summary=item["summary"],
            link=item.get("link", ""),
            published_at=item.get("published_at"),
            severity=severity,
            tags=tags,
            attributes={"cve_ids": cves, "categories": item.get("categories", [])},
            raw=item.get("raw", {}),
        )
        documents.append(
            build_threat_item_document(
                source_id=source_id,
                source_type="rss",
                family=family,
                external_id=item["external_id"],
                origin="rss",
                payload=payload,
            )
        )
    return documents


def adapt_fortinet_rss_items(source_id: str, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    documents = []
    for item in items:
        cves = sorted({match.upper() for match in _CVE_RE.findall(f"{item['title']} {item['summary']}")})
        category_tags = [category.lower().replace(" ", "_") for category in item["categories"]]
        severity = normalize_severity(_severity_from_text(item["title"], item["summary"], *category_tags))
        tags = ["fortinet", *category_tags, *cves]
        payload = build_threat_item_payload(
            title=item["title"],
            summary=item["summary"],
            link=item["link"],
            published_at=item["published_at"],
            severity=severity,
            tags=tags,
            attributes={"cve_ids": cves, "categories": item["categories"]},
            raw=item["raw"],
        )
        documents.append(
            build_threat_item_document(
                source_id=source_id,
                source_type="rss",
                family="fortinet",
                external_id=item["external_id"],
                origin="rss",
                payload=payload,
            )
        )
    return documents

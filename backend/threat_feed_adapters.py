"""
RSS/XML adapters for threat ingestion sources.
"""

from __future__ import annotations

import re
from defusedxml import ElementTree as ET
from email.utils import parsedate_to_datetime
from typing import Any

from threat_items import build_threat_item_document, build_threat_item_payload, normalize_severity


_CVE_RE = re.compile(r"\bCVE-\d{4}-\d{4,}\b", re.IGNORECASE)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")

_SUMMARY_MAX_CHARS = 400


def _strip_html(text: str | None, max_chars: int = _SUMMARY_MAX_CHARS) -> str:
    """Remove HTML tags, collapse whitespace, and truncate."""
    if not text:
        return ""
    plain = _HTML_TAG_RE.sub(" ", text)
    plain = _WHITESPACE_RE.sub(" ", plain).strip()
    if len(plain) > max_chars:
        plain = plain[:max_chars].rsplit(" ", 1)[0] + "…"
    return plain

_SECTOR_KEYWORDS: dict[str, list[str]] = {
    "infrastructure": ["cisco", "firewall", "router", "switch", "vpn", "network", "dns", "proxy", "load balancer", "sd-wan"],
    "finance": ["bank", "payment", "financial", "swift", "credit card", "fintech", "atm"],
    "healthcare": ["hospital", "medical", "health", "pharma", "patient", "hipaa", "clinical"],
    "government": ["government", "federal", "agency", "cisa", "state-sponsored", "nation-state", "election"],
    "energy": ["energy", "power grid", "oil", "gas", "scada", "ics", "industrial control"],
    "telecom": ["telecom", "5g", "carrier", "mobile network", "sim", "sms"],
    "technology": ["cloud", "saas", "kubernetes", "docker", "container", "devops", "api"],
    "defense": ["military", "defense", "aerospace", "intelligence", "espionage"],
    "education": ["university", "school", "academic", "education", "student"],
    "retail": ["retail", "e-commerce", "pos", "point of sale", "shopping"],
}

_TOPIC_KEYWORDS: dict[str, list[str]] = {
    "ransomware": ["ransomware", "locker", "extortion"],
    "phishing": ["phishing", "credential harvesting", "spoofed login", "smishing"],
    "vulnerability": ["cve-", "vulnerability", "patch", "advisory", "zero-day", "0day"],
    "malware": ["malware", "trojan", "loader", "stealer", "infostealer", "rat"],
    "botnet": ["botnet", "c2", "command and control", "ddos"],
    "espionage": ["espionage", "apt", "nation-state", "state-sponsored"],
    "breach": ["breach", "data leak", "data theft", "exposed database"],
    "cloud": ["cloud", "kubernetes", "aws", "azure", "gcp", "container"],
}


def infer_sectors(title: str, summary: str, tags: list[str]) -> list[str]:
    """Infer sectors from text using keyword matching. Returns sorted list."""
    haystack = f"{title} {summary} {' '.join(tags)}".lower()
    matched = []
    for sector, keywords in _SECTOR_KEYWORDS.items():
        if any(kw in haystack for kw in keywords):
            matched.append(sector)
    return sorted(matched)


def infer_topics(title: str, summary: str, tags: list[str], categories: list[str] | None = None) -> list[str]:
    haystack = f"{title} {summary} {' '.join(tags)} {' '.join(categories or [])}".lower()
    matched = []
    for topic, keywords in _TOPIC_KEYWORDS.items():
        if any(keyword in haystack for keyword in keywords):
            matched.append(topic)
    return sorted(matched)


def infer_story_kind(title: str, summary: str, tags: list[str], categories: list[str] | None = None) -> str:
    haystack = f"{title} {summary} {' '.join(tags)} {' '.join(categories or [])}".lower()
    if any(keyword in haystack for keyword in ("campaign", "active exploitation", "in the wild", "phishing", "botnet")):
        return "campaign"
    if any(keyword in haystack for keyword in ("breach", "leak", "compromised", "stolen")):
        return "incident"
    if any(keyword in haystack for keyword in ("report", "analysis", "research", "threat signal")):
        return "research"
    if any(keyword in haystack for keyword in ("advisory", "cve-", "patch", "update", "vulnerability")):
        return "advisory"
    return "brief"


def build_editorial_metadata(
    *,
    title: str,
    summary: str,
    severity: str,
    tags: list[str],
    categories: list[str] | None = None,
) -> dict[str, Any]:
    topics = infer_topics(title, summary, tags, categories)
    story_kind = infer_story_kind(title, summary, tags, categories)
    headline_score = 0
    normalized_severity = normalize_severity(severity)

    if normalized_severity == "critical":
        headline_score += 50
    elif normalized_severity == "high":
        headline_score += 35
    elif normalized_severity == "medium":
        headline_score += 20
    elif normalized_severity == "low":
        headline_score += 10

    if "vulnerability" in topics:
        headline_score += 12
    if story_kind == "campaign":
        headline_score += 10
    if story_kind == "incident":
        headline_score += 8
    if any(tag.startswith("CVE-") for tag in tags):
        headline_score += 8
    if any(topic in topics for topic in ("ransomware", "phishing", "espionage", "breach")):
        headline_score += 10

    return {
        "story_kind": story_kind,
        "topics": topics,
        "headline_score": headline_score,
        "is_newsworthy": headline_score >= 20,
    }


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
        summary = _strip_html(_text(item, "description"))
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


def adapt_cve_rss_items(
    source_id: str,
    items: list[dict[str, Any]],
    source_name: str = "NVD",
    tlp: str = "white",
) -> list[dict[str, Any]]:
    documents = []
    for item in items:
        cves = sorted({match.upper() for match in _CVE_RE.findall(f"{item['title']} {item['summary']}")})
        severity = _severity_from_text(item["title"], item["summary"], *item["categories"])
        tags = ["cve", *cves]
        sector = infer_sectors(item["title"], item["summary"], tags)
        editorial = build_editorial_metadata(
            title=item["title"],
            summary=item["summary"],
            severity=severity,
            tags=tags,
            categories=item["categories"],
        )
        payload = build_threat_item_payload(
            title=item["title"],
            summary=item["summary"],
            link=item["link"],
            published_at=item["published_at"],
            severity=severity,
            tags=tags,
            attributes={"cve_ids": cves, "editorial": editorial},
            raw=item["raw"],
            source_name=source_name,
            tlp=tlp,
            sector=sector,
        )
        documents.append(
            build_threat_item_document(
                source_id=source_id,
                source_type="rss",
                family="cve",
                external_id=item["external_id"],
                origin="rss",
                payload=payload,
                extra_fields={"editorial": editorial},
            )
        )
    return documents


def adapt_generic_rss_items(
    source_id: str,
    family: str,
    items: list[dict[str, Any]],
    source_name: str = "",
    tlp: str = "white",
) -> list[dict[str, Any]]:
    """Generic adapter for manually-added RSS feeds."""
    documents = []
    for item in items:
        cves = sorted({match.upper() for match in _CVE_RE.findall(f"{item['title']} {item['summary']}")})
        category_tags = [c.lower().replace(" ", "_") for c in item.get("categories", [])]
        severity = normalize_severity(_severity_from_text(item["title"], item["summary"], *category_tags))
        tags = [family, *category_tags, *cves]
        sector = infer_sectors(item["title"], item["summary"], tags)
        editorial = build_editorial_metadata(
            title=item["title"],
            summary=item["summary"],
            severity=severity,
            tags=tags,
            categories=item.get("categories", []),
        )
        payload = build_threat_item_payload(
            title=item["title"],
            summary=item["summary"],
            link=item.get("link", ""),
            published_at=item.get("published_at"),
            severity=severity,
            tags=tags,
            attributes={"cve_ids": cves, "categories": item.get("categories", []), "editorial": editorial},
            raw=item.get("raw", {}),
            source_name=source_name or family,
            tlp=tlp,
            sector=sector,
        )
        documents.append(
            build_threat_item_document(
                source_id=source_id,
                source_type="rss",
                family=family,
                external_id=item["external_id"],
                origin="rss",
                payload=payload,
                extra_fields={"editorial": editorial},
            )
        )
    return documents


def adapt_fortinet_rss_items(
    source_id: str,
    items: list[dict[str, Any]],
    source_name: str = "FortiGuard",
    tlp: str = "white",
) -> list[dict[str, Any]]:
    documents = []
    for item in items:
        cves = sorted({match.upper() for match in _CVE_RE.findall(f"{item['title']} {item['summary']}")})
        category_tags = [category.lower().replace(" ", "_") for category in item["categories"]]
        severity = normalize_severity(_severity_from_text(item["title"], item["summary"], *category_tags))
        tags = ["fortinet", *category_tags, *cves]
        sector = infer_sectors(item["title"], item["summary"], tags)
        editorial = build_editorial_metadata(
            title=item["title"],
            summary=item["summary"],
            severity=severity,
            tags=tags,
            categories=item["categories"],
        )
        payload = build_threat_item_payload(
            title=item["title"],
            summary=item["summary"],
            link=item["link"],
            published_at=item["published_at"],
            severity=severity,
            tags=tags,
            attributes={"cve_ids": cves, "categories": item["categories"], "editorial": editorial},
            raw=item["raw"],
            source_name=source_name,
            tlp=tlp,
            sector=sector,
        )
        documents.append(
            build_threat_item_document(
                source_id=source_id,
                source_type="rss",
                family="fortinet",
                external_id=item["external_id"],
                origin="rss",
                payload=payload,
                extra_fields={"editorial": editorial},
            )
        )
    return documents

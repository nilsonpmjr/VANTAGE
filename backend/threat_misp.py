"""
Minimal MISP client and canonical adapters for threat ingestion.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from threat_feed_adapters import infer_sectors
from threat_items import build_threat_item_document, build_threat_item_payload, normalize_severity, normalize_tlp


def _as_list(value) -> list:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    return []


def _parse_misp_datetime(*values) -> datetime | None:
    for value in values:
        if value in (None, ""):
            continue
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        try:
            timestamp = int(str(value).strip())
            if timestamp > 0:
                return datetime.fromtimestamp(timestamp, tz=timezone.utc)
        except (TypeError, ValueError):
            pass
        try:
            return datetime.fromisoformat(str(value).strip()).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _extract_events(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    response = payload.get("response")
    if isinstance(response, list):
        return [item for item in response if isinstance(item, dict)]
    if isinstance(response, dict):
        if isinstance(response.get("Event"), list):
            return [item for item in response["Event"] if isinstance(item, dict)]
        if isinstance(response.get("Event"), dict):
            return [response["Event"]]

    if isinstance(payload.get("Event"), list):
        return [item for item in payload["Event"] if isinstance(item, dict)]
    if isinstance(payload.get("Event"), dict):
        return [payload["Event"]]

    return []


def _event_view_url(base_url: str, event_id: str | None) -> str:
    if not event_id:
        return base_url
    return f"{base_url.rstrip('/')}/events/view/{event_id}"


def _severity_from_event(event: dict[str, Any]) -> str:
    mapping = {
        "1": "high",
        "2": "medium",
        "3": "low",
        "4": "info",
    }
    return normalize_severity(mapping.get(str(event.get("threat_level_id") or "").strip(), "unknown"))


def adapt_misp_events(source_id: str, base_url: str, payload: Any) -> list[dict[str, Any]]:
    documents = []

    for raw_event in _extract_events(payload):
        event = raw_event.get("Event") if isinstance(raw_event.get("Event"), dict) else raw_event
        event_id = str(event.get("id") or "").strip()
        event_uuid = str(event.get("uuid") or event_id).strip()
        if not event_uuid:
            continue

        attributes = _as_list(event.get("Attribute"))
        tags = _as_list(event.get("Tag"))
        tag_names = sorted(
            {
                str(tag.get("name") or "").strip()
                for tag in tags
                if isinstance(tag, dict) and str(tag.get("name") or "").strip()
            }
        )
        attribute_types = sorted(
            {
                str(attribute.get("type") or "").strip()
                for attribute in attributes
                if isinstance(attribute, dict) and str(attribute.get("type") or "").strip()
            }
        )
        attribute_values = [
            str(attribute.get("value") or "").strip()
            for attribute in attributes
            if isinstance(attribute, dict) and str(attribute.get("value") or "").strip()
        ]

        title = str(event.get("info") or f"MISP event {event_uuid}").strip()
        summary = f"MISP event with {len(attributes)} attribute(s)."
        if event.get("Orgc") and isinstance(event["Orgc"], dict):
            org_name = str(event["Orgc"].get("name") or "").strip()
            if org_name:
                summary = f"{summary} Source org: {org_name}."

        # Extract TLP from MISP tags (e.g. "tlp:amber", "tlp:white")
        event_tlp = ""
        for tn in tag_names:
            if tn.lower().startswith("tlp:"):
                event_tlp = normalize_tlp(tn)
                if event_tlp:
                    break
        all_tags = ["misp", *tag_names, *attribute_types]
        sector = infer_sectors(title, summary, all_tags)

        payload_data = build_threat_item_payload(
            title=title,
            summary=summary,
            link=_event_view_url(base_url, event_id),
            published_at=_parse_misp_datetime(
                event.get("publish_timestamp"),
                event.get("timestamp"),
                event.get("date"),
            ),
            severity=_severity_from_event(event),
            tags=all_tags,
            attributes={
                "event_id": event_id,
                "event_uuid": event_uuid,
                "attribute_count": len(attributes),
                "attribute_types": attribute_types,
                "sample_values": attribute_values[:10],
                "tags": tag_names,
            },
            source_name="MISP",
            tlp=event_tlp or "green",
            sector=sector,
            raw={
                "event_id": event_id,
                "event_uuid": event_uuid,
                "threat_level_id": event.get("threat_level_id"),
                "analysis": event.get("analysis"),
                "distribution": event.get("distribution"),
                "attribute_count": len(attributes),
                "tag_count": len(tag_names),
            },
        )
        documents.append(
            build_threat_item_document(
                source_id=source_id,
                source_type="misp",
                family="misp",
                external_id=event_uuid,
                origin="misp",
                payload=payload_data,
                extra_fields={"event_id": event_id, "event_uuid": event_uuid},
            )
        )

    return documents


class MISPClient:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        verify_tls: bool = True,
        timeout_seconds: float = 15.0,
        transport=None,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.verify_tls = verify_tls
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": self.api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    async def test_connection(self) -> dict[str, Any]:
        async with httpx.AsyncClient(
            base_url=self.base_url,
            headers=self._headers,
            verify=self.verify_tls,
            timeout=httpx.Timeout(self.timeout_seconds),
            transport=self.transport,
        ) as client:
            response = await client.get("/servers/getVersion")
            response.raise_for_status()
            try:
                payload = response.json()
            except ValueError:
                payload = {}

        version = payload.get("version")
        if not version and isinstance(payload.get("response"), dict):
            version = payload["response"].get("version")
        return {"ok": True, "version": version or "unknown"}

    async def fetch_events(self, *, page_size: int = 100, max_pages: int = 5) -> Any:
        page_size = max(int(page_size), 1)
        max_pages = max(int(max_pages), 1)
        aggregated_events: list[dict[str, Any]] = []

        async with httpx.AsyncClient(
            base_url=self.base_url,
            headers=self._headers,
            verify=self.verify_tls,
            timeout=httpx.Timeout(self.timeout_seconds),
            transport=self.transport,
        ) as client:
            for page in range(1, max_pages + 1):
                response = await client.post(
                    "/events/restSearch",
                    json={
                        "limit": page_size,
                        "page": page,
                        "published": 1,
                    },
                )
                response.raise_for_status()
                payload = response.json()
                events = _extract_events(payload)
                aggregated_events.extend(events)
                if len(events) < page_size:
                    break

        # Controlled pagination for MVP: keep walking until the feed page is not full,
        # but cap the number of requests to avoid unbounded sync loops.
        return {"response": aggregated_events}


async def fetch_and_adapt_misp_items(source: dict[str, Any]) -> list[dict[str, Any]]:
    config = source.get("config", {})
    client = MISPClient(
        base_url=config.get("base_url", ""),
        api_key=config.get("api_key", ""),
        verify_tls=bool(config.get("verify_tls", True)),
    )
    payload = await client.fetch_events()
    return adapt_misp_events(source["source_id"], config.get("base_url", ""), payload)

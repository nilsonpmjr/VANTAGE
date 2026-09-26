"""Opt-in, non-authoritative enrichment for materialized RedMode assets."""

from __future__ import annotations

import asyncio
from collections import defaultdict, deque
from datetime import datetime, timezone
from ipaddress import ip_network
from typing import Literal, Protocol
from urllib.parse import quote, urlparse

import httpx

from config import settings


ProviderMode = Literal["local", "external"]
SUPPORTED_ENRICHMENT_KINDS = frozenset({"ip", "cidr", "asn"})


class ScopeEnrichmentProvider(Protocol):
    key: str
    mode: ProviderMode
    supported_kinds: frozenset[str]

    async def lookup(self, kind: str, canonical: str) -> dict | None:
        """Return normalized metadata, or None when the value is unknown."""


class ProviderQueryError(RuntimeError):
    """A provider failed without exposing target data in the exception."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class ProviderRateLimitError(ProviderQueryError):
    def __init__(self):
        super().__init__("provider_rate_limited")


def _organization(payload: dict) -> str | None:
    direct = payload.get("organization") or payload.get("org") or payload.get("name")
    if direct:
        return str(direct)
    for entity in payload.get("entities") or []:
        vcard = entity.get("vcardArray") if isinstance(entity, dict) else None
        rows = vcard[1] if isinstance(vcard, list) and len(vcard) > 1 else []
        for row in rows:
            if isinstance(row, list) and len(row) > 3 and row[0] in {"fn", "org"}:
                value = row[3]
                if isinstance(value, list):
                    value = " ".join(str(item) for item in value)
                if value:
                    return str(value)
    return None


def _prefix(payload: dict) -> str | None:
    direct = payload.get("prefix") or payload.get("announced_prefix")
    if direct:
        return str(direct)
    for candidate in payload.get("cidr0_cidrs") or []:
        if not isinstance(candidate, dict):
            continue
        base = candidate.get("v4prefix") or candidate.get("v6prefix")
        length = candidate.get("length")
        if base is not None and length is not None:
            return f"{base}/{length}"
    return None


def _asn(payload: dict) -> str | None:
    raw = payload.get("asn") or payload.get("autnum") or payload.get("startAutnum")
    if raw is None:
        return None
    value = str(raw).upper()
    return value if value.startswith("AS") else f"AS{value}"


class RdapHttpProvider:
    """Configurable RDAP/IP-to-ASN adapter with no target discovery side effects."""

    key = "rdap"
    mode: ProviderMode = "external"
    supported_kinds = SUPPORTED_ENRICHMENT_KINDS

    def __init__(
        self,
        base_url: str,
        *,
        timeout_seconds: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        parsed = urlparse(base_url)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
        ):
            raise ValueError("invalid_rdap_url")
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    def _path(self, kind: str, canonical: str) -> str:
        if kind == "asn":
            number = canonical.upper().removeprefix("AS")
            return f"autnum/{quote(number, safe='')}"
        if kind == "cidr":
            # Query one canonical network address. No prefix enumeration occurs.
            canonical = str(ip_network(canonical, strict=False).network_address)
        return f"ip/{quote(canonical, safe='')}"

    async def lookup(self, kind: str, canonical: str) -> dict | None:
        if kind not in self.supported_kinds:
            raise ProviderQueryError("provider_kind_unsupported")
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds,
                transport=self.transport,
                follow_redirects=False,
            ) as client:
                response = await client.get(f"{self.base_url}/{self._path(kind, canonical)}")
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderQueryError("provider_unavailable") from exc
        if response.status_code == 404:
            return None
        if response.status_code == 429:
            raise ProviderRateLimitError()
        if response.status_code < 200 or response.status_code >= 300:
            raise ProviderQueryError("provider_response_error")
        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderQueryError("provider_invalid_response") from exc
        if not isinstance(payload, dict):
            raise ProviderQueryError("provider_invalid_response")
        return {
            "asn": _asn(payload),
            "organization": _organization(payload),
            "prefix": _prefix(payload),
            "source": str(
                payload.get("source")
                or payload.get("port43")
                or self.base_url
            ),
        }


def get_scope_enrichment_providers() -> list[ScopeEnrichmentProvider]:
    """Build configured providers. Empty configuration remains a valid state."""
    if not settings.redmode_enrichment_rdap_url.strip():
        return []
    try:
        return [RdapHttpProvider(
            settings.redmode_enrichment_rdap_url,
            timeout_seconds=settings.redmode_enrichment_timeout_seconds,
        )]
    except ValueError:
        return []


class EnrichmentRuntime:
    """In-process concurrency and provider rate guard for explicit queries."""

    def __init__(self):
        self._semaphore: asyncio.Semaphore | None = None
        self._semaphore_size = 0
        self._rate_lock = asyncio.Lock()
        self._calls: dict[str, deque[float]] = defaultdict(deque)

    def _current_semaphore(self) -> asyncio.Semaphore:
        size = max(1, settings.redmode_enrichment_max_concurrent)
        if self._semaphore is None or self._semaphore_size != size:
            self._semaphore = asyncio.Semaphore(size)
            self._semaphore_size = size
        return self._semaphore

    async def _claim_rate_slot(self, provider_key: str) -> None:
        loop = asyncio.get_running_loop()
        now = loop.time()
        maximum = max(1, settings.redmode_enrichment_rate_limit_per_minute)
        async with self._rate_lock:
            calls = self._calls[provider_key]
            while calls and calls[0] <= now - 60:
                calls.popleft()
            if len(calls) >= maximum:
                raise ProviderRateLimitError()
            calls.append(now)

    async def query(
        self,
        provider: ScopeEnrichmentProvider,
        kind: str,
        canonical: str,
    ) -> dict | None:
        async with self._current_semaphore():
            await self._claim_rate_slot(provider.key)
            return await provider.lookup(kind, canonical)

    def reset(self) -> None:
        self._calls.clear()
        self._semaphore = None
        self._semaphore_size = 0


enrichment_runtime = EnrichmentRuntime()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)

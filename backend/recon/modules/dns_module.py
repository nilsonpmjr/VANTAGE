"""
DNS Recon module — uses dnspython (already a project dependency).
Queries A, AAAA, MX, NS, TXT, SOA, CNAME for domains; PTR for IPs.
"""

import asyncio

import dns.asyncresolver
import dns.exception
import dns.reversename

from logging_config import get_logger
from .base import ReconModule

logger = get_logger("DNSModule")


class DNSModule(ReconModule):
    name = "dns"
    display_name = "DNS"
    requires = []
    target_types = ["both"]
    timeout_seconds = 15

    async def run(self, target: str, target_type: str) -> dict:
        resolver = dns.asyncresolver.Resolver()
        resolver.timeout = 5
        resolver.lifetime = 10

        if target_type == "ip":
            return await self._resolve_ip(resolver, target)
        return await self._resolve_domain(resolver, target)

    async def _resolve_ip(self, resolver: dns.asyncresolver.Resolver, ip: str) -> dict:
        result: dict = {"PTR": []}
        try:
            rev = dns.reversename.from_address(ip)
            ans = await asyncio.wait_for(resolver.resolve(rev, "PTR"), timeout=5)
            result["PTR"] = [r.to_text() for r in ans]
        except Exception as exc:
            logger.debug(f"PTR lookup failed for {ip}: {exc}")
        return result

    async def _resolve_domain(self, resolver: dns.asyncresolver.Resolver, domain: str) -> dict:
        result: dict = {}
        record_types = ["A", "AAAA", "MX", "NS", "TXT", "SOA", "CNAME"]

        async def query_one(rtype: str):
            try:
                ans = await asyncio.wait_for(resolver.resolve(domain, rtype), timeout=5)
                return rtype, [r.to_text() for r in ans]
            except dns.exception.DNSException:
                return rtype, []
            except Exception:
                return rtype, []

        responses = await asyncio.gather(*[query_one(rt) for rt in record_types])
        for rtype, records in responses:
            if records:
                result[rtype] = records

        return result

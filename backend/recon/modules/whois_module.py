"""
WHOIS Recon module — uses python-whois (sync, run in thread executor).
"""

import asyncio
from datetime import datetime, timezone
from functools import partial

from .base import ReconModule


class WhoisModule(ReconModule):
    name = "whois"
    display_name = "WHOIS"
    requires = []
    target_types = ["both"]
    timeout_seconds = 20

    async def run(self, target: str, target_type: str) -> dict:
        loop = asyncio.get_event_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(None, partial(self._query, target)),
                timeout=self.timeout_seconds,
            )
            return result
        except asyncio.TimeoutError:
            return {"error": "WHOIS query timed out"}
        except Exception as e:
            return {"error": str(e)}

    def _query(self, target: str) -> dict:
        try:
            import whois  # python-whois
        except ImportError:
            return {"error": "python-whois not installed"}

        try:
            w = whois.whois(target)
        except Exception as e:
            return {"error": str(e)}

        def _date(d) -> str | None:
            if d is None:
                return None
            if isinstance(d, list):
                d = d[0]
            if isinstance(d, datetime):
                if d.tzinfo is None:
                    d = d.replace(tzinfo=timezone.utc)
                return d.isoformat()
            return str(d)

        def _list(v) -> list:
            if v is None:
                return []
            if isinstance(v, list):
                return [str(x) for x in v if x]
            return [str(v)]

        return {
            "domain_name": _list(w.domain_name),
            "registrar": w.registrar or None,
            "creation_date": _date(w.creation_date),
            "expiration_date": _date(w.expiration_date),
            "updated_date": _date(w.updated_date),
            "name_servers": _list(w.name_servers),
            "status": _list(w.status),
            "emails": _list(w.emails),
            "registrant_country": w.country or None,
            "org": w.org or None,
            "dnssec": w.dnssec or None,
        }

"""
Recon Engine — module registry and dispatcher.

Module availability is evaluated once at import time via shutil.which().
Unavailable modules are simply excluded from the returned list.
"""

import asyncio

from .modules.base import ReconModule
from .modules.dns_module import DNSModule
from .modules.whois_module import WhoisModule
from .modules.ssl_module import SSLModule
from .modules.web_module import WebModule
from .modules.ports_module import PortsModule
from .modules.passive_module import PassiveModule
from .modules.subdomains_module import SubdomainsModule
from .modules.traceroute_module import TracerouteModule

# Ordered list — defines display order in the sidebar
_ALL_MODULES: list[ReconModule] = [
    DNSModule(),
    WhoisModule(),
    SSLModule(),
    WebModule(),
    PortsModule(),
    PassiveModule(),
    SubdomainsModule(),
    TracerouteModule(),
]

# Evaluate availability once at startup
_AVAILABLE: dict[str, ReconModule] = {
    m.name: m for m in _ALL_MODULES if m.is_available()
}


def get_available_modules() -> list[dict]:
    """Returns metadata for all available modules (for sidebar rendering)."""
    return [
        {
            "name": m.name,
            "display_name": m.display_name,
            "target_types": m.target_types,
            "timeout_seconds": m.timeout_seconds,
        }
        for m in _ALL_MODULES
        if m.name in _AVAILABLE
    ]


def get_module(name: str) -> ReconModule | None:
    return _AVAILABLE.get(name)


async def run_module(name: str, target: str, target_type: str) -> dict:
    """
    Execute a single module.
    Returns the result dict (never raises).
    """
    module = _AVAILABLE.get(name)
    if module is None:
        return {"error": f"Module '{name}' not available"}

    if not module.supports(target_type):
        return {"skipped": f"Module '{name}' does not support target type '{target_type}'"}

    try:
        return await asyncio.wait_for(
            module.run(target, target_type),
            timeout=module.timeout_seconds,
        )
    except asyncio.TimeoutError:
        return {"error": f"Module '{name}' timed out after {module.timeout_seconds}s"}
    except Exception as e:
        return {"error": str(e)}

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


def get_module_inventory() -> list[dict]:
    """Return the built-in recon inventory, including unavailable modules."""
    return [
        {
            "key": m.name,
            "name": m.display_name or m.name,
            "runtime": "builtin",
            "entrypoint": f"backend.recon.modules.{m.__class__.__module__.split('.')[-1]}:{m.__class__.__name__}",
            "requiredBinaries": list(m.requires),
            "supportedTargetTypes": list(m.target_types),
            "timeoutSeconds": m.timeout_seconds,
            "available": m.name in _AVAILABLE,
            "preservesCurrentOutput": True,
        }
        for m in _ALL_MODULES
    ]


def get_available_modules() -> list[dict]:
    """Returns metadata for all available modules (for sidebar rendering)."""
    return [
        {
            "name": item["key"],
            "display_name": item["name"],
            "target_types": item["supportedTargetTypes"],
            "timeout_seconds": item["timeoutSeconds"],
        }
        for item in get_module_inventory()
        if item["available"]
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

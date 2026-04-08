"""
Compat re-export: exposure_runtime → exposure.runtime

Mantido para retrocompatibilidade com imports legados no core.
A implementação canônica agora está em ExtensionsVantage/Exposure/exposure/runtime.py

When the exposure extension package is not installed, all symbols degrade
to safe no-op stubs so the core backend can boot without the premium
extension present.
"""

try:
    from exposure.runtime import (  # noqa: F401
        SURFACE_MONITOR_KIND_ALIASES,
        SURFACE_MONITOR_SUPPORTED_ASSET_TYPES,
        SURFACE_MONITOR_SUPPORTED_FINDING_KINDS,
        VIP_MONITOR_KIND_ALIASES,
        VIP_MONITOR_SUPPORTED_ASSET_TYPES,
        VIP_MONITOR_SUPPORTED_FINDING_KINDS,
        build_exposure_provider_catalog,
        build_surface_monitor_asset,
        build_surface_monitor_provider_descriptor,
        build_vip_monitor_asset,
        build_vip_monitor_provider_descriptor,
        normalize_surface_monitor_findings,
        normalize_vip_monitor_findings,
        run_surface_monitor_query,
        run_vip_monitor_query,
    )
except ModuleNotFoundError:
    SURFACE_MONITOR_KIND_ALIASES: dict = {}
    SURFACE_MONITOR_SUPPORTED_ASSET_TYPES: set = set()
    SURFACE_MONITOR_SUPPORTED_FINDING_KINDS: set = set()
    VIP_MONITOR_KIND_ALIASES: dict = {}
    VIP_MONITOR_SUPPORTED_ASSET_TYPES: set = set()
    VIP_MONITOR_SUPPORTED_FINDING_KINDS: set = set()

    def build_exposure_provider_catalog(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def build_surface_monitor_asset(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def build_surface_monitor_provider_descriptor(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def build_vip_monitor_asset(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def build_vip_monitor_provider_descriptor(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def normalize_surface_monitor_findings(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def normalize_vip_monitor_findings(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def run_surface_monitor_query(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def run_vip_monitor_query(*a, **kw):
        raise RuntimeError("exposure extension not installed")

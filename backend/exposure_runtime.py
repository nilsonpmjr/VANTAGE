"""
Compat re-export: exposure_runtime → exposure.runtime

Mantido para retrocompatibilidade com imports legados no core.
A implementação canônica agora está em ExtensionsVantage/Exposure/exposure/runtime.py
"""

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

"""
Compat re-export: exposure_contracts → exposure.contracts

Mantido para retrocompatibilidade com imports legados no core.
A implementação canônica agora está em ExtensionsVantage/Exposure/exposure/contracts.py

When the exposure extension package is not installed, all symbols degrade
to safe no-op stubs so the core backend can boot without the premium
extension present.
"""

try:
    from exposure.contracts import (  # noqa: F401
        VALID_EXPOSURE_ASSET_TYPES,
        VALID_EXPOSURE_FINDING_KINDS,
        VALID_EXPOSURE_PROVIDER_SCOPES,
        VALID_EXPOSURE_SCHEDULE_MODES,
        build_exposure_asset_payload,
        build_exposure_finding_document,
        build_exposure_finding_payload,
        build_exposure_provider_descriptor,
        extract_exposure_finding_payload,
        normalize_exposure_asset_type,
        normalize_exposure_schedule_mode,
    )
except ModuleNotFoundError:
    VALID_EXPOSURE_ASSET_TYPES: set = set()
    VALID_EXPOSURE_FINDING_KINDS: set = set()
    VALID_EXPOSURE_PROVIDER_SCOPES: set = set()
    VALID_EXPOSURE_SCHEDULE_MODES: set = set()

    def build_exposure_asset_payload(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def build_exposure_finding_document(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def build_exposure_finding_payload(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def build_exposure_provider_descriptor(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def extract_exposure_finding_payload(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def normalize_exposure_asset_type(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def normalize_exposure_schedule_mode(*a, **kw):
        raise RuntimeError("exposure extension not installed")

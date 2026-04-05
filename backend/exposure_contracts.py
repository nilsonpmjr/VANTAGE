"""
Compat re-export: exposure_contracts → exposure.contracts

Mantido para retrocompatibilidade com imports legados no core.
A implementação canônica agora está em ExtensionsVantage/Exposure/exposure/contracts.py
"""

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

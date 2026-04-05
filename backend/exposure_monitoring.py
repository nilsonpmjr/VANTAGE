"""
Compat re-export: exposure_monitoring → exposure.monitoring

Mantido para retrocompatibilidade com imports legados no core.
A implementação canônica agora está em ExtensionsVantage/Exposure/exposure/monitoring.py
"""

from exposure.monitoring import (  # noqa: F401
    EXPOSURE_DATA_BOUNDARY,
    EXPOSURE_FINDINGS_COLLECTION,
    EXPOSURE_INCIDENTS_COLLECTION,
    EXPOSURE_MONITORED_ASSETS_COLLECTION,
    EXPOSURE_PRODUCT_SURFACE,
    VALID_EXPOSURE_DOC_KINDS,
    VALID_EXPOSURE_INCIDENT_STATUSES,
    VALID_EXPOSURE_RECURRENCE_STATUSES,
    VALID_EXPOSURE_SEVERITIES,
    build_exposure_incident_document,
    build_exposure_monitored_asset_document,
    build_exposure_recurrence_state,
    build_monitored_exposure_finding_document,
    update_exposure_recurrence_state,
)

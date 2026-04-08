"""
Compat re-export: exposure_monitoring → exposure.monitoring

Mantido para retrocompatibilidade com imports legados no core.
A implementação canônica agora está em ExtensionsVantage/Exposure/exposure/monitoring.py

When the exposure extension package is not installed, all symbols degrade
to safe no-op stubs so the core backend can boot without the premium
extension present.
"""

try:
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
except ModuleNotFoundError:
    EXPOSURE_DATA_BOUNDARY: str = "premium"
    EXPOSURE_FINDINGS_COLLECTION: str = "exposure_findings"
    EXPOSURE_INCIDENTS_COLLECTION: str = "exposure_incidents"
    EXPOSURE_MONITORED_ASSETS_COLLECTION: str = "exposure_monitored_assets"
    EXPOSURE_PRODUCT_SURFACE: str = "exposure"
    VALID_EXPOSURE_DOC_KINDS: set = set()
    VALID_EXPOSURE_INCIDENT_STATUSES: set = set()
    VALID_EXPOSURE_RECURRENCE_STATUSES: set = set()
    VALID_EXPOSURE_SEVERITIES: set = set()

    def build_exposure_incident_document(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def build_exposure_monitored_asset_document(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def build_exposure_recurrence_state(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def build_monitored_exposure_finding_document(*a, **kw):
        raise RuntimeError("exposure extension not installed")

    def update_exposure_recurrence_state(*a, **kw):
        raise RuntimeError("exposure extension not installed")

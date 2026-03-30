from exposure_contracts import (
    build_exposure_asset_payload,
    build_exposure_finding_payload,
)
from exposure_monitoring import (
    EXPOSURE_DATA_BOUNDARY,
    EXPOSURE_FINDINGS_COLLECTION,
    EXPOSURE_INCIDENTS_COLLECTION,
    EXPOSURE_MONITORED_ASSETS_COLLECTION,
    build_exposure_incident_document,
    build_exposure_monitored_asset_document,
    build_exposure_recurrence_state,
    build_monitored_exposure_finding_document,
)


def test_build_exposure_recurrence_state_respects_manual_mode():
    recurrence = build_exposure_recurrence_state(
        schedule_mode="manual",
        next_run_at="ignored",
    )

    assert recurrence["mode"] == "manual"
    assert recurrence["next_run_at"] is None
    assert recurrence["last_status"] == "never_run"


def test_build_exposure_monitored_asset_document_sets_boundary_and_collection():
    asset_payload = build_exposure_asset_payload(
        asset_type="domain",
        value="Example.com",
        owner="customer-a",
        schedule_mode="daily",
        tags=["Priority", "Brand"],
    )

    document = build_exposure_monitored_asset_document(
        customer_key="Customer-A",
        asset_payload=asset_payload,
        provider_keys=["premium.exposure.surface"],
        created_by="admin",
    )

    assert document["doc_kind"] == "monitored_asset"
    assert document["collection_hint"] == EXPOSURE_MONITORED_ASSETS_COLLECTION
    assert document["data_boundary"] == EXPOSURE_DATA_BOUNDARY
    assert document["customer_key"] == "customer-a"
    assert document["recurrence"]["mode"] == "daily"
    assert document["provider_keys"] == ["premium.exposure.surface"]


def test_build_monitored_exposure_finding_document_links_asset_without_becoming_incident():
    asset_payload = build_exposure_asset_payload(
        asset_type="email_domain",
        value="example.com",
        owner="customer-a",
    )
    payload = build_exposure_finding_payload(
        title="Credential leak reference",
        summary="A public source references exposed credentials tied to the monitored domain.",
        kind="credential_exposure",
        severity="high",
        confidence=0.8,
    )

    document = build_monitored_exposure_finding_document(
        customer_key="customer-a",
        monitored_asset_id="asset-1",
        provider_key="premium.exposure.surface",
        asset_payload=asset_payload,
        payload=payload,
    )

    assert document["doc_kind"] == "finding"
    assert document["collection_hint"] == EXPOSURE_FINDINGS_COLLECTION
    assert document["monitored_asset_id"] == "asset-1"
    assert document["incident_id"] is None
    assert document["kind"] == "credential_exposure"


def test_build_exposure_incident_document_separates_findings_from_incident_tracking():
    document = build_exposure_incident_document(
        customer_key="customer-a",
        title="Brand abuse campaign",
        summary="Multiple findings now require analyst follow-up.",
        severity="critical",
        source_finding_ids=["finding-2", "finding-1"],
        related_assets=[
            {
                "asset_type": "brand_keyword",
                "value": "vantage",
                "monitored_asset_id": "asset-1",
            }
        ],
    )

    assert document["doc_kind"] == "incident"
    assert document["collection_hint"] == EXPOSURE_INCIDENTS_COLLECTION
    assert document["status"] == "open"
    assert document["source_finding_ids"] == ["finding-1", "finding-2"]
    assert document["related_assets"][0]["asset_type"] == "brand_keyword"


def test_exposure_monitoring_requires_customer_boundary():
    asset_payload = build_exposure_asset_payload(
        asset_type="domain",
        value="example.com",
    )

    try:
        build_exposure_monitored_asset_document(
            customer_key="",
            asset_payload=asset_payload,
        )
    except ValueError as exc:
        assert str(exc) == "customer_key_required"
    else:
        raise AssertionError("Expected ValueError for missing customer boundary")

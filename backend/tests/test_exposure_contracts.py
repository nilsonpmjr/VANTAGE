from exposure_contracts import (
    build_exposure_asset_payload,
    build_exposure_finding_document,
    build_exposure_finding_payload,
    build_exposure_provider_descriptor,
    extract_exposure_finding_payload,
    normalize_exposure_asset_type,
    normalize_exposure_schedule_mode,
)


def test_normalize_exposure_asset_type_accepts_aliases():
    assert normalize_exposure_asset_type("hostname") == "domain"
    assert normalize_exposure_asset_type("mail_domain") == "email_domain"
    assert normalize_exposure_asset_type("brand") == "brand_keyword"


def test_build_exposure_provider_descriptor_sets_premium_shape():
    descriptor = build_exposure_provider_descriptor(
        key="premium-exposure-surface",
        name="Surface Monitor",
        version="0.1.0",
        asset_types=["domain", "brand_keyword"],
        provider_scope=["surface", "brand"],
        entrypoint="premium.exposure.surface",
        capabilities=["shadow_asset_discovery", "brand_abuse"],
        recommended_schedule="daily",
    )

    assert descriptor["premiumFeatureType"] == "exposure_provider"
    assert descriptor["distributionTier"] == "premium"
    assert descriptor["assetTypes"] == ["brand_keyword", "domain"]
    assert descriptor["recommendedSchedule"] == "daily"


def test_build_exposure_provider_descriptor_requires_asset_types():
    try:
        build_exposure_provider_descriptor(
            key="premium-exposure-surface",
            name="Surface Monitor",
            version="0.1.0",
            asset_types=[],
            provider_scope=["surface"],
            entrypoint="premium.exposure.surface",
        )
    except ValueError as exc:
        assert str(exc) == "exposure_asset_types_required"
    else:
        raise AssertionError("Expected ValueError for empty exposure asset types")


def test_build_exposure_asset_payload_normalizes_value_and_schedule():
    asset = build_exposure_asset_payload(
        asset_type="domain",
        value=" Example.COM ",
        owner="customer-a",
        schedule_mode="continuous",
        tags=["Priority", "External"],
    )

    assert asset["asset_type"] == "domain"
    assert asset["value"] == "example.com"
    assert asset["schedule_mode"] == "continuous"
    assert asset["tags"] == ["external", "priority"]


def test_build_exposure_finding_payload_and_document_roundtrip():
    asset = build_exposure_asset_payload(
        asset_type="email_domain",
        value="example.com",
        owner="customer-a",
    )
    payload = build_exposure_finding_payload(
        title="Credential exposure detected",
        summary="Potential exposed employee credentials tied to the monitored domain.",
        kind="credential_exposure",
        severity="high",
        confidence=0.9,
        evidence=[{"source": "demo", "ref": "paste-123"}],
        attributes={"account_count": 2},
    )

    document = build_exposure_finding_document(
        provider_key="premium-exposure-surface",
        asset_payload=asset,
        payload=payload,
        extra_fields={"external_ref": "paste-123"},
    )

    assert document["asset_type"] == "email_domain"
    assert document["kind"] == "credential_exposure"
    assert document["severity"] == "high"
    assert extract_exposure_finding_payload(document)["attributes"]["account_count"] == 2


def test_invalid_schedule_mode_is_rejected():
    try:
        normalize_exposure_schedule_mode("weekly")
    except ValueError as exc:
        assert str(exc) == "unsupported_exposure_schedule_mode:weekly"
    else:
        raise AssertionError("Expected ValueError for unsupported schedule mode")

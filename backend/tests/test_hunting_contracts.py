from __future__ import annotations

from hunting_contracts import (
    build_hunting_provider_descriptor,
    build_hunting_query_payload,
    build_hunting_result_document,
    build_hunting_result_payload,
    extract_hunting_result_payload,
    normalize_hunting_artifact_type,
    recommend_hunting_execution_profile,
)


def test_normalize_hunting_artifact_type_supports_aliases():
    assert normalize_hunting_artifact_type("handle") == "username"
    assert normalize_hunting_artifact_type("mail") == "email"
    assert normalize_hunting_artifact_type("profile") == "profile_url"


def test_build_hunting_provider_descriptor_normalizes_contract():
    execution_profile = recommend_hunting_execution_profile(
        requires_custom_binaries=True,
        dependency_weight="medium",
    )
    descriptor = build_hunting_provider_descriptor(
        key="sherlock",
        name="Sherlock",
        version="0.1.0",
        artifact_types=["handle", "username", "email"],
        provider_scope=["identity", "social"],
        entrypoint="premium.hunting.sherlock",
        capabilities=["profile_discovery", "profile_discovery"],
        required_secrets=["license_key"],
        execution_profile=execution_profile,
        requires_kali=False,
    )

    assert descriptor["artifactTypes"] == ["email", "username"]
    assert descriptor["providerScope"] == ["identity", "social"]
    assert descriptor["runtime"] == "plugin_premium"
    assert descriptor["requiresKali"] is False
    assert descriptor["executionProfile"]["mode"] == "isolated_container"


def test_recommend_hunting_execution_profile_prefers_native_for_lightweight_provider():
    profile = recommend_hunting_execution_profile()

    assert profile["mode"] == "native_local"
    assert profile["requiresKali"] is False
    assert profile["operationalRisk"] == "low"
    assert profile["allowedByDefault"] is True


def test_recommend_hunting_execution_profile_prefers_isolated_container_for_heavier_binary_stack():
    profile = recommend_hunting_execution_profile(
        requires_custom_binaries=True,
        handles_untrusted_targets=True,
        dependency_weight="heavy",
    )

    assert profile["mode"] == "isolated_container"
    assert profile["requiresKali"] is False
    assert "requires_custom_binaries" in profile["rationale"]
    assert "handles_untrusted_targets" in profile["rationale"]


def test_recommend_hunting_execution_profile_only_allows_kali_under_explicit_gate():
    profile = recommend_hunting_execution_profile(
        requires_privileged_network=True,
        requires_linux_toolchain=True,
        dependency_weight="heavy",
    )

    assert profile["mode"] == "kali_container"
    assert profile["requiresKali"] is True
    assert profile["allowedByDefault"] is False
    assert profile["operationalRisk"] == "high"


def test_build_hunting_query_payload_requires_query():
    try:
        build_hunting_query_payload(artifact_type="username", query="   ")
    except ValueError as exc:
        assert str(exc) == "query_required"
    else:
        raise AssertionError("expected query_required")


def test_build_hunting_result_payload_enforces_kind_and_confidence():
    payload = build_hunting_result_payload(
        title="GitHub profile match",
        summary="Potential username match found.",
        kind="profile_match",
        confidence=0.75,
        evidence=[{"source": "github", "url": "https://github.com/example"}],
    )

    assert payload["kind"] == "profile_match"
    assert payload["confidence"] == 0.75


def test_build_hunting_result_document_keeps_query_and_provider_shape():
    query_payload = build_hunting_query_payload(
        artifact_type="username",
        query="example_user",
        analyst="alice",
    )
    payload = build_hunting_result_payload(
        title="GitHub profile match",
        summary="Potential username match found.",
        kind="profile_match",
        confidence=0.75,
    )

    document = build_hunting_result_document(
        provider_key="sherlock",
        query_payload=query_payload,
        payload=payload,
    )

    assert document["provider_key"] == "sherlock"
    assert document["artifact_type"] == "username"
    assert document["query"] == "example_user"
    assert document["kind"] == "profile_match"
    assert document["data"] == payload


def test_extract_hunting_result_payload_supports_canonical_and_legacy_shapes():
    canonical = {
        "data": {
            "title": "Profile",
            "summary": "Found",
            "kind": "lead",
            "confidence": 0.5,
            "evidence": [],
            "attributes": {},
            "raw": {},
        }
    }
    legacy = {
        "title": "Profile",
        "summary": "Found",
        "kind": "lead",
        "confidence": 0.5,
        "evidence": [],
        "attributes": {},
        "raw": {},
    }

    assert extract_hunting_result_payload(canonical) == canonical["data"]
    assert extract_hunting_result_payload(legacy)["kind"] == "lead"

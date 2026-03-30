"""
Canonical contracts for premium hunting providers and their normalized results.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


VALID_HUNTING_ARTIFACT_TYPES = {
    "username",
    "alias",
    "email",
    "account",
    "profile_url",
}
VALID_HUNTING_PROVIDER_SCOPES = {
    "identity",
    "social",
    "breach",
    "correlation",
}
VALID_HUNTING_EXECUTION_MODES = {
    "native_local",
    "isolated_container",
    "kali_container",
}
VALID_HUNTING_DEPENDENCY_WEIGHTS = {
    "light",
    "medium",
    "heavy",
}
VALID_HUNTING_RESULT_KINDS = {
    "profile_match",
    "account_match",
    "breach_mention",
    "relationship",
    "lead",
}


def normalize_hunting_artifact_type(value: str | None) -> str:
    if not value:
        return "username"

    normalized = str(value).strip().lower()
    aliases = {
        "user": "username",
        "handle": "username",
        "mail": "email",
        "profile": "profile_url",
        "url": "profile_url",
    }
    normalized = aliases.get(normalized, normalized)
    if normalized not in VALID_HUNTING_ARTIFACT_TYPES:
        raise ValueError(f"unsupported_artifact_type:{normalized}")
    return normalized


def _normalize_scope(values: list[str] | tuple[str, ...] | None) -> list[str]:
    if not values:
        raise ValueError("provider_scope_required")

    normalized = sorted({str(value).strip().lower() for value in values if str(value).strip()})
    invalid = [value for value in normalized if value not in VALID_HUNTING_PROVIDER_SCOPES]
    if invalid:
        raise ValueError(f"unsupported_provider_scope:{','.join(invalid)}")
    return normalized


def _normalize_dependency_weight(value: str | None) -> str:
    normalized = str(value or "light").strip().lower()
    if normalized not in VALID_HUNTING_DEPENDENCY_WEIGHTS:
        raise ValueError(f"unsupported_dependency_weight:{normalized}")
    return normalized


def recommend_hunting_execution_profile(
    *,
    requires_custom_binaries: bool = False,
    requires_browser_automation: bool = False,
    requires_privileged_network: bool = False,
    requires_linux_toolchain: bool = False,
    handles_untrusted_targets: bool = False,
    dependency_weight: str = "light",
) -> dict[str, Any]:
    normalized_dependency_weight = _normalize_dependency_weight(dependency_weight)
    rationale: list[str] = []

    if requires_privileged_network and requires_linux_toolchain:
        mode = "kali_container"
        rationale.extend([
            "requires_privileged_network",
            "requires_linux_toolchain",
        ])
        operational_risk = "high"
        performance_profile = "heavy_boot"
        allowed_by_default = False
    elif (
        requires_custom_binaries
        or requires_browser_automation
        or handles_untrusted_targets
        or normalized_dependency_weight in {"medium", "heavy"}
    ):
        mode = "isolated_container"
        if requires_custom_binaries:
            rationale.append("requires_custom_binaries")
        if requires_browser_automation:
            rationale.append("requires_browser_automation")
        if handles_untrusted_targets:
            rationale.append("handles_untrusted_targets")
        if normalized_dependency_weight in {"medium", "heavy"}:
            rationale.append(f"dependency_weight:{normalized_dependency_weight}")
        operational_risk = "medium"
        performance_profile = "balanced"
        allowed_by_default = True
    else:
        mode = "native_local"
        rationale.append("lightweight_runtime")
        operational_risk = "low"
        performance_profile = "fast_start"
        allowed_by_default = True

    return {
        "mode": mode,
        "requiresKali": mode == "kali_container",
        "allowedByDefault": allowed_by_default,
        "operationalRisk": operational_risk,
        "performanceProfile": performance_profile,
        "dependencyWeight": normalized_dependency_weight,
        "criteria": {
            "requiresCustomBinaries": bool(requires_custom_binaries),
            "requiresBrowserAutomation": bool(requires_browser_automation),
            "requiresPrivilegedNetwork": bool(requires_privileged_network),
            "requiresLinuxToolchain": bool(requires_linux_toolchain),
            "handlesUntrustedTargets": bool(handles_untrusted_targets),
        },
        "rationale": rationale,
    }


def build_hunting_provider_descriptor(
    *,
    key: str,
    name: str,
    version: str,
    artifact_types: list[str],
    provider_scope: list[str],
    entrypoint: str,
    runtime: str = "plugin_premium",
    isolation_mode: str = "local_process",
    capabilities: list[str] | None = None,
    required_secrets: list[str] | None = None,
    requires_kali: bool = False,
    execution_profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_artifact_types = sorted({normalize_hunting_artifact_type(value) for value in artifact_types})
    if not entrypoint:
        raise ValueError("provider_entrypoint_required")

    normalized_execution_profile = execution_profile or recommend_hunting_execution_profile()
    execution_mode = str(normalized_execution_profile.get("mode") or "").strip().lower()
    if execution_mode not in VALID_HUNTING_EXECUTION_MODES:
        raise ValueError(f"unsupported_execution_mode:{execution_mode}")
    if bool(requires_kali) != bool(normalized_execution_profile.get("requiresKali")):
        raise ValueError("requires_kali_mismatch")

    return {
        "key": key,
        "name": name,
        "version": version,
        "kind": "premium_feature",
        "premiumFeatureType": "hunting_provider",
        "distributionTier": "premium",
        "artifactTypes": normalized_artifact_types,
        "providerScope": _normalize_scope(provider_scope),
        "entrypoint": entrypoint,
        "runtime": runtime,
        "isolationMode": isolation_mode,
        "capabilities": sorted({str(value).strip() for value in (capabilities or []) if str(value).strip()}),
        "requiredSecrets": sorted({str(value).strip() for value in (required_secrets or []) if str(value).strip()}),
        "requiresKali": bool(requires_kali),
        "executionProfile": normalized_execution_profile,
        "productSurface": ["hunting"],
    }


def build_hunting_query_payload(
    *,
    artifact_type: str,
    query: str,
    analyst: str | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_query = str(query or "").strip()
    if not normalized_query:
        raise ValueError("query_required")

    return {
        "artifact_type": normalize_hunting_artifact_type(artifact_type),
        "query": normalized_query,
        "analyst": analyst,
        "context": context or {},
    }


def build_hunting_result_payload(
    *,
    title: str,
    summary: str,
    kind: str,
    confidence: float | int,
    evidence: list[dict[str, Any]] | None = None,
    attributes: dict[str, Any] | None = None,
    raw: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_kind = str(kind or "").strip().lower()
    if normalized_kind not in VALID_HUNTING_RESULT_KINDS:
        raise ValueError(f"unsupported_result_kind:{normalized_kind}")

    normalized_confidence = float(confidence)
    if normalized_confidence < 0 or normalized_confidence > 1:
        raise ValueError("confidence_must_be_between_0_and_1")

    return {
        "title": str(title or "").strip(),
        "summary": str(summary or "").strip(),
        "kind": normalized_kind,
        "confidence": normalized_confidence,
        "evidence": evidence or [],
        "attributes": attributes or {},
        "raw": raw or {},
    }


def build_hunting_result_document(
    *,
    provider_key: str,
    query_payload: dict[str, Any],
    payload: dict[str, Any],
    timestamp: datetime | None = None,
    extra_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    document = {
        "provider_key": provider_key,
        "artifact_type": query_payload["artifact_type"],
        "query": query_payload["query"],
        "analyst": query_payload.get("analyst"),
        "timestamp": timestamp or datetime.now(timezone.utc),
        "title": payload["title"],
        "summary": payload["summary"],
        "kind": payload["kind"],
        "confidence": payload["confidence"],
        "data": payload,
    }
    if extra_fields:
        document.update(extra_fields)
    return document


def extract_hunting_result_payload(document: dict[str, Any] | None) -> dict[str, Any] | None:
    if not document:
        return None

    payload = document.get("data")
    if isinstance(payload, dict):
        return payload

    if {"title", "summary", "kind", "confidence"} <= set(document.keys()):
        return build_hunting_result_payload(
            title=document.get("title", ""),
            summary=document.get("summary", ""),
            kind=document.get("kind", "lead"),
            confidence=document.get("confidence", 0),
            evidence=document.get("evidence", []),
            attributes=document.get("attributes", {}),
            raw=document.get("raw", {}),
        )

    return None

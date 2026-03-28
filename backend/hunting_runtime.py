"""
Reference runtime helpers for premium hunting providers.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
from typing import Any

from hunting_contracts import (
    VALID_HUNTING_EXECUTION_MODES,
    build_hunting_provider_descriptor,
    build_hunting_query_payload,
    build_hunting_result_document,
    build_hunting_result_payload,
    recommend_hunting_execution_profile,
)


SHERLOCK_SUPPORTED_ARTIFACT_TYPES = {"username", "alias", "account"}
TRUTHY_VALUES = {"1", "true", "yes", "on"}


def _is_truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in TRUTHY_VALUES


def _get_hunting_execution_mode() -> str:
    configured = str(os.getenv("HUNTING_EXECUTION_MODE", "auto") or "auto").strip().lower()
    return configured if configured in VALID_HUNTING_EXECUTION_MODES | {"auto"} else "auto"


def build_hunting_runtime_catalog(exec_runner=None) -> dict[str, Any]:
    configured_mode = _get_hunting_execution_mode()
    sherlock_binary = str(os.getenv("HUNTING_SHERLOCK_BINARY", "sherlock") or "sherlock").strip() or "sherlock"
    native_binary_available = shutil.which(sherlock_binary) is not None
    native_ready = exec_runner is not None or native_binary_available
    isolated_ready = _is_truthy(os.getenv("HUNTING_ISOLATED_RUNTIME_ENABLED"))
    kali_ready = _is_truthy(os.getenv("HUNTING_KALI_RUNTIME_ENABLED"))

    return {
        "configuredMode": configured_mode,
        "modes": {
            "native_local": {
                "mode": "native_local",
                "label": "Native Local",
                "ready": native_ready,
                "wired": native_ready,
                "detail": (
                    f"Binary '{sherlock_binary}' disponível no runtime local."
                    if native_binary_available
                    else "Requer binário local ou exec_runner injetado."
                ),
            },
            "isolated_container": {
                "mode": "isolated_container",
                "label": "Isolated Container",
                "ready": isolated_ready,
                "wired": isolated_ready and exec_runner is not None,
                "detail": (
                    "Lane declarada para providers com dependências pesadas."
                    if isolated_ready
                    else "Lane opcional ainda não declarada neste ambiente."
                ),
            },
            "kali_container": {
                "mode": "kali_container",
                "label": "Kali Container",
                "ready": kali_ready,
                "wired": kali_ready and exec_runner is not None,
                "detail": (
                    "Lane opcional reservada para providers que exigem toolchain Linux privilegiada."
                    if kali_ready
                    else "Lane opcional desativada no runtime atual."
                ),
            },
        },
    }


def resolve_hunting_provider_runtime(provider: dict[str, Any], exec_runner=None) -> dict[str, Any]:
    runtime_catalog = build_hunting_runtime_catalog(exec_runner=exec_runner)
    modes = runtime_catalog["modes"]
    recommended_mode = str(
        provider.get("executionProfile", {}).get("mode")
        or provider.get("isolationMode")
        or "native_local"
    ).strip().lower()
    configured_mode = runtime_catalog["configuredMode"]
    preferred_mode = configured_mode if configured_mode in VALID_HUNTING_EXECUTION_MODES else recommended_mode
    requires_kali = bool(provider.get("requiresKali"))

    active_mode: str | None = None
    state = "blocked"
    blocker: str | None = None

    def is_wired(mode: str) -> bool:
        return bool(modes.get(mode, {}).get("wired"))

    if requires_kali:
        preferred_mode = "kali_container"
        if is_wired("kali_container"):
            active_mode = "kali_container"
            state = "preferred"
        else:
            blocker = "kali_runtime_required"
    else:
        if is_wired(preferred_mode):
            active_mode = preferred_mode
            state = "preferred"
        elif preferred_mode != "native_local" and is_wired("native_local"):
            active_mode = "native_local"
            state = "fallback"
            blocker = f"{preferred_mode}_unavailable"
        elif preferred_mode != "native_local" and modes.get(preferred_mode, {}).get("ready"):
            blocker = "runtime_declared_but_not_wired"
        elif is_wired("native_local"):
            active_mode = "native_local"
            state = "fallback"
            blocker = "recommended_runtime_unavailable"
        else:
            blocker = "provider_runtime_missing"

    return {
        "ready": active_mode is not None,
        "state": state,
        "recommendedMode": recommended_mode,
        "preferredMode": preferred_mode,
        "activeMode": active_mode,
        "requiresKali": requires_kali,
        "availableModes": [mode for mode, meta in modes.items() if meta.get("ready")],
        "wiredModes": [mode for mode, meta in modes.items() if meta.get("wired")],
        "blocker": None if active_mode is not None else blocker,
    }


def build_sherlock_provider_descriptor() -> dict[str, Any]:
    execution_profile = recommend_hunting_execution_profile(
        requires_custom_binaries=True,
        handles_untrusted_targets=True,
        dependency_weight="medium",
    )
    return build_hunting_provider_descriptor(
        key="premium-hunting-sherlock",
        name="Sherlock",
        version="0.1.0",
        artifact_types=["username", "alias", "account"],
        provider_scope=["identity", "social"],
        entrypoint="premium.hunting.sherlock",
        isolation_mode=execution_profile["mode"],
        capabilities=["profile_discovery", "username_enumeration"],
        execution_profile=execution_profile,
        requires_kali=False,
    )


def build_sherlock_command(query_payload: dict[str, Any]) -> list[str]:
    artifact_type = str(query_payload.get("artifact_type") or "").strip().lower()
    query = str(query_payload.get("query") or "").strip()

    if artifact_type not in SHERLOCK_SUPPORTED_ARTIFACT_TYPES:
        raise ValueError(f"unsupported_sherlock_artifact_type:{artifact_type}")
    if not query:
        raise ValueError("query_required")

    return ["sherlock", "--output", "json", query]


async def run_sherlock_query(
    query_payload: dict[str, Any],
    exec_runner=None,
) -> dict[str, Any]:
    command = build_sherlock_command(query_payload)

    if exec_runner is None:
        async def default_runner(argv: list[str]) -> tuple[int, str]:
            proc = await asyncio.create_subprocess_exec(
                *argv,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            output = stdout.decode("utf-8", errors="replace") or stderr.decode("utf-8", errors="replace")
            return proc.returncode, output

        exec_runner = default_runner

    returncode, output = await exec_runner(command)
    if returncode != 0:
        raise RuntimeError(f"sherlock_execution_failed:{returncode}")

    try:
        return json.loads(output or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError(f"sherlock_invalid_json:{exc.msg}") from exc


def normalize_sherlock_results(
    query_payload: dict[str, Any],
    raw_output: dict[str, Any],
) -> list[dict[str, Any]]:
    normalized_results: list[dict[str, Any]] = []

    for platform, details in sorted((raw_output or {}).items()):
        if not isinstance(details, dict):
            continue

        exists = details.get("exists")
        if exists is False:
            continue

        profile_url = details.get("url") or details.get("profile_url") or details.get("link")
        if not profile_url:
            continue

        payload = build_hunting_result_payload(
            title=f"{platform} profile match",
            summary=f"Potential profile match found on {platform}.",
            kind="profile_match",
            confidence=0.7 if exists in (True, "claimed") else 0.55,
            evidence=[{"source": platform, "url": profile_url}],
            attributes={
                "platform": platform,
                "username": query_payload["query"],
                "claimed": exists in (True, "claimed"),
            },
            raw=details,
        )
        normalized_results.append(
            build_hunting_result_document(
                provider_key="premium-hunting-sherlock",
                query_payload=query_payload,
                payload=payload,
                extra_fields={
                    "provider_family": "sherlock",
                    "external_ref": profile_url,
                },
            )
        )

    return normalized_results


def build_sherlock_query(*, artifact_type: str, query: str, analyst: str | None = None) -> dict[str, Any]:
    return build_hunting_query_payload(
        artifact_type=artifact_type,
        query=query,
        analyst=analyst,
    )

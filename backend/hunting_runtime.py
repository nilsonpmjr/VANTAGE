"""
Reference runtime helpers for premium hunting providers.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shlex
import shutil
import tempfile
from typing import Any

from hunting_contracts import (
    VALID_HUNTING_EXECUTION_MODES,
    build_hunting_provider_descriptor,
    build_hunting_query_payload,
    build_hunting_result_document,
    build_hunting_result_payload,
    recommend_hunting_execution_profile,
)


TRUTHY_VALUES = {"1", "true", "yes", "on"}

SHERLOCK_SUPPORTED_ARTIFACT_TYPES = {"username", "alias", "account"}
MAIGRET_SUPPORTED_ARTIFACT_TYPES = {"username", "alias", "account"}
HOLEHE_SUPPORTED_ARTIFACT_TYPES = {"email"}
SOCIALSCAN_SUPPORTED_ARTIFACT_TYPES = {"username", "email", "alias", "account"}
SHERLOCK_FOUND_LINE_RE = re.compile(r"^\[\+\]\s+(?P<platform>[^:]+):\s+(?P<url>https?://\S+)\s*$")


def _is_truthy(value: str | None) -> bool:
    return str(value or "").strip().lower() in TRUTHY_VALUES


def _get_hunting_execution_mode() -> str:
    configured = str(os.getenv("HUNTING_EXECUTION_MODE", "auto") or "auto").strip().lower()
    return configured if configured in VALID_HUNTING_EXECUTION_MODES | {"auto"} else "auto"


def _binary_from_env(env_key: str, fallback: str) -> str:
    return str(os.getenv(env_key, fallback) or fallback).strip() or fallback


def build_hunting_runtime_catalog(exec_runner=None) -> dict[str, Any]:
    configured_mode = _get_hunting_execution_mode()
    sherlock_binary = _binary_from_env("HUNTING_SHERLOCK_BINARY", "sherlock")
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


def build_sherlock_provider_descriptor() -> dict[str, Any]:
    execution_profile = recommend_hunting_execution_profile(
        requires_custom_binaries=True,
        handles_untrusted_targets=True,
        dependency_weight="medium",
    )
    descriptor = build_hunting_provider_descriptor(
        key="premium-hunting-sherlock",
        name="Sherlock",
        version="0.1.0",
        artifact_types=sorted(SHERLOCK_SUPPORTED_ARTIFACT_TYPES),
        provider_scope=["identity", "social"],
        entrypoint="premium.hunting.sherlock",
        isolation_mode=execution_profile["mode"],
        capabilities=["profile_discovery", "username_enumeration"],
        execution_profile=execution_profile,
        requires_kali=False,
    )
    descriptor["runtimeHints"] = {
        "binary": _binary_from_env("HUNTING_SHERLOCK_BINARY", "sherlock"),
        "wired": True,
    }
    return descriptor


def build_maigret_provider_descriptor() -> dict[str, Any]:
    execution_profile = recommend_hunting_execution_profile(
        requires_custom_binaries=True,
        handles_untrusted_targets=True,
        dependency_weight="heavy",
    )
    descriptor = build_hunting_provider_descriptor(
        key="premium-hunting-maigret",
        name="Maigret",
        version="0.1.0",
        artifact_types=sorted(MAIGRET_SUPPORTED_ARTIFACT_TYPES),
        provider_scope=["identity", "social", "correlation"],
        entrypoint="premium.hunting.maigret",
        isolation_mode=execution_profile["mode"],
        capabilities=["profile_discovery", "username_enumeration", "profile_enrichment"],
        execution_profile=execution_profile,
        requires_kali=False,
    )
    descriptor["runtimeHints"] = {
        "binary": _binary_from_env("HUNTING_MAIGRET_BINARY", "maigret"),
        "wired": False,
    }
    return descriptor


def build_holehe_provider_descriptor() -> dict[str, Any]:
    execution_profile = recommend_hunting_execution_profile(
        requires_custom_binaries=True,
        handles_untrusted_targets=True,
        dependency_weight="medium",
    )
    descriptor = build_hunting_provider_descriptor(
        key="premium-hunting-holehe",
        name="Holehe",
        version="0.1.0",
        artifact_types=sorted(HOLEHE_SUPPORTED_ARTIFACT_TYPES),
        provider_scope=["identity", "social", "correlation"],
        entrypoint="premium.hunting.holehe",
        isolation_mode=execution_profile["mode"],
        capabilities=["email_enumeration", "account_presence"],
        execution_profile=execution_profile,
        requires_kali=False,
    )
    descriptor["runtimeHints"] = {
        "binary": _binary_from_env("HUNTING_HOLEHE_BINARY", "holehe"),
        "wired": False,
    }
    return descriptor


def build_socialscan_provider_descriptor() -> dict[str, Any]:
    execution_profile = recommend_hunting_execution_profile(
        requires_custom_binaries=True,
        handles_untrusted_targets=True,
        dependency_weight="medium",
    )
    descriptor = build_hunting_provider_descriptor(
        key="premium-hunting-socialscan",
        name="Socialscan",
        version="0.1.0",
        artifact_types=sorted(SOCIALSCAN_SUPPORTED_ARTIFACT_TYPES),
        provider_scope=["identity", "social", "correlation"],
        entrypoint="premium.hunting.socialscan",
        isolation_mode=execution_profile["mode"],
        capabilities=["username_enumeration", "email_enumeration", "account_presence"],
        execution_profile=execution_profile,
        requires_kali=False,
    )
    descriptor["runtimeHints"] = {
        "binary": _binary_from_env("HUNTING_SOCIALSCAN_BINARY", "socialscan"),
        "wired": False,
    }
    return descriptor


def build_hunting_provider_catalog(exec_runner=None) -> list[dict[str, Any]]:
    providers = [
        build_sherlock_provider_descriptor(),
        build_maigret_provider_descriptor(),
        build_holehe_provider_descriptor(),
        build_socialscan_provider_descriptor(),
    ]
    return [
        {
            **provider,
            "runtimeStatus": resolve_hunting_provider_runtime(provider, exec_runner=exec_runner),
        }
        for provider in providers
    ]


def resolve_hunting_provider_runtime(provider: dict[str, Any], exec_runner=None) -> dict[str, Any]:
    runtime_catalog = build_hunting_runtime_catalog(exec_runner=exec_runner)
    modes = runtime_catalog["modes"]
    runtime_hints = provider.get("runtimeHints") or {}
    binary = str(runtime_hints.get("binary") or "").strip()
    provider_wired = bool(runtime_hints.get("wired"))
    native_binary_available = bool(binary) and shutil.which(binary) is not None

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

    def is_mode_ready(mode: str) -> bool:
        if mode == "native_local":
          return provider_wired and (exec_runner is not None or native_binary_available)
        return bool(modes.get(mode, {}).get("wired")) and provider_wired

    def is_mode_declared(mode: str) -> bool:
        if mode == "native_local":
          return exec_runner is not None or native_binary_available or bool(binary)
        return bool(modes.get(mode, {}).get("ready"))

    if requires_kali:
        preferred_mode = "kali_container"

    if is_mode_ready(preferred_mode):
        active_mode = preferred_mode
        state = "preferred"
    elif preferred_mode != "native_local" and is_mode_ready("native_local"):
        active_mode = "native_local"
        state = "fallback"
        blocker = f"{preferred_mode}_unavailable"
    elif is_mode_declared(preferred_mode):
        blocker = "runtime_declared_but_not_wired"
    elif is_mode_ready("native_local"):
        active_mode = "native_local"
        state = "fallback"
        blocker = "recommended_runtime_unavailable"
    elif provider_wired:
        blocker = "provider_runtime_missing"
    else:
        blocker = "runtime_declared_but_not_wired"

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


def build_sherlock_command(query_payload: dict[str, Any]) -> list[str]:
    artifact_type = str(query_payload.get("artifact_type") or "").strip().lower()
    query = str(query_payload.get("query") or "").strip()

    if artifact_type not in SHERLOCK_SUPPORTED_ARTIFACT_TYPES:
        raise ValueError(f"unsupported_sherlock_artifact_type:{artifact_type}")
    if not query:
        raise ValueError("query_required")

    return [
        _binary_from_env("HUNTING_SHERLOCK_BINARY", "sherlock"),
        "--print-found",
        "--no-color",
        "--no-txt",
        "--timeout",
        str(int(os.getenv("HUNTING_SHERLOCK_REQUEST_TIMEOUT", "12") or "12")),
        query,
    ]


async def run_sherlock_query(
    query_payload: dict[str, Any],
    exec_runner=None,
) -> dict[str, Any]:
    command = build_sherlock_command(query_payload)

    if exec_runner is None:
        async def default_runner(argv: list[str]) -> tuple[int, str]:
            process_timeout = str(int(float(os.getenv("HUNTING_SHELL_PROCESS_TIMEOUT", "45") or "45")))
            with tempfile.NamedTemporaryFile(prefix="hunting-runtime-", suffix=".log", delete=False) as handle:
                capture_path = handle.name
            command = " ".join(shlex.quote(part) for part in argv)
            shell_command = f"timeout {shlex.quote(process_timeout)} {command} > {shlex.quote(capture_path)} 2>&1"
            proc = await asyncio.create_subprocess_shell(shell_command)
            await proc.communicate()
            try:
                with open(capture_path, "r", encoding="utf-8", errors="replace") as capture_file:
                    output = capture_file.read()
            finally:
                try:
                    os.remove(capture_path)
                except FileNotFoundError:
                    pass
            return proc.returncode, output

        exec_runner = default_runner

    returncode, output = await exec_runner(command)
    if returncode != 0 and "[+]" not in output:
        raise RuntimeError(f"sherlock_execution_failed:{returncode}")
    stripped = (output or "").strip()
    if stripped.startswith("{"):
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass
    return output or ""


def normalize_sherlock_results(
    query_payload: dict[str, Any],
    raw_output: dict[str, Any] | str,
) -> list[dict[str, Any]]:
    normalized_results: list[dict[str, Any]] = []

    if isinstance(raw_output, str):
        parsed_output: dict[str, dict[str, Any]] = {}
        for line in raw_output.splitlines():
            match = SHERLOCK_FOUND_LINE_RE.match(line.strip())
            if not match:
                continue
            platform = match.group("platform").strip().lower()
            parsed_output[platform] = {
                "exists": True,
                "url": match.group("url").strip(),
            }
        raw_output = parsed_output

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


def get_hunting_provider_registry() -> dict[str, dict[str, Any]]:
    return {
        "premium-hunting-sherlock": {
            "supported_artifact_types": SHERLOCK_SUPPORTED_ARTIFACT_TYPES,
            "build_query": build_sherlock_query,
            "run_query": run_sherlock_query,
            "normalize_results": normalize_sherlock_results,
            "wired": True,
        },
        "premium-hunting-maigret": {
            "supported_artifact_types": MAIGRET_SUPPORTED_ARTIFACT_TYPES,
            "build_query": None,
            "run_query": None,
            "normalize_results": None,
            "wired": False,
        },
        "premium-hunting-holehe": {
            "supported_artifact_types": HOLEHE_SUPPORTED_ARTIFACT_TYPES,
            "build_query": None,
            "run_query": None,
            "normalize_results": None,
            "wired": False,
        },
        "premium-hunting-socialscan": {
            "supported_artifact_types": SOCIALSCAN_SUPPORTED_ARTIFACT_TYPES,
            "build_query": None,
            "run_query": None,
            "normalize_results": None,
            "wired": False,
        },
    }

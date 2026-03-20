"""
Reference runtime helpers for premium hunting providers.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from hunting_contracts import (
    build_hunting_provider_descriptor,
    build_hunting_query_payload,
    build_hunting_result_document,
    build_hunting_result_payload,
    recommend_hunting_execution_profile,
)


SHERLOCK_SUPPORTED_ARTIFACT_TYPES = {"username", "alias", "account"}


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

from __future__ import annotations

import json

import pytest

from hunting_runtime import (
    build_holehe_provider_descriptor,
    build_hunting_provider_catalog,
    build_maigret_provider_descriptor,
    build_socialscan_provider_descriptor,
    build_hunting_runtime_catalog,
    build_sherlock_command,
    build_sherlock_provider_descriptor,
    build_sherlock_query,
    normalize_sherlock_results,
    resolve_hunting_provider_runtime,
    run_sherlock_query,
)


def test_build_sherlock_provider_descriptor_chooses_isolated_container_without_kali():
    descriptor = build_sherlock_provider_descriptor()

    assert descriptor["key"] == "premium-hunting-sherlock"
    assert descriptor["isolationMode"] == "isolated_container"
    assert descriptor["requiresKali"] is False
    assert descriptor["executionProfile"]["mode"] == "isolated_container"
    assert descriptor["runtimeHints"]["wired"] is True


def test_additional_hunting_provider_descriptors_are_declared_but_not_wired():
    maigret = build_maigret_provider_descriptor()
    holehe = build_holehe_provider_descriptor()
    socialscan = build_socialscan_provider_descriptor()

    assert maigret["runtimeHints"]["wired"] is False
    assert holehe["runtimeHints"]["wired"] is False
    assert socialscan["runtimeHints"]["wired"] is False
    assert "email" in holehe["artifactTypes"]
    assert "email" in socialscan["artifactTypes"]


def test_build_sherlock_command_only_accepts_supported_artifact_types():
    query_payload = build_sherlock_query(artifact_type="username", query="example_user")
    assert build_sherlock_command(query_payload) == [
        "sherlock",
        "--print-found",
        "--no-color",
        "--no-txt",
        "--timeout",
        "12",
        "example_user",
    ]

    with pytest.raises(ValueError, match="unsupported_sherlock_artifact_type:email"):
        build_sherlock_command(build_sherlock_query(artifact_type="email", query="user@example.com"))


def test_build_hunting_runtime_catalog_reports_native_and_optional_lanes(monkeypatch):
    monkeypatch.setenv("HUNTING_ISOLATED_RUNTIME_ENABLED", "true")
    monkeypatch.setenv("HUNTING_KALI_RUNTIME_ENABLED", "false")
    monkeypatch.setattr("hunting_runtime.shutil.which", lambda _: "/usr/bin/sherlock")

    catalog = build_hunting_runtime_catalog()

    assert catalog["configuredMode"] == "auto"
    assert catalog["modes"]["native_local"]["ready"] is True
    assert catalog["modes"]["isolated_container"]["ready"] is True
    assert catalog["modes"]["kali_container"]["ready"] is False


def test_resolve_hunting_provider_runtime_falls_back_to_native_local_when_container_not_wired(monkeypatch):
    monkeypatch.setenv("HUNTING_ISOLATED_RUNTIME_ENABLED", "true")
    monkeypatch.delenv("HUNTING_KALI_RUNTIME_ENABLED", raising=False)
    monkeypatch.setattr("hunting_runtime.shutil.which", lambda _: "/usr/bin/sherlock")

    runtime = resolve_hunting_provider_runtime(build_sherlock_provider_descriptor())

    assert runtime["ready"] is True
    assert runtime["state"] == "fallback"
    assert runtime["recommendedMode"] == "isolated_container"
    assert runtime["activeMode"] == "native_local"


def test_resolve_hunting_provider_runtime_marks_declared_but_unwired_provider(monkeypatch):
    monkeypatch.setattr("hunting_runtime.shutil.which", lambda _: None)

    runtime = resolve_hunting_provider_runtime(build_maigret_provider_descriptor())

    assert runtime["ready"] is False
    assert runtime["blocker"] == "runtime_declared_but_not_wired"


def test_build_hunting_provider_catalog_returns_multiple_providers(monkeypatch):
    monkeypatch.setattr("hunting_runtime.shutil.which", lambda _: None)

    providers = build_hunting_provider_catalog()
    keys = {provider["key"] for provider in providers}

    assert keys == {
        "premium-hunting-sherlock",
        "premium-hunting-maigret",
        "premium-hunting-holehe",
        "premium-hunting-socialscan",
    }


@pytest.mark.asyncio
async def test_run_sherlock_query_uses_injected_runner_and_parses_json():
    async def fake_runner(argv):
        assert argv == [
            "sherlock",
            "--print-found",
            "--no-color",
            "--no-txt",
            "--timeout",
            "12",
            "example_user",
        ]
        return 0, json.dumps({"github": {"exists": True, "url": "https://github.com/example_user"}})

    result = await run_sherlock_query(
        build_sherlock_query(artifact_type="username", query="example_user"),
        exec_runner=fake_runner,
    )

    assert result["github"]["url"] == "https://github.com/example_user"


def test_normalize_sherlock_results_returns_canonical_documents():
    query_payload = build_sherlock_query(artifact_type="username", query="example_user", analyst="alice")
    raw_output = {
        "github": {"exists": True, "url": "https://github.com/example_user"},
        "twitter": {"exists": False, "url": "https://x.com/example_user"},
        "mastodon": {"exists": "claimed", "url": "https://mastodon.social/@example_user"},
    }

    results = normalize_sherlock_results(query_payload, raw_output)

    assert len(results) == 2
    assert results[0]["provider_key"] == "premium-hunting-sherlock"
    assert results[0]["artifact_type"] == "username"
    assert results[0]["kind"] == "profile_match"
    assert results[0]["data"]["attributes"]["platform"] == "github"
    assert results[1]["data"]["attributes"]["platform"] == "mastodon"


def test_normalize_sherlock_results_supports_text_stdout_format():
    query_payload = build_sherlock_query(artifact_type="username", query="nilsonpmjr", analyst="alice")
    raw_output = """
[*] Checking username nilsonpmjr on:
[+] ArtStation: https://www.artstation.com/nilsonpmjr
[+] GitHub: https://github.com/nilsonpmjr
"""

    results = normalize_sherlock_results(query_payload, raw_output)

    assert len(results) == 2
    assert results[0]["provider_key"] == "premium-hunting-sherlock"
    assert results[0]["external_ref"].startswith("https://")

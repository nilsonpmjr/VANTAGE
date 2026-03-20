from __future__ import annotations

import json

import pytest

from hunting_runtime import (
    build_sherlock_command,
    build_sherlock_provider_descriptor,
    build_sherlock_query,
    normalize_sherlock_results,
    run_sherlock_query,
)


def test_build_sherlock_provider_descriptor_chooses_isolated_container_without_kali():
    descriptor = build_sherlock_provider_descriptor()

    assert descriptor["key"] == "premium-hunting-sherlock"
    assert descriptor["isolationMode"] == "isolated_container"
    assert descriptor["requiresKali"] is False
    assert descriptor["executionProfile"]["mode"] == "isolated_container"


def test_build_sherlock_command_only_accepts_supported_artifact_types():
    query_payload = build_sherlock_query(artifact_type="username", query="example_user")
    assert build_sherlock_command(query_payload) == ["sherlock", "--output", "json", "example_user"]

    with pytest.raises(ValueError, match="unsupported_sherlock_artifact_type:email"):
        build_sherlock_command(build_sherlock_query(artifact_type="email", query="user@example.com"))


@pytest.mark.asyncio
async def test_run_sherlock_query_uses_injected_runner_and_parses_json():
    async def fake_runner(argv):
        assert argv == ["sherlock", "--output", "json", "example_user"]
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

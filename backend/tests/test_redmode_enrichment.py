"""RedMode enrichment is explicit, cached, isolated, and non-authoritative."""

from datetime import datetime, timedelta, timezone

import httpx
import pytest

from auth import create_access_token
from redmode_enrichment import (
    ProviderQueryError,
    ProviderRateLimitError,
    RdapHttpProvider,
    enrichment_runtime,
)


def headers_for(username: str, role: str = "tech") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


class MemorySourceTexts:
    def __init__(self):
        self.files = {}

    async def save(self, filename, content, metadata):
        file_id = f"representation-{len(self.files) + 1}"
        self.files[file_id] = content
        return file_id

    async def read(self, file_id):
        return self.files[file_id]

    async def delete(self, file_id):
        self.files.pop(file_id, None)


class FakeProvider:
    key = "fake-asn"
    supported_kinds = frozenset({"ip", "cidr", "asn"})

    def __init__(self, *, mode="external", responses=None):
        self.mode = mode
        self.responses = list(responses or [{
            "asn": "AS64500",
            "organization": "Example Network",
            "prefix": "192.0.2.0/24",
            "source": "fake-registry",
        }])
        self.calls = []

    async def lookup(self, kind, canonical):
        self.calls.append((kind, canonical))
        response = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(response, Exception):
            raise response
        return response


@pytest.fixture(autouse=True)
def isolated_runtime(monkeypatch):
    import routers.redmode as redmode

    store = MemorySourceTexts()
    monkeypatch.setattr(redmode, "source_text_store", lambda: store)
    enrichment_runtime.reset()
    yield
    enrichment_runtime.reset()


async def create_project(async_client, slug="cliente-demo"):
    response = await async_client.post(
        "/api/redmode/projects",
        json={"slug": slug, "display_name": slug.replace("-", " ").title()},
        headers=headers_for("admin", "admin"),
    )
    assert response.status_code == 201


async def publish_scope(async_client, slug="cliente-demo", text="192.0.2.10"):
    response = await async_client.post(
        f"/api/redmode/projects/{slug}/scope/text",
        json={"text": text},
        headers=headers_for("admin", "admin"),
    )
    assert response.status_code == 201
    return response.json()


async def change_policy(async_client, mode, slug="cliente-demo", revision=0):
    response = await async_client.put(
        f"/api/redmode/projects/{slug}/enrichment/policy",
        json={"mode": mode, "expected_revision": revision},
        headers=headers_for("admin", "admin"),
    )
    assert response.status_code == 200
    return response.json()


async def first_asset(async_client, version, slug="cliente-demo", kind=None):
    query = f"?kind={kind}" if kind else ""
    response = await async_client.get(
        f"/api/redmode/projects/{slug}/scope/versions/{version['id']}/assets{query}",
        headers=headers_for("admin", "admin"),
    )
    assert response.status_code == 200
    return response.json()["items"][0]


def enrichment_path(slug, version_id, asset_id):
    return (
        f"/api/redmode/projects/{slug}/scope/versions/{version_id}"
        f"/assets/{asset_id}/enrichment"
    )


@pytest.mark.asyncio
async def test_policy_defaults_disabled_and_only_responsible_can_change_it(
    async_client,
    fake_db,
):
    await create_project(async_client)
    policy = await async_client.get(
        "/api/redmode/projects/cliente-demo/enrichment/policy",
        headers=headers_for("admin", "admin"),
    )
    assert policy.status_code == 200
    assert policy.json()["mode"] == "disabled"
    assert policy.json()["configured"] is False

    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"extra_permissions": ["redmode:access"]}},
    )
    await async_client.put(
        "/api/redmode/projects/cliente-demo/members/techuser",
        headers=headers_for("admin", "admin"),
    )
    denied = await async_client.put(
        "/api/redmode/projects/cliente-demo/enrichment/policy",
        json={"mode": "local_only", "expected_revision": 0},
        headers=headers_for("techuser"),
    )
    assert denied.status_code == 403

    changed = await change_policy(async_client, "local_only")
    assert changed["revision"] == 1
    activity = await async_client.get(
        "/api/redmode/projects/cliente-demo/activity",
        headers=headers_for("admin", "admin"),
    )
    assert activity.json()["items"][-1]["type"] == "enrichment_policy_changed"
    assert activity.json()["items"][-1]["subject"] == "disabled -> local_only"


@pytest.mark.asyncio
async def test_publication_never_calls_provider_and_disabled_policy_blocks_query(
    async_client,
    monkeypatch,
):
    import routers.redmode as redmode

    provider = FakeProvider()
    monkeypatch.setattr(redmode, "get_scope_enrichment_providers", lambda: [provider])
    monkeypatch.setattr(redmode.settings, "redmode_enrichment_external_enabled", True)
    await create_project(async_client)
    version = await publish_scope(async_client)
    assert provider.calls == []
    asset = await first_asset(async_client, version)
    assert asset["enrichment"] == {"state": "not_configured"}

    blocked = await async_client.post(
        enrichment_path("cliente-demo", version["id"], asset["asset_id"]),
        headers=headers_for("admin", "admin"),
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "enrichment_policy_disabled"
    assert provider.calls == []


@pytest.mark.asyncio
async def test_provider_must_match_project_and_installation_policy(async_client, monkeypatch):
    import routers.redmode as redmode

    provider = FakeProvider(mode="external")
    monkeypatch.setattr(redmode, "get_scope_enrichment_providers", lambda: [provider])
    monkeypatch.setattr(redmode.settings, "redmode_enrichment_external_enabled", False)
    await create_project(async_client)
    version = await publish_scope(async_client)
    asset = await first_asset(async_client, version)

    local_policy = await change_policy(async_client, "local_only")
    assert local_policy["configured"] is False
    absent = await async_client.post(
        enrichment_path("cliente-demo", version["id"], asset["asset_id"]),
        headers=headers_for("admin", "admin"),
    )
    assert absent.status_code == 200
    assert absent.json()["enrichment"]["state"] == "not_configured"

    external_policy = await change_policy(
        async_client,
        "external_allowed",
        revision=local_policy["revision"],
    )
    assert external_policy["configured"] is False
    assert provider.calls == []


@pytest.mark.asyncio
async def test_available_result_is_cached_visible_and_never_authoritative(
    async_client,
    fake_db,
    monkeypatch,
):
    import routers.redmode as redmode

    provider = FakeProvider()
    monkeypatch.setattr(redmode, "get_scope_enrichment_providers", lambda: [provider])
    monkeypatch.setattr(redmode.settings, "redmode_enrichment_external_enabled", True)
    await create_project(async_client)
    version = await publish_scope(async_client, text="192.0.2.10\n192.0.2.0/24")
    await change_policy(async_client, "external_allowed")
    asset = await first_asset(async_client, version, kind="ip")
    before = [(item["kind"], item["value"]) for item in version["rules"]]

    path = enrichment_path("cliente-demo", version["id"], asset["asset_id"])
    first = await async_client.post(path, headers=headers_for("admin", "admin"))
    second = await async_client.post(path, headers=headers_for("admin", "admin"))
    assert first.status_code == second.status_code == 200
    enriched = second.json()
    assert enriched["value"] == "192.0.2.10"
    assert enriched["original_value"] == "192.0.2.10"
    assert enriched["enrichment"]["state"] == "available"
    assert enriched["enrichment"]["asn"] == "AS64500"
    assert enriched["enrichment"]["prefix"] == "192.0.2.0/24"
    assert provider.calls == [("ip", "192.0.2.10")]
    assert fake_db.redmode_enrichment_cache._data[0]["attempts"] == 1

    active = await async_client.get(
        "/api/redmode/projects/cliente-demo/scope/active",
        headers=headers_for("admin", "admin"),
    )
    assert [(item["kind"], item["value"]) for item in active.json()["rules"]] == before
    listed = await async_client.get(
        f"/api/redmode/projects/cliente-demo/scope/versions/{version['id']}/assets",
        headers=headers_for("admin", "admin"),
    )
    listed_values = {(item["kind"], item["value"]) for item in listed.json()["items"]}
    assert listed_values == {("ip", "192.0.2.10"), ("cidr", "192.0.2.0/24")}
    assert ("asn", "AS64500") not in listed_values

    identity = await async_client.get(
        "/api/redmode/projects/cliente-demo/identity",
        headers=headers_for("admin", "admin"),
    )
    suggestion = next(item for item in identity.json()["suggestions"] if item["value"] == "AS64500")
    assert suggestion["origins"][0]["classification"] == "enriched"


@pytest.mark.asyncio
async def test_expired_and_failed_queries_can_be_retried(async_client, fake_db, monkeypatch):
    import routers.redmode as redmode

    provider = FakeProvider(responses=[
        {"asn": "AS64500", "organization": "First", "prefix": "192.0.2.0/24", "source": "fake"},
        ProviderQueryError("temporary_failure"),
        {"asn": "AS64501", "organization": "Recovered", "prefix": "192.0.2.0/24", "source": "fake"},
    ])
    monkeypatch.setattr(redmode, "get_scope_enrichment_providers", lambda: [provider])
    monkeypatch.setattr(redmode.settings, "redmode_enrichment_external_enabled", True)
    await create_project(async_client)
    version = await publish_scope(async_client)
    await change_policy(async_client, "external_allowed")
    asset = await first_asset(async_client, version)
    path = enrichment_path("cliente-demo", version["id"], asset["asset_id"])

    available = await async_client.post(path, headers=headers_for("admin", "admin"))
    assert available.json()["enrichment"]["state"] == "available"
    fake_db.redmode_enrichment_cache._data[0]["expires_at"] = (
        datetime.now(timezone.utc) - timedelta(seconds=1)
    )
    failed = await async_client.post(path, headers=headers_for("admin", "admin"))
    assert failed.json()["enrichment"]["state"] == "failed"
    assert failed.json()["enrichment"]["error_code"] == "temporary_failure"
    recovered = await async_client.post(path, headers=headers_for("admin", "admin"))
    assert recovered.json()["enrichment"]["state"] == "available"
    assert recovered.json()["enrichment"]["asn"] == "AS64501"
    assert len(provider.calls) == 3
    assert fake_db.redmode_enrichment_cache._data[0]["attempts"] == 3


@pytest.mark.asyncio
async def test_cache_does_not_leak_into_another_engagement(async_client, monkeypatch):
    import routers.redmode as redmode

    provider = FakeProvider()
    monkeypatch.setattr(redmode, "get_scope_enrichment_providers", lambda: [provider])
    monkeypatch.setattr(redmode.settings, "redmode_enrichment_external_enabled", True)
    await create_project(async_client, "cliente-um")
    first_version = await publish_scope(async_client, "cliente-um")
    await change_policy(async_client, "external_allowed", "cliente-um")
    first = await first_asset(async_client, first_version, "cliente-um")
    await async_client.post(
        enrichment_path("cliente-um", first_version["id"], first["asset_id"]),
        headers=headers_for("admin", "admin"),
    )

    await create_project(async_client, "cliente-dois")
    second_version = await publish_scope(async_client, "cliente-dois")
    second = await first_asset(async_client, second_version, "cliente-dois")
    assert second["enrichment"] == {"state": "not_configured"}
    assert second["normalized"]["enrichments"] == []
    denied = await async_client.post(
        enrichment_path("cliente-dois", second_version["id"], second["asset_id"]),
        headers=headers_for("admin", "admin"),
    )
    assert denied.status_code == 403
    assert len(provider.calls) == 1


@pytest.mark.asyncio
async def test_local_provider_works_without_external_installation_flag(async_client, monkeypatch):
    import routers.redmode as redmode

    provider = FakeProvider(mode="local")
    monkeypatch.setattr(redmode, "get_scope_enrichment_providers", lambda: [provider])
    monkeypatch.setattr(redmode.settings, "redmode_enrichment_external_enabled", False)
    await create_project(async_client)
    version = await publish_scope(async_client)
    policy = await change_policy(async_client, "local_only")
    assert policy["configured"] is True
    asset = await first_asset(async_client, version)
    response = await async_client.post(
        enrichment_path("cliente-demo", version["id"], asset["asset_id"]),
        headers=headers_for("admin", "admin"),
    )
    assert response.json()["enrichment"]["provider_mode"] == "local"


@pytest.mark.asyncio
async def test_domain_is_not_enriched_or_resolved(async_client, monkeypatch):
    import routers.redmode as redmode

    provider = FakeProvider()
    monkeypatch.setattr(redmode, "get_scope_enrichment_providers", lambda: [provider])
    monkeypatch.setattr(redmode.settings, "redmode_enrichment_external_enabled", True)
    await create_project(async_client)
    version = await publish_scope(async_client, text="example.com")
    await change_policy(async_client, "external_allowed")
    asset = await first_asset(async_client, version)
    response = await async_client.post(
        enrichment_path("cliente-demo", version["id"], asset["asset_id"]),
        headers=headers_for("admin", "admin"),
    )
    assert response.status_code == 422
    assert provider.calls == []


@pytest.mark.asyncio
async def test_rdap_adapter_parses_one_canonical_lookup_without_discovery():
    requests = []

    def handler(request: httpx.Request):
        requests.append(str(request.url))
        return httpx.Response(200, json={
            "startAutnum": 64500,
            "name": "Example Network",
            "cidr0_cidrs": [{"v4prefix": "192.0.2.0", "length": 24}],
            "port43": "registry.example",
        })

    provider = RdapHttpProvider(
        "https://rdap.example/api",
        transport=httpx.MockTransport(handler),
    )
    result = await provider.lookup("cidr", "192.0.2.0/24")
    assert requests == ["https://rdap.example/api/ip/192.0.2.0"]
    assert result == {
        "asn": "AS64500",
        "organization": "Example Network",
        "prefix": "192.0.2.0/24",
        "source": "registry.example",
    }


@pytest.mark.asyncio
async def test_runtime_enforces_provider_rate_limit(monkeypatch):
    import redmode_enrichment

    provider = FakeProvider(mode="local")
    monkeypatch.setattr(redmode_enrichment.settings, "redmode_enrichment_rate_limit_per_minute", 1)
    await enrichment_runtime.query(provider, "ip", "192.0.2.10")
    with pytest.raises(ProviderRateLimitError):
        await enrichment_runtime.query(provider, "ip", "192.0.2.11")
    assert provider.calls == [("ip", "192.0.2.10")]

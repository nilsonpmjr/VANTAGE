from auth import create_access_token


async def test_list_hunting_providers_returns_initial_catalog(async_client):
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.get(
        "/api/hunting/providers",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 1
    provider = data["items"][0]
    assert provider["key"] == "premium-hunting-sherlock"
    assert provider["premiumFeatureType"] == "hunting_provider"


async def test_hunting_search_returns_normalized_results(async_client, fake_db):
    token = create_access_token({"sub": "techuser", "role": "tech"})

    async def fake_runner(argv):
        assert argv[:3] == ["sherlock", "--output", "json"]
        return 0, '{"github":{"exists":true,"url":"https://github.com/example"}}'

    async_client._transport.app.state.hunting_exec_runner = fake_runner
    resp = await async_client.post(
        "/api/hunting/search",
        json={"artifact_type": "username", "query": "example"},
        headers={"Authorization": f"Bearer {token}"},
    )

    del async_client._transport.app.state.hunting_exec_runner

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_results"] == 1
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["status"] == "ok"
    assert item["provider"]["key"] == "premium-hunting-sherlock"
    assert item["query"]["artifact_type"] == "username"
    assert item["results"][0]["provider_key"] == "premium-hunting-sherlock"
    assert item["results"][0]["data"]["attributes"]["platform"] == "github"
    assert len(fake_db.hunting_results._data) == 1
    assert fake_db.hunting_results._data[0]["search_id"]
    audit = await fake_db.audit_log.find_one({"action": "premium_hunting_search"})
    assert audit is not None
    assert audit["result"] == "success"

async def test_hunting_search_reports_unsupported_artifact_per_provider(async_client, fake_db):
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.post(
        "/api/hunting/search",
        json={"artifact_type": "email", "query": "person@example.com"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_results"] == 0
    assert data["items"][0]["status"] == "unsupported"
    assert data["items"][0]["error"] == "unsupported_artifact_type:email"
    audit = await fake_db.audit_log.find_one({"action": "premium_hunting_search"})
    assert audit is not None
    assert audit["result"] == "success"

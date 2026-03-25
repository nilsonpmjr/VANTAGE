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


async def test_saved_hunting_search_lifecycle(async_client, fake_db):
    token = create_access_token({"sub": "techuser", "role": "tech"})

    create_resp = await async_client.post(
        "/api/hunting/saved-searches",
        json={
            "name": "Investigate johndoe",
            "artifact_type": "username",
            "query": "johndoe",
            "provider_keys": ["premium-hunting-sherlock"],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 201
    saved_id = create_resp.json()["item"]["_id"]

    list_resp = await async_client.get(
        "/api/hunting/saved-searches",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_resp.status_code == 200
    assert len(list_resp.json()["items"]) == 1

    delete_resp = await async_client.delete(
        f"/api/hunting/saved-searches/{saved_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert delete_resp.status_code == 200


async def test_hunting_case_notes_persist_per_search(async_client, fake_db):
    token = create_access_token({"sub": "techuser", "role": "tech"})

    note_resp = await async_client.post(
        "/api/hunting/case-notes",
        json={"search_id": "search-123", "note": "Escalate this handle for manual review."},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert note_resp.status_code == 201

    list_resp = await async_client.get(
        "/api/hunting/case-notes",
        params={"search_id": "search-123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert list_resp.status_code == 200
    assert list_resp.json()["items"][0]["note"] == "Escalate this handle for manual review."


async def test_recent_hunting_searches_group_by_search_id(async_client, fake_db):
    token = create_access_token({"sub": "techuser", "role": "tech"})
    fake_db.hunting_results._data.extend(
        [
            {
                "_id": "r1",
                "search_id": "search-1",
                "search_timestamp": "2026-03-24T00:00:00+00:00",
                "timestamp": "2026-03-24T00:00:00+00:00",
                "analyst": "techuser",
                "artifact_type": "username",
                "query": "alice",
                "provider_key": "premium-hunting-sherlock",
            },
            {
                "_id": "r2",
                "search_id": "search-1",
                "search_timestamp": "2026-03-24T00:00:00+00:00",
                "timestamp": "2026-03-24T00:00:00+00:00",
                "analyst": "techuser",
                "artifact_type": "username",
                "query": "alice",
                "provider_key": "premium-hunting-sherlock",
            },
        ]
    )

    resp = await async_client.get(
        "/api/hunting/recent-searches",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["result_count"] == 2

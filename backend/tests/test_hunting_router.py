from auth import create_access_token


async def test_list_hunting_providers_returns_initial_catalog(async_client):
    token = create_access_token({"sub": "techuser", "role": "tech"})
    resp = await async_client.get(
        "/api/hunting/providers",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 4
    assert "runtime" in data
    keys = {provider["key"] for provider in data["items"]}
    assert keys == {
        "premium-hunting-sherlock",
        "premium-hunting-maigret",
        "premium-hunting-holehe",
        "premium-hunting-socialscan",
    }
    for provider in data["items"]:
        assert provider["premiumFeatureType"] == "hunting_provider"
        assert "runtimeStatus" in provider


async def test_hunting_search_returns_normalized_results(async_client, fake_db):
    token = create_access_token({"sub": "techuser", "role": "tech"})

    async def fake_runner(argv):
        assert argv[:6] == ["sherlock", "--print-found", "--no-color", "--no-txt", "--timeout", "12"]
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
    assert len(data["items"]) == 4
    sherlock_item = next(item for item in data["items"] if item["provider"]["key"] == "premium-hunting-sherlock")
    assert sherlock_item["status"] == "ok"
    assert sherlock_item["query"]["artifact_type"] == "username"
    assert sherlock_item["results"][0]["provider_key"] == "premium-hunting-sherlock"
    assert sherlock_item["results"][0]["data"]["attributes"]["platform"] == "github"
    assert any(item["status"] == "error" for item in data["items"] if item["provider"]["key"] != "premium-hunting-sherlock")
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
    assert any(item["status"] == "unsupported" for item in data["items"])
    assert any(item["status"] == "error" for item in data["items"])
    audit = await fake_db.audit_log.find_one({"action": "premium_hunting_search"})
    assert audit is not None
    assert audit["result"] == "failure"


async def test_hunting_search_reports_runtime_missing_when_provider_is_not_ready(async_client):
    token = create_access_token({"sub": "techuser", "role": "tech"})

    import hunting.runtime as hunting_runtime

    original = hunting_runtime.resolve_hunting_provider_runtime
    hunting_runtime.resolve_hunting_provider_runtime = lambda provider, exec_runner=None: {
        "ready": False,
        "state": "blocked",
        "recommendedMode": "isolated_container",
        "preferredMode": "isolated_container",
        "activeMode": None,
        "requiresKali": False,
        "availableModes": [],
        "wiredModes": [],
        "blocker": "provider_runtime_missing",
    }
    try:
        resp = await async_client.post(
            "/api/hunting/search",
            json={"artifact_type": "username", "query": "example"},
            headers={"Authorization": f"Bearer {token}"},
        )
    finally:
        hunting_runtime.resolve_hunting_provider_runtime = original

    assert resp.status_code == 200
    data = resp.json()
    sherlock_item = next(item for item in data["items"] if item["provider"]["key"] == "premium-hunting-sherlock")
    assert sherlock_item["status"] == "error"
    assert sherlock_item["error"] == "provider_runtime_missing"


async def test_hunting_search_nilsonpmjr_reports_no_executable_coverage(async_client, fake_db, monkeypatch):
    token = create_access_token({"sub": "techuser", "role": "tech"})

    monkeypatch.setattr("hunting_runtime.shutil.which", lambda _: None)

    resp = await async_client.post(
        "/api/hunting/search",
        json={"artifact_type": "username", "query": "nilsonpmjr"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total_results"] == 0
    assert any(item["status"] == "error" for item in data["items"])
    assert any(item["status"] == "unsupported" for item in data["items"])
    audit = await fake_db.audit_log.find_one({"action": "premium_hunting_search"})
    assert audit is not None
    assert audit["result"] == "failure"


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


async def test_get_hunting_search_rehydrates_persisted_results(async_client, fake_db):
    token = create_access_token({"sub": "techuser", "role": "tech"})
    fake_db.hunting_results._data.extend(
        [
            {
                "_id": "r1",
                "search_id": "search-42",
                "search_timestamp": "2026-03-24T00:00:00+00:00",
                "timestamp": "2026-03-24T00:00:00+00:00",
                "analyst": "techuser",
                "artifact_type": "username",
                "query": "nilsonpmjr",
                "provider_key": "premium-hunting-sherlock",
                "title": "github profile match",
                "summary": "Potential profile match found on github.",
                "kind": "profile_match",
                "confidence": 0.7,
                "data": {
                    "title": "github profile match",
                    "summary": "Potential profile match found on github.",
                    "kind": "profile_match",
                    "confidence": 0.7,
                    "attributes": {"platform": "github", "username": "nilsonpmjr"},
                    "evidence": [{"source": "github", "url": "https://github.com/nilsonpmjr"}],
                    "raw": {"exists": True, "url": "https://github.com/nilsonpmjr"},
                },
                "provider_family": "sherlock",
                "external_ref": "https://github.com/nilsonpmjr",
            },
            {
                "_id": "r2",
                "search_id": "search-42",
                "search_timestamp": "2026-03-24T00:00:00+00:00",
                "timestamp": "2026-03-24T00:00:00+00:00",
                "analyst": "techuser",
                "artifact_type": "username",
                "query": "nilsonpmjr",
                "provider_key": "premium-hunting-sherlock",
                "title": "docker hub profile match",
                "summary": "Potential profile match found on docker hub.",
                "kind": "profile_match",
                "confidence": 0.7,
                "data": {
                    "title": "docker hub profile match",
                    "summary": "Potential profile match found on docker hub.",
                    "kind": "profile_match",
                    "confidence": 0.7,
                    "attributes": {"platform": "docker hub", "username": "nilsonpmjr"},
                    "evidence": [{"source": "docker hub", "url": "https://hub.docker.com/u/nilsonpmjr/"}],
                    "raw": {"exists": True, "url": "https://hub.docker.com/u/nilsonpmjr/"},
                },
                "provider_family": "sherlock",
                "external_ref": "https://hub.docker.com/u/nilsonpmjr/",
            },
        ]
    )

    resp = await async_client.get(
        "/api/hunting/searches/search-42",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["search_id"] == "search-42"
    assert data["query"]["query"] == "nilsonpmjr"
    assert data["total_results"] == 2
    assert len(data["items"]) == 1
    assert data["items"][0]["provider"]["key"] == "premium-hunting-sherlock"
    assert len(data["items"][0]["results"]) == 2

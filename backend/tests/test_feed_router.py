from auth import create_access_token


async def test_feed_modeling_snapshot_returns_editorial_readiness(async_client, fake_db):
    token = create_access_token({"sub": "techuser", "role": "tech"})
    fake_db.threat_items._data.extend(
        [
            {
                "_id": "rss-1",
                "source_type": "rss",
                "family": "fortinet",
                "source_name": "Fortinet Threat Signal",
                "editorial": {
                    "story_kind": "campaign",
                    "topics": ["ransomware", "vulnerability"],
                    "headline_score": 48,
                    "is_newsworthy": True,
                },
            },
            {
                "_id": "rss-2",
                "source_type": "rss",
                "family": "cve",
                "source_name": "NVD",
                "editorial": {
                    "story_kind": "advisory",
                    "topics": ["vulnerability"],
                    "headline_score": 24,
                    "is_newsworthy": True,
                },
            },
            {
                "_id": "rss-3",
                "source_type": "rss",
                "family": "custom",
                "source_name": "Research Feed",
                "editorial": {
                    "story_kind": "research",
                    "topics": ["cloud"],
                    "headline_score": 10,
                    "is_newsworthy": False,
                },
            },
        ]
    )

    resp = await async_client.get(
        "/api/feed/modeling",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "feature_pack_ready"
    assert data["objective"] == "cti_story_prioritization"
    assert data["model_status"] == "ready_for_labeling"
    assert data["eligible_items"] == 3
    assert data["newsworthy_items"] == 2
    assert data["priority_bands"]["high"] == 1
    assert data["priority_bands"]["medium"] == 1
    assert data["priority_bands"]["low"] == 1
    assert data["topic_distribution"][0]["topic"] == "vulnerability"
    assert "headline_score" in data["feature_columns"]

"""Tests for GET /api/shift-handoffs/pending-artifacts.

The endpoint is a thin read-model over `scans` and `recon_jobs`, gated by
the auto_artifacts toggle in shift_handoff_config.
"""

from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId

from shift_handoff_config import invalidate_cache


@pytest.fixture(autouse=True)
def _clear_config_cache():
    """Ensure each test starts with a fresh in-process config cache."""
    invalidate_cache()
    yield
    invalidate_cache()


# ── Helpers ─────────────────────────────────────────────────────────────────


def _seed_scan(fake_db, *, target, timestamp, analyst="techuser", verdict="SAFE"):
    fake_db.scans._data.append(
        {
            "_id": ObjectId(),
            "target": target,
            "type": "ip",
            "verdict": verdict,
            "risk_score": 10,
            "analyst": analyst,
            "timestamp": timestamp,
        }
    )


def _seed_recon(
    fake_db,
    *,
    target,
    created_at,
    analyst="techuser",
    status="done",
    modules=None,
):
    fake_db.recon_jobs._data.append(
        {
            "_id": ObjectId(),
            "target": target,
            "target_type": "domain",
            "modules": modules or ["dns", "whois"],
            "analyst": analyst,
            "status": status,
            "created_at": created_at,
        }
    )


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ── Auth ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pending_artifacts_requires_authentication(async_client):
    now = datetime.now(timezone.utc)
    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
        },
    )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_pending_artifacts_allows_any_authenticated_role(async_client, tech_token):
    now = datetime.now(timezone.utc)
    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200


# ── Window validation ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pending_artifacts_rejects_inverted_window(async_client, tech_token):
    now = datetime.now(timezone.utc)
    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now),
            "until": _iso(now - timedelta(hours=1)),
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_pending_artifacts_requires_since_and_until(async_client, tech_token):
    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 422


# ── Empty DB ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pending_artifacts_empty_db_returns_empty_groups(async_client, tech_token):
    now = datetime.now(timezone.utc)
    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["analyze"] == []
    assert data["recon"] == []
    assert data["total"] == 0
    assert data["capture"] == {"analyze": True, "recon": True}


# ── Basic shape and content ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pending_artifacts_returns_scans_and_recons_in_window(
    async_client, tech_token, fake_db
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=12)
    until = now

    _seed_scan(fake_db, target="1.1.1.1", timestamp=now - timedelta(hours=2))
    _seed_scan(fake_db, target="2.2.2.2", timestamp=now - timedelta(hours=4))
    _seed_recon(fake_db, target="evil.com", created_at=now - timedelta(hours=3))

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={"since": _iso(since), "until": _iso(until)},
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["analyze"]) == 2
    assert len(data["recon"]) == 1
    assert data["total"] == 3


@pytest.mark.asyncio
async def test_pending_artifacts_excludes_items_outside_window(
    async_client, tech_token, fake_db
):
    now = datetime.now(timezone.utc)
    # Inside window
    _seed_scan(fake_db, target="inside.scan", timestamp=now - timedelta(hours=2))
    _seed_recon(fake_db, target="inside.recon", created_at=now - timedelta(hours=3))
    # Before window
    _seed_scan(fake_db, target="too.old.scan", timestamp=now - timedelta(hours=20))
    _seed_recon(fake_db, target="too.old.recon", created_at=now - timedelta(hours=20))
    # After window
    _seed_scan(fake_db, target="too.new.scan", timestamp=now + timedelta(hours=2))

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()

    targets_analyze = {item["target"] for item in data["analyze"]}
    targets_recon = {item["target"] for item in data["recon"]}
    assert targets_analyze == {"inside.scan"}
    assert targets_recon == {"inside.recon"}


@pytest.mark.asyncio
async def test_pending_artifacts_only_includes_done_recon_jobs(
    async_client, tech_token, fake_db
):
    now = datetime.now(timezone.utc)
    _seed_recon(fake_db, target="ok.com", created_at=now - timedelta(hours=2), status="done")
    _seed_recon(
        fake_db, target="running.com", created_at=now - timedelta(hours=2), status="running"
    )
    _seed_recon(
        fake_db, target="failed.com", created_at=now - timedelta(hours=2), status="failed"
    )

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    targets = {item["target"] for item in resp.json()["recon"]}
    assert targets == {"ok.com"}


# ── Team filter ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pending_artifacts_team_filter_keeps_only_listed_analysts(
    async_client, tech_token, fake_db
):
    now = datetime.now(timezone.utc)
    _seed_scan(fake_db, target="alice.scan", timestamp=now - timedelta(hours=1), analyst="alice")
    _seed_scan(fake_db, target="bob.scan", timestamp=now - timedelta(hours=1), analyst="bob")
    _seed_scan(
        fake_db, target="carol.scan", timestamp=now - timedelta(hours=1), analyst="carol"
    )
    _seed_recon(
        fake_db, target="alice.recon", created_at=now - timedelta(hours=1), analyst="alice"
    )
    _seed_recon(
        fake_db, target="carol.recon", created_at=now - timedelta(hours=1), analyst="carol"
    )

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
            "team_members": "alice,bob",
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["team_members"] == ["alice", "bob"]
    analyze_targets = {item["target"] for item in data["analyze"]}
    recon_targets = {item["target"] for item in data["recon"]}
    assert analyze_targets == {"alice.scan", "bob.scan"}
    assert recon_targets == {"alice.recon"}


@pytest.mark.asyncio
async def test_pending_artifacts_empty_team_filter_returns_all_analysts(
    async_client, tech_token, fake_db
):
    now = datetime.now(timezone.utc)
    _seed_scan(fake_db, target="a.scan", timestamp=now - timedelta(hours=1), analyst="alice")
    _seed_scan(fake_db, target="b.scan", timestamp=now - timedelta(hours=1), analyst="bob")

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
        },
        cookies={"access_token": tech_token},
    )
    data = resp.json()
    assert {item["target"] for item in data["analyze"]} == {"a.scan", "b.scan"}


@pytest.mark.asyncio
async def test_pending_artifacts_team_filter_resolves_display_name_to_username(
    async_client, tech_token, fake_db
):
    """Typing a user's display name (or first token) should resolve to their
    login username before the $in filter runs. The `techuser` fixture has
    name="Tech User" — typing "Tech" must still surface their scans."""
    now = datetime.now(timezone.utc)
    _seed_scan(
        fake_db, target="byname.scan", timestamp=now - timedelta(hours=1), analyst="techuser"
    )
    _seed_scan(
        fake_db, target="other.scan", timestamp=now - timedelta(hours=1), analyst="someoneelse"
    )

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
            "team_members": "Tech",
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert {item["target"] for item in data["analyze"]} == {"byname.scan"}


@pytest.mark.asyncio
async def test_pending_artifacts_team_filter_resolves_full_display_name(
    async_client, tech_token, fake_db
):
    """Typing the exact display name should also resolve to the username."""
    now = datetime.now(timezone.utc)
    _seed_scan(
        fake_db, target="byfull.scan", timestamp=now - timedelta(hours=1), analyst="techuser"
    )

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
            "team_members": "Tech User",
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert {item["target"] for item in data["analyze"]} == {"byfull.scan"}


@pytest.mark.asyncio
async def test_pending_artifacts_team_filter_resolves_username_directly(
    async_client, tech_token, fake_db
):
    """Typing the exact username must continue to work (backward compat)."""
    now = datetime.now(timezone.utc)
    _seed_scan(
        fake_db, target="byuser.scan", timestamp=now - timedelta(hours=1), analyst="techuser"
    )

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
            "team_members": "techuser",
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert {item["target"] for item in data["analyze"]} == {"byuser.scan"}


@pytest.mark.asyncio
async def test_pending_artifacts_team_filter_is_case_insensitive(
    async_client, tech_token, fake_db
):
    """Name resolution must be case-insensitive so 'TECH' and 'tech' both work."""
    now = datetime.now(timezone.utc)
    _seed_scan(
        fake_db, target="upper.scan", timestamp=now - timedelta(hours=1), analyst="techuser"
    )

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
            "team_members": "TECH",
        },
        cookies={"access_token": tech_token},
    )
    data = resp.json()
    assert {item["target"] for item in data["analyze"]} == {"upper.scan"}


@pytest.mark.asyncio
async def test_pending_artifacts_team_filter_unknown_name_returns_empty(
    async_client, tech_token, fake_db
):
    """A name that doesn't resolve falls back to literal username matching,
    which won't match any existing scan — yielding an empty result."""
    now = datetime.now(timezone.utc)
    _seed_scan(
        fake_db, target="x.scan", timestamp=now - timedelta(hours=1), analyst="techuser"
    )

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
            "team_members": "NobodyThisNameExists",
        },
        cookies={"access_token": tech_token},
    )
    data = resp.json()
    assert data["analyze"] == []


# ── Toggle gating ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pending_artifacts_master_off_returns_empty(
    async_client, tech_token, admin_token, fake_db
):
    now = datetime.now(timezone.utc)
    _seed_scan(fake_db, target="x.scan", timestamp=now - timedelta(hours=1))
    _seed_recon(fake_db, target="x.recon", created_at=now - timedelta(hours=1))

    # Disable master switch as admin
    patch_resp = await async_client.patch(
        "/api/shift-handoffs/config",
        json={"auto_artifacts": {"enabled": False}},
        cookies={"access_token": admin_token},
    )
    assert patch_resp.status_code == 200

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["analyze"] == []
    assert data["recon"] == []
    assert data["capture"] == {"analyze": False, "recon": False}


@pytest.mark.asyncio
async def test_pending_artifacts_capture_analyze_off_drops_only_analyze(
    async_client, tech_token, admin_token, fake_db
):
    now = datetime.now(timezone.utc)
    _seed_scan(fake_db, target="x.scan", timestamp=now - timedelta(hours=1))
    _seed_recon(fake_db, target="x.recon", created_at=now - timedelta(hours=1))

    patch_resp = await async_client.patch(
        "/api/shift-handoffs/config",
        json={"auto_artifacts": {"capture_analyze": False}},
        cookies={"access_token": admin_token},
    )
    assert patch_resp.status_code == 200

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
        },
        cookies={"access_token": tech_token},
    )
    data = resp.json()
    assert data["analyze"] == []
    assert len(data["recon"]) == 1
    assert data["capture"] == {"analyze": False, "recon": True}


@pytest.mark.asyncio
async def test_pending_artifacts_capture_recon_off_drops_only_recon(
    async_client, tech_token, admin_token, fake_db
):
    now = datetime.now(timezone.utc)
    _seed_scan(fake_db, target="x.scan", timestamp=now - timedelta(hours=1))
    _seed_recon(fake_db, target="x.recon", created_at=now - timedelta(hours=1))

    patch_resp = await async_client.patch(
        "/api/shift-handoffs/config",
        json={"auto_artifacts": {"capture_recon": False}},
        cookies={"access_token": admin_token},
    )
    assert patch_resp.status_code == 200

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
        },
        cookies={"access_token": tech_token},
    )
    data = resp.json()
    assert len(data["analyze"]) == 1
    assert data["recon"] == []
    assert data["capture"] == {"analyze": True, "recon": False}


# ── Item shape ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pending_artifacts_analyze_item_shape(async_client, tech_token, fake_db):
    now = datetime.now(timezone.utc)
    _seed_scan(
        fake_db,
        target="1.2.3.4",
        timestamp=now - timedelta(hours=1),
        verdict="HIGH RISK",
    )
    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
        },
        cookies={"access_token": tech_token},
    )
    item = resp.json()["analyze"][0]
    assert item["kind"] == "analyze"
    assert item["target"] == "1.2.3.4"
    assert item["target_type"] == "ip"
    assert item["verdict"] == "HIGH RISK"
    assert item["risk_score"] == 10
    assert item["analyst"] == "techuser"
    assert item["timestamp"]  # ISO string, non-empty
    assert item["id"]


@pytest.mark.asyncio
async def test_pending_artifacts_recon_item_shape(async_client, tech_token, fake_db):
    now = datetime.now(timezone.utc)
    _seed_recon(
        fake_db,
        target="bad.example",
        created_at=now - timedelta(hours=1),
        modules=["dns", "ssl"],
    )
    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
        },
        cookies={"access_token": tech_token},
    )
    item = resp.json()["recon"][0]
    assert item["kind"] == "recon"
    assert item["target"] == "bad.example"
    assert item["target_type"] == "domain"
    assert item["modules"] == ["dns", "ssl"]
    assert item["status"] == "done"
    assert item["analyst"] == "techuser"
    assert item["job_id"]
    assert item["id"] == item["job_id"]


# ── Limit ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pending_artifacts_per_source_limit(async_client, tech_token, fake_db):
    now = datetime.now(timezone.utc)
    for i in range(10):
        _seed_scan(
            fake_db,
            target=f"scan-{i}",
            timestamp=now - timedelta(minutes=i + 1),
        )

    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
            "limit": 3,
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    assert len(resp.json()["analyze"]) == 3


@pytest.mark.asyncio
async def test_pending_artifacts_rejects_limit_above_cap(async_client, tech_token):
    now = datetime.now(timezone.utc)
    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
            "limit": 10000,
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_pending_artifacts_rejects_zero_limit(async_client, tech_token):
    now = datetime.now(timezone.utc)
    resp = await async_client.get(
        "/api/shift-handoffs/pending-artifacts",
        params={
            "since": _iso(now - timedelta(hours=12)),
            "until": _iso(now),
            "limit": 0,
        },
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 422

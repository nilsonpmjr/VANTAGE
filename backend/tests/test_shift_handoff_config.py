"""Tests for /api/shift-handoffs/config (auto-artifacts toggle)."""

import pytest

from shift_handoff_config import (
    DEFAULT_AUTO_ARTIFACTS,
    invalidate_cache,
    is_artifact_capture_enabled,
)


@pytest.fixture(autouse=True)
def _clear_config_cache():
    """Ensure every test sees a pristine in-process cache."""
    invalidate_cache()
    yield
    invalidate_cache()


# ── GET: defaults and visibility ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_config_returns_defaults_when_empty(async_client, tech_token):
    """Fresh DB should yield the documented default flags."""
    resp = await async_client.get(
        "/api/shift-handoffs/config",
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["auto_artifacts"] == DEFAULT_AUTO_ARTIFACTS


@pytest.mark.asyncio
async def test_get_config_requires_authentication(async_client):
    """Unauthenticated callers must be rejected."""
    resp = await async_client.get("/api/shift-handoffs/config")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_config_allows_non_admin_read(async_client, tech_token):
    """Read access is intentionally open to any authenticated role."""
    resp = await async_client.get(
        "/api/shift-handoffs/config",
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 200


# ── PATCH: role enforcement ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_patch_config_rejects_non_admin(async_client, tech_token):
    """Only admins are allowed to flip flags."""
    resp = await async_client.patch(
        "/api/shift-handoffs/config",
        json={"auto_artifacts": {"enabled": False}},
        cookies={"access_token": tech_token},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_patch_config_admin_can_flip_master_switch(async_client, admin_token):
    resp = await async_client.patch(
        "/api/shift-handoffs/config",
        json={"auto_artifacts": {"enabled": False}},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["auto_artifacts"]["enabled"] is False
    # Sub-flags untouched should remain at their prior state (defaults).
    assert data["auto_artifacts"]["capture_analyze"] is True
    assert data["auto_artifacts"]["capture_recon"] is True
    assert data["updated_by"] == "admin"


@pytest.mark.asyncio
async def test_patch_config_admin_can_toggle_sub_flags_only(async_client, admin_token):
    resp = await async_client.patch(
        "/api/shift-handoffs/config",
        json={"auto_artifacts": {"capture_recon": False}},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["auto_artifacts"]["enabled"] is True
    assert data["auto_artifacts"]["capture_analyze"] is True
    assert data["auto_artifacts"]["capture_recon"] is False


# ── PATCH: validation ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_patch_config_rejects_empty_patch(async_client, admin_token):
    resp = await async_client.patch(
        "/api/shift-handoffs/config",
        json={"auto_artifacts": {}},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_patch_config_rejects_non_boolean_values(async_client, admin_token):
    resp = await async_client.patch(
        "/api/shift-handoffs/config",
        json={"auto_artifacts": {"enabled": "yes"}},
        cookies={"access_token": admin_token},
    )
    # Pydantic strict bool validation rejects this at the parse layer.
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_config_rejects_missing_auto_artifacts_block(
    async_client, admin_token
):
    resp = await async_client.patch(
        "/api/shift-handoffs/config",
        json={},
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 422


# ── Cache invalidation ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_patch_config_invalidates_cache_for_subsequent_reads(
    async_client, admin_token
):
    """After PATCH, the very next GET must reflect the new state."""
    await async_client.patch(
        "/api/shift-handoffs/config",
        json={"auto_artifacts": {"enabled": False}},
        cookies={"access_token": admin_token},
    )
    resp = await async_client.get(
        "/api/shift-handoffs/config",
        cookies={"access_token": admin_token},
    )
    assert resp.status_code == 200
    assert resp.json()["auto_artifacts"]["enabled"] is False


# ── Audit logging ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_patch_config_writes_audit_log_entry(async_client, admin_token, fake_db):
    await async_client.patch(
        "/api/shift-handoffs/config",
        json={"auto_artifacts": {"capture_analyze": False}},
        cookies={"access_token": admin_token},
    )
    entries = [
        e for e in fake_db.audit_log._data
        if e.get("action") == "settings.shift_handoff.update"
    ]
    assert len(entries) == 1
    assert entries[0]["user"] == "admin"
    assert "capture_analyze" in entries[0]["detail"]


# ── is_artifact_capture_enabled helper ──────────────────────────────────────


@pytest.mark.asyncio
async def test_helper_returns_true_with_defaults(fake_db):
    assert await is_artifact_capture_enabled(fake_db, "analyze") is True
    assert await is_artifact_capture_enabled(fake_db, "recon") is True


@pytest.mark.asyncio
async def test_helper_returns_false_when_master_disabled(async_client, admin_token, fake_db):
    await async_client.patch(
        "/api/shift-handoffs/config",
        json={"auto_artifacts": {"enabled": False}},
        cookies={"access_token": admin_token},
    )
    assert await is_artifact_capture_enabled(fake_db, "analyze") is False
    assert await is_artifact_capture_enabled(fake_db, "recon") is False


@pytest.mark.asyncio
async def test_helper_returns_false_only_for_disabled_sub_flag(
    async_client, admin_token, fake_db
):
    await async_client.patch(
        "/api/shift-handoffs/config",
        json={"auto_artifacts": {"capture_recon": False}},
        cookies={"access_token": admin_token},
    )
    assert await is_artifact_capture_enabled(fake_db, "analyze") is True
    assert await is_artifact_capture_enabled(fake_db, "recon") is False

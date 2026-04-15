"""
Shift Handoff configuration layer.

Stores runtime-editable flags for the shift handoff feature in its own
MongoDB singleton document, independent from operational_config (SMTP).

Current scope:
    - auto_artifacts: controls automatic ingestion of analyst activity into
      the shift handoff form (analyze/recon history). The flag is a
      kill-switch; when disabled, the pending-artifacts endpoint returns
      an empty list regardless of underlying activity.

A tiny in-process cache is kept to avoid per-request Mongo reads for the
flag, but it is trivially invalidated on every PATCH so UI changes are
immediate on the writing pod, and at most 30 seconds elsewhere.
"""

from __future__ import annotations

import time
from copy import deepcopy
from datetime import datetime, timezone
from typing import Literal

from logging_config import get_logger

logger = get_logger("ShiftHandoffConfig")

SHIFT_HANDOFF_CONFIG_ID = "singleton"

# ── Defaults ────────────────────────────────────────────────────────────────

DEFAULT_AUTO_ARTIFACTS = {
    "enabled": True,
    "capture_analyze": True,
    "capture_recon": True,
}


def _default_config() -> dict:
    """Return a fresh copy of the default config block."""
    return {
        "auto_artifacts": deepcopy(DEFAULT_AUTO_ARTIFACTS),
    }


# ── In-process cache ────────────────────────────────────────────────────────
#
# The cache is intentionally simple: a single dict plus an expires_at
# monotonic timestamp. Any PATCH clears it; any read that finds it stale
# refreshes from the DB. Good enough for the multi-pod latency budget of
# ~30 seconds stated in the PRD.

_CACHE_TTL_SECONDS = 30.0
_cache: dict | None = None
_cache_expires_at: float = 0.0


def _cache_store(config: dict) -> None:
    global _cache, _cache_expires_at
    _cache = deepcopy(config)
    _cache_expires_at = time.monotonic() + _CACHE_TTL_SECONDS


def invalidate_cache() -> None:
    """Drop the in-process cache so the next read hits the DB."""
    global _cache, _cache_expires_at
    _cache = None
    _cache_expires_at = 0.0


# ── Persistence helpers ─────────────────────────────────────────────────────


def _merge_with_defaults(stored: dict | None) -> dict:
    """
    Merge a (possibly partial) stored document with defaults.

    This is how we apply an implicit, idempotent migration: any new key
    we introduce in DEFAULT_AUTO_ARTIFACTS is picked up automatically on
    read, even for old documents that never stored it.
    """
    base = _default_config()
    if not stored:
        return base

    auto = stored.get("auto_artifacts") or {}
    for key, default_value in DEFAULT_AUTO_ARTIFACTS.items():
        if key in auto:
            base["auto_artifacts"][key] = bool(auto[key])

    # carry provenance fields through so the frontend can render them
    if stored.get("updated_at") is not None:
        base["updated_at"] = stored["updated_at"]
    if stored.get("updated_by"):
        base["updated_by"] = stored["updated_by"]

    return base


async def get_shift_handoff_config(db) -> dict:
    """
    Return the effective shift handoff config, merged with defaults.

    Reads from the in-process cache when fresh; otherwise hits Mongo
    and refreshes the cache.
    """
    if _cache is not None and time.monotonic() < _cache_expires_at:
        return deepcopy(_cache)

    if db is None:
        config = _default_config()
        _cache_store(config)
        return deepcopy(config)

    try:
        doc = await db.shift_handoff_config.find_one({"_id": SHIFT_HANDOFF_CONFIG_ID})
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Failed to read shift_handoff_config: %s", exc)
        doc = None

    config = _merge_with_defaults(doc)
    _cache_store(config)
    return deepcopy(config)


async def update_shift_handoff_config(
    db,
    patch: dict,
    updated_by: str | None = None,
) -> dict:
    """
    Apply a partial update to the shift handoff config and return the
    effective view post-write. Only known keys are accepted.

    The cache is invalidated so the very next read hits Mongo.
    """
    if not isinstance(patch, dict):
        raise ValueError("shift_handoff_config patch must be an object.")

    auto_patch = patch.get("auto_artifacts")
    if not isinstance(auto_patch, dict):
        raise ValueError("Missing or invalid 'auto_artifacts' block.")

    normalized: dict = {}
    for key in DEFAULT_AUTO_ARTIFACTS:
        if key in auto_patch:
            value = auto_patch[key]
            if not isinstance(value, bool):
                raise ValueError(f"'{key}' must be a boolean.")
            normalized[key] = value

    if not normalized:
        raise ValueError("At least one auto_artifacts field must be provided.")

    current = await get_shift_handoff_config(db)
    next_doc = {
        "_id": SHIFT_HANDOFF_CONFIG_ID,
        "auto_artifacts": {**current["auto_artifacts"], **normalized},
        "updated_at": datetime.now(timezone.utc),
        "updated_by": updated_by,
    }

    if db is not None:
        await db.shift_handoff_config.replace_one(
            {"_id": SHIFT_HANDOFF_CONFIG_ID},
            next_doc,
            upsert=True,
        )

    invalidate_cache()
    return await get_shift_handoff_config(db)


# ── Read-path helper used by analyze/recon pipelines ────────────────────────

ArtifactSource = Literal["analyze", "recon"]


async def is_artifact_capture_enabled(db, source: ArtifactSource) -> bool:
    """
    Return True if artifact ingestion is currently enabled for the given
    source. Both the master switch and the per-source sub-flag must be on.

    Safe to call on hot paths: uses the in-process cache.
    """
    config = await get_shift_handoff_config(db)
    auto = config.get("auto_artifacts", {})
    if not auto.get("enabled", True):
        return False
    key = f"capture_{source}"
    return bool(auto.get(key, True))

"""
Public threat feed endpoint — serves ingested threat items to any authenticated user.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from auth import get_current_user
from cti_modeling import build_cti_modeling_snapshot
from db import db_manager
from logging_config import get_logger

logger = get_logger("FeedRouter")

router = APIRouter(prefix="/feed", tags=["feed"])


@router.get("")
async def list_feed_items(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    severity: str | None = Query(None),
    source_type: str | None = Query(None),
    family: str | None = Query(None),
    tlp: str | None = Query(None),
    view: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Return threat feed items sorted by published_at desc."""
    db = db_manager.db
    if db is None:
        return {"items": [], "total": 0}

    query: dict = {}
    if severity:
        query["severity"] = severity.lower()
    if source_type:
        query["source_type"] = source_type
    if family:
        query["family"] = family
    if tlp:
        query["tlp"] = tlp.lower()
    if view == "news":
        query["source_type"] = "rss"
        query["editorial.is_newsworthy"] = True

    total = await db.threat_items.count_documents(query)
    cursor = db.threat_items.find(query, {"raw": 0, "data.raw": 0})
    if view == "news":
        cursor = cursor.sort([("editorial.headline_score", -1), ("published_at", -1)])
    else:
        cursor = cursor.sort("published_at", -1)
    cursor = cursor.skip(offset).limit(limit)

    items = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        items.append(doc)

    return {"items": items, "total": total, "view": view or "feed"}


@router.get("/modeling")
async def get_feed_modeling_snapshot(
    window: int = Query(200, ge=20, le=1000),
    current_user: dict = Depends(get_current_user),
):
    """Expose the initial ML readiness snapshot for editorial CTI stories."""
    db = db_manager.db
    if db is None:
        return build_cti_modeling_snapshot([])

    cursor = db.threat_items.find(
        {"source_type": "rss"},
        {"raw": 0, "data.raw": 0},
    ).sort("published_at", -1).limit(window)
    items = await cursor.to_list(length=window)
    return build_cti_modeling_snapshot(items)

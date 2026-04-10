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


@router.get("/summary")
async def get_feed_summary(
    current_user: dict = Depends(get_current_user),
):
    """Return aggregate feed statistics for the full RSS-backed feed corpus."""
    db = db_manager.db
    if db is None:
        return {
            "total_rss_items": 0,
            "critical_items": 0,
            "high_items": 0,
            "medium_items": 0,
            "latest_source_label": "",
            "source_distribution": [],
        }

    query = {"source_type": "rss"}
    total_rss_items = await db.threat_items.count_documents(query)

    cursor = db.threat_items.find(query, {"source_name": 1, "family": 1, "severity": 1, "published_at": 1}).sort("published_at", -1)
    items = await cursor.to_list(length=5000)

    counts_by_source: dict[str, int] = {}
    critical_items = 0
    high_items = 0
    medium_items = 0

    for item in items:
        source_label = str(item.get("source_name") or item.get("family") or "VANTAGE").upper()
        counts_by_source[source_label] = counts_by_source.get(source_label, 0) + 1

        severity = str(item.get("severity") or "").lower()
        if severity == "critical":
            critical_items += 1
        elif severity == "high":
            high_items += 1
        elif severity == "medium":
            medium_items += 1

    source_distribution = sorted(
        (
            {
                "name": name,
                "count": count,
                "percentage": round((count / total_rss_items) * 100, 2) if total_rss_items else 0,
            }
            for name, count in counts_by_source.items()
        ),
        key=lambda entry: entry["count"],
        reverse=True,
    )

    latest_source_label = (
        str(items[0].get("source_name") or items[0].get("family") or "VANTAGE").upper()
        if items
        else ""
    )

    return {
        "total_rss_items": total_rss_items,
        "critical_items": critical_items,
        "high_items": high_items,
        "medium_items": medium_items,
        "latest_source_label": latest_source_label,
        "source_distribution": source_distribution[:8],
    }


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

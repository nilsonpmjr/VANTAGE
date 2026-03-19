from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from db import db_manager
from auth import get_current_user
from validators import validate_target, ValidationError
from logging_config import get_logger

logger = get_logger("WatchlistRouter")

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


# ── SMTP status (used by frontend to enable/disable email notifications) ─────

@router.get("/smtp-status")
async def smtp_status(current_user: dict = Depends(get_current_user)):
    from mailer import is_smtp_configured
    return {"smtp_configured": await is_smtp_configured()}

WATCHLIST_LIMIT = 50


class WatchlistAdd(BaseModel):
    target: str
    notify_on_change: bool = True


# ── GET / — list user's watchlist ─────────────────────────────────────────────

@router.get("/")
async def list_watchlist(
    current_user: dict = Depends(get_current_user),
):
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    cursor = db_manager.db.watchlist.find(
        {"user": current_user["username"]},
    ).sort("created_at", -1)

    items = []
    async for doc in cursor:
        items.append({
            "id": str(doc["_id"]),
            "target": doc["target"],
            "target_type": doc.get("target_type", ""),
            "notify_on_change": doc.get("notify_on_change", True),
            "last_verdict": doc.get("last_verdict"),
            "last_scan_at": doc.get("last_scan_at", "").isoformat()
            if hasattr(doc.get("last_scan_at", ""), "isoformat")
            else str(doc.get("last_scan_at", "")),
            "created_at": doc.get("created_at", "").isoformat()
            if hasattr(doc.get("created_at", ""), "isoformat")
            else str(doc.get("created_at", "")),
        })

    return {"items": items, "total": len(items), "limit": WATCHLIST_LIMIT}


# ── POST / — add target to watchlist ─────────────────────────────────────────

@router.post("/", status_code=201)
async def add_to_watchlist(
    body: WatchlistAdd,
    current_user: dict = Depends(get_current_user),
):
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    # Validate target
    try:
        v = validate_target(body.target.strip())
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    username = current_user["username"]

    # Check limit
    count = await db_manager.db.watchlist.count_documents({"user": username})
    if count >= WATCHLIST_LIMIT:
        raise HTTPException(
            status_code=422,
            detail=f"Watchlist limit reached ({WATCHLIST_LIMIT}).",
        )

    # Check duplicate
    existing = await db_manager.db.watchlist.find_one({
        "user": username, "target": v.sanitized,
    })
    if existing:
        raise HTTPException(status_code=409, detail="Target already in watchlist.")

    doc = {
        "user": username,
        "target": v.sanitized,
        "target_type": v.target_type,
        "notify_on_change": body.notify_on_change,
        "last_verdict": None,
        "last_scan_at": None,
        "created_at": datetime.now(timezone.utc),
    }

    result = await db_manager.db.watchlist.insert_one(doc)
    doc["id"] = str(result.inserted_id)

    return {
        "id": doc["id"],
        "target": doc["target"],
        "target_type": doc["target_type"],
        "notify_on_change": doc["notify_on_change"],
    }


# ── PATCH /{id} — toggle notify ──────────────────────────────────────────────

@router.patch("/{item_id}")
async def update_watchlist_item(
    item_id: str,
    body: dict,
    current_user: dict = Depends(get_current_user),
):
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    from bson import ObjectId

    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID.")

    doc = await db_manager.db.watchlist.find_one({"_id": oid})
    if not doc or doc["user"] != current_user["username"]:
        raise HTTPException(status_code=404, detail="Item not found.")

    update = {}
    if "notify_on_change" in body:
        update["notify_on_change"] = bool(body["notify_on_change"])

    if update:
        await db_manager.db.watchlist.update_one({"_id": oid}, {"$set": update})

    return {"ok": True}


# ── DELETE /{id} — remove from watchlist ──────────────────────────────────────

@router.delete("/{item_id}")
async def remove_from_watchlist(
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    from bson import ObjectId

    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID.")

    result = await db_manager.db.watchlist.delete_one({
        "_id": oid, "user": current_user["username"],
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found.")

    return {"ok": True}

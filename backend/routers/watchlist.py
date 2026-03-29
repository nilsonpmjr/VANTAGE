from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, field_validator

from db import db_manager
from auth import get_current_user
from validators import validate_target, ValidationError
from logging_config import get_logger
from watchlist_runtime import (
    evaluate_watchlist_target,
    normalize_watchlist_notification_route,
    persist_watchlist_scan,
)

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
    notification_route: str = "email"

    @field_validator("notification_route")
    @classmethod
    def _normalize_route(cls, value: str) -> str:
        return normalize_watchlist_notification_route(value)


class WatchlistBulkRequest(BaseModel):
    item_ids: list[str]
    action: str
    notification_route: str | None = None

    @field_validator("action")
    @classmethod
    def _normalize_action(cls, value: str) -> str:
        return str(value or "").strip().lower()

    @field_validator("notification_route")
    @classmethod
    def _optional_route(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_watchlist_notification_route(value)


def _serialize_value(value):
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _serialize_watchlist_item(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "target": doc["target"],
        "target_type": doc.get("target_type", ""),
        "notify_on_change": doc.get("notify_on_change", True),
        "notification_route": doc.get("notification_route", "email"),
        "last_verdict": doc.get("last_verdict"),
        "last_scan_at": _serialize_value(doc.get("last_scan_at")),
        "created_at": _serialize_value(doc.get("created_at")),
    }


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
        items.append(_serialize_watchlist_item(doc))

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
        "notification_route": body.notification_route,
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
        "notification_route": doc["notification_route"],
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
    if "notification_route" in body:
        try:
            update["notification_route"] = normalize_watchlist_notification_route(body["notification_route"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    if update:
        await db_manager.db.watchlist.update_one({"_id": oid}, {"$set": update})

    return {"ok": True}


@router.post("/bulk")
async def bulk_watchlist_action(
    body: WatchlistBulkRequest,
    current_user: dict = Depends(get_current_user),
):
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    from bson import ObjectId

    normalized_ids = []
    for item_id in body.item_ids:
        try:
            normalized_ids.append(ObjectId(item_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid ID.")

    owned_items = []
    for oid in normalized_ids:
        doc = await db_manager.db.watchlist.find_one({"_id": oid})
        if doc and doc["user"] == current_user["username"]:
            owned_items.append(doc)

    if not owned_items:
        return {"updated": 0}

    updated = 0
    for doc in owned_items:
        if body.action == "enable_notifications":
            await db_manager.db.watchlist.update_one(
                {"_id": doc["_id"]},
                {"$set": {"notify_on_change": True}},
            )
            updated += 1
        elif body.action == "disable_notifications":
            await db_manager.db.watchlist.update_one(
                {"_id": doc["_id"]},
                {"$set": {"notify_on_change": False}},
            )
            updated += 1
        elif body.action == "set_route":
            if not body.notification_route:
                raise HTTPException(status_code=400, detail="notification_route_required")
            await db_manager.db.watchlist.update_one(
                {"_id": doc["_id"]},
                {"$set": {"notification_route": body.notification_route}},
            )
            updated += 1
        elif body.action == "delete":
            result = await db_manager.db.watchlist.delete_one(
                {"_id": doc["_id"], "user": current_user["username"]},
            )
            updated += int(result.deleted_count > 0)
        else:
            raise HTTPException(status_code=400, detail=f"unsupported_bulk_action:{body.action}")

    return {"updated": updated}


@router.post("/{item_id}/scan")
async def scan_watchlist_item(
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    if db_manager.db is None:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    from bson import ObjectId
    from clients.api_client_async import AsyncThreatIntelClient

    try:
        oid = ObjectId(item_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID.")

    doc = await db_manager.db.watchlist.find_one({"_id": oid})
    if not doc or doc["user"] != current_user["username"]:
        raise HTTPException(status_code=404, detail="Item not found.")

    try:
        async with AsyncThreatIntelClient() as client:
            runtime = await evaluate_watchlist_target(
                client,
                doc["target"],
                doc.get("target_type", "ip"),
            )
    except ValueError as exc:
        raise HTTPException(status_code=424, detail=str(exc))

    persisted = await persist_watchlist_scan(
        db_manager.db,
        doc,
        verdict=runtime["verdict"],
    )
    refreshed = await db_manager.db.watchlist.find_one({"_id": oid}) or doc
    return {
        "item": _serialize_watchlist_item(refreshed),
        "changed": persisted["changed"],
        "previous_verdict": persisted["previous_verdict"],
        "verdict": persisted["verdict"],
        "total_sources": runtime["total_sources"],
    }


@router.get("/{item_id}/history")
async def read_watchlist_item_history(
    item_id: str,
    limit: int = Query(12, ge=3, le=60),
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

    history = await db_manager.db.watchlist_history.find(
        {"user": current_user["username"], "watchlist_item_id": item_id},
        {"_id": 0},
    ).sort("scanned_at", -1).limit(limit).to_list(length=limit)

    serialized = [
        {
            **entry,
            "scanned_at": _serialize_value(entry.get("scanned_at")),
        }
        for entry in history
    ]
    return {"items": serialized, "total": len(serialized)}


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

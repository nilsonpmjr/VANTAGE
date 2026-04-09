import base64
from datetime import datetime, timezone, timedelta

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from pydantic import BaseModel, field_validator

from db import db_manager
from auth import get_current_user, require_role
from audit import log_action
from logging_config import get_logger

logger = get_logger("ShiftHandoffRouter")

router = APIRouter(prefix="/shift-handoffs", tags=["shift-handoffs"])

BODY_MAX_LENGTH = 500000
VALID_VISIBILITY_DAYS = {4, 7, 14, 30}
VALID_INCIDENT_STATUSES = {"active", "monitoring", "escalated", "resolved"}
VALID_INCIDENT_SEVERITIES = {"critical", "high", "medium", "low", "info"}
VALID_TOOL_STATUSES = {"operational", "degraded", "down", "maintenance"}
MAX_ATTACHMENTS = 5
MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024  # 2MB
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}


# ── Models ────────────────────────────────────────────────────────────────────

class IncidentEntry(BaseModel):
    title: str
    status: str = "active"
    severity: str = "medium"
    action_needed: str = ""

    @field_validator("status")
    @classmethod
    def _validate_status(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in VALID_INCIDENT_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_INCIDENT_STATUSES)}")
        return value

    @field_validator("severity")
    @classmethod
    def _validate_severity(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in VALID_INCIDENT_SEVERITIES:
            raise ValueError(f"severity must be one of {sorted(VALID_INCIDENT_SEVERITIES)}")
        return value


class ToolStatusEntry(BaseModel):
    name: str
    status: str = "operational"

    @field_validator("status")
    @classmethod
    def _validate_status(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in VALID_TOOL_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_TOOL_STATUSES)}")
        return value


class ShiftHandoffCreate(BaseModel):
    shift_date: str
    team_members: list[str]
    body: str
    visibility_days: int = 4
    incidents: list[IncidentEntry] = []
    tools_status: list[ToolStatusEntry] = []
    observations: str = ""
    shift_focus: str = ""
    acknowledged_by: str = ""

    @field_validator("shift_date")
    @classmethod
    def _validate_date(cls, value: str) -> str:
        value = value.strip()
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            raise ValueError("shift_date must be in YYYY-MM-DD format")
        return value

    @field_validator("team_members")
    @classmethod
    def _validate_members(cls, value: list[str]) -> list[str]:
        cleaned = [m.strip() for m in value if m.strip()]
        if not cleaned:
            raise ValueError("at least one team member is required")
        return cleaned

    @field_validator("body")
    @classmethod
    def _validate_body(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("body cannot be empty")
        if len(value) > BODY_MAX_LENGTH:
            raise ValueError(f"body must be at most {BODY_MAX_LENGTH} characters")
        return value

    @field_validator("visibility_days")
    @classmethod
    def _validate_visibility(cls, value: int) -> int:
        if value not in VALID_VISIBILITY_DAYS:
            raise ValueError(f"visibility_days must be one of {sorted(VALID_VISIBILITY_DAYS)}")
        return value

    @field_validator("observations")
    @classmethod
    def _validate_observations(cls, value: str) -> str:
        return value.strip()[:2000]

    @field_validator("shift_focus")
    @classmethod
    def _validate_focus(cls, value: str) -> str:
        return value.strip()[:500]


class ShiftHandoffUpdate(BaseModel):
    team_members: list[str] | None = None
    body: str | None = None
    visibility_days: int | None = None
    incidents: list[IncidentEntry] | None = None
    tools_status: list[ToolStatusEntry] | None = None
    observations: str | None = None
    shift_focus: str | None = None
    acknowledged_by: str | None = None

    @field_validator("team_members")
    @classmethod
    def _validate_members(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = [m.strip() for m in value if m.strip()]
        if not cleaned:
            raise ValueError("at least one team member is required")
        return cleaned

    @field_validator("body")
    @classmethod
    def _validate_body(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("body cannot be empty")
        if len(value) > BODY_MAX_LENGTH:
            raise ValueError(f"body must be at most {BODY_MAX_LENGTH} characters")
        return value

    @field_validator("visibility_days")
    @classmethod
    def _validate_visibility(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value not in VALID_VISIBILITY_DAYS:
            raise ValueError(f"visibility_days must be one of {sorted(VALID_VISIBILITY_DAYS)}")
        return value

    @field_validator("observations")
    @classmethod
    def _validate_observations(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()[:2000]

    @field_validator("shift_focus")
    @classmethod
    def _validate_focus(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()[:500]


class ShiftHandoffIncidentStatusUpdate(BaseModel):
    status: str
    action_needed: str | None = None

    @field_validator("status")
    @classmethod
    def _validate_status(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in VALID_INCIDENT_STATUSES:
            raise ValueError(f"status must be one of {sorted(VALID_INCIDENT_STATUSES)}")
        return value

    @field_validator("action_needed")
    @classmethod
    def _validate_action_needed(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()[:500]


# ── Serialization ─────────────────────────────────────────────────────────────

def _serialize(doc: dict) -> dict:
    def _ts(v):
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return v

    return {
        "id": str(doc["_id"]),
        "shift_date": doc["shift_date"],
        "team_members": doc.get("team_members", []),
        "body": doc.get("body", ""),
        "visibility_days": doc.get("visibility_days", 4),
        "expires_at": _ts(doc.get("expires_at")),
        "created_by": doc.get("created_by", ""),
        "created_at": _ts(doc.get("created_at")),
        "updated_at": _ts(doc.get("updated_at")),
        "incidents": doc.get("incidents", []),
        "tools_status": doc.get("tools_status", []),
        "observations": doc.get("observations", ""),
        "shift_focus": doc.get("shift_focus", ""),
        "acknowledged_by": doc.get("acknowledged_by", ""),
        "acknowledged_at": _ts(doc.get("acknowledged_at")),
        "attachments": [
            {
                "id": str(a.get("_id", a.get("id", ""))),
                "filename": a.get("filename", ""),
                "content_type": a.get("content_type", ""),
                "size": a.get("size", 0),
                "data_uri": a.get("data_uri", ""),
                "uploaded_by": a.get("uploaded_by", ""),
                "uploaded_at": _ts(a.get("uploaded_at")),
            }
            for a in doc.get("attachments", [])
        ],
        "edit_history": [
            {
                "edited_by": e.get("edited_by", ""),
                "edited_at": _ts(e.get("edited_at")),
                "previous_body": e.get("previous_body", ""),
            }
            for e in doc.get("edit_history", [])
        ],
    }


# ── POST / — create shift handoff ────────────────────────────────────────────

@router.post("")
async def create_handoff(
    payload: ShiftHandoffCreate,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=payload.visibility_days)

    doc = {
        "shift_date": payload.shift_date,
        "team_members": payload.team_members,
        "body": payload.body,
        "visibility_days": payload.visibility_days,
        "expires_at": expires_at,
        "created_by": current_user["username"],
        "created_at": now,
        "updated_at": now,
        "incidents": [inc.model_dump() for inc in payload.incidents],
        "tools_status": [ts.model_dump() for ts in payload.tools_status],
        "observations": payload.observations,
        "shift_focus": payload.shift_focus,
        "acknowledged_by": payload.acknowledged_by or "",
        "acknowledged_at": None,
        "attachments": [],
        "edit_history": [],
    }

    result = await db.shift_handoffs.insert_one(doc)
    doc["_id"] = result.inserted_id

    await log_action(
        current_user["username"],
        "shift_handoff_create",
        f"Created shift handoff for {payload.shift_date}",
    )
    logger.info("Shift handoff created by %s for %s", current_user["username"], payload.shift_date)
    return _serialize(doc)


# ── GET / — list active handoffs ──────────────────────────────────────────────

@router.get("")
async def list_handoffs(
    current_user: dict = Depends(get_current_user),
    days: int | None = Query(None, description="Filter by recent active handoff window"),
    include_expired: bool = Query(False, description="Include expired handoffs (for history)"),
    limit: int = Query(100, ge=1, le=500, description="Max results"),
    offset: int = Query(0, ge=0, description="Skip results"),
):
    db = db_manager.db
    now = datetime.now(timezone.utc)

    query: dict = {}
    if not include_expired:
        query["expires_at"] = {"$gt": now}
    if days and days > 0:
        query["created_at"] = {"$gte": now - timedelta(days=days)}

    cursor = db.shift_handoffs.find(query).sort("created_at", -1).skip(offset).limit(limit)
    results = []
    async for doc in cursor:
        results.append(_serialize(doc))
    return results


# ── GET /{id} — handoff detail ────────────────────────────────────────────────

@router.get("/{handoff_id}")
async def get_handoff(
    handoff_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_handoff_id")

    doc = await db.shift_handoffs.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="handoff_not_found")
    return _serialize(doc)


# ── PUT /{id} — edit handoff (author or admin/manager) ───────────────────────

@router.put("/{handoff_id}")
async def update_handoff(
    handoff_id: str,
    payload: ShiftHandoffUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_handoff_id")

    doc = await db.shift_handoffs.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="handoff_not_found")

    is_author = doc.get("created_by") == current_user["username"]
    is_privileged = current_user.get("role") in ("admin", "manager")
    if not is_author and not is_privileged:
        raise HTTPException(status_code=403, detail="edit_not_allowed")

    now = datetime.now(timezone.utc)
    update_fields: dict = {"updated_at": now}

    if payload.body is not None and payload.body != doc.get("body", ""):
        history_entry = {
            "edited_by": current_user["username"],
            "edited_at": now,
            "previous_body": doc.get("body", ""),
        }
        await db.shift_handoffs.update_one(
            {"_id": oid},
            {"$push": {"edit_history": history_entry}},
        )
        update_fields["body"] = payload.body

    if payload.team_members is not None:
        update_fields["team_members"] = payload.team_members
    if payload.visibility_days is not None:
        update_fields["visibility_days"] = payload.visibility_days
        update_fields["expires_at"] = doc["created_at"] + timedelta(days=payload.visibility_days)
    if payload.incidents is not None:
        update_fields["incidents"] = [inc.model_dump() for inc in payload.incidents]
    if payload.tools_status is not None:
        update_fields["tools_status"] = [ts.model_dump() for ts in payload.tools_status]
    if payload.observations is not None:
        update_fields["observations"] = payload.observations
    if payload.shift_focus is not None:
        update_fields["shift_focus"] = payload.shift_focus
    if payload.acknowledged_by is not None:
        update_fields["acknowledged_by"] = payload.acknowledged_by
        if payload.acknowledged_by and not doc.get("acknowledged_by"):
            update_fields["acknowledged_at"] = now

    await db.shift_handoffs.update_one({"_id": oid}, {"$set": update_fields})

    updated = await db.shift_handoffs.find_one({"_id": oid})
    await log_action(
        current_user["username"],
        "shift_handoff_update",
        f"Updated shift handoff {handoff_id}",
    )
    return _serialize(updated)


# ── POST /{id}/acknowledge — incoming team acknowledges ──────────────────────

@router.post("/{handoff_id}/acknowledge")
async def acknowledge_handoff(
    handoff_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_handoff_id")

    doc = await db.shift_handoffs.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="handoff_not_found")

    if doc.get("acknowledged_by"):
        raise HTTPException(status_code=409, detail="already_acknowledged")

    now = datetime.now(timezone.utc)
    await db.shift_handoffs.update_one(
        {"_id": oid},
        {"$set": {
            "acknowledged_by": current_user["username"],
            "acknowledged_at": now,
            "updated_at": now,
        }},
    )

    await log_action(
        current_user["username"],
        "shift_handoff_acknowledge",
        f"Acknowledged shift handoff {handoff_id}",
    )
    updated = await db.shift_handoffs.find_one({"_id": oid})
    return _serialize(updated)


# ── POST /{id}/incidents/{index}/status — update incident lifecycle ──────────

@router.post("/{handoff_id}/incidents/{incident_index}/status")
async def update_incident_status(
    handoff_id: str,
    incident_index: int,
    payload: ShiftHandoffIncidentStatusUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_handoff_id")

    doc = await db.shift_handoffs.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="handoff_not_found")

    incidents = list(doc.get("incidents", []))
    if incident_index < 0 or incident_index >= len(incidents):
        raise HTTPException(status_code=404, detail="incident_not_found")

    incident = dict(incidents[incident_index])
    incident["status"] = payload.status
    if payload.action_needed is not None:
        incident["action_needed"] = payload.action_needed
    incidents[incident_index] = incident

    now = datetime.now(timezone.utc)
    await db.shift_handoffs.update_one(
        {"_id": oid},
        {
            "$set": {
                "incidents": incidents,
                "updated_at": now,
            },
        },
    )

    await log_action(
        current_user["username"],
        "shift_handoff_incident_status_update",
        f"Updated incident {incident_index} on shift handoff {handoff_id} to {payload.status}",
    )

    updated = await db.shift_handoffs.find_one({"_id": oid})
    return _serialize(updated)


# ── POST /{id}/attachments — upload image ────────────────────────────────────

@router.post("/{handoff_id}/attachments")
async def upload_attachment(
    handoff_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_handoff_id")

    doc = await db.shift_handoffs.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="handoff_not_found")

    is_author = doc.get("created_by") == current_user["username"]
    is_privileged = current_user.get("role") in ("admin", "manager")
    if not is_author and not is_privileged:
        raise HTTPException(status_code=403, detail="upload_not_allowed")

    current_attachments = doc.get("attachments", [])
    if len(current_attachments) >= MAX_ATTACHMENTS:
        raise HTTPException(status_code=400, detail=f"max_{MAX_ATTACHMENTS}_attachments")

    content_type = file.content_type or ""
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="only_images_allowed")

    contents = await file.read()
    if len(contents) > MAX_ATTACHMENT_SIZE:
        raise HTTPException(status_code=400, detail="file_too_large_max_2mb")

    b64 = base64.b64encode(contents).decode("ascii")
    data_uri = f"data:{content_type};base64,{b64}"

    attachment = {
        "id": str(ObjectId()),
        "filename": file.filename or "image",
        "content_type": content_type,
        "size": len(contents),
        "data_uri": data_uri,
        "uploaded_by": current_user["username"],
        "uploaded_at": datetime.now(timezone.utc),
    }

    await db.shift_handoffs.update_one(
        {"_id": oid},
        {
            "$push": {"attachments": attachment},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
    )

    await log_action(
        current_user["username"],
        "shift_handoff_attachment_upload",
        f"Uploaded attachment to handoff {handoff_id}",
    )
    return {
        "id": attachment["id"],
        "filename": attachment["filename"],
        "content_type": attachment["content_type"],
        "size": attachment["size"],
        "data_uri": data_uri,
    }


# ── DELETE /{id}/attachments/{attachment_id} — remove image ──────────────────

@router.delete("/{handoff_id}/attachments/{attachment_id}")
async def delete_attachment(
    handoff_id: str,
    attachment_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_handoff_id")

    doc = await db.shift_handoffs.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="handoff_not_found")

    is_author = doc.get("created_by") == current_user["username"]
    is_privileged = current_user.get("role") in ("admin", "manager")
    if not is_author and not is_privileged:
        raise HTTPException(status_code=403, detail="delete_not_allowed")

    result = await db.shift_handoffs.update_one(
        {"_id": oid},
        {
            "$pull": {"attachments": {"id": attachment_id}},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
    )

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="attachment_not_found")

    await log_action(
        current_user["username"],
        "shift_handoff_attachment_delete",
        f"Deleted attachment {attachment_id} from handoff {handoff_id}",
    )
    return {"deleted": True}


# ── DELETE /{id} — remove handoff (admin only) ───────────────────────────────

@router.delete("/{handoff_id}")
async def delete_handoff(
    handoff_id: str,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_handoff_id")

    result = await db.shift_handoffs.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="handoff_not_found")

    await log_action(
        current_user["username"],
        "shift_handoff_delete",
        f"Deleted shift handoff {handoff_id}",
    )
    logger.info("Shift handoff %s deleted by %s", handoff_id, current_user["username"])
    return {"deleted": True}

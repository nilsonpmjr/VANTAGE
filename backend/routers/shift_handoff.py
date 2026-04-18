import base64
import re
from datetime import datetime, timezone, timedelta

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from pydantic import BaseModel, StrictBool, field_validator

from db import db_manager
from auth import get_current_user, require_role
from audit import log_action
from logging_config import get_logger
from shift_handoff_migration import migrate_shift_handoff_incidents
from shift_handoff_config import (
    get_shift_handoff_config,
    is_artifact_capture_enabled,
    update_shift_handoff_config,
)

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


# Request models

class IncidentEntry(BaseModel):
    incident_id: str | None = None
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


# Serialization helpers

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


def _serialize_incident(doc: dict) -> dict:
    def _ts(v):
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return v

    return {
        "id": str(doc.get("_id")),
        "handoff_id": str(doc.get("handoff_id")),
        "handoff_shift_date": doc.get("handoff_shift_date", ""),
        "created_at": _ts(doc.get("created_at")),
        "created_by": doc.get("created_by", ""),
        "updated_at": _ts(doc.get("updated_at")),
        "updated_by": doc.get("updated_by", ""),
        "resolved_at": _ts(doc.get("resolved_at")),
        "resolved_by": doc.get("resolved_by", ""),
        "team_members": doc.get("team_members", []),
        "title": doc.get("title", ""),
        "severity": doc.get("severity", "medium"),
        "status": doc.get("status", "active"),
        "action_needed": doc.get("action_needed", ""),
    }


async def _create_persistent_incidents(
    db,
    *,
    handoff_id: ObjectId,
    shift_date: str,
    team_members: list[str],
    incidents: list[IncidentEntry],
    current_user: dict,
    now: datetime,
) -> list[dict]:
    serialized: list[dict] = []
    for incident in incidents:
        incident_id = ObjectId()
        incident_doc = {
            "_id": incident_id,
            "handoff_id": handoff_id,
            "handoff_shift_date": shift_date,
            "team_members": team_members,
            "created_at": now,
            "created_by": current_user["username"],
            "updated_at": now,
            "updated_by": current_user["username"],
            "resolved_at": now if incident.status == "resolved" else None,
            "resolved_by": current_user["username"] if incident.status == "resolved" else "",
            "title": incident.title,
            "severity": incident.severity,
            "status": incident.status,
            "action_needed": incident.action_needed,
        }
        await db.shift_handoff_incidents.insert_one(incident_doc)
        serialized.append(
            {
                "incident_id": str(incident_id),
                "title": incident.title,
                "status": incident.status,
                "severity": incident.severity,
                "action_needed": incident.action_needed,
            }
        )
    return serialized


async def _sync_persistent_incidents(
    db,
    *,
    handoff_oid: ObjectId,
    existing_doc: dict,
    incoming_incidents: list[IncidentEntry],
    current_user: dict,
    now: datetime,
) -> list[dict]:
    existing_snapshots = {
        incident.get("incident_id"): incident
        for incident in existing_doc.get("incidents", [])
        if incident.get("incident_id")
    }
    incoming_by_id = {
        incident.incident_id: incident
        for incident in incoming_incidents
        if incident.incident_id
    }

    for incident_id, snapshot in existing_snapshots.items():
        if incident_id in incoming_by_id:
            continue
        await db.shift_handoff_incidents.update_one(
            {"_id": ObjectId(incident_id)},
            {
                "$set": {
                    "status": "resolved",
                    "updated_at": now,
                    "updated_by": current_user["username"],
                    "resolved_at": now,
                    "resolved_by": current_user["username"],
                    "action_needed": snapshot.get("action_needed", ""),
                }
            },
        )

    serialized: list[dict] = []
    for incident in incoming_incidents:
        if incident.incident_id:
            oid = ObjectId(incident.incident_id)
            update_fields = {
                "title": incident.title,
                "severity": incident.severity,
                "status": incident.status,
                "action_needed": incident.action_needed,
                "updated_at": now,
                "updated_by": current_user["username"],
            }
            if incident.status == "resolved":
                update_fields["resolved_at"] = now
                update_fields["resolved_by"] = current_user["username"]
            else:
                update_fields["resolved_at"] = None
                update_fields["resolved_by"] = ""

            await db.shift_handoff_incidents.update_one({"_id": oid}, {"$set": update_fields})
            serialized.append(
                {
                    "incident_id": incident.incident_id,
                    "title": incident.title,
                    "status": incident.status,
                    "severity": incident.severity,
                    "action_needed": incident.action_needed,
                }
            )
            continue

        created = await _create_persistent_incidents(
            db,
            handoff_id=handoff_oid,
            shift_date=existing_doc["shift_date"],
            team_members=existing_doc.get("team_members", []),
            incidents=[incident],
            current_user=current_user,
            now=now,
        )
        serialized.extend(created)

    return serialized


# Create a shift handoff

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
        "incidents": [],
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

    doc["incidents"] = await _create_persistent_incidents(
        db,
        handoff_id=result.inserted_id,
        shift_date=payload.shift_date,
        team_members=payload.team_members,
        incidents=payload.incidents,
        current_user=current_user,
        now=now,
    )
    await db.shift_handoffs.update_one(
        {"_id": result.inserted_id},
        {"$set": {"incidents": doc["incidents"]}},
    )

    await log_action(
        db,
        current_user["username"],
        "shift_handoff_create",
        f"Created shift handoff for {payload.shift_date}",
    )
    logger.info("Shift handoff created by %s for %s", current_user["username"], payload.shift_date)
    return _serialize(doc)


# List active handoffs

@router.get("")
async def list_handoffs(
    current_user: dict = Depends(get_current_user),
    days: int | None = Query(None, description="Filter by configured visibility window"),
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
        query["visibility_days"] = days

    cursor = db.shift_handoffs.find(query).sort("created_at", -1).skip(offset).limit(limit)
    results = []
    async for doc in cursor:
        results.append(_serialize(doc))
    return results


# ── Pending artifacts (analyst activity for a shift window) ────────────────
#
# Queries existing `scans` and `recon_jobs` collections filtered by a time
# window and optional team-members list. No new collection is used — this
# endpoint is a thin read-model over already-captured analyst activity and
# is gated by the shift_handoff_config auto_artifacts flags.


MAX_PENDING_ARTIFACTS_LIMIT = 500


async def _resolve_team_members_to_usernames(db, members: list[str]) -> list[str]:
    """Resolve free-text team member names to canonical usernames.

    The handoff `team_members` field is a free-text list of names the analyst
    typed (e.g. "Nilson, Samuel"). Scans/recons store `analyst = username`
    (login), so a direct `$in` against those strings never matches.

    This helper looks up the `users` collection with a case-insensitive
    regex against `username`, `name`, and the first token of `name` (so
    "Nilson" resolves to username of "Nilson PM Jr"). Any member that
    resolves is expanded to the set of matching usernames. Members that
    don't resolve are treated as literal usernames (last-resort fallback).
    The returned list is deduped and never contains empty strings.
    """
    if not members:
        return []

    resolved: set[str] = set()
    for raw in members:
        name = raw.strip()
        if not name:
            continue
        # Escape regex metacharacters so user input can't craft a bad regex
        escaped = re.escape(name)
        # Match anywhere in username OR anywhere in name (case-insensitive).
        # `name` is a display name like "Nilson PM Jr" — a first-token search
        # is achieved naturally by the substring match.
        query = {
            "$or": [
                {"username": {"$regex": f"^{escaped}$", "$options": "i"}},
                {"name": {"$regex": f"(^|\\s){escaped}(\\s|$)", "$options": "i"}},
            ]
        }
        matched_any = False
        async for doc in db.users.find(query, {"username": 1}):
            username = doc.get("username")
            if username:
                resolved.add(username)
                matched_any = True
        if not matched_any:
            # Fallback: treat the input as a literal username so users that
            # happen to type the exact login still work.
            resolved.add(name)

    return sorted(resolved)


@router.get("/pending-artifacts")
async def list_pending_artifacts(
    since: datetime = Query(..., description="ISO-8601 lower bound (inclusive)"),
    until: datetime = Query(..., description="ISO-8601 upper bound (inclusive)"),
    team_members: str = Query(
        "",
        description="Comma-separated analyst usernames; empty = no analyst filter",
    ),
    limit: int = Query(
        100,
        ge=1,
        le=MAX_PENDING_ARTIFACTS_LIMIT,
        description="Per-source limit",
    ),
    current_user: dict = Depends(get_current_user),
):
    """
    Return analyze + recon activity within [since, until] for the given
    analyst list, respecting the auto_artifacts master/sub toggles.

    Shape:
        {
          "since": "...",
          "until": "...",
          "team_members": [...],
          "analyze": [...],
          "recon": [...],
          "total": N,
          "capture": {"analyze": bool, "recon": bool}
        }
    """
    del current_user  # auth enforced by dependency

    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="database_unavailable")

    # Normalize datetimes to UTC-aware
    if since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)

    if since >= until:
        raise HTTPException(status_code=400, detail="since_must_precede_until")

    members = [m.strip() for m in team_members.split(",") if m.strip()]
    resolved_usernames = await _resolve_team_members_to_usernames(db, members)

    capture_analyze = await is_artifact_capture_enabled(db, "analyze")
    capture_recon = await is_artifact_capture_enabled(db, "recon")

    analyze_items: list[dict] = []
    recon_items: list[dict] = []

    if capture_analyze:
        analyze_query: dict = {"timestamp": {"$gte": since, "$lte": until}}
        if resolved_usernames:
            analyze_query["analyst"] = {"$in": resolved_usernames}
        scan_docs = await (
            db.scans.find(
                analyze_query,
                {
                    "_id": 1,
                    "target": 1,
                    "type": 1,
                    "verdict": 1,
                    "risk_score": 1,
                    "analyst": 1,
                    "timestamp": 1,
                },
            )
            .sort("timestamp", -1)
            .limit(limit)
            .to_list(length=limit)
        )
        for doc in scan_docs:
            ts = doc.get("timestamp")
            analyze_items.append(
                {
                    "id": str(doc["_id"]) if doc.get("_id") is not None else None,
                    "kind": "analyze",
                    "timestamp": ts.isoformat() if isinstance(ts, datetime) else ts,
                    "target": doc.get("target"),
                    "target_type": doc.get("type"),
                    "verdict": doc.get("verdict"),
                    "risk_score": doc.get("risk_score"),
                    "analyst": doc.get("analyst"),
                }
            )

    if capture_recon:
        recon_query: dict = {
            "created_at": {"$gte": since, "$lte": until},
            "status": "done",
        }
        if resolved_usernames:
            recon_query["analyst"] = {"$in": resolved_usernames}
        recon_docs = await (
            db.recon_jobs.find(
                recon_query,
                {
                    "_id": 1,
                    "target": 1,
                    "target_type": 1,
                    "modules": 1,
                    "analyst": 1,
                    "status": 1,
                    "created_at": 1,
                    "risk_indicators_summary": 1,
                },
            )
            .sort("created_at", -1)
            .limit(limit)
            .to_list(length=limit)
        )
        for doc in recon_docs:
            ts = doc.get("created_at")
            recon_items.append(
                {
                    "id": str(doc["_id"]),
                    "job_id": str(doc["_id"]),
                    "kind": "recon",
                    "timestamp": ts.isoformat() if isinstance(ts, datetime) else ts,
                    "target": doc.get("target"),
                    "target_type": doc.get("target_type"),
                    "modules": doc.get("modules") or [],
                    "status": doc.get("status"),
                    "analyst": doc.get("analyst"),
                    "risk_indicators_summary": doc.get("risk_indicators_summary"),
                }
            )

    return {
        "since": since.isoformat(),
        "until": until.isoformat(),
        "team_members": members,
        "analyze": analyze_items,
        "recon": recon_items,
        "total": len(analyze_items) + len(recon_items),
        "capture": {"analyze": capture_analyze, "recon": capture_recon},
    }


# ── Runtime config: auto-artifacts toggle ──────────────────────────────────
#
# IMPORTANT: these routes MUST be declared BEFORE any /{handoff_id} route,
# otherwise FastAPI will match GET /config against GET /{handoff_id} and
# try to parse "config" as an ObjectId, returning 400.


class AutoArtifactsPatch(BaseModel):
    enabled: StrictBool | None = None
    capture_analyze: StrictBool | None = None
    capture_recon: StrictBool | None = None


class ShiftHandoffConfigPatch(BaseModel):
    auto_artifacts: AutoArtifactsPatch


@router.get("/config")
async def read_shift_handoff_config(
    current_user: dict = Depends(get_current_user),
):
    """Return the current shift handoff runtime config for any authenticated user."""
    del current_user  # required by dependency, unused in body
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="database_unavailable")

    config = await get_shift_handoff_config(db)
    return config


@router.patch("/config")
async def patch_shift_handoff_config(
    payload: ShiftHandoffConfigPatch,
    current_user: dict = Depends(require_role(["admin"])),
):
    """Admin-only partial update of shift handoff runtime config."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="database_unavailable")

    # Pydantic -> plain dict, dropping None so we don't overwrite untouched flags
    auto_patch = {
        key: value
        for key, value in payload.auto_artifacts.model_dump().items()
        if value is not None
    }
    if not auto_patch:
        raise HTTPException(
            status_code=400,
            detail="at_least_one_field_required",
        )

    try:
        updated = await update_shift_handoff_config(
            db,
            {"auto_artifacts": auto_patch},
            updated_by=current_user["username"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    await log_action(
        db,
        current_user["username"],
        "settings.shift_handoff.update",
        target="shift_handoff_config",
        detail=f"auto_artifacts={auto_patch}",
    )
    logger.info(
        "Shift handoff config updated by %s: %s",
        current_user["username"],
        auto_patch,
    )
    return updated


# Read a handoff

@router.get("/{handoff_id}")
async def get_handoff(
    handoff_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="invalid_handoff_id")

    doc = await db.shift_handoffs.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="handoff_not_found")

    doc_team = doc.get("team")
    user_team = current_user.get("team")
    is_privileged = current_user.get("role") in ("admin", "manager")
    if doc_team and user_team and doc_team != user_team and not is_privileged:
        raise HTTPException(status_code=403, detail="access_denied")

    return _serialize(doc)


# Update a handoff

@router.put("/{handoff_id}")
async def update_handoff(
    handoff_id: str,
    payload: ShiftHandoffUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="invalid_handoff_id")

    doc = await db.shift_handoffs.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="handoff_not_found")

    is_author = doc.get("created_by") == current_user["username"]
    is_privileged = current_user.get("role") in ("admin", "manager")

    doc_team = doc.get("team")
    user_team = current_user.get("team")
    if doc_team and user_team and doc_team != user_team and not is_privileged:
        raise HTTPException(status_code=403, detail="access_denied")

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
        update_fields["incidents"] = await _sync_persistent_incidents(
            db,
            handoff_oid=oid,
            existing_doc=doc,
            incoming_incidents=payload.incidents,
            current_user=current_user,
            now=now,
        )
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
        db,
        current_user["username"],
        "shift_handoff_update",
        f"Updated shift handoff {handoff_id}",
    )
    return _serialize(updated)


# Acknowledge a handoff

@router.post("/{handoff_id}/acknowledge")
async def acknowledge_handoff(
    handoff_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except (InvalidId, TypeError):
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
        db,
        current_user["username"],
        "shift_handoff_acknowledge",
        f"Acknowledged shift handoff {handoff_id}",
    )
    updated = await db.shift_handoffs.find_one({"_id": oid})
    return _serialize(updated)


# Update an incident lifecycle

@router.post("/{handoff_id}/incidents/{incident_id}/status")
async def update_incident_status(
    handoff_id: str,
    incident_id: str,
    payload: ShiftHandoffIncidentStatusUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="invalid_handoff_id")

    doc = await db.shift_handoffs.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="handoff_not_found")

    incidents = list(doc.get("incidents", []))
    incident_index = next(
        (
            index
            for index, incident in enumerate(incidents)
            if incident.get("incident_id") == incident_id
        ),
        -1,
    )
    if incident_index < 0:
        raise HTTPException(status_code=404, detail="incident_not_found")

    incident = dict(incidents[incident_index])
    incident["status"] = payload.status
    if payload.action_needed is not None:
        incident["action_needed"] = payload.action_needed
    incidents[incident_index] = incident

    now = datetime.now(timezone.utc)
    if incident.get("incident_id") != incident_id:
        raise HTTPException(status_code=400, detail="incident_not_persistent")

    await db.shift_handoff_incidents.update_one(
        {"_id": ObjectId(incident_id)},
        {
            "$set": {
                "status": payload.status,
                "action_needed": incident.get("action_needed", ""),
                "updated_at": now,
                "updated_by": current_user["username"],
                "resolved_at": now if payload.status == "resolved" else None,
                "resolved_by": current_user["username"] if payload.status == "resolved" else "",
            }
        },
    )

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
        db,
        current_user["username"],
        "shift_handoff_incident_status_update",
        f"Updated incident {incident_id} on shift handoff {handoff_id} to {payload.status}",
    )

    updated = await db.shift_handoffs.find_one({"_id": oid})
    return _serialize(updated)


@router.get("/incidents/active")
async def list_persistent_incidents(
    current_user: dict = Depends(get_current_user),
    status: str | None = Query(None, description="Filter by status"),
    limit: int = Query(200, ge=1, le=500),
):
    db = db_manager.db
    await migrate_shift_handoff_incidents(db)
    query: dict = {}
    if status:
        query["status"] = status.strip().lower()

    cursor = db.shift_handoff_incidents.find(query).sort("created_at", -1).limit(limit)
    results = []
    async for doc in cursor:
        results.append(_serialize_incident(doc))
    return results


def _matches_image_signature(content_type: str, contents: bytes) -> bool:
    if content_type == "image/png":
        return contents.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return contents.startswith(b"\xff\xd8\xff")
    if content_type == "image/gif":
        return contents.startswith((b"GIF87a", b"GIF89a"))
    if content_type == "image/webp":
        return (
            len(contents) >= 12
            and contents.startswith(b"RIFF")
            and contents[8:12] == b"WEBP"
        )
    return False


# Upload a handoff attachment

@router.post("/{handoff_id}/attachments")
async def upload_attachment(
    handoff_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except (InvalidId, TypeError):
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
    if not _matches_image_signature(content_type, contents):
        raise HTTPException(status_code=400, detail="invalid_image_payload")

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
        db,
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


# Delete a handoff attachment

@router.delete("/{handoff_id}/attachments/{attachment_id}")
async def delete_attachment(
    handoff_id: str,
    attachment_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except (InvalidId, TypeError):
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
        db,
        current_user["username"],
        "shift_handoff_attachment_delete",
        f"Deleted attachment {attachment_id} from handoff {handoff_id}",
    )
    return {"deleted": True}


# Delete a handoff

@router.delete("/{handoff_id}")
async def delete_handoff(
    handoff_id: str,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    try:
        oid = ObjectId(handoff_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="invalid_handoff_id")

    result = await db.shift_handoffs.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="handoff_not_found")

    await log_action(
        db,
        current_user["username"],
        "shift_handoff_delete",
        f"Deleted shift handoff {handoff_id}",
    )
    logger.info("Shift handoff %s deleted by %s", handoff_id, current_user["username"])
    return {"deleted": True}

"""RedMode project index, kept separate from the defensive threat feed."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from mimetypes import guess_type
from typing import Literal
from uuid import uuid4
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import DuplicateKeyError

from auth import get_current_user, has_permission
from config import settings
from db import db_manager
from logging_config import get_logger
from redmode_files import GridFSScopeStore, clean_filename, extract_scope_content
from redmode_scope import compile_scope_text, merge_scope_rules


router = APIRouter(prefix="/redmode", tags=["redmode"])
logger = get_logger("RedModeRouter")


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str = Field(min_length=3, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")
    display_name: str = Field(min_length=2, max_length=120)


ProjectPhase = Literal[
    "pre-engagement",
    "reconnaissance",
    "threat-modeling",
    "vulnerability-analysis",
    "exploitation",
    "post-exploitation",
    "reporting",
]


class ProjectPhaseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase: ProjectPhase


class ScopeTextCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=500_000)


async def require_redmode_access(current_user: dict = Depends(get_current_user)) -> dict:
    # API keys have no RedMode scope yet. Keep this workspace session-only.
    if current_user.get("_api_key_scopes") is not None or not has_permission(current_user, "redmode:access"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission_required:redmode:access")
    return current_user


def projects_collection():
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="database_unavailable")
    return db.redmode_projects


def scope_versions_collection():
    projects_collection()
    return db_manager.db.redmode_scope_versions


def file_store():
    projects_collection()
    return GridFSScopeStore(db_manager.db)


def project_summary(doc: dict) -> dict:
    return {
        "slug": doc["_id"],
        "display_name": doc["display_name"],
        "phase": doc["phase"],
        "status": doc["status"],
        "responsible": doc["responsible"],
        "last_activity_at": doc["last_activity_at"],
    }


def project_detail(doc: dict) -> dict:
    return {**project_summary(doc), "members": doc["members"], "created_at": doc["created_at"]}


HOME_ACTIVITY_TYPES = frozenset({
    "scope_published",
    "evidence_added",
    "finding_created",
    "finding_updated",
})
PTES_PHASE_ORDER = (
    "pre-engagement",
    "reconnaissance",
    "threat-modeling",
    "vulnerability-analysis",
    "exploitation",
    "post-exploitation",
    "reporting",
)
FINDING_SEVERITY_ORDER = ("informational", "low", "medium", "high", "critical")
HOME_ATTENTION_LIMIT = 8
HOME_RECENT_SOURCE_LIMIT = 8


async def _current_revisions_for_projects(project_slugs: list[str]) -> list[dict]:
    if not project_slugs:
        return []
    db = db_manager.db
    findings = [
        item
        async for item in db.redmode_findings.find({"project_slug": {"$in": project_slugs}})
    ]
    revision_ids = [item.get("current_revision_id") for item in findings]
    revision_ids = [item for item in revision_ids if item]
    if not revision_ids:
        return []
    return [
        item
        async for item in db.redmode_finding_revisions.find({
            "_id": {"$in": revision_ids},
            "project_slug": {"$in": project_slugs},
        })
    ]


async def _scope_versions_for_projects(projects: list[dict]) -> list[dict]:
    version_ids = [
        version_id
        for project in projects
        for version_id in project.get("scope_history", [])
    ]
    if not version_ids:
        return []
    return [
        item
        async for item in db_manager.db.redmode_scope_versions.find({
            "_id": {"$in": version_ids},
            "project_slug": {"$in": [project["_id"] for project in projects]},
        })
    ]


def _activity_series(projects: list[dict], now: datetime) -> list[dict]:
    today = now.astimezone(timezone.utc).date()
    days = [today - timedelta(days=offset) for offset in range(29, -1, -1)]
    buckets = {
        day.isoformat(): {"evidence": 0, "findings": 0, "scope_publications": 0}
        for day in days
    }
    event_fields = {
        "evidence_added": "evidence",
        "finding_created": "findings",
        "finding_updated": "findings",
        "scope_published": "scope_publications",
    }
    for project in projects:
        for event in project.get("activity_events", []):
            event_at = event.get("at")
            field = event_fields.get(event.get("type"))
            if field is None or not isinstance(event_at, datetime):
                continue
            day_key = event_at.astimezone(timezone.utc).date().isoformat()
            if day_key in buckets:
                buckets[day_key][field] += 1
    return [
        {"date": day, **counts, "total": sum(counts.values())}
        for day, counts in buckets.items()
    ]


def _attention_queue(projects: list[dict], current_revisions: list[dict]) -> list[dict]:
    findings_by_project: dict[str, Counter] = {}
    for revision in current_revisions:
        slug = revision.get("project_slug")
        if slug:
            findings_by_project.setdefault(slug, Counter())[revision.get("severity")] += 1

    items = []
    for project in projects:
        severities = findings_by_project.get(project["_id"], Counter())
        critical_count = severities["critical"]
        high_count = severities["high"]
        missing_scope = not project.get("active_scope_version")
        if not (critical_count or high_count or missing_scope):
            continue
        reasons = []
        if critical_count:
            reasons.append({"kind": "critical_findings", "count": critical_count})
        if missing_scope:
            reasons.append({"kind": "missing_scope", "count": 1})
        if high_count:
            reasons.append({"kind": "high_findings", "count": high_count})
        items.append({
            **project_summary(project),
            "reasons": reasons,
            "_sort": (
                0 if critical_count else 1,
                0 if missing_scope else 1,
                0 if high_count else 1,
                -project["last_activity_at"].timestamp(),
                project["_id"],
            ),
        })
    items.sort(key=lambda item: item["_sort"])
    return [
        {key: value for key, value in item.items() if key != "_sort"}
        for item in items[:HOME_ATTENTION_LIMIT]
    ]


def _recent_sources(projects: list[dict], scope_versions: list[dict]) -> list[dict]:
    projects_by_slug = {project["_id"]: project for project in projects}
    sources = []
    for version in scope_versions:
        project = projects_by_slug.get(version.get("project_slug"))
        if project is None:
            continue
        for file_info in version.get("source", {}).get("files", []):
            filename = file_info.get("filename", "")
            sources.append({
                "project_slug": project["_id"],
                "project_display_name": project["display_name"],
                "version_id": version["_id"],
                "file_id": file_info.get("id"),
                "filename": filename,
                "content_type": guess_type(filename)[0] or "application/octet-stream",
                "size": file_info.get("size", 0),
                "author": version["author"],
                "published_at": version["created_at"],
            })
    sources.sort(key=lambda item: (
        -item["published_at"].timestamp(),
        item["project_slug"],
        item["version_id"],
        item["filename"],
    ))
    return sources[:HOME_RECENT_SOURCE_LIMIT]


@router.get("/home")
async def get_offensive_home(current_user: dict = Depends(require_redmode_access)):
    """Return a member-scoped operational summary for the Offensive Mode Home."""
    db = db_manager.db
    username = current_user["username"]
    now = datetime.now(timezone.utc)
    projects = [
        item
        async for item in projects_collection().find({"members": username}).sort("last_activity_at", -1)
    ]
    project_slugs = [item["_id"] for item in projects]
    active_projects = [item for item in projects if item.get("status") == "active"]
    current_revisions = await _current_revisions_for_projects(project_slugs)
    scope_versions = await _scope_versions_for_projects(projects)
    phase_counts = Counter(item.get("phase") for item in projects)
    severity_counts = Counter(item.get("severity") for item in current_revisions)
    active_with_scope = sum(1 for item in active_projects if item.get("active_scope_version"))
    recent_cutoff = now - timedelta(days=7)
    recent_activity = sum(
        1
        for project in projects
        for event in project.get("activity_events", [])
        if event.get("type") in HOME_ACTIVITY_TYPES
        and isinstance(event.get("at"), datetime)
        and event["at"] >= recent_cutoff
    )

    user_doc = await db.users.find_one({"username": username})
    remembered_slug = user_doc.get("last_offensive_engagement") if user_doc else None
    resume_project = next(
        (item for item in projects if item["_id"] == remembered_slug),
        projects[0] if projects else None,
    )
    resume = None
    if resume_project is not None:
        active_scope = None
        active_scope_id = resume_project.get("active_scope_version")
        if active_scope_id:
            scope_doc = await db.redmode_scope_versions.find_one({
                "_id": active_scope_id,
                "project_slug": resume_project["_id"],
            })
            if scope_doc is not None:
                active_scope = {
                    "id": scope_doc["_id"],
                    "author": scope_doc["author"],
                    "created_at": scope_doc["created_at"],
                }
        resume = {**project_summary(resume_project), "active_scope": active_scope}

    return {
        "generated_at": now,
        "resume": resume,
        "metrics": {
            "active_engagements": len(active_projects),
            "scopes_needing_attention": sum(
                1 for item in active_projects if not item.get("active_scope_version")
            ),
            "high_critical_findings": sum(
                1 for item in current_revisions if item.get("severity") in {"high", "critical"}
            ),
            "activity_7d": recent_activity,
        },
        "charts": {
            "ptes_pipeline": [
                {"phase": phase, "count": phase_counts[phase]}
                for phase in PTES_PHASE_ORDER
            ],
            "finding_severity": [
                {"severity": severity, "count": severity_counts[severity]}
                for severity in FINDING_SEVERITY_ORDER
            ],
            "scope_readiness": {
                "with_active_scope": active_with_scope,
                "without_active_scope": len(active_projects) - active_with_scope,
            },
            "activity_30d": _activity_series(projects, now),
        },
        "attention": _attention_queue(projects, current_revisions),
        "recent_sources": _recent_sources(projects, scope_versions),
    }


async def load_project_for_member(slug: str, current_user: dict) -> dict:
    doc = await projects_collection().find_one({"_id": slug})
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")
    if current_user["username"] not in doc["members"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="project_membership_required")
    return doc


@router.get("/projects")
async def list_projects(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_redmode_access),
):
    collection = projects_collection()
    total = await collection.count_documents({})
    cursor = collection.find({}).sort("last_activity_at", -1).skip(offset).limit(limit)
    items = [project_summary(doc) async for doc in cursor]
    return {"items": items, "total": total}


@router.post("/projects", status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    current_user: dict = Depends(require_redmode_access),
):
    collection = projects_collection()
    now = datetime.now(timezone.utc)
    username = current_user["username"]
    doc = {
        "_id": payload.slug,
        "display_name": payload.display_name.strip(),
        "phase": "pre-engagement",
        "status": "active",
        "responsible": username,
        "members": [username],
        "created_at": now,
        "last_activity_at": now,
        "activity_events": [{"type": "project_created", "author": username, "subject": payload.slug, "at": now}],
    }
    if len(doc["display_name"]) < 2:
        raise HTTPException(status_code=422, detail="invalid_display_name")
    try:
        await collection.insert_one(doc)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="project_slug_exists") from exc
    return project_detail(doc)


@router.get("/projects/{slug}")
async def get_project(
    slug: str,
    current_user: dict = Depends(require_redmode_access),
):
    doc = await load_project_for_member(slug, current_user)
    return project_detail(doc)


@router.put("/projects/{slug}/resume")
async def remember_project_for_resume(
    slug: str,
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_member(slug, current_user)
    await db_manager.db.users.update_one(
        {"username": current_user["username"]},
        {"$set": {"last_offensive_engagement": slug}},
    )
    return {"slug": slug}


@router.get("/projects/{slug}/activity")
async def list_project_activity(
    slug: str,
    current_user: dict = Depends(require_redmode_access),
):
    doc = await load_project_for_member(slug, current_user)
    return {"items": doc.get("activity_events", [])}


@router.put("/projects/{slug}/phase")
async def update_project_phase(
    slug: str,
    payload: ProjectPhaseUpdate,
    current_user: dict = Depends(require_redmode_access),
):
    doc = await load_project_for_member(slug, current_user)
    if current_user["username"] != doc["responsible"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="project_responsible_required",
        )
    if payload.phase == doc["phase"]:
        return project_detail(doc)

    now = datetime.now(timezone.utc)
    event = {
        "type": "phase_changed",
        "author": current_user["username"],
        "subject": f'{doc["phase"]} -> {payload.phase}',
        "at": now,
    }
    result = await projects_collection().update_one(
        {"_id": slug, "phase": doc["phase"]},
        {
            "$set": {"phase": payload.phase, "last_activity_at": now},
            "$push": {"activity_events": event},
        },
    )
    if result.modified_count != 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="project_changed_retry",
        )
    updated_doc = await projects_collection().find_one({"_id": slug})
    return project_detail(updated_doc)


async def change_members(slug: str, username: str, current_user: dict, *, add: bool) -> dict:
    doc = await load_project_for_member(slug, current_user)
    if current_user["username"] != doc["responsible"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="project_responsible_required")
    members = list(doc["members"])
    if add:
        user = await db_manager.db.users.find_one({"username": username})
        if user is None or not user.get("is_active") or not has_permission(user, "redmode:access"):
            raise HTTPException(status_code=422, detail="member_not_eligible")
        if username in members:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="member_already_added")
        updated_members = [*members, username]
        event_type = "member_added"
    else:
        if username == doc["responsible"]:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="cannot_remove_responsible")
        if username not in members:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="member_not_found")
        updated_members = [member for member in members if member != username]
        event_type = "member_removed"

    now = datetime.now(timezone.utc)
    event = {"type": event_type, "author": current_user["username"], "subject": username, "at": now}
    result = await projects_collection().update_one(
        {"_id": slug, "members": members},
        {"$set": {"members": updated_members, "last_activity_at": now}, "$push": {"activity_events": event}},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="project_changed_retry")
    updated_doc = await projects_collection().find_one({"_id": slug})
    return project_detail(updated_doc)


@router.put("/projects/{slug}/members/{username}")
async def add_member(
    slug: str,
    username: str,
    current_user: dict = Depends(require_redmode_access),
):
    return await change_members(slug, username, current_user, add=True)


@router.delete("/projects/{slug}/members/{username}")
async def remove_member(
    slug: str,
    username: str,
    current_user: dict = Depends(require_redmode_access),
):
    return await change_members(slug, username, current_user, add=False)


def scope_version_detail(doc: dict) -> dict:
    return {
        "id": doc["_id"],
        "project_slug": doc["project_slug"],
        "author": doc["author"],
        "created_at": doc["created_at"],
        "source": doc["source"],
        "rules": doc["rules"],
    }


async def _publish_scope(project: dict, source: dict, rules: list[dict], current_user: dict) -> dict:
    slug = project["_id"]
    now = datetime.now(timezone.utc)
    version_id = uuid4().hex
    version = {
        "_id": version_id,
        "project_slug": slug,
        "author": current_user["username"],
        "created_at": now,
        "source": source,
        "rules": rules,
    }
    versions = scope_versions_collection()
    await versions.insert_one(version)
    event = {"type": "scope_published", "author": current_user["username"], "subject": version_id, "at": now}
    try:
        result = await projects_collection().update_one(
            {"_id": slug, "members": project["members"], "active_scope_version": project.get("active_scope_version")},
            {
                "$set": {"active_scope_version": version_id, "last_activity_at": now},
                "$push": {"scope_history": version_id, "activity_events": event},
            },
        )
    except Exception:
        await versions.delete_one({"_id": version_id})
        raise
    if result.modified_count != 1:
        await versions.delete_one({"_id": version_id})
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="project_changed_retry")
    return scope_version_detail(version)


@router.post("/projects/{slug}/scope/text", status_code=status.HTTP_201_CREATED)
async def publish_text_scope(
    slug: str,
    payload: ScopeTextCreate,
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_member(slug, current_user)
    try:
        rules = compile_scope_text(payload.text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    source = {
        "kind": "text",
        "text": payload.text,
        "sha256": sha256(payload.text.encode("utf-8")).hexdigest(),
        "files": [],
    }
    return await _publish_scope(project, source, rules, current_user)


@router.get("/scope/limits")
async def get_scope_limits(current_user: dict = Depends(require_redmode_access)):
    return {
        "max_text_characters": 500_000,
        "max_files": settings.redmode_scope_max_files,
        "max_file_bytes": settings.redmode_scope_max_file_bytes,
        "extensions": [".txt", ".csv", ".json", ".pdf", ".docx", ".xlsx"],
    }


@router.post("/projects/{slug}/scope/submit", status_code=status.HTTP_201_CREATED)
async def publish_scope_bundle(
    slug: str,
    text: str = Form(""),
    files: list[UploadFile] | None = File(None),
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_member(slug, current_user)
    uploads = files or []
    if len(text) > 500_000:
        raise HTTPException(status_code=413, detail="scope_text_too_large")
    if len(uploads) > settings.redmode_scope_max_files:
        raise HTTPException(status_code=413, detail="scope_too_many_files")

    groups = []
    if text.strip():
        try:
            groups.append(compile_scope_text(text, source_id="text"))
        except ValueError:
            pass  # Keep operator text as a source if files provide valid targets.

    prepared = []
    for upload in uploads:
        filename = clean_filename(upload.filename or "")
        content = await upload.read(settings.redmode_scope_max_file_bytes + 1)
        if len(content) > settings.redmode_scope_max_file_bytes:
            raise HTTPException(status_code=413, detail="scope_file_too_large")
        try:
            extracted, positions = extract_scope_content(filename, content)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        source_id = uuid4().hex
        try:
            file_rules = compile_scope_text(extracted, source_id=source_id)
            for rule in file_rules:
                for origin in rule["origins"]:
                    if origin["line"] in positions:
                        origin["position"] = positions[origin["line"]]
            groups.append(file_rules)
        except ValueError:
            pass  # A readable file without targets remains a source, not authorization.
        prepared.append({
            "source_id": source_id,
            "filename": filename,
            "content": content,
            "sha256": sha256(content).hexdigest(),
        })

    rules = merge_scope_rules(groups)
    if not rules:
        raise HTTPException(status_code=422, detail="scope_has_no_targets")

    store = file_store() if prepared else None
    saved_ids = []
    file_metadata = []
    try:
        for item in prepared:
            file_id = await store.save(item["filename"], item["content"], {
                "project_slug": slug,
                "author": current_user["username"],
                "sha256": item["sha256"],
            })
            saved_ids.append(file_id)
            file_metadata.append({
                "id": file_id,
                "source_id": item["source_id"],
                "filename": item["filename"],
                "size": len(item["content"]),
                "sha256": item["sha256"],
            })
        fingerprint = sha256(text.encode("utf-8") + "".join(item["sha256"] for item in prepared).encode("ascii")).hexdigest()
        source = {"kind": "bundle", "text": text, "sha256": fingerprint, "files": file_metadata}
        return await _publish_scope(project, source, rules, current_user)
    except Exception as exc:
        if store is not None:
            for file_id in saved_ids:
                try:
                    await store.delete(file_id)
                except Exception:
                    logger.warning("Failed to clean up unpublished RedMode scope file")
        if isinstance(exc, HTTPException):
            raise
        logger.exception("RedMode scope bundle could not be published")
        raise HTTPException(status_code=503, detail="scope_storage_unavailable") from exc


@router.get("/projects/{slug}/scope/versions/{version_id}/files/{file_id}")
async def download_scope_file(
    slug: str,
    version_id: str,
    file_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_member(slug, current_user)
    if version_id not in project.get("scope_history", []):
        raise HTTPException(status_code=404, detail="scope_version_not_found")
    version = await scope_versions_collection().find_one({"_id": version_id, "project_slug": slug})
    if version is None:
        raise HTTPException(status_code=404, detail="scope_version_not_found")
    file_info = next((item for item in version["source"].get("files", []) if item["id"] == file_id), None)
    if file_info is None:
        raise HTTPException(status_code=404, detail="scope_file_not_found")
    try:
        content = await file_store().read(file_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="scope_file_unavailable") from exc
    name = clean_filename(file_info["filename"])
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}",
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/projects/{slug}/scope/active")
async def get_active_scope(
    slug: str,
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_member(slug, current_user)
    version_id = project.get("active_scope_version")
    if not version_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scope_not_published")
    version = await scope_versions_collection().find_one({"_id": version_id, "project_slug": slug})
    if version is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="scope_version_unavailable")
    return scope_version_detail(version)


@router.get("/projects/{slug}/scope/versions")
async def list_scope_versions(
    slug: str,
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_member(slug, current_user)
    versions = scope_versions_collection()
    items = []
    for version_id in reversed(project.get("scope_history", [])):
        version = await versions.find_one({"_id": version_id, "project_slug": slug})
        if version is not None:
            items.append({
                "id": version_id,
                "author": version["author"],
                "created_at": version["created_at"],
                "rule_count": len(version["rules"]),
                "source_hash": version["source"]["sha256"],
            })
    return {"items": items}


@router.get("/projects/{slug}/scope/versions/{version_id}")
async def get_scope_version(
    slug: str,
    version_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_member(slug, current_user)
    if version_id not in project.get("scope_history", []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="scope_version_not_found")
    version = await scope_versions_collection().find_one({"_id": version_id, "project_slug": slug})
    if version is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="scope_version_unavailable")
    return scope_version_detail(version)

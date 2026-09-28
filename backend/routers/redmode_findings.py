"""Human-authored Markdown findings with private drafts and immutable revisions."""

from __future__ import annotations

from datetime import datetime, timezone
from difflib import unified_diff
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from pymongo.errors import DuplicateKeyError

from db import db_manager
from logging_config import get_logger
from redmode_references import evidence_search_text, extract_internal_references, reference_context
from routers.redmode import (
    load_project_for_member,
    load_project_for_write,
    projects_collection,
    require_redmode_access,
)
from routers.redmode_evidence import (
    PTES_PHASES,
    _resolve_references,
    _validated_references,
    evidence_collection,
    evidence_revisions_collection,
)


router = APIRouter(prefix="/redmode", tags=["redmode-findings"])
logger = get_logger("RedModeFindings")
FINDING_TEMPLATE = """# Resumo

# Impacto

# Evidências

# Reprodução

# Recomendação
"""
SEVERITIES = frozenset({"informational", "low", "medium", "high", "critical"})


class FindingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=1, max_length=100_000)
    severity: Literal["informational", "low", "medium", "high", "critical"]
    phase: str
    targets: list[str] = Field(default_factory=list, max_length=100)
    evidence_ids: list[str] = Field(default_factory=list, max_length=100)

    @field_validator("title", "description")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("field_must_not_be_blank")
        return value.strip()

    @field_validator("phase")
    @classmethod
    def valid_phase(cls, value: str) -> str:
        if value not in PTES_PHASES:
            raise ValueError("invalid_ptes_phase")
        return value

    @field_validator("targets")
    @classmethod
    def valid_targets(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if any(not value or len(value) > 2_048 for value in normalized) or len(set(normalized)) != len(normalized):
            raise ValueError("invalid_targets")
        return normalized

    @field_validator("evidence_ids")
    @classmethod
    def valid_evidence_ids(cls, values: list[str]) -> list[str]:
        if any(not value or len(value) > 128 for value in values) or len(set(values)) != len(values):
            raise ValueError("invalid_evidence_ids")
        return values


class FindingEdit(FindingInput):
    expected_revision_id: str = Field(min_length=1, max_length=128)


class FindingDraftWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=100_000)
    severity: Literal["informational", "low", "medium", "high", "critical"] = "medium"
    phase: str = "pre-engagement"
    targets: list[str] = Field(default_factory=list, max_length=100)
    evidence_ids: list[str] = Field(default_factory=list, max_length=100)
    base_revision_id: str | None = Field(default=None, max_length=128)
    expected_version: int = Field(ge=0)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        return value.strip()

    @field_validator("phase")
    @classmethod
    def valid_phase(cls, value: str) -> str:
        if value not in PTES_PHASES:
            raise ValueError("invalid_ptes_phase")
        return value

    @field_validator("targets")
    @classmethod
    def valid_targets(cls, values: list[str]) -> list[str]:
        return FindingInput.valid_targets(values)

    @field_validator("evidence_ids")
    @classmethod
    def valid_evidence_ids(cls, values: list[str]) -> list[str]:
        return FindingInput.valid_evidence_ids(values)


class FindingDraftPublish(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)


class FindingDraftRebase(FindingDraftPublish):
    current_revision_id: str = Field(min_length=1, max_length=128)


def findings_collection():
    projects_collection()
    return db_manager.db.redmode_findings


def revisions_collection():
    projects_collection()
    return db_manager.db.redmode_finding_revisions


def drafts_collection():
    projects_collection()
    return db_manager.db.redmode_finding_drafts


def _draft_id(slug: str, finding_id: str, author: str) -> str:
    return f"{slug}:{finding_id}:{author}"


async def _private_draft(slug: str, finding_id: str, author: str) -> dict | None:
    return await drafts_collection().find_one({
        "_id": _draft_id(slug, finding_id, author),
        "project_slug": slug,
        "finding_id": finding_id,
        "author": author,
    })


async def validate_evidence_ids(slug: str, ids: list[str]) -> None:
    for evidence_id in ids:
        if await evidence_collection().find_one({"_id": evidence_id, "project_slug": slug}) is None:
            raise HTTPException(status_code=422, detail="evidence_not_in_project")


def _reference_fields(document: FindingInput | FindingDraftWrite, references: list[dict]) -> dict:
    return {
        "references": references,
        "reference_keys": [reference["key"] for reference in references],
        "search_text": evidence_search_text(document.title, document.description, [], references),
    }


def revision_detail(doc: dict) -> dict:
    description = doc.get("description", "")
    references = doc.get("references")
    if references is None:
        references = extract_internal_references(description)
    return {
        "id": doc["_id"], "finding_id": doc["finding_id"], "project_slug": doc["project_slug"],
        "number": doc["number"], "previous_revision_id": doc["previous_revision_id"],
        "author": doc["author"], "created_at": doc["created_at"],
        "title": doc["title"], "description": description,
        "severity": doc["severity"], "phase": doc["phase"],
        "targets": doc.get("targets", []), "evidence_ids": doc.get("evidence_ids", []),
        "references": references,
    }


def draft_detail(doc: dict) -> dict:
    description = doc.get("description", "")
    references = doc.get("references")
    if references is None:
        references = extract_internal_references(description)
    return {
        "id": doc["_id"], "finding_id": doc["finding_id"], "project_slug": doc["project_slug"],
        "author": doc["author"], "version": doc["version"],
        "base_revision_id": doc.get("base_revision_id"), "created_at": doc["created_at"],
        "updated_at": doc["updated_at"], "title": doc.get("title", ""),
        "description": description, "severity": doc.get("severity", "medium"),
        "phase": doc.get("phase", "pre-engagement"), "targets": doc.get("targets", []),
        "evidence_ids": doc.get("evidence_ids", []), "references": references,
    }


def draft_summary(doc: dict) -> dict:
    return {
        "finding_id": doc["finding_id"], "project_slug": doc["project_slug"],
        "version": doc["version"], "base_revision_id": doc.get("base_revision_id"),
        "updated_at": doc["updated_at"], "title": doc.get("title", ""),
        "severity": doc.get("severity", "medium"), "phase": doc.get("phase", "pre-engagement"),
        "is_new": doc.get("base_revision_id") is None,
    }


async def _current_revision(doc: dict) -> dict:
    revision = await revisions_collection().find_one({
        "_id": doc["current_revision_id"],
        "finding_id": doc["_id"],
        "project_slug": doc["project_slug"],
    })
    if revision is None:
        raise HTTPException(status_code=503, detail="finding_revision_unavailable")
    return revision


async def finding_detail(doc: dict) -> dict:
    revision = await _current_revision(doc)
    linked = evidence_collection().find({"project_slug": doc["project_slug"], "finding_id": doc["_id"]})
    evidence_ids = list(revision.get("evidence_ids", []))
    async for evidence in linked:
        if evidence["_id"] not in evidence_ids:
            evidence_ids.append(evidence["_id"])
    revision_notes = {
        note["current_revision_id"]: note["_id"]
        async for note in evidence_collection().find({"project_slug": doc["project_slug"]})
        if note.get("current_revision_id")
    }
    if revision_notes:
        linked_revisions = evidence_revisions_collection().find({
            "_id": {"$in": list(revision_notes)},
            "project_slug": doc["project_slug"],
            "finding_ids": doc["_id"],
        })
        async for evidence_revision in linked_revisions:
            note_id = revision_notes[evidence_revision["_id"]]
            if note_id not in evidence_ids:
                evidence_ids.append(note_id)
    detail = revision_detail(revision)
    return {
        "id": doc["_id"], "project_slug": doc["project_slug"], "origin": "human",
        "created_at": doc["created_at"], "updated_at": doc["updated_at"],
        "title": detail["title"], "description": detail["description"],
        "severity": detail["severity"], "phase": detail["phase"],
        "targets": detail["targets"], "evidence_ids": evidence_ids,
        "references": detail["references"],
        "revision": {"id": revision["_id"], "number": revision["number"],
                     "previous_revision_id": revision["previous_revision_id"],
                     "author": revision["author"], "created_at": revision["created_at"]},
    }


async def _record_activity(project: dict, event_type: str, finding_id: str, now: datetime, author: str) -> None:
    result = await projects_collection().update_one(
        {"_id": project["_id"], "members": project["members"]},
        {"$set": {"last_activity_at": now}, "$push": {"activity_events": {
            "type": event_type, "author": author, "subject": finding_id, "at": now,
        }}},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="project_changed_retry")


async def _store_revision(
    slug: str,
    finding_id: str,
    document: FindingInput,
    current_user: dict,
    project: dict,
    doc: dict | None,
) -> dict:
    previous = await _current_revision(doc) if doc else None
    references = await _validated_references(slug, document.description)
    now = datetime.now(timezone.utc)
    revision_id = uuid4().hex
    revision = {
        "_id": revision_id, "finding_id": finding_id, "project_slug": slug,
        "number": previous["number"] + 1 if previous else 1,
        "previous_revision_id": previous["_id"] if previous else None,
        "author": current_user["username"], "created_at": now,
        **document.model_dump(), **_reference_fields(document, references),
    }
    inserted_finding = False
    updated_finding = False
    previous_updated_at = doc.get("updated_at") if doc else None
    try:
        await revisions_collection().insert_one(revision)
        if doc is None:
            doc = {"_id": finding_id, "project_slug": slug, "current_revision_id": revision_id, "created_at": now, "updated_at": now}
            await findings_collection().insert_one(doc)
            inserted_finding = True
        else:
            result = await findings_collection().update_one(
                {"_id": finding_id, "project_slug": slug, "current_revision_id": previous["_id"]},
                {"$set": {"current_revision_id": revision_id, "updated_at": now}},
            )
            if result.modified_count != 1:
                raise HTTPException(status_code=409, detail="finding_changed_retry")
            updated_finding = True
        await _record_activity(project, "finding_updated" if previous else "finding_created", finding_id, now, current_user["username"])
    except Exception as exc:
        if inserted_finding:
            await findings_collection().delete_one({"_id": finding_id, "current_revision_id": revision_id})
        elif updated_finding:
            await findings_collection().update_one(
                {"_id": finding_id, "current_revision_id": revision_id},
                {"$set": {"current_revision_id": previous["_id"], "updated_at": previous_updated_at}},
            )
        await revisions_collection().delete_one({"_id": revision_id})
        if isinstance(exc, HTTPException):
            raise
        logger.exception("RedMode finding could not be stored")
        raise HTTPException(status_code=503, detail="finding_storage_unavailable") from exc
    return doc


@router.post("/projects/{slug}/findings", status_code=status.HTTP_201_CREATED)
async def create_finding(slug: str, payload: FindingInput, current_user: dict = Depends(require_redmode_access)):
    project = await load_project_for_write(slug, current_user)
    await validate_evidence_ids(slug, payload.evidence_ids)
    finding_id = uuid4().hex
    return await finding_detail(await _store_revision(slug, finding_id, payload, current_user, project, None))


@router.get("/projects/{slug}/findings")
async def list_findings(
    slug: str,
    q: str = Query("", max_length=200),
    severity: str | None = Query(None),
    phase: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_member(slug, current_user)
    if severity is not None and severity not in SEVERITIES:
        raise HTTPException(status_code=422, detail="invalid_finding_severity")
    if phase is not None and phase not in PTES_PHASES:
        raise HTTPException(status_code=422, detail="invalid_ptes_phase")
    cursor = findings_collection().find({"project_slug": slug}).sort("updated_at", -1)
    matches = []
    needle = q.strip().casefold()
    async for item in cursor:
        revision = await _current_revision(item)
        if severity is not None and revision["severity"] != severity:
            continue
        if phase is not None and revision["phase"] != phase:
            continue
        search_text = revision.get("search_text") or f"{revision['title']} {revision.get('description', '')}".casefold()
        if needle and needle not in search_text:
            continue
        matches.append(item)
    page = matches[offset:offset + limit]
    return {"items": [await finding_detail(item) for item in page], "total": len(matches)}


async def load_finding(slug: str, finding_id: str, current_user: dict) -> dict:
    await load_project_for_member(slug, current_user)
    doc = await findings_collection().find_one({"_id": finding_id, "project_slug": slug})
    if doc is None:
        raise HTTPException(status_code=404, detail="finding_not_found")
    return doc


@router.get("/projects/{slug}/findings/{finding_id}")
async def get_finding(slug: str, finding_id: str, current_user: dict = Depends(require_redmode_access)):
    return await finding_detail(await load_finding(slug, finding_id, current_user))


@router.get("/projects/{slug}/findings/{finding_id}/revisions")
async def list_finding_revisions(slug: str, finding_id: str, current_user: dict = Depends(require_redmode_access)):
    await load_finding(slug, finding_id, current_user)
    cursor = revisions_collection().find({"project_slug": slug, "finding_id": finding_id}).sort("number", -1)
    return {"items": [revision_detail(item) async for item in cursor]}


@router.get("/projects/{slug}/findings/{finding_id}/revisions/compare")
async def compare_finding_revisions(
    slug: str,
    finding_id: str,
    base_revision_id: str = Query(..., min_length=1, max_length=128),
    revision_id: str = Query(..., min_length=1, max_length=128),
    current_user: dict = Depends(require_redmode_access),
):
    await load_finding(slug, finding_id, current_user)
    base = await revisions_collection().find_one({"_id": base_revision_id, "project_slug": slug, "finding_id": finding_id})
    revision = await revisions_collection().find_one({"_id": revision_id, "project_slug": slug, "finding_id": finding_id})
    if base is None or revision is None:
        raise HTTPException(status_code=404, detail="finding_revision_not_found")
    changes = {}
    for field in ("title", "severity", "phase", "targets", "evidence_ids"):
        if base.get(field) != revision.get(field):
            changes[field] = {"before": base.get(field), "after": revision.get(field)}
    diff = "\n".join(unified_diff(
        base.get("description", "").splitlines(), revision.get("description", "").splitlines(),
        fromfile=f"revisão-{base['number']}", tofile=f"revisão-{revision['number']}", lineterm="",
    ))
    return {"base_revision_id": base_revision_id, "revision_id": revision_id, "document_diff": diff, "property_changes": changes}


async def finding_backlinks(slug: str, key: str, excluded_finding_id: str | None = None) -> list[dict]:
    backlinks = []
    evidence_cursor = evidence_revisions_collection().find({"project_slug": slug, "reference_keys": key})
    async for revision in evidence_cursor:
        note = await evidence_collection().find_one({"_id": revision["note_id"], "project_slug": slug, "current_revision_id": revision["_id"]})
        if note is not None:
            backlinks.append({
                "type": "evidence", "id": note["_id"], "label": revision["title"],
                "href": f"/offensive/projects/{slug}/evidence?note={note['_id']}",
                "context": reference_context(revision.get("markdown", ""), key),
                "author": revision["author"], "updated_at": note.get("updated_at", note["created_at"]),
            })
    finding_cursor = revisions_collection().find({"project_slug": slug, "reference_keys": key})
    async for revision in finding_cursor:
        if revision["finding_id"] == excluded_finding_id:
            continue
        finding = await findings_collection().find_one({"_id": revision["finding_id"], "project_slug": slug, "current_revision_id": revision["_id"]})
        if finding is not None:
            backlinks.append({
                "type": "finding", "id": finding["_id"], "label": revision["title"],
                "href": f"/offensive/projects/{slug}/findings?finding={finding['_id']}",
                "context": reference_context(revision.get("description", ""), key),
                "author": revision["author"], "updated_at": finding["updated_at"],
            })
    backlinks.sort(key=lambda item: item["updated_at"], reverse=True)
    return backlinks


@router.get("/projects/{slug}/references/backlinks")
async def get_reference_backlinks(
    slug: str,
    key: str = Query(..., min_length=1, max_length=300),
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_member(slug, current_user)
    references = await _validated_references(slug, f"[[{key}]]")
    if len(references) != 1 or references[0]["key"] != key:
        raise HTTPException(status_code=422, detail="evidence_reference_syntax_invalid")
    return {"items": await finding_backlinks(slug, key)}


@router.get("/projects/{slug}/findings/{finding_id}/links")
async def get_finding_links(
    slug: str,
    finding_id: str,
    revision_id: str | None = Query(None),
    current_user: dict = Depends(require_redmode_access),
):
    finding = await load_finding(slug, finding_id, current_user)
    if revision_id is None:
        revision = await _current_revision(finding)
    else:
        revision = await revisions_collection().find_one({"_id": revision_id, "project_slug": slug, "finding_id": finding_id})
        if revision is None:
            raise HTTPException(status_code=404, detail="finding_revision_not_found")
    return {
        "outgoing": await _resolve_references(slug, revision.get("description", ""), revision.get("references")),
        "backlinks": await finding_backlinks(slug, f"finding:{finding_id}", finding_id),
    }


@router.put("/projects/{slug}/findings/{finding_id}")
async def update_finding(slug: str, finding_id: str, payload: FindingEdit, current_user: dict = Depends(require_redmode_access)):
    project = await load_project_for_write(slug, current_user)
    doc = await findings_collection().find_one({"_id": finding_id, "project_slug": slug})
    if doc is None:
        raise HTTPException(status_code=404, detail="finding_not_found")
    if payload.expected_revision_id != doc["current_revision_id"]:
        raise HTTPException(status_code=409, detail="finding_changed_retry")
    await validate_evidence_ids(slug, payload.evidence_ids)
    document = FindingInput(**payload.model_dump(exclude={"expected_revision_id"}))
    return await finding_detail(await _store_revision(slug, finding_id, document, current_user, project, doc))


@router.post("/projects/{slug}/finding-drafts", status_code=status.HTTP_201_CREATED)
async def create_finding_draft(slug: str, current_user: dict = Depends(require_redmode_access)):
    await load_project_for_write(slug, current_user)
    finding_id = uuid4().hex
    now = datetime.now(timezone.utc)
    draft = {
        "_id": _draft_id(slug, finding_id, current_user["username"]),
        "finding_id": finding_id, "project_slug": slug, "author": current_user["username"],
        "version": 1, "base_revision_id": None, "created_at": now, "updated_at": now,
        "title": "", "description": FINDING_TEMPLATE, "severity": "medium", "phase": "pre-engagement",
        "targets": [], "evidence_ids": [], "references": [], "reference_keys": [],
        "search_text": FINDING_TEMPLATE.casefold(),
    }
    await drafts_collection().insert_one(draft)
    return draft_detail(draft)


@router.get("/projects/{slug}/finding-drafts")
async def list_finding_drafts(slug: str, current_user: dict = Depends(require_redmode_access)):
    await load_project_for_member(slug, current_user)
    cursor = drafts_collection().find({"project_slug": slug, "author": current_user["username"]}).sort("updated_at", -1)
    return {"items": [draft_summary(item) async for item in cursor]}


@router.get("/projects/{slug}/finding-drafts/{finding_id}")
async def get_finding_draft(slug: str, finding_id: str, current_user: dict = Depends(require_redmode_access)):
    await load_project_for_member(slug, current_user)
    draft = await _private_draft(slug, finding_id, current_user["username"])
    if draft is None:
        raise HTTPException(status_code=404, detail="finding_draft_not_found")
    return draft_detail(draft)


@router.put("/projects/{slug}/finding-drafts/{finding_id}")
async def save_finding_draft(slug: str, finding_id: str, payload: FindingDraftWrite, current_user: dict = Depends(require_redmode_access)):
    await load_project_for_write(slug, current_user)
    finding = await findings_collection().find_one({"_id": finding_id, "project_slug": slug})
    current_revision = await _current_revision(finding) if finding else None
    current_revision_id = current_revision["_id"] if current_revision else None
    if payload.base_revision_id != current_revision_id:
        raise HTTPException(status_code=409, detail="finding_draft_conflict")
    author = current_user["username"]
    draft = await _private_draft(slug, finding_id, author)
    if draft is not None and draft.get("base_revision_id") != payload.base_revision_id:
        raise HTTPException(status_code=409, detail="finding_draft_conflict")
    if draft is None and payload.expected_version != 0:
        raise HTTPException(status_code=409, detail="finding_draft_changed_retry")
    if draft is not None and draft["version"] != payload.expected_version:
        raise HTTPException(status_code=409, detail="finding_draft_changed_retry")
    await validate_evidence_ids(slug, payload.evidence_ids)
    references = extract_internal_references(payload.description)
    fields = {**payload.model_dump(exclude={"base_revision_id", "expected_version"}), **_reference_fields(payload, references)}
    now = datetime.now(timezone.utc)
    if draft is None:
        draft = {
            "_id": _draft_id(slug, finding_id, author), "finding_id": finding_id, "project_slug": slug,
            "author": author, "version": 1, "base_revision_id": payload.base_revision_id,
            "created_at": now, "updated_at": now, **fields,
        }
        try:
            await drafts_collection().insert_one(draft)
        except DuplicateKeyError as exc:
            raise HTTPException(status_code=409, detail="finding_draft_changed_retry") from exc
        return draft_detail(draft)
    result = await drafts_collection().update_one(
        {"_id": draft["_id"], "version": payload.expected_version},
        {"$set": {**fields, "updated_at": now}, "$inc": {"version": 1}},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="finding_draft_changed_retry")
    return draft_detail(await _private_draft(slug, finding_id, author))


@router.delete("/projects/{slug}/finding-drafts/{finding_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_finding_draft(slug: str, finding_id: str, current_user: dict = Depends(require_redmode_access)):
    await load_project_for_write(slug, current_user)
    draft = await _private_draft(slug, finding_id, current_user["username"])
    if draft is None:
        raise HTTPException(status_code=404, detail="finding_draft_not_found")
    result = await drafts_collection().delete_one({"_id": draft["_id"], "version": draft["version"]})
    if result.deleted_count != 1:
        raise HTTPException(status_code=409, detail="finding_draft_changed_retry")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/projects/{slug}/finding-drafts/{finding_id}/rebase")
async def rebase_finding_draft(slug: str, finding_id: str, payload: FindingDraftRebase, current_user: dict = Depends(require_redmode_access)):
    await load_project_for_write(slug, current_user)
    finding = await load_finding(slug, finding_id, current_user)
    current = await _current_revision(finding)
    if current["_id"] != payload.current_revision_id:
        raise HTTPException(status_code=409, detail="finding_draft_conflict")
    draft = await _private_draft(slug, finding_id, current_user["username"])
    if draft is None:
        raise HTTPException(status_code=404, detail="finding_draft_not_found")
    result = await drafts_collection().update_one(
        {"_id": draft["_id"], "version": payload.expected_version},
        {"$set": {"base_revision_id": current["_id"], "updated_at": datetime.now(timezone.utc)}, "$inc": {"version": 1}},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="finding_draft_changed_retry")
    return draft_detail(await _private_draft(slug, finding_id, current_user["username"]))


@router.post("/projects/{slug}/finding-drafts/{finding_id}/publish")
async def publish_finding_draft(slug: str, finding_id: str, payload: FindingDraftPublish, current_user: dict = Depends(require_redmode_access)):
    project = await load_project_for_write(slug, current_user)
    draft = await _private_draft(slug, finding_id, current_user["username"])
    if draft is None:
        raise HTTPException(status_code=404, detail="finding_draft_not_found")
    if draft["version"] != payload.expected_version:
        raise HTTPException(status_code=409, detail="finding_draft_changed_retry")
    finding = await findings_collection().find_one({"_id": finding_id, "project_slug": slug})
    current = await _current_revision(finding) if finding else None
    if draft.get("base_revision_id") != (current["_id"] if current else None):
        raise HTTPException(status_code=409, detail="finding_draft_conflict")
    try:
        document = FindingInput(**{
            field: draft.get(field, [] if field.endswith("s") or field.endswith("_ids") else "")
            for field in ("title", "description", "severity", "phase", "targets", "evidence_ids")
        })
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="finding_draft_not_publishable") from exc
    await validate_evidence_ids(slug, document.evidence_ids)
    await _validated_references(slug, document.description)
    claim = await drafts_collection().update_one(
        {"_id": draft["_id"], "version": payload.expected_version},
        {"$set": {"publishing_at": datetime.now(timezone.utc)}, "$inc": {"version": 1}},
    )
    if claim.modified_count != 1:
        raise HTTPException(status_code=409, detail="finding_draft_changed_retry")
    claimed_version = payload.expected_version + 1
    try:
        stored = await _store_revision(slug, finding_id, document, current_user, project, finding)
        await drafts_collection().delete_one({"_id": draft["_id"], "version": claimed_version})
    except Exception:
        await drafts_collection().update_one(
            {"_id": draft["_id"], "version": claimed_version},
            {"$set": {"publishing_at": None}, "$inc": {"version": -1}},
        )
        raise
    return await finding_detail(stored)

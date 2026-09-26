"""Private, revisioned evidence notes with a legacy evidence compatibility API."""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import re
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pymongo.errors import DuplicateKeyError

from config import settings
from db import db_manager
from logging_config import get_logger
from redmode_files import GridFSEvidenceStore, clean_filename
from routers.redmode import (
    PTES_PHASE_ORDER,
    load_project_for_member,
    projects_collection,
    require_redmode_access,
)


router = APIRouter(prefix="/redmode", tags=["redmode-evidence"])
logger = get_logger("RedModeEvidence")
PTES_PHASES = frozenset(PTES_PHASE_ORDER)
LEGACY_REVISION_PREFIX = "legacy:"
MAX_NOTE_TITLE = 200
MAX_NOTE_MARKDOWN = 100_000
MAX_NOTE_TAGS = 50
MAX_NOTE_RELATIONS = 100


class EvidenceNoteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=MAX_NOTE_TITLE)
    markdown: str = Field(default="", max_length=MAX_NOTE_MARKDOWN)
    phase: str
    tags: list[str] = Field(default_factory=list, max_length=MAX_NOTE_TAGS)
    targets: list[str] = Field(default_factory=list, max_length=MAX_NOTE_RELATIONS)
    finding_ids: list[str] = Field(default_factory=list, max_length=MAX_NOTE_RELATIONS)
    attachment_ids: list[str] = Field(default_factory=list, max_length=MAX_NOTE_RELATIONS)

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("field_must_not_be_blank")
        return value

    @field_validator("phase")
    @classmethod
    def valid_phase(cls, value: str) -> str:
        if value not in PTES_PHASES:
            raise ValueError("invalid_ptes_phase")
        return value

    @field_validator("tags")
    @classmethod
    def valid_tags(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        folded = [value.casefold() for value in normalized]
        if (
            any(not value or len(value) > 64 for value in normalized)
            or len(set(folded)) != len(folded)
        ):
            raise ValueError("invalid_evidence_tags")
        return normalized

    @field_validator("targets")
    @classmethod
    def valid_targets(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if (
            any(not value or len(value) > 2_048 for value in normalized)
            or len(set(normalized)) != len(normalized)
        ):
            raise ValueError("invalid_evidence_targets")
        return normalized

    @field_validator("finding_ids", "attachment_ids")
    @classmethod
    def valid_relation_ids(cls, values: list[str]) -> list[str]:
        if (
            any(not value or len(value) > 128 for value in values)
            or len(set(values)) != len(values)
        ):
            raise ValueError("invalid_evidence_relation_ids")
        return values


class EvidenceNoteEdit(EvidenceNoteInput):
    expected_revision_id: str = Field(min_length=1, max_length=128)


def evidence_collection():
    projects_collection()
    return db_manager.db.redmode_evidence


def evidence_revisions_collection():
    projects_collection()
    return db_manager.db.redmode_evidence_revisions


def evidence_attachments_collection():
    projects_collection()
    return db_manager.db.redmode_evidence_attachments


def findings_collection():
    projects_collection()
    return db_manager.db.redmode_findings


def evidence_file_store():
    projects_collection()
    return GridFSEvidenceStore(db_manager.db)


def _legacy_revision_id(note_id: str) -> str:
    return f"{LEGACY_REVISION_PREFIX}{note_id}"


def _attachment_view(info: dict) -> dict:
    return {
        "id": str(info["id"]),
        "filename": info["filename"],
        "size": info["size"],
        "sha256": info["sha256"],
    }


def _plain_markdown_line(value: str) -> str:
    value = re.sub(r"<[^>]*>", " ", value)
    value = re.sub(r"!\[([^]]*)\]\([^)]*\)", r"\1", value)
    value = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", value)
    value = re.sub(r"^\s*(?:#{1,6}|>|[-+*]|\d+[.)])\s*", "", value)
    value = re.sub(r"[`*_~]", "", value)
    return " ".join(value.split())


def _legacy_title(markdown: str, file_info: dict | None) -> str:
    for line in markdown.splitlines():
        title = _plain_markdown_line(line)
        if title:
            return title[:MAX_NOTE_TITLE]
    if file_info:
        filename = clean_filename(file_info.get("filename", ""))
        if filename:
            return filename[:MAX_NOTE_TITLE]
    return "Evidência sem título"


def _markdown_excerpt(markdown: str) -> str:
    chunks = [_plain_markdown_line(line) for line in markdown.splitlines()]
    text = " ".join(chunk for chunk in chunks if chunk)
    if len(text) <= 240:
        return text
    return f"{text[:237].rstrip()}..."


def _legacy_revision(doc: dict) -> dict:
    file_info = doc.get("file")
    attachments = [_attachment_view(file_info)] if file_info else []
    target = doc.get("target")
    finding_id = doc.get("finding_id")
    created_at = doc["created_at"]
    return {
        "_id": _legacy_revision_id(doc["_id"]),
        "note_id": doc["_id"],
        "project_slug": doc["project_slug"],
        "number": 1,
        "previous_revision_id": None,
        "author": doc.get("author", doc.get("created_by", "unknown")),
        "created_at": created_at,
        "title": _legacy_title(doc.get("text", ""), file_info),
        "markdown": doc.get("text", ""),
        "phase": doc.get("phase", "pre-engagement"),
        "tags": [],
        "targets": [target] if target else [],
        "finding_ids": [finding_id] if finding_id else [],
        "attachment_ids": [item["id"] for item in attachments],
        "attachments": attachments,
    }


def evidence_revision_detail(doc: dict) -> dict:
    return {
        "id": doc["_id"],
        "note_id": doc["note_id"],
        "project_slug": doc["project_slug"],
        "number": doc["number"],
        "previous_revision_id": doc["previous_revision_id"],
        "author": doc["author"],
        "created_at": doc["created_at"],
        "title": doc["title"],
        "markdown": doc["markdown"],
        "phase": doc["phase"],
        "tags": doc["tags"],
        "targets": doc["targets"],
        "finding_ids": doc["finding_ids"],
        "attachment_ids": doc.get(
            "attachment_ids",
            [item["id"] for item in doc.get("attachments", [])],
        ),
        "attachments": doc.get("attachments", []),
    }


async def _current_revision(doc: dict) -> dict:
    revision_id = doc.get("current_revision_id")
    if not revision_id:
        return _legacy_revision(doc)
    revision = await evidence_revisions_collection().find_one({
        "_id": revision_id,
        "note_id": doc["_id"],
        "project_slug": doc["project_slug"],
    })
    if revision is None:
        raise HTTPException(status_code=503, detail="evidence_revision_unavailable")
    return revision


async def evidence_note_detail(doc: dict) -> dict:
    revision = await _current_revision(doc)
    created_at = doc["created_at"]
    return {
        "id": doc["_id"],
        "project_slug": doc["project_slug"],
        "origin": doc.get("origin", "human"),
        "created_by": doc.get("created_by", doc.get("author", revision["author"])),
        "created_at": created_at,
        "updated_at": doc.get("updated_at", created_at),
        "title": revision["title"],
        "markdown": revision["markdown"],
        "phase": revision["phase"],
        "tags": revision["tags"],
        "targets": revision["targets"],
        "finding_ids": revision["finding_ids"],
        "attachment_ids": revision.get("attachment_ids", []),
        "attachments": revision.get("attachments", []),
        "revision": {
            "id": revision["_id"],
            "number": revision["number"],
            "previous_revision_id": revision["previous_revision_id"],
            "author": revision["author"],
            "created_at": revision["created_at"],
        },
    }


async def evidence_note_summary(doc: dict) -> dict:
    detail = await evidence_note_detail(doc)
    return {
        "id": detail["id"],
        "project_slug": detail["project_slug"],
        "origin": detail["origin"],
        "created_by": detail["created_by"],
        "created_at": detail["created_at"],
        "updated_at": detail["updated_at"],
        "title": detail["title"],
        "excerpt": _markdown_excerpt(detail["markdown"]),
        "phase": detail["phase"],
        "tags": detail["tags"],
        "target_count": len(detail["targets"]),
        "finding_count": len(detail["finding_ids"]),
        "attachment_count": len(detail["attachment_ids"]),
        "revision": detail["revision"],
    }


async def evidence_detail(doc: dict) -> dict:
    """Serialize a revisioned note through the temporary legacy contract."""
    detail = await evidence_note_detail(doc)
    attachment = detail["attachments"][0] if detail["attachments"] else None
    return {
        "id": detail["id"],
        "project_slug": detail["project_slug"],
        "text": detail["markdown"],
        "phase": detail["phase"],
        "target": detail["targets"][0] if detail["targets"] else None,
        "finding_id": detail["finding_ids"][0] if detail["finding_ids"] else None,
        "file": attachment,
        "author": detail["created_by"],
        "created_at": detail["created_at"],
        "origin": detail["origin"],
    }


async def _validate_finding_ids(slug: str, finding_ids: list[str]) -> None:
    for finding_id in finding_ids:
        if await findings_collection().find_one({
            "_id": finding_id,
            "project_slug": slug,
        }) is None:
            raise HTTPException(status_code=422, detail="finding_not_in_project")


async def _resolve_attachments(
    slug: str,
    note_id: str,
    attachment_ids: list[str],
    current_attachments: list[dict] | None = None,
) -> list[dict]:
    current_by_id = {
        str(item["id"]): _attachment_view(item)
        for item in (current_attachments or [])
    }
    attachments = []
    for attachment_id in attachment_ids:
        if attachment_id in current_by_id:
            attachments.append(current_by_id[attachment_id])
            continue
        attachment = await evidence_attachments_collection().find_one({
            "_id": attachment_id,
            "project_slug": slug,
        })
        if attachment is None or attachment.get("state", "published") != "published":
            raise HTTPException(status_code=422, detail="attachment_not_in_project")
        owner_note_id = attachment.get("note_id")
        if owner_note_id not in (None, note_id):
            raise HTTPException(status_code=422, detail="attachment_not_in_note")
        attachments.append(_attachment_view(attachment))
    return attachments


async def _record_activity(
    project: dict,
    event_type: str,
    note_id: str,
    now: datetime,
    author: str,
) -> None:
    result = await projects_collection().update_one(
        {"_id": project["_id"], "members": project["members"]},
        {
            "$set": {"last_activity_at": now},
            "$push": {"activity_events": {
                "type": event_type,
                "author": author,
                "subject": note_id,
                "at": now,
            }},
        },
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="project_changed_retry")


async def load_evidence(slug: str, evidence_id: str, current_user: dict) -> dict:
    await load_project_for_member(slug, current_user)
    doc = await evidence_collection().find_one({
        "_id": evidence_id,
        "project_slug": slug,
    })
    if doc is None:
        raise HTTPException(status_code=404, detail="evidence_not_found")
    return doc


@router.get("/evidence/limits")
async def get_evidence_limits(current_user: dict = Depends(require_redmode_access)):
    return {
        "max_text_characters": MAX_NOTE_MARKDOWN,
        "max_file_bytes": settings.redmode_evidence_max_file_bytes,
    }


@router.post(
    "/projects/{slug}/evidence/notes",
    status_code=status.HTTP_201_CREATED,
)
async def create_evidence_note(
    slug: str,
    payload: EvidenceNoteInput,
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_member(slug, current_user)
    await _validate_finding_ids(slug, payload.finding_ids)
    note_id = uuid4().hex
    attachments = await _resolve_attachments(
        slug,
        note_id,
        payload.attachment_ids,
    )
    now = datetime.now(timezone.utc)
    revision_id = uuid4().hex
    revision = {
        "_id": revision_id,
        "note_id": note_id,
        "project_slug": slug,
        "number": 1,
        "previous_revision_id": None,
        "author": current_user["username"],
        "created_at": now,
        **payload.model_dump(),
        "attachments": attachments,
    }
    note = {
        "_id": note_id,
        "project_slug": slug,
        "current_revision_id": revision_id,
        "created_by": current_user["username"],
        "created_at": now,
        "updated_at": now,
        "origin": "human",
    }
    inserted_note = False
    try:
        await evidence_revisions_collection().insert_one(revision)
        await evidence_collection().insert_one(note)
        inserted_note = True
        await _record_activity(
            project,
            "evidence_created",
            note_id,
            now,
            current_user["username"],
        )
    except Exception as exc:
        if inserted_note:
            await evidence_collection().delete_one({"_id": note_id})
        await evidence_revisions_collection().delete_one({"_id": revision_id})
        if isinstance(exc, HTTPException):
            raise
        logger.exception("RedMode evidence note could not be created")
        raise HTTPException(
            status_code=503,
            detail="evidence_storage_unavailable",
        ) from exc
    return await evidence_note_detail(note)


@router.get("/projects/{slug}/evidence/notes")
async def list_evidence_notes(
    slug: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_member(slug, current_user)
    query = {"project_slug": slug}
    collection = evidence_collection()
    total = await collection.count_documents(query)
    cursor = collection.find(query).sort("updated_at", -1).skip(offset).limit(limit)
    return {
        "items": [await evidence_note_summary(item) async for item in cursor],
        "total": total,
    }


@router.get("/projects/{slug}/evidence/notes/{note_id}/revisions")
async def list_evidence_note_revisions(
    slug: str,
    note_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    note = await load_evidence(slug, note_id, current_user)
    if not note.get("current_revision_id"):
        return {"items": [evidence_revision_detail(_legacy_revision(note))]}
    cursor = evidence_revisions_collection().find({
        "project_slug": slug,
        "note_id": note_id,
    }).sort("number", -1)
    return {"items": [evidence_revision_detail(item) async for item in cursor]}


@router.get(
    "/projects/{slug}/evidence/notes/{note_id}/revisions/{revision_id}"
)
async def get_evidence_note_revision(
    slug: str,
    note_id: str,
    revision_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    note = await load_evidence(slug, note_id, current_user)
    if revision_id == _legacy_revision_id(note_id) and not note.get("current_revision_id"):
        return evidence_revision_detail(_legacy_revision(note))
    revision = await evidence_revisions_collection().find_one({
        "_id": revision_id,
        "project_slug": slug,
        "note_id": note_id,
    })
    if revision is None:
        raise HTTPException(status_code=404, detail="evidence_revision_not_found")
    return evidence_revision_detail(revision)


@router.get("/projects/{slug}/evidence/notes/{note_id}")
async def get_evidence_note(
    slug: str,
    note_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    return await evidence_note_detail(
        await load_evidence(slug, note_id, current_user)
    )


@router.put("/projects/{slug}/evidence/notes/{note_id}")
async def update_evidence_note(
    slug: str,
    note_id: str,
    payload: EvidenceNoteEdit,
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_member(slug, current_user)
    note = await evidence_collection().find_one({"_id": note_id, "project_slug": slug})
    if note is None:
        raise HTTPException(status_code=404, detail="evidence_not_found")
    previous = await _current_revision(note)
    if payload.expected_revision_id != previous["_id"]:
        raise HTTPException(status_code=409, detail="evidence_changed_retry")
    await _validate_finding_ids(slug, payload.finding_ids)
    attachments = await _resolve_attachments(
        slug,
        note_id,
        payload.attachment_ids,
        previous.get("attachments", []),
    )

    materialized_legacy = False
    if not note.get("current_revision_id"):
        try:
            await evidence_revisions_collection().insert_one(previous)
        except DuplicateKeyError as exc:
            raise HTTPException(
                status_code=409,
                detail="evidence_changed_retry",
            ) from exc
        materialized_legacy = True

    previous_updated_at = note.get("updated_at", note["created_at"])
    now = datetime.now(timezone.utc)
    revision_id = uuid4().hex
    revision = {
        "_id": revision_id,
        "note_id": note_id,
        "project_slug": slug,
        "number": previous["number"] + 1,
        "previous_revision_id": previous["_id"],
        "author": current_user["username"],
        "created_at": now,
        **payload.model_dump(exclude={"expected_revision_id"}),
        "attachments": attachments,
    }
    try:
        await evidence_revisions_collection().insert_one(revision)
    except Exception as exc:
        if materialized_legacy:
            await evidence_revisions_collection().delete_one({"_id": previous["_id"]})
        logger.exception("RedMode evidence revision could not be stored")
        raise HTTPException(
            status_code=503,
            detail="evidence_storage_unavailable",
        ) from exc
    try:
        result = await evidence_collection().update_one(
            {
                "_id": note_id,
                "project_slug": slug,
                "current_revision_id": note.get("current_revision_id"),
            },
            {"$set": {"current_revision_id": revision_id, "updated_at": now}},
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail="evidence_changed_retry")
        await _record_activity(
            project,
            "evidence_updated",
            note_id,
            now,
            current_user["username"],
        )
    except Exception as exc:
        rolled_back = await evidence_collection().update_one(
            {"_id": note_id, "current_revision_id": revision_id},
            {
                "$set": {
                    "current_revision_id": note.get("current_revision_id"),
                    "updated_at": previous_updated_at,
                }
            },
        )
        if (
            rolled_back.modified_count == 1
            or isinstance(exc, HTTPException)
            and exc.detail == "evidence_changed_retry"
        ):
            await evidence_revisions_collection().delete_one({"_id": revision_id})
            if materialized_legacy:
                await evidence_revisions_collection().delete_one({"_id": previous["_id"]})
        else:
            logger.error("Could not roll back RedMode evidence revision")
        if isinstance(exc, HTTPException):
            raise
        logger.exception("RedMode evidence note could not be updated")
        raise HTTPException(
            status_code=503,
            detail="evidence_storage_unavailable",
        ) from exc
    updated = await evidence_collection().find_one({"_id": note_id, "project_slug": slug})
    return await evidence_note_detail(updated)


@router.get(
    "/projects/{slug}/evidence/notes/{note_id}/attachments/{attachment_id}"
)
async def download_evidence_attachment(
    slug: str,
    note_id: str,
    attachment_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    note = await load_evidence(slug, note_id, current_user)
    revisions = evidence_revisions_collection().find({
        "project_slug": slug,
        "note_id": note_id,
    })
    candidates = []
    async for revision in revisions:
        candidates.extend(revision.get("attachments", []))
    if not note.get("current_revision_id"):
        candidates.extend(_legacy_revision(note)["attachments"])
    info = next(
        (item for item in candidates if str(item["id"]) == attachment_id),
        None,
    )
    if info is None:
        raise HTTPException(status_code=404, detail="evidence_file_not_found")
    storage_id = await _attachment_storage_id(slug, note_id, info)
    return await _evidence_file_response(storage_id, info)


@router.post("/projects/{slug}/evidence", status_code=status.HTTP_201_CREATED)
async def add_evidence(
    slug: str,
    phase: str = Form(...),
    text: str = Form(""),
    target: str = Form(""),
    finding_id: str = Form(""),
    file: UploadFile | None = File(None),
    current_user: dict = Depends(require_redmode_access),
):
    """Temporary multipart endpoint used by the pre-notebook interface."""
    project = await load_project_for_member(slug, current_user)
    if phase not in PTES_PHASES:
        raise HTTPException(status_code=422, detail="invalid_ptes_phase")
    if len(text) > MAX_NOTE_MARKDOWN or len(target) > 2_048:
        raise HTTPException(status_code=413, detail="evidence_text_too_large")
    if len(finding_id) > 64:
        raise HTTPException(status_code=422, detail="invalid_finding_id")
    if not text.strip() and file is None:
        raise HTTPException(status_code=422, detail="evidence_content_required")
    await _validate_finding_ids(slug, [finding_id] if finding_id else [])

    content = None
    filename = None
    if file is not None:
        filename = clean_filename(file.filename or "")
        if not filename:
            raise HTTPException(status_code=422, detail="evidence_filename_required")
        content = await file.read(settings.redmode_evidence_max_file_bytes + 1)
        if len(content) > settings.redmode_evidence_max_file_bytes:
            raise HTTPException(status_code=413, detail="evidence_file_too_large")
        if not content:
            raise HTTPException(status_code=422, detail="evidence_file_empty")

    now = datetime.now(timezone.utc)
    note_id = uuid4().hex
    revision_id = uuid4().hex
    attachment_id = uuid4().hex if content is not None else None
    store = evidence_file_store() if content is not None else None
    storage_id = None
    attachment = None
    inserted_note = False
    inserted_attachment = False
    try:
        if store is not None:
            digest = sha256(content).hexdigest()
            storage_id = await store.save(filename, content, {
                "project_slug": slug,
                "evidence_id": note_id,
                "attachment_id": attachment_id,
                "author": current_user["username"],
                "sha256": digest,
            })
            attachment = {
                "_id": attachment_id,
                "id": attachment_id,
                "project_slug": slug,
                "note_id": note_id,
                "storage_id": storage_id,
                "filename": filename,
                "size": len(content),
                "sha256": digest,
                "state": "published",
                "created_by": current_user["username"],
                "created_at": now,
            }
            await evidence_attachments_collection().insert_one(attachment)
            inserted_attachment = True
        attachments = [_attachment_view(attachment)] if attachment else []
        revision = {
            "_id": revision_id,
            "note_id": note_id,
            "project_slug": slug,
            "number": 1,
            "previous_revision_id": None,
            "author": current_user["username"],
            "created_at": now,
            "title": _legacy_title(text.strip(), attachment),
            "markdown": text.strip(),
            "phase": phase,
            "tags": [],
            "targets": [target.strip()] if target.strip() else [],
            "finding_ids": [finding_id] if finding_id else [],
            "attachment_ids": [attachment_id] if attachment_id else [],
            "attachments": attachments,
        }
        note = {
            "_id": note_id,
            "project_slug": slug,
            "current_revision_id": revision_id,
            "created_by": current_user["username"],
            "created_at": now,
            "updated_at": now,
            "origin": "human",
        }
        await evidence_revisions_collection().insert_one(revision)
        await evidence_collection().insert_one(note)
        inserted_note = True
        await _record_activity(
            project,
            "evidence_created",
            note_id,
            now,
            current_user["username"],
        )
    except Exception as exc:
        if inserted_note:
            await evidence_collection().delete_one({"_id": note_id})
        await evidence_revisions_collection().delete_one({"_id": revision_id})
        if inserted_attachment:
            await evidence_attachments_collection().delete_one({"_id": attachment_id})
        if storage_id is not None:
            try:
                await store.delete(storage_id)
            except Exception:
                logger.warning("Failed to clean up unpublished RedMode evidence file")
        if isinstance(exc, HTTPException):
            raise
        logger.exception("RedMode evidence could not be stored")
        raise HTTPException(
            status_code=503,
            detail="evidence_storage_unavailable",
        ) from exc
    return await evidence_detail(note)


@router.get("/projects/{slug}/evidence")
async def list_evidence(
    slug: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_redmode_access),
):
    """Temporary full-body listing used by the pre-notebook interface."""
    await load_project_for_member(slug, current_user)
    collection = evidence_collection()
    query = {"project_slug": slug}
    total = await collection.count_documents(query)
    cursor = collection.find(query).sort("created_at", -1).skip(offset).limit(limit)
    return {
        "items": [await evidence_detail(item) async for item in cursor],
        "total": total,
    }


@router.get("/projects/{slug}/evidence/{evidence_id}")
async def get_evidence(
    slug: str,
    evidence_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    return await evidence_detail(await load_evidence(slug, evidence_id, current_user))


async def _evidence_file_response(storage_id: str, info: dict) -> Response:
    try:
        content = await evidence_file_store().read(storage_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="evidence_file_unavailable") from exc
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": (
                f"attachment; filename*=UTF-8''{quote(clean_filename(info['filename']))}"
            ),
            "Cache-Control": "private, no-store",
        },
    )


async def _attachment_storage_id(slug: str, note_id: str, info: dict) -> str:
    attachment = await evidence_attachments_collection().find_one({
        "_id": info["id"],
        "project_slug": slug,
    })
    if attachment is None:
        return str(info["id"])
    if attachment.get("note_id") not in (None, note_id):
        raise HTTPException(status_code=404, detail="evidence_file_not_found")
    return attachment.get("storage_id", str(info["id"]))


@router.get("/projects/{slug}/evidence/{evidence_id}/file")
async def download_evidence_file(
    slug: str,
    evidence_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    note = await load_evidence(slug, evidence_id, current_user)
    revision = await _current_revision(note)
    attachments = revision.get("attachments", [])
    if not attachments:
        raise HTTPException(status_code=404, detail="evidence_file_not_found")
    info = attachments[0]
    storage_id = await _attachment_storage_id(slug, evidence_id, info)
    return await _evidence_file_response(storage_id, info)

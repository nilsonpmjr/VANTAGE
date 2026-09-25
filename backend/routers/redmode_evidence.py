"""Member-only manual evidence, separate from scope sources and defensive feed."""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response

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


def evidence_collection():
    projects_collection()
    return db_manager.db.redmode_evidence


def findings_collection():
    projects_collection()
    return db_manager.db.redmode_findings


def evidence_file_store():
    projects_collection()
    return GridFSEvidenceStore(db_manager.db)


def evidence_detail(doc: dict) -> dict:
    return {
        "id": doc["_id"], "project_slug": doc["project_slug"],
        "text": doc["text"], "phase": doc["phase"], "target": doc["target"],
        "finding_id": doc["finding_id"], "file": doc["file"],
        "author": doc["author"], "created_at": doc["created_at"],
        "origin": "human",
    }


@router.get("/evidence/limits")
async def get_evidence_limits(current_user: dict = Depends(require_redmode_access)):
    return {"max_text_characters": 100_000, "max_file_bytes": settings.redmode_evidence_max_file_bytes}


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
    project = await load_project_for_member(slug, current_user)
    if phase not in PTES_PHASES:
        raise HTTPException(status_code=422, detail="invalid_ptes_phase")
    if len(text) > 100_000 or len(target) > 2_048:
        raise HTTPException(status_code=413, detail="evidence_text_too_large")
    if len(finding_id) > 64:
        raise HTTPException(status_code=422, detail="invalid_finding_id")
    if not text.strip() and file is None:
        raise HTTPException(status_code=422, detail="evidence_content_required")
    if finding_id and await findings_collection().find_one({"_id": finding_id, "project_slug": slug}) is None:
        raise HTTPException(status_code=422, detail="finding_not_in_project")

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
    evidence_id = uuid4().hex
    store = evidence_file_store() if content is not None else None
    saved_id = None
    inserted = False
    try:
        if store is not None:
            saved_id = await store.save(filename, content, {
                "project_slug": slug, "evidence_id": evidence_id,
                "author": current_user["username"], "sha256": sha256(content).hexdigest(),
            })
        doc = {
            "_id": evidence_id, "project_slug": slug,
            "text": text.strip(), "phase": phase, "target": target.strip() or None,
            "finding_id": finding_id or None,
            "file": {"id": saved_id, "filename": filename, "size": len(content), "sha256": sha256(content).hexdigest()} if saved_id else None,
            "author": current_user["username"], "created_at": now,
        }
        await evidence_collection().insert_one(doc)
        inserted = True
        event = {"type": "evidence_added", "author": current_user["username"], "subject": evidence_id, "at": now}
        result = await projects_collection().update_one(
            {"_id": slug, "members": project["members"]},
            {"$set": {"last_activity_at": now}, "$push": {"activity_events": event}},
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail="project_changed_retry")
    except Exception as exc:
        if inserted:
            await evidence_collection().delete_one({"_id": evidence_id})
        if saved_id is not None:
            try:
                await store.delete(saved_id)
            except Exception:
                logger.warning("Failed to clean up unpublished RedMode evidence file")
        if isinstance(exc, HTTPException):
            raise
        logger.exception("RedMode evidence could not be stored")
        raise HTTPException(status_code=503, detail="evidence_storage_unavailable") from exc
    return evidence_detail(doc)


@router.get("/projects/{slug}/evidence")
async def list_evidence(
    slug: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_member(slug, current_user)
    collection = evidence_collection()
    query = {"project_slug": slug}
    total = await collection.count_documents(query)
    cursor = collection.find(query).sort("created_at", -1).skip(offset).limit(limit)
    return {"items": [evidence_detail(item) async for item in cursor], "total": total}


async def load_evidence(slug: str, evidence_id: str, current_user: dict) -> dict:
    await load_project_for_member(slug, current_user)
    doc = await evidence_collection().find_one({"_id": evidence_id, "project_slug": slug})
    if doc is None:
        raise HTTPException(status_code=404, detail="evidence_not_found")
    return doc


@router.get("/projects/{slug}/evidence/{evidence_id}")
async def get_evidence(slug: str, evidence_id: str, current_user: dict = Depends(require_redmode_access)):
    return evidence_detail(await load_evidence(slug, evidence_id, current_user))


@router.get("/projects/{slug}/evidence/{evidence_id}/file")
async def download_evidence_file(slug: str, evidence_id: str, current_user: dict = Depends(require_redmode_access)):
    doc = await load_evidence(slug, evidence_id, current_user)
    info = doc["file"]
    if info is None:
        raise HTTPException(status_code=404, detail="evidence_file_not_found")
    try:
        content = await evidence_file_store().read(info["id"])
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="evidence_file_unavailable") from exc
    return Response(
        content=content, media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(clean_filename(info['filename']))}",
            "Cache-Control": "private, no-store",
        },
    )

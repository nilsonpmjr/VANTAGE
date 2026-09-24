"""Human-authored RedMode findings with immutable revision history."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from db import db_manager
from logging_config import get_logger
from routers.redmode import load_project_for_member, projects_collection, require_redmode_access
from routers.redmode_evidence import PTES_PHASES, evidence_collection


router = APIRouter(prefix="/redmode", tags=["redmode-findings"])
logger = get_logger("RedModeFindings")


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
        if any(not value.strip() or len(value) > 2_048 for value in values) or len(set(values)) != len(values):
            raise ValueError("invalid_targets")
        return values

    @field_validator("evidence_ids")
    @classmethod
    def valid_evidence_ids(cls, values: list[str]) -> list[str]:
        if any(not value or len(value) > 64 for value in values) or len(set(values)) != len(values):
            raise ValueError("invalid_evidence_ids")
        return values


class FindingEdit(FindingInput):
    expected_revision_id: str = Field(min_length=1, max_length=64)


def findings_collection():
    projects_collection()
    return db_manager.db.redmode_findings


def revisions_collection():
    projects_collection()
    return db_manager.db.redmode_finding_revisions


async def validate_evidence_ids(slug: str, ids: list[str]) -> None:
    for evidence_id in ids:
        if await evidence_collection().find_one({"_id": evidence_id, "project_slug": slug}) is None:
            raise HTTPException(status_code=422, detail="evidence_not_in_project")


def revision_detail(doc: dict) -> dict:
    return {
        "id": doc["_id"], "finding_id": doc["finding_id"], "project_slug": doc["project_slug"],
        "number": doc["number"], "previous_revision_id": doc["previous_revision_id"],
        "author": doc["author"], "created_at": doc["created_at"],
        "title": doc["title"], "description": doc["description"],
        "severity": doc["severity"], "phase": doc["phase"],
        "targets": doc["targets"], "evidence_ids": doc["evidence_ids"],
    }


async def finding_detail(doc: dict) -> dict:
    revision = await revisions_collection().find_one({"_id": doc["current_revision_id"], "finding_id": doc["_id"], "project_slug": doc["project_slug"]})
    if revision is None:
        raise HTTPException(status_code=503, detail="finding_revision_unavailable")
    linked = evidence_collection().find({"project_slug": doc["project_slug"], "finding_id": doc["_id"]})
    evidence_ids = list(revision["evidence_ids"])
    async for evidence in linked:
        if evidence["_id"] not in evidence_ids:
            evidence_ids.append(evidence["_id"])
    return {
        "id": doc["_id"], "project_slug": doc["project_slug"], "origin": "human",
        "created_at": doc["created_at"], "updated_at": doc["updated_at"],
        "title": revision["title"], "description": revision["description"],
        "severity": revision["severity"], "phase": revision["phase"],
        "targets": revision["targets"], "evidence_ids": evidence_ids,
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


@router.post("/projects/{slug}/findings", status_code=status.HTTP_201_CREATED)
async def create_finding(slug: str, payload: FindingInput, current_user: dict = Depends(require_redmode_access)):
    project = await load_project_for_member(slug, current_user)
    await validate_evidence_ids(slug, payload.evidence_ids)
    now = datetime.now(timezone.utc)
    finding_id, revision_id = uuid4().hex, uuid4().hex
    revision = {
        "_id": revision_id, "finding_id": finding_id, "project_slug": slug,
        "number": 1, "previous_revision_id": None,
        "author": current_user["username"], "created_at": now,
        **payload.model_dump(),
    }
    doc = {"_id": finding_id, "project_slug": slug, "current_revision_id": revision_id, "created_at": now, "updated_at": now}
    inserted_finding = False
    try:
        await revisions_collection().insert_one(revision)
        await findings_collection().insert_one(doc)
        inserted_finding = True
        await _record_activity(project, "finding_created", finding_id, now, current_user["username"])
    except Exception as exc:
        if inserted_finding:
            await findings_collection().delete_one({"_id": finding_id})
        await revisions_collection().delete_one({"_id": revision_id})
        if isinstance(exc, HTTPException):
            raise
        logger.exception("RedMode finding could not be stored")
        raise HTTPException(status_code=503, detail="finding_storage_unavailable") from exc
    return await finding_detail(doc)


@router.get("/projects/{slug}/findings")
async def list_findings(
    slug: str, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_member(slug, current_user)
    query = {"project_slug": slug}
    collection = findings_collection()
    total = await collection.count_documents(query)
    cursor = collection.find(query).sort("updated_at", -1).skip(offset).limit(limit)
    return {"items": [await finding_detail(item) async for item in cursor], "total": total}


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


@router.put("/projects/{slug}/findings/{finding_id}")
async def update_finding(slug: str, finding_id: str, payload: FindingEdit, current_user: dict = Depends(require_redmode_access)):
    project = await load_project_for_member(slug, current_user)
    doc = await findings_collection().find_one({"_id": finding_id, "project_slug": slug})
    if doc is None:
        raise HTTPException(status_code=404, detail="finding_not_found")
    if payload.expected_revision_id != doc["current_revision_id"]:
        raise HTTPException(status_code=409, detail="finding_changed_retry")
    await validate_evidence_ids(slug, payload.evidence_ids)
    previous = await revisions_collection().find_one({"_id": doc["current_revision_id"], "finding_id": finding_id, "project_slug": slug})
    if previous is None:
        raise HTTPException(status_code=503, detail="finding_revision_unavailable")
    previous_updated_at = doc["updated_at"]
    now = datetime.now(timezone.utc)
    revision_id = uuid4().hex
    revision = {
        "_id": revision_id, "finding_id": finding_id, "project_slug": slug,
        "number": previous["number"] + 1, "previous_revision_id": previous["_id"],
        "author": current_user["username"], "created_at": now,
        **payload.model_dump(exclude={"expected_revision_id"}),
    }
    await revisions_collection().insert_one(revision)
    try:
        result = await findings_collection().update_one(
            {"_id": finding_id, "project_slug": slug, "current_revision_id": previous["_id"]},
            {"$set": {"current_revision_id": revision_id, "updated_at": now}},
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail="finding_changed_retry")
        await _record_activity(project, "finding_updated", finding_id, now, current_user["username"])
    except Exception as exc:
        rolled_back = await findings_collection().update_one(
            {"_id": finding_id, "current_revision_id": revision_id},
            {"$set": {"current_revision_id": previous["_id"], "updated_at": previous_updated_at}},
        )
        if rolled_back.modified_count == 1 or isinstance(exc, HTTPException) and exc.detail == "finding_changed_retry":
            await revisions_collection().delete_one({"_id": revision_id})
        else:
            logger.error("Could not roll back RedMode finding revision after activity failure")
        if isinstance(exc, HTTPException):
            raise
        logger.exception("RedMode finding could not be updated")
        raise HTTPException(status_code=503, detail="finding_storage_unavailable") from exc
    return await finding_detail(await findings_collection().find_one({"_id": finding_id, "project_slug": slug}))

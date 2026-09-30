"""Private, revisioned evidence notes with a legacy evidence compatibility API."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
import re
from typing import Literal
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from pymongo.errors import DuplicateKeyError

from config import settings
from db import db_manager
from logging_config import get_logger
from redmode_files import GridFSEvidenceStore, clean_filename
from redmode_leafwiki import (
    aggregate_tags,
    build_tree_hierarchy,
    calculate_node_path,
    calculate_reordered_positions,
    detect_broken_links,
    dump_markdown_frontmatter,
    export_bundle_as_zip,
    parse_markdown_frontmatter,
    refactor_markdown_links,
    slugify,
    validate_node_move,
)
from redmode_references import (
    ReferenceSyntaxError,
    evidence_search_text,
    extract_internal_references,
    reference_context,
)
from routers.redmode import (
    PTES_PHASE_ORDER,
    load_project_for_member,
    load_project_for_write,
    projects_collection,
    require_redmode_access,
    scope_assets_collection,
    scope_sources_collection,
    scope_versions_collection,
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
    parent_id: str | None = Field(default=None, max_length=128)
    slug: str | None = Field(default=None, max_length=200)
    kind: Literal["page", "section"] = Field(default="page")
    position: int = Field(default=0, ge=0)
    pinned: bool = Field(default=False)

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


class EvidenceDraftWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(default="", max_length=MAX_NOTE_TITLE)
    markdown: str = Field(default="", max_length=MAX_NOTE_MARKDOWN)
    phase: str
    tags: list[str] = Field(default_factory=list, max_length=MAX_NOTE_TAGS)
    targets: list[str] = Field(default_factory=list, max_length=MAX_NOTE_RELATIONS)
    finding_ids: list[str] = Field(default_factory=list, max_length=MAX_NOTE_RELATIONS)
    attachment_ids: list[str] = Field(default_factory=list, max_length=MAX_NOTE_RELATIONS)
    parent_id: str | None = Field(default=None, max_length=128)
    slug: str | None = Field(default=None, max_length=200)
    kind: Literal["page", "section"] = Field(default="page")
    position: int = Field(default=0, ge=0)
    pinned: bool = Field(default=False)
    base_revision_id: str | None = Field(default=None, max_length=128)
    expected_version: int = Field(ge=0)

    @field_validator("title")
    @classmethod
    def valid_draft_title(cls, value: str) -> str:
        return value.strip()

    @field_validator("phase")
    @classmethod
    def valid_draft_phase(cls, value: str) -> str:
        if value not in PTES_PHASES:
            raise ValueError("invalid_ptes_phase")
        return value

    @field_validator("tags")
    @classmethod
    def valid_draft_tags(cls, values: list[str]) -> list[str]:
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
    def valid_draft_targets(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if (
            any(not value or len(value) > 2_048 for value in normalized)
            or len(set(normalized)) != len(normalized)
        ):
            raise ValueError("invalid_evidence_targets")
        return normalized

    @field_validator("finding_ids", "attachment_ids")
    @classmethod
    def valid_draft_relation_ids(cls, values: list[str]) -> list[str]:
        if (
            any(not value or len(value) > 128 for value in values)
            or len(set(values)) != len(values)
        ):
            raise ValueError("invalid_evidence_relation_ids")
        return values


class EvidenceDraftPublish(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)


class EvidenceDraftRebase(EvidenceDraftPublish):
    current_revision_id: str = Field(min_length=1, max_length=128)


class EvidenceReferenceResolve(BaseModel):
    model_config = ConfigDict(extra="forbid")
    markdown: str = Field(default="", max_length=MAX_NOTE_MARKDOWN)


class EvidenceSectionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=MAX_NOTE_TITLE)
    parent_id: str | None = Field(default=None, max_length=128)
    phase: str = Field(default="pre-engagement")
    markdown: str = Field(default="", max_length=MAX_NOTE_MARKDOWN)

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


class EvidenceNodeMove(BaseModel):
    model_config = ConfigDict(extra="forbid")
    parent_id: str | None = Field(default=None, max_length=128)
    position: int | None = Field(default=None, ge=0)


class EvidenceNodeCopy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_parent_id: str | None = Field(default=None, max_length=128)
    new_title: str | None = Field(default=None, max_length=MAX_NOTE_TITLE)


class EvidenceNodePin(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pinned: bool


class EvidenceTreeSort(BaseModel):
    model_config = ConfigDict(extra="forbid")
    parent_id: str | None = Field(default=None, max_length=128)
    ordered_ids: list[str] = Field(min_length=1, max_length=500)


class EvidenceLinkRefactor(BaseModel):
    model_config = ConfigDict(extra="forbid")
    old_title: str = Field(min_length=1, max_length=MAX_NOTE_TITLE)
    new_title: str = Field(min_length=1, max_length=MAX_NOTE_TITLE)
    old_slug: str = Field(default="", max_length=200)
    new_slug: str = Field(default="", max_length=200)


class EvidenceImportInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    filename: str = Field(default="", max_length=200)
    content: str = Field(min_length=1, max_length=MAX_NOTE_MARKDOWN)
    parent_id: str | None = Field(default=None, max_length=128)


def evidence_collection():
    projects_collection()
    return db_manager.db.redmode_evidence


def evidence_revisions_collection():
    projects_collection()
    return db_manager.db.redmode_evidence_revisions


def evidence_favorites_collection():
    projects_collection()
    return db_manager.db.redmode_evidence_favorites


def evidence_drafts_collection():
    projects_collection()
    return db_manager.db.redmode_evidence_drafts


def evidence_attachments_collection():
    projects_collection()
    return db_manager.db.redmode_evidence_attachments


def findings_collection():
    projects_collection()
    return db_manager.db.redmode_findings


def finding_revisions_collection():
    projects_collection()
    return db_manager.db.redmode_finding_revisions


def evidence_file_store():
    projects_collection()
    return GridFSEvidenceStore(db_manager.db)


def _reference_href(slug: str, section: str, query: dict[str, str]) -> str:
    encoded_slug = quote(slug, safe="")
    encoded_query = "&".join(
        f"{quote(key, safe='')}={quote(value, safe='')}"
        for key, value in query.items()
    )
    return f"/redmode/engagements/{encoded_slug}/{section}?{encoded_query}"


def _broken_reference_view(reference: dict) -> dict:
    return {
        **reference,
        "label": "Referência indisponível",
        "href": None,
        "broken": True,
    }


async def _source_reference_view(
    slug: str,
    reference: dict,
    version: dict,
    source_id: str,
) -> dict:
    source = await scope_sources_collection().find_one({
        "project_slug": slug,
        "version_id": version["_id"],
        "source_id": source_id,
    })
    label = source.get("name") if source else None
    if label is None:
        legacy_source = version.get("source", {})
        if source_id == "text" and legacy_source.get("text"):
            label = "Texto colado"
        else:
            offset = 1 if legacy_source.get("text") else 0
            for index, file_info in enumerate(
                legacy_source.get("files", []),
                start=offset,
            ):
                candidate = file_info.get("source_id") or f"legacy-file-{index + 1}"
                if candidate == source_id:
                    label = clean_filename(file_info.get("filename", "")) or "Arquivo"
                    break
    if label is None:
        return _broken_reference_view(reference)
    return {
        **reference,
        "label": label,
        "href": _reference_href(slug, "scope", {
            "version": version["_id"],
            "view": "sources",
            "source": source_id,
        }),
        "broken": False,
    }


async def _target_reference_view(
    slug: str,
    reference: dict,
    version: dict,
    asset_id: str,
) -> dict:
    asset = await scope_assets_collection().find_one({
        "project_slug": slug,
        "version_id": version["_id"],
        "asset_id": asset_id,
    })
    if asset is None:
        for item in [
            *version.get("rules", []),
            *version.get("context_assets", []),
        ]:
            kind = item.get("kind")
            value = item.get("value")
            if not kind or not value:
                continue
            candidate = sha256(f"{kind}\0{value}".encode("utf-8")).hexdigest()
            if candidate == asset_id:
                asset = {"kind": kind, "value": value}
                break
    if asset is None:
        return _broken_reference_view(reference)
    return {
        **reference,
        "label": asset["value"],
        "href": _reference_href(slug, "scope", {
            "version": version["_id"],
            "view": "effective",
            "target": asset["value"],
        }),
        "broken": False,
    }


async def _resolve_reference(slug: str, reference: dict) -> dict:
    kind = reference["kind"]
    identifier = reference["id"]
    if kind == "evidence":
        note = await evidence_collection().find_one({
            "_id": identifier,
            "project_slug": slug,
        })
        if note is None:
            return _broken_reference_view(reference)
        try:
            revision = await _current_revision(note)
        except HTTPException:
            return _broken_reference_view(reference)
        return {
            **reference,
            "label": revision["title"],
            "href": _reference_href(slug, "evidence", {"note": identifier}),
            "broken": False,
        }
    if kind == "finding":
        finding = await findings_collection().find_one({
            "_id": identifier,
            "project_slug": slug,
        })
        if finding is None:
            return _broken_reference_view(reference)
        revision = await finding_revisions_collection().find_one({
            "_id": finding.get("current_revision_id"),
            "finding_id": identifier,
            "project_slug": slug,
        })
        if revision is None:
            return _broken_reference_view(reference)
        return {
            **reference,
            "label": revision["title"],
            "href": _reference_href(slug, "findings", {"finding": identifier}),
            "broken": False,
        }
    version_id, item_id = identifier.split("/", 1)
    version = await scope_versions_collection().find_one({
        "_id": version_id,
        "project_slug": slug,
    })
    if version is None:
        return _broken_reference_view(reference)
    if kind == "source":
        return await _source_reference_view(slug, reference, version, item_id)
    return await _target_reference_view(slug, reference, version, item_id)


async def _resolve_references(
    slug: str,
    markdown: str,
    references: list[dict] | None = None,
) -> list[dict]:
    stored = references
    if stored is None:
        stored = extract_internal_references(markdown)
    views = []
    for reference in stored:
        view = await _resolve_reference(slug, reference)
        view["context"] = reference_context(markdown, reference["key"])
        views.append(view)
    return views


async def _validated_references(slug: str, markdown: str) -> list[dict]:
    try:
        references = extract_internal_references(markdown, strict=True)
    except ReferenceSyntaxError as exc:
        raise HTTPException(status_code=422, detail=exc.code) from exc
    for reference in references:
        resolved = await _resolve_reference(slug, reference)
        if resolved["broken"]:
            raise HTTPException(
                status_code=422,
                detail=f"{reference['kind']}_reference_not_in_project",
            )
    return references


def _reference_fields(document: EvidenceNoteInput, references: list[dict]) -> dict:
    return {
        "references": references,
        "reference_keys": [reference["key"] for reference in references],
        "search_text": evidence_search_text(
            document.title,
            document.markdown,
            document.tags,
            references,
        ),
    }


def _legacy_revision_id(note_id: str) -> str:
    return f"{LEGACY_REVISION_PREFIX}{note_id}"


def _attachment_view(info: dict) -> dict:
    return {
        "id": str(info["id"]),
        "filename": info["filename"],
        "size": info["size"],
        "sha256": info["sha256"],
        "content_type": info.get("content_type", "application/octet-stream"),
        "created_by": info.get("created_by"),
        "created_at": info.get("created_at"),
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
    markdown = doc.get("text", "")
    references = extract_internal_references(markdown)
    return {
        "_id": _legacy_revision_id(doc["_id"]),
        "note_id": doc["_id"],
        "project_slug": doc["project_slug"],
        "number": 1,
        "previous_revision_id": None,
        "author": doc.get("author", doc.get("created_by", "unknown")),
        "created_at": created_at,
        "title": _legacy_title(markdown, file_info),
        "markdown": markdown,
        "phase": doc.get("phase", "pre-engagement"),
        "tags": [],
        "targets": [target] if target else [],
        "finding_ids": [finding_id] if finding_id else [],
        "attachment_ids": [item["id"] for item in attachments],
        "attachments": attachments,
        "references": references,
        "reference_keys": [item["key"] for item in references],
    }


def evidence_revision_detail(doc: dict) -> dict:
    references = doc.get("references")
    if references is None:
        references = extract_internal_references(doc.get("markdown", ""))
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
        "references": references,
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
    references = revision.get("references")
    if references is None:
        references = extract_internal_references(revision.get("markdown", ""))
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
        "references": references,
        "slug": doc.get("slug") or slugify(revision["title"]),
        "parent_id": doc.get("parent_id"),
        "kind": doc.get("kind", "page"),
        "position": doc.get("position", 0),
        "pinned": bool(doc.get("pinned", False)),
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
        "slug": detail["slug"],
        "parent_id": detail["parent_id"],
        "kind": detail["kind"],
        "position": detail["position"],
        "pinned": detail["pinned"],
        "revision": detail["revision"],
    }


def _draft_id(slug: str, note_id: str, author: str) -> str:
    return f"{slug}:{note_id}:{author}"


def evidence_draft_detail(doc: dict) -> dict:
    markdown = doc.get("markdown", "")
    references = doc.get("references")
    if references is None:
        references = extract_internal_references(markdown)
    return {
        "id": doc["_id"],
        "note_id": doc["note_id"],
        "project_slug": doc["project_slug"],
        "author": doc["author"],
        "version": doc["version"],
        "base_revision_id": doc.get("base_revision_id"),
        "created_at": doc["created_at"],
        "updated_at": doc["updated_at"],
        "title": doc.get("title", ""),
        "markdown": markdown,
        "phase": doc.get("phase", "pre-engagement"),
        "tags": doc.get("tags", []),
        "targets": doc.get("targets", []),
        "finding_ids": doc.get("finding_ids", []),
        "attachment_ids": doc.get("attachment_ids", []),
        "attachments": doc.get("attachments", []),
        "references": references,
        "slug": doc.get("slug"),
        "parent_id": doc.get("parent_id"),
        "kind": doc.get("kind", "page"),
        "position": doc.get("position", 0),
        "pinned": bool(doc.get("pinned", False)),
    }


def evidence_draft_summary(doc: dict) -> dict:
    return {
        "note_id": doc["note_id"],
        "project_slug": doc["project_slug"],
        "version": doc["version"],
        "base_revision_id": doc.get("base_revision_id"),
        "updated_at": doc["updated_at"],
        "title": doc.get("title", ""),
        "excerpt": _markdown_excerpt(doc.get("markdown", "")),
        "phase": doc.get("phase", "pre-engagement"),
        "tags": doc.get("tags", []),
        "attachment_count": len(doc.get("attachment_ids", [])),
        "is_new": doc.get("base_revision_id") is None,
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


async def _resolve_draft_attachments(
    slug: str,
    note_id: str,
    author: str,
    attachment_ids: list[str],
    published_attachments: list[dict] | None = None,
) -> list[dict]:
    published_by_id = {
        str(item["id"]): _attachment_view(item)
        for item in (published_attachments or [])
    }
    attachments = []
    for attachment_id in attachment_ids:
        if attachment_id in published_by_id:
            attachments.append(published_by_id[attachment_id])
            continue
        attachment = await evidence_attachments_collection().find_one({
            "_id": attachment_id,
            "project_slug": slug,
        })
        if attachment is None or attachment.get("note_id") not in (None, note_id):
            raise HTTPException(status_code=422, detail="attachment_not_in_draft")
        if attachment.get("state") == "draft" and attachment.get("created_by") != author:
            raise HTTPException(status_code=422, detail="attachment_not_in_draft")
        if attachment.get("state") not in ("draft", "published"):
            raise HTTPException(status_code=422, detail="attachment_not_in_draft")
        attachments.append(_attachment_view(attachment))
    return attachments


async def _private_draft(slug: str, note_id: str, author: str) -> dict | None:
    return await evidence_drafts_collection().find_one({
        "_id": _draft_id(slug, note_id, author),
        "project_slug": slug,
        "note_id": note_id,
        "author": author,
    })


async def _delete_draft_attachments(draft: dict) -> int:
    deleted = 0
    for attachment_id in draft.get("attachment_ids", []):
        attachment = await evidence_attachments_collection().find_one({
            "_id": attachment_id,
            "project_slug": draft["project_slug"],
            "note_id": draft["note_id"],
            "state": "draft",
            "created_by": draft["author"],
        })
        if attachment is None:
            continue
        await evidence_attachments_collection().delete_one({"_id": attachment_id})
        try:
            await evidence_file_store().delete(attachment["storage_id"])
        except Exception:
            logger.warning("Failed to remove a RedMode draft attachment binary")
        deleted += 1
    return deleted


async def cleanup_abandoned_evidence_drafts(now: datetime | None = None) -> dict:
    """Remove expired private drafts and orphan draft uploads, never publications."""
    if db_manager.db is None:
        return {"drafts": 0, "attachments": 0}
    moment = now or datetime.now(timezone.utc)
    cutoff = moment - timedelta(
        hours=max(1, settings.redmode_evidence_draft_retention_hours)
    )
    removed_drafts = 0
    removed_attachments = 0
    cursor = evidence_drafts_collection().find({"updated_at": {"$lt": cutoff}})
    async for draft in cursor:
        result = await evidence_drafts_collection().delete_one({
            "_id": draft["_id"],
            "updated_at": draft["updated_at"],
        })
        if result.deleted_count != 1:
            continue
        removed_drafts += 1
        removed_attachments += await _delete_draft_attachments(draft)

    orphan_cursor = evidence_attachments_collection().find({
        "state": "draft",
        "created_at": {"$lt": cutoff},
    })
    async for attachment in orphan_cursor:
        draft = await _private_draft(
            attachment["project_slug"],
            attachment["note_id"],
            attachment["created_by"],
        )
        if draft is not None:
            continue
        result = await evidence_attachments_collection().delete_one({
            "_id": attachment["_id"],
            "state": "draft",
        })
        if result.deleted_count != 1:
            continue
        try:
            await evidence_file_store().delete(attachment["storage_id"])
        except Exception:
            logger.warning("Failed to remove an orphan RedMode draft upload")
        removed_attachments += 1
    if removed_drafts or removed_attachments:
        logger.info(
            "Cleaned abandoned RedMode evidence drafts",
            extra={
                "drafts": removed_drafts,
                "attachments": removed_attachments,
            },
        )
    return {"drafts": removed_drafts, "attachments": removed_attachments}


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


def _within_dates(
    value: datetime,
    date_from: datetime | None,
    date_to: datetime | None,
) -> bool:
    return not (
        date_from is not None and value < date_from
        or date_to is not None and value > date_to
    )


def _search_match(query: str, *values: str) -> bool:
    if not query:
        return True
    folded = query.casefold()
    return any(folded in value.casefold() for value in values)


def _reference_result(
    view: dict,
    *,
    entity_type: str,
    excerpt: str,
    phase: str | None,
    updated_at: datetime,
    private: bool = False,
) -> dict:
    return {
        "type": entity_type,
        "id": view["id"],
        "reference": f"[[{view['key']}]]" if not view["broken"] else None,
        "key": view["key"],
        "label": view["label"],
        "excerpt": excerpt,
        "phase": phase,
        "updated_at": updated_at,
        "href": view["href"],
        "private": private,
        "broken": view["broken"],
    }


async def _document_search_results(
    slug: str,
    username: str,
    query: str,
    entity_type: str,
    phase: str | None,
    tag: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> list[dict]:
    results = []
    if entity_type in {"all", "evidence"}:
        async for note in evidence_collection().find({"project_slug": slug}):
            revision = await _current_revision(note)
            updated_at = note.get("updated_at", note["created_at"])
            if phase and revision["phase"] != phase:
                continue
            if tag and tag not in revision.get("tags", []):
                continue
            if not _within_dates(updated_at, date_from, date_to):
                continue
            search_text = revision.get("search_text") or evidence_search_text(
                revision["title"],
                revision["markdown"],
                revision["tags"],
                revision.get("references", []),
            )
            if not _search_match(query, search_text):
                continue
            view = await _resolve_reference(slug, {
                "kind": "evidence",
                "id": note["_id"],
                "key": f"evidence:{note['_id']}",
            })
            results.append(_reference_result(
                view,
                entity_type="evidence",
                excerpt=_markdown_excerpt(revision["markdown"]),
                phase=revision["phase"],
                updated_at=updated_at,
            ))
    if entity_type in {"all", "draft"}:
        cursor = evidence_drafts_collection().find({
            "project_slug": slug,
            "author": username,
        })
        async for draft in cursor:
            if phase and draft.get("phase") != phase:
                continue
            if tag and tag not in draft.get("tags", []):
                continue
            if not _within_dates(draft["updated_at"], date_from, date_to):
                continue
            search_text = draft.get("search_text") or evidence_search_text(
                draft.get("title", ""),
                draft.get("markdown", ""),
                draft.get("tags", []),
                draft.get("references", []),
            )
            if not _search_match(query, search_text):
                continue
            key = f"evidence:{draft['note_id']}"
            results.append({
                "type": "draft",
                "id": draft["note_id"],
                "reference": None,
                "key": key,
                "label": draft.get("title") or "Rascunho sem título",
                "excerpt": _markdown_excerpt(draft.get("markdown", "")),
                "phase": draft.get("phase"),
                "updated_at": draft["updated_at"],
                "href": _reference_href(slug, "evidence", {"note": draft["note_id"]}),
                "private": True,
                "broken": False,
            })
    if entity_type in {"all", "finding"}:
        if tag:
            return results
        async for finding in findings_collection().find({"project_slug": slug}):
            revision = await finding_revisions_collection().find_one({
                "_id": finding.get("current_revision_id"),
                "finding_id": finding["_id"],
                "project_slug": slug,
            })
            if revision is None:
                continue
            updated_at = finding.get("updated_at", finding.get("created_at"))
            if phase and revision["phase"] != phase:
                continue
            if not _within_dates(updated_at, date_from, date_to):
                continue
            if not _search_match(
                query,
                revision["title"],
                revision["description"],
                *revision.get("targets", []),
                f"finding:{finding['_id']}",
            ):
                continue
            view = await _resolve_reference(slug, {
                "kind": "finding",
                "id": finding["_id"],
                "key": f"finding:{finding['_id']}",
            })
            results.append(_reference_result(
                view,
                entity_type="finding",
                excerpt=_markdown_excerpt(revision["description"]),
                phase=revision["phase"],
                updated_at=updated_at,
            ))
    return results


async def _scope_search_results(
    slug: str,
    project: dict,
    query: str,
    entity_type: str,
    date_from: datetime | None,
    date_to: datetime | None,
    *,
    active_only: bool,
    per_version_limit: int,
) -> list[dict]:
    if entity_type not in {"all", "source", "target"}:
        return []
    version_ids = (
        [project.get("active_scope_version")]
        if active_only
        else list(reversed(project.get("scope_history", [])))
    )
    results = []
    for version_id in [item for item in version_ids if item]:
        version = await scope_versions_collection().find_one({
            "_id": version_id,
            "project_slug": slug,
        })
        if version is None or not _within_dates(
            version["created_at"],
            date_from,
            date_to,
        ):
            continue
        if entity_type in {"all", "source"}:
            source_query = {"project_slug": slug, "version_id": version_id}
            if query:
                pattern = {"$regex": re.escape(query), "$options": "i"}
                source_query["$or"] = [
                    {"name": pattern},
                    {"source_id": pattern},
                ]
            source_docs = await scope_sources_collection().find(source_query).limit(
                per_version_limit
            ).to_list(length=per_version_limit)
            source_ids = [item["source_id"] for item in source_docs]
            if not source_docs and not query:
                source = version.get("source", {})
                if source.get("text"):
                    source_ids.append("text")
                offset = 1 if source.get("text") else 0
                for index, file_info in enumerate(source.get("files", []), start=offset):
                    source_ids.append(
                        file_info.get("source_id") or f"legacy-file-{index + 1}"
                    )
            for source_id in source_ids:
                reference = {
                    "kind": "source",
                    "id": f"{version_id}/{source_id}",
                    "key": f"source:{version_id}/{source_id}",
                }
                view = await _resolve_reference(slug, reference)
                if view["broken"] or not _search_match(query, view["label"], view["key"]):
                    continue
                results.append(_reference_result(
                    view,
                    entity_type="source",
                    excerpt=f"Versão de escopo {version_id[:10]}",
                    phase=None,
                    updated_at=version["created_at"],
                ))
        if entity_type in {"all", "target"}:
            asset_query = {"project_slug": slug, "version_id": version_id}
            if query:
                pattern = {"$regex": re.escape(query), "$options": "i"}
                asset_query["$or"] = [
                    {"search_text": pattern},
                    {"asset_id": pattern},
                ]
            asset_docs = await scope_assets_collection().find(asset_query).limit(
                per_version_limit
            ).to_list(length=per_version_limit)
            asset_ids = [item["asset_id"] for item in asset_docs]
            if not asset_docs and not query:
                for item in [
                    *version.get("rules", []),
                    *version.get("context_assets", []),
                ][:per_version_limit]:
                    if item.get("kind") and item.get("value"):
                        asset_ids.append(sha256(
                            f"{item['kind']}\0{item['value']}".encode("utf-8")
                        ).hexdigest())
            for asset_id in asset_ids:
                reference = {
                    "kind": "target",
                    "id": f"{version_id}/{asset_id}",
                    "key": f"target:{version_id}/{asset_id}",
                }
                view = await _resolve_reference(slug, reference)
                if view["broken"] or not _search_match(query, view["label"], view["key"]):
                    continue
                results.append(_reference_result(
                    view,
                    entity_type="target",
                    excerpt=f"Alvo canônico da versão {version_id[:10]}",
                    phase=None,
                    updated_at=version["created_at"],
                ))
    return results


async def _search_notebook(
    slug: str,
    project: dict,
    username: str,
    query: str,
    entity_type: str,
    phase: str | None,
    tag: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    *,
    active_scope_only: bool,
    per_version_limit: int,
) -> list[dict]:
    results = await _document_search_results(
        slug,
        username,
        query,
        entity_type,
        phase,
        tag,
        date_from,
        date_to,
    )
    if not phase and not tag:
        results.extend(await _scope_search_results(
            slug,
            project,
            query,
            entity_type,
            date_from,
            date_to,
            active_only=active_scope_only,
            per_version_limit=per_version_limit,
        ))
    results.sort(key=lambda item: item["updated_at"], reverse=True)
    return results


@router.get("/evidence/limits")
async def get_evidence_limits(current_user: dict = Depends(require_redmode_access)):
    return {
        "max_text_characters": MAX_NOTE_MARKDOWN,
        "max_file_bytes": settings.redmode_evidence_max_file_bytes,
    }


@router.post("/projects/{slug}/references/resolve")
async def resolve_evidence_references(
    slug: str,
    payload: EvidenceReferenceResolve,
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_member(slug, current_user)
    return {"items": await _resolve_references(slug, payload.markdown)}


@router.get("/projects/{slug}/references/suggest")
async def suggest_evidence_references(
    slug: str,
    q: str = Query("", max_length=200),
    limit: int = Query(12, ge=1, le=30),
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_member(slug, current_user)
    query = q.strip()
    entity_type = "all"
    if ":" in query:
        prefix, remainder = query.split(":", 1)
        if prefix in {"evidence", "finding", "source", "target"}:
            entity_type = prefix
            query = remainder
    results = await _search_notebook(
        slug,
        project,
        current_user["username"],
        query,
        entity_type,
        None,
        None,
        None,
        None,
        active_scope_only=True,
        per_version_limit=limit,
    )
    return {
        "items": [item for item in results if item["reference"]][:limit],
    }


@router.get("/projects/{slug}/notebook/search")
async def search_evidence_notebook(
    slug: str,
    q: str = Query("", max_length=200),
    entity_type: Literal[
        "all", "evidence", "draft", "finding", "source", "target"
    ] = Query("all", alias="type"),
    phase: str | None = Query(None),
    tag: str | None = Query(None, max_length=80),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_member(slug, current_user)
    if phase is not None and phase not in PTES_PHASES:
        raise HTTPException(status_code=422, detail="invalid_ptes_phase")
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(status_code=422, detail="invalid_search_date_range")
    results = await _search_notebook(
        slug,
        project,
        current_user["username"],
        q.strip(),
        entity_type,
        phase,
        tag,
        date_from,
        date_to,
        active_scope_only=False,
        per_version_limit=max(limit, 50),
    )
    return {"items": results[offset:offset + limit], "total": len(results)}


@router.post(
    "/projects/{slug}/evidence/drafts",
    status_code=status.HTTP_201_CREATED,
)
async def create_evidence_draft(
    slug: str,
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_write(slug, current_user)
    note_id = uuid4().hex
    now = datetime.now(timezone.utc)
    draft = {
        "_id": _draft_id(slug, note_id, current_user["username"]),
        "note_id": note_id,
        "project_slug": slug,
        "author": current_user["username"],
        "version": 1,
        "base_revision_id": None,
        "created_at": now,
        "updated_at": now,
        "title": "",
        "markdown": "",
        "phase": "pre-engagement",
        "tags": [],
        "targets": [],
        "finding_ids": [],
        "attachment_ids": [],
        "attachments": [],
        "references": [],
        "reference_keys": [],
        "search_text": "",
    }
    await evidence_drafts_collection().insert_one(draft)
    return evidence_draft_detail(draft)


@router.get("/projects/{slug}/evidence/drafts")
async def list_evidence_drafts(
    slug: str,
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_member(slug, current_user)
    cursor = evidence_drafts_collection().find({
        "project_slug": slug,
        "author": current_user["username"],
    }).sort("updated_at", -1)
    return {"items": [evidence_draft_summary(item) async for item in cursor]}


@router.get("/projects/{slug}/evidence/drafts/{note_id}")
async def get_evidence_draft(
    slug: str,
    note_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_member(slug, current_user)
    draft = await _private_draft(slug, note_id, current_user["username"])
    if draft is None:
        raise HTTPException(status_code=404, detail="evidence_draft_not_found")
    return evidence_draft_detail(draft)


@router.put("/projects/{slug}/evidence/drafts/{note_id}")
async def save_evidence_draft(
    slug: str,
    note_id: str,
    payload: EvidenceDraftWrite,
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_write(slug, current_user)
    note = await evidence_collection().find_one({
        "_id": note_id,
        "project_slug": slug,
    })
    current_revision = await _current_revision(note) if note is not None else None
    current_revision_id = current_revision["_id"] if current_revision else None
    if payload.base_revision_id != current_revision_id:
        raise HTTPException(status_code=409, detail="evidence_draft_conflict")

    author = current_user["username"]
    draft = await _private_draft(slug, note_id, author)
    if draft is not None and draft.get("base_revision_id") != payload.base_revision_id:
        raise HTTPException(status_code=409, detail="evidence_draft_conflict")
    if draft is None and payload.expected_version != 0:
        raise HTTPException(status_code=409, detail="evidence_draft_changed_retry")
    if draft is not None and draft["version"] != payload.expected_version:
        raise HTTPException(status_code=409, detail="evidence_draft_changed_retry")

    await _validate_finding_ids(slug, payload.finding_ids)
    attachments = await _resolve_draft_attachments(
        slug,
        note_id,
        author,
        payload.attachment_ids,
        current_revision.get("attachments", []) if current_revision else [],
    )
    references = extract_internal_references(payload.markdown)
    fields = {
        **payload.model_dump(exclude={"base_revision_id", "expected_version"}),
        "references": references,
        "reference_keys": [reference["key"] for reference in references],
        "search_text": evidence_search_text(
            payload.title,
            payload.markdown,
            payload.tags,
            references,
        ),
    }
    now = datetime.now(timezone.utc)
    if draft is None:
        draft = {
            "_id": _draft_id(slug, note_id, author),
            "note_id": note_id,
            "project_slug": slug,
            "author": author,
            "version": 1,
            "base_revision_id": payload.base_revision_id,
            "created_at": now,
            "updated_at": now,
            **fields,
            "attachments": attachments,
        }
        try:
            await evidence_drafts_collection().insert_one(draft)
        except DuplicateKeyError as exc:
            raise HTTPException(
                status_code=409,
                detail="evidence_draft_changed_retry",
            ) from exc
        return evidence_draft_detail(draft)

    result = await evidence_drafts_collection().update_one(
        {"_id": draft["_id"], "version": payload.expected_version},
        {
            "$set": {
                **fields,
                "attachments": attachments,
                "updated_at": now,
            },
            "$inc": {"version": 1},
        },
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="evidence_draft_changed_retry")
    updated = await _private_draft(slug, note_id, author)
    return evidence_draft_detail(updated)


@router.delete(
    "/projects/{slug}/evidence/drafts/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def discard_evidence_draft(
    slug: str,
    note_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_write(slug, current_user)
    draft = await _private_draft(slug, note_id, current_user["username"])
    if draft is None:
        raise HTTPException(status_code=404, detail="evidence_draft_not_found")
    result = await evidence_drafts_collection().delete_one({
        "_id": draft["_id"],
        "version": draft["version"],
    })
    if result.deleted_count != 1:
        raise HTTPException(status_code=409, detail="evidence_draft_changed_retry")
    await _delete_draft_attachments(draft)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/projects/{slug}/evidence/drafts/{note_id}/rebase")
async def rebase_evidence_draft(
    slug: str,
    note_id: str,
    payload: EvidenceDraftRebase,
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_write(slug, current_user)
    note = await evidence_collection().find_one({
        "_id": note_id,
        "project_slug": slug,
    })
    if note is None:
        raise HTTPException(status_code=404, detail="evidence_not_found")
    current_revision = await _current_revision(note)
    if current_revision["_id"] != payload.current_revision_id:
        raise HTTPException(status_code=409, detail="evidence_draft_conflict")
    draft = await _private_draft(slug, note_id, current_user["username"])
    if draft is None:
        raise HTTPException(status_code=404, detail="evidence_draft_not_found")
    result = await evidence_drafts_collection().update_one(
        {"_id": draft["_id"], "version": payload.expected_version},
        {
            "$set": {
                "base_revision_id": current_revision["_id"],
                "updated_at": datetime.now(timezone.utc),
            },
            "$inc": {"version": 1},
        },
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="evidence_draft_changed_retry")
    updated = await _private_draft(slug, note_id, current_user["username"])
    return evidence_draft_detail(updated)


@router.post("/projects/{slug}/evidence/drafts/{note_id}/attachments")
async def upload_evidence_draft_attachments(
    slug: str,
    note_id: str,
    expected_version: int = Form(...),
    files: list[UploadFile] = File(...),
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_write(slug, current_user)
    author = current_user["username"]
    draft = await _private_draft(slug, note_id, author)
    if draft is None:
        raise HTTPException(status_code=404, detail="evidence_draft_not_found")
    if draft["version"] != expected_version:
        raise HTTPException(status_code=409, detail="evidence_draft_changed_retry")
    if not files:
        raise HTTPException(status_code=422, detail="evidence_files_required")
    if len(draft.get("attachment_ids", [])) + len(files) > MAX_NOTE_RELATIONS:
        raise HTTPException(status_code=422, detail="too_many_evidence_attachments")

    now = datetime.now(timezone.utc)
    created = []
    store = evidence_file_store()
    try:
        for upload in files:
            filename = clean_filename(upload.filename or "")
            if not filename:
                raise HTTPException(
                    status_code=422,
                    detail="evidence_filename_required",
                )
            content = await upload.read(settings.redmode_evidence_max_file_bytes + 1)
            if len(content) > settings.redmode_evidence_max_file_bytes:
                raise HTTPException(status_code=413, detail="evidence_file_too_large")
            if not content:
                raise HTTPException(status_code=422, detail="evidence_file_empty")
            attachment_id = uuid4().hex
            digest = sha256(content).hexdigest()
            content_type = (upload.content_type or "application/octet-stream")[:255]
            storage_id = await store.save(filename, content, {
                "project_slug": slug,
                "note_id": note_id,
                "attachment_id": attachment_id,
                "author": author,
                "sha256": digest,
                "state": "draft",
            })
            attachment = {
                "_id": attachment_id,
                "id": attachment_id,
                "project_slug": slug,
                "note_id": note_id,
                "storage_id": storage_id,
                "filename": filename,
                "content_type": content_type,
                "size": len(content),
                "sha256": digest,
                "state": "draft",
                "created_by": author,
                "created_at": now,
            }
            await evidence_attachments_collection().insert_one(attachment)
            created.append(attachment)

        attachment_ids = [
            *draft.get("attachment_ids", []),
            *[item["id"] for item in created],
        ]
        attachments = [
            *draft.get("attachments", []),
            *[_attachment_view(item) for item in created],
        ]
        result = await evidence_drafts_collection().update_one(
            {"_id": draft["_id"], "version": expected_version},
            {
                "$set": {
                    "attachment_ids": attachment_ids,
                    "attachments": attachments,
                    "updated_at": now,
                },
                "$inc": {"version": 1},
            },
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail="evidence_draft_changed_retry")
    except Exception:
        for attachment in created:
            await evidence_attachments_collection().delete_one({
                "_id": attachment["_id"],
            })
            try:
                await store.delete(attachment["storage_id"])
            except Exception:
                logger.warning("Failed to roll back a RedMode draft attachment")
        raise
    updated = await _private_draft(slug, note_id, author)
    return evidence_draft_detail(updated)


@router.delete(
    "/projects/{slug}/evidence/drafts/{note_id}/attachments/{attachment_id}"
)
async def delete_evidence_draft_attachment(
    slug: str,
    note_id: str,
    attachment_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_write(slug, current_user)
    author = current_user["username"]
    draft = await _private_draft(slug, note_id, author)
    if draft is None:
        raise HTTPException(status_code=404, detail="evidence_draft_not_found")
    attachment = await evidence_attachments_collection().find_one({
        "_id": attachment_id,
        "project_slug": slug,
        "note_id": note_id,
        "state": "draft",
        "created_by": author,
    })
    if attachment is None or attachment_id not in draft.get("attachment_ids", []):
        raise HTTPException(status_code=404, detail="evidence_file_not_found")
    next_ids = [item for item in draft["attachment_ids"] if item != attachment_id]
    next_attachments = [
        item for item in draft.get("attachments", [])
        if str(item["id"]) != attachment_id
    ]
    result = await evidence_drafts_collection().update_one(
        {"_id": draft["_id"], "version": draft["version"]},
        {
            "$set": {
                "attachment_ids": next_ids,
                "attachments": next_attachments,
                "updated_at": datetime.now(timezone.utc),
            },
            "$inc": {"version": 1},
        },
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="evidence_draft_changed_retry")
    await evidence_attachments_collection().delete_one({"_id": attachment_id})
    try:
        await evidence_file_store().delete(attachment["storage_id"])
    except Exception:
        logger.warning("Failed to remove a RedMode draft attachment binary")
    updated = await _private_draft(slug, note_id, author)
    return evidence_draft_detail(updated)


@router.post("/projects/{slug}/evidence/drafts/{note_id}/publish")
async def publish_evidence_draft(
    slug: str,
    note_id: str,
    payload: EvidenceDraftPublish,
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_write(slug, current_user)
    author = current_user["username"]
    draft = await _private_draft(slug, note_id, author)
    if draft is None:
        raise HTTPException(status_code=404, detail="evidence_draft_not_found")
    if draft["version"] != payload.expected_version:
        raise HTTPException(status_code=409, detail="evidence_draft_changed_retry")

    note = await evidence_collection().find_one({
        "_id": note_id,
        "project_slug": slug,
    })
    previous = await _current_revision(note) if note is not None else None
    current_revision_id = previous["_id"] if previous else None
    if draft.get("base_revision_id") != current_revision_id:
        raise HTTPException(status_code=409, detail="evidence_draft_conflict")

    try:
        document = EvidenceNoteInput(**{
            key: draft.get(
                key,
                [] if key.endswith("s") or key.endswith("_ids") else "",
            )
            for key in (
                "title",
                "markdown",
                "phase",
                "tags",
                "targets",
                "finding_ids",
                "attachment_ids",
            )
        })
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail="evidence_draft_not_publishable",
        ) from exc
    await _validate_finding_ids(slug, document.finding_ids)
    references = await _validated_references(slug, document.markdown)
    attachments = await _resolve_draft_attachments(
        slug,
        note_id,
        author,
        document.attachment_ids,
        previous.get("attachments", []) if previous else [],
    )

    claim = await evidence_drafts_collection().update_one(
        {"_id": draft["_id"], "version": payload.expected_version},
        {
            "$set": {"publishing_at": datetime.now(timezone.utc)},
            "$inc": {"version": 1},
        },
    )
    if claim.modified_count != 1:
        raise HTTPException(status_code=409, detail="evidence_draft_changed_retry")
    claimed_version = payload.expected_version + 1

    materialized_legacy = False
    note_inserted = False
    note_updated = False
    revision_inserted = False
    attachments_published = False
    previous_updated_at = note.get("updated_at", note["created_at"]) if note else None
    now = datetime.now(timezone.utc)
    revision_id = uuid4().hex
    revision = {
        "_id": revision_id,
        "note_id": note_id,
        "project_slug": slug,
        "number": previous["number"] + 1 if previous else 1,
        "previous_revision_id": previous["_id"] if previous else None,
        "author": author,
        "created_at": now,
        **document.model_dump(),
        "attachments": attachments,
        **_reference_fields(document, references),
    }
    draft_attachment_ids = []
    for attachment_id in document.attachment_ids:
        attachment = await evidence_attachments_collection().find_one({
            "_id": attachment_id,
            "project_slug": slug,
            "note_id": note_id,
            "state": "draft",
            "created_by": author,
        })
        if attachment is not None:
            draft_attachment_ids.append(attachment_id)

    try:
        if note is not None and not note.get("current_revision_id"):
            try:
                await evidence_revisions_collection().insert_one(previous)
            except DuplicateKeyError as exc:
                raise HTTPException(
                    status_code=409,
                    detail="evidence_draft_conflict",
                ) from exc
            materialized_legacy = True

        await evidence_revisions_collection().insert_one(revision)
        revision_inserted = True
        if note is None:
            note = {
                "_id": note_id,
                "project_slug": slug,
                "current_revision_id": revision_id,
                "created_by": author,
                "created_at": now,
                "updated_at": now,
                "origin": "human",
                "parent_id": document.parent_id,
                "slug": document.slug or slugify(document.title),
                "kind": document.kind,
                "position": document.position,
                "pinned": document.pinned,
            }
            await evidence_collection().insert_one(note)
            note_inserted = True
        else:
            result = await evidence_collection().update_one(
                {
                    "_id": note_id,
                    "project_slug": slug,
                    "current_revision_id": note.get("current_revision_id"),
                },
                {"$set": {"current_revision_id": revision_id, "updated_at": now}},
            )
            if result.modified_count != 1:
                raise HTTPException(status_code=409, detail="evidence_draft_conflict")
            note_updated = True

        if draft_attachment_ids:
            await evidence_attachments_collection().update_many(
                {
                    "_id": {"$in": draft_attachment_ids},
                    "project_slug": slug,
                    "note_id": note_id,
                    "state": "draft",
                    "created_by": author,
                },
                {"$set": {
                    "state": "published",
                    "published_revision_id": revision_id,
                }},
            )
            attachments_published = True

        await _record_activity(
            project,
            "evidence_updated" if previous else "evidence_created",
            note_id,
            now,
            author,
        )
        await evidence_drafts_collection().delete_one({
            "_id": draft["_id"],
            "version": claimed_version,
        })
    except Exception as exc:
        if note_inserted:
            await evidence_collection().delete_one({
                "_id": note_id,
                "current_revision_id": revision_id,
            })
        elif note_updated:
            await evidence_collection().update_one(
                {"_id": note_id, "current_revision_id": revision_id},
                {"$set": {
                    "current_revision_id": note.get("current_revision_id"),
                    "updated_at": previous_updated_at,
                }},
            )
        if revision_inserted:
            await evidence_revisions_collection().delete_one({"_id": revision_id})
        if materialized_legacy:
            await evidence_revisions_collection().delete_one({"_id": previous["_id"]})
        if attachments_published:
            await evidence_attachments_collection().update_many(
                {"_id": {"$in": draft_attachment_ids}},
                {"$set": {"state": "draft", "published_revision_id": None}},
            )
        await evidence_drafts_collection().update_one(
            {"_id": draft["_id"], "version": claimed_version},
            {
                "$set": {"publishing_at": None},
                "$inc": {"version": -1},
            },
        )
        if isinstance(exc, HTTPException):
            raise
        logger.exception("RedMode evidence draft could not be published")
        raise HTTPException(
            status_code=503,
            detail="evidence_storage_unavailable",
        ) from exc

    published = await evidence_collection().find_one({
        "_id": note_id,
        "project_slug": slug,
    })
    return await evidence_note_detail(published)


@router.post(
    "/projects/{slug}/evidence/notes",
    status_code=status.HTTP_201_CREATED,
)
async def create_evidence_note(
    slug: str,
    payload: EvidenceNoteInput,
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_write(slug, current_user)
    await _validate_finding_ids(slug, payload.finding_ids)
    references = await _validated_references(slug, payload.markdown)
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
        **_reference_fields(payload, references),
    }
    note = {
        "_id": note_id,
        "project_slug": slug,
        "current_revision_id": revision_id,
        "created_by": current_user["username"],
        "created_at": now,
        "updated_at": now,
        "origin": "human",
        "parent_id": payload.parent_id,
        "slug": payload.slug or slugify(payload.title),
        "kind": payload.kind,
        "position": payload.position,
        "pinned": payload.pinned,
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


@router.get("/projects/{slug}/evidence/notes/{note_id}/links")
async def get_evidence_note_links(
    slug: str,
    note_id: str,
    revision_id: str | None = Query(None),
    current_user: dict = Depends(require_redmode_access),
):
    note = await load_evidence(slug, note_id, current_user)
    if revision_id is None:
        revision = await _current_revision(note)
    elif (
        revision_id == _legacy_revision_id(note_id)
        and not note.get("current_revision_id")
    ):
        revision = _legacy_revision(note)
    else:
        revision = await evidence_revisions_collection().find_one({
            "_id": revision_id,
            "project_slug": slug,
            "note_id": note_id,
        })
        if revision is None:
            raise HTTPException(status_code=404, detail="evidence_revision_not_found")

    outgoing = await _resolve_references(
        slug,
        revision.get("markdown", ""),
        revision.get("references"),
    )
    backlink_key = f"evidence:{note_id}"
    backlinks = []
    revision_cursor = evidence_revisions_collection().find({
        "project_slug": slug,
        "reference_keys": backlink_key,
    })
    async for candidate_revision in revision_cursor:
        candidate = await evidence_collection().find_one({
            "_id": candidate_revision["note_id"],
            "project_slug": slug,
            "current_revision_id": candidate_revision["_id"],
        })
        if candidate is None:
            continue
        backlinks.append({
            "type": "evidence",
            "id": candidate["_id"],
            "label": candidate_revision["title"],
            "href": _reference_href(
                slug,
                "evidence",
                {"note": candidate["_id"]},
            ),
            "context": reference_context(
                candidate_revision["markdown"],
                backlink_key,
            ),
            "author": candidate_revision["author"],
            "updated_at": candidate.get(
                "updated_at",
                candidate["created_at"],
            ),
        })
    finding_cursor = finding_revisions_collection().find({
        "project_slug": slug,
        "reference_keys": backlink_key,
    })
    async for candidate_revision in finding_cursor:
        finding = await findings_collection().find_one({
            "_id": candidate_revision["finding_id"],
            "project_slug": slug,
            "current_revision_id": candidate_revision["_id"],
        })
        if finding is None:
            continue
        backlinks.append({
            "type": "finding",
            "id": finding["_id"],
            "label": candidate_revision["title"],
            "href": _reference_href(
                slug,
                "findings",
                {"finding": finding["_id"]},
            ),
            "context": reference_context(
                candidate_revision.get("description", ""),
                backlink_key,
            ),
            "author": candidate_revision["author"],
            "updated_at": finding["updated_at"],
        })
    backlinks.sort(key=lambda item: item["updated_at"], reverse=True)
    return {"outgoing": outgoing, "backlinks": backlinks}


@router.put("/projects/{slug}/evidence/notes/{note_id}")
async def update_evidence_note(
    slug: str,
    note_id: str,
    payload: EvidenceNoteEdit,
    current_user: dict = Depends(require_redmode_access),
):
    project = await load_project_for_write(slug, current_user)
    note = await evidence_collection().find_one({"_id": note_id, "project_slug": slug})
    if note is None:
        raise HTTPException(status_code=404, detail="evidence_not_found")
    previous = await _current_revision(note)
    if payload.expected_revision_id != previous["_id"]:
        raise HTTPException(status_code=409, detail="evidence_changed_retry")
    await _validate_finding_ids(slug, payload.finding_ids)
    references = await _validated_references(slug, payload.markdown)
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
        **_reference_fields(payload, references),
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
    inline: bool = Query(False),
    current_user: dict = Depends(require_redmode_access),
):
    await load_project_for_member(slug, current_user)
    note = await evidence_collection().find_one({
        "_id": note_id,
        "project_slug": slug,
    })
    candidates = []
    if note is not None:
        revisions = evidence_revisions_collection().find({
            "project_slug": slug,
            "note_id": note_id,
        })
        async for revision in revisions:
            candidates.extend(revision.get("attachments", []))
    if note is not None and not note.get("current_revision_id"):
        candidates.extend(_legacy_revision(note)["attachments"])
    draft = await _private_draft(slug, note_id, current_user["username"])
    if draft is not None:
        candidates.extend(draft.get("attachments", []))
    info = next(
        (item for item in candidates if str(item["id"]) == attachment_id),
        None,
    )
    if info is None:
        raise HTTPException(status_code=404, detail="evidence_file_not_found")
    storage_id = await _attachment_storage_id(slug, note_id, info)
    return await _evidence_file_response(storage_id, info, inline=inline)


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
    project = await load_project_for_write(slug, current_user)
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

    document = EvidenceNoteInput(
        title=_legacy_title(
            text.strip(),
            {"filename": filename} if filename else None,
        ),
        markdown=text.strip(),
        phase=phase,
        tags=[],
        targets=[target.strip()] if target.strip() else [],
        finding_ids=[finding_id] if finding_id else [],
        attachment_ids=[],
    )
    references = await _validated_references(slug, document.markdown)
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
            **document.model_dump(exclude={"attachment_ids"}),
            "attachment_ids": [attachment_id] if attachment_id else [],
            "attachments": attachments,
            **_reference_fields(document, references),
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


@router.get("/projects/{slug}/evidence/tree")
async def get_evidence_tree(
    slug: str,
    current_user: dict = Depends(require_redmode_access),
):
    """Hierarchical PageNode tree translated from LeafWiki internal/core/tree."""
    await load_project_for_member(slug, current_user)
    cursor = evidence_collection().find({"project_slug": slug})
    notes_list = []
    async for note in cursor:
        summary = await evidence_note_summary(note)
        notes_list.append(summary)

    fav_cursor = evidence_favorites_collection().find({
        "project_slug": slug,
        "username": current_user["username"],
    })
    user_favorites = {doc["note_id"] async for doc in fav_cursor}

    tree = build_tree_hierarchy(notes_list, user_favorites)
    return {"tree": tree, "total": len(notes_list)}


@router.post("/projects/{slug}/evidence/sections", status_code=status.HTTP_201_CREATED)
async def create_evidence_section(
    slug: str,
    payload: EvidenceSectionCreate,
    current_user: dict = Depends(require_redmode_access),
):
    """Create a section folder translated from LeafWiki internal/wiki/pages."""
    project = await load_project_for_write(slug, current_user)
    if payload.parent_id:
        parent = await evidence_collection().find_one({
            "_id": payload.parent_id,
            "project_slug": slug,
        })
        if not parent:
            raise HTTPException(status_code=404, detail="parent_section_not_found")

    note_id = uuid4().hex
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
        "title": payload.title,
        "markdown": payload.markdown,
        "phase": payload.phase,
        "tags": [],
        "targets": [],
        "finding_ids": [],
        "attachments": [],
        "attachment_ids": [],
        "references": [],
        "search_text": f"{payload.title} {payload.markdown}",
    }
    note = {
        "_id": note_id,
        "project_slug": slug,
        "current_revision_id": revision_id,
        "created_by": current_user["username"],
        "created_at": now,
        "updated_at": now,
        "origin": "human",
        "parent_id": payload.parent_id,
        "slug": slugify(payload.title),
        "kind": "section",
        "position": 0,
        "pinned": False,
    }
    await evidence_revisions_collection().insert_one(revision)
    await evidence_collection().insert_one(note)
    await _record_activity(
        project,
        "evidence_section_created",
        note_id,
        now,
        current_user["username"],
    )
    return await evidence_note_detail(note)


@router.post("/projects/{slug}/evidence/notes/{note_id}/move")
async def move_evidence_note(
    slug: str,
    note_id: str,
    payload: EvidenceNodeMove,
    current_user: dict = Depends(require_redmode_access),
):
    """Move note/section with cycle prevention and sibling reordering translated from move_page.go."""
    project = await load_project_for_write(slug, current_user)
    note = await evidence_collection().find_one({"_id": note_id, "project_slug": slug})
    if not note:
        raise HTTPException(status_code=404, detail="evidence_not_found")

    all_notes = {
        doc["_id"]: doc
        async for doc in evidence_collection().find({"project_slug": slug})
    }
    try:
        validate_node_move(all_notes, note_id, payload.parent_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    now = datetime.now(timezone.utc)
    target_parent_id = payload.parent_id
    siblings = [
        {"id": doc["_id"], "position": doc.get("position", 0)}
        for doc in all_notes.values()
        if doc.get("parent_id") == target_parent_id and doc["_id"] != note_id
    ]
    siblings.sort(key=lambda s: s["position"])
    reordered = calculate_reordered_positions(siblings, note_id, payload.position)

    for nid, pos in reordered.items():
        update_fields = {"position": pos}
        if nid == note_id:
            update_fields["parent_id"] = target_parent_id
            update_fields["updated_at"] = now
        await evidence_collection().update_one(
            {"_id": nid, "project_slug": slug},
            {"$set": update_fields},
        )

    await _record_activity(project, "evidence_moved", note_id, now, current_user["username"])
    updated_note = await evidence_collection().find_one({"_id": note_id, "project_slug": slug})
    return await evidence_note_detail(updated_note)


@router.post("/projects/{slug}/evidence/notes/{note_id}/copy", status_code=status.HTTP_201_CREATED)
async def copy_evidence_note(
    slug: str,
    note_id: str,
    payload: EvidenceNodeCopy,
    current_user: dict = Depends(require_redmode_access),
):
    """Duplicate note, content, and attachments translated from copy_page.go."""
    project = await load_project_for_write(slug, current_user)
    source_note = await evidence_collection().find_one({"_id": note_id, "project_slug": slug})
    if not source_note:
        raise HTTPException(status_code=404, detail="evidence_not_found")
    source_rev = await _current_revision(source_note)

    new_note_id = uuid4().hex
    new_rev_id = uuid4().hex
    now = datetime.now(timezone.utc)
    new_title = payload.new_title.strip() if payload.new_title else f"{source_rev['title']} (Cópia)"

    new_attachments = []
    new_attachment_ids = []
    if source_rev.get("attachments"):
        store = evidence_file_store()
        for att in source_rev.get("attachments", []):
            try:
                original_data = await store.read(att.get("storage_id", str(att["id"])))
                new_storage_id = await store.save(
                    att["filename"],
                    original_data,
                    {"project_slug": slug, "note_id": new_note_id},
                )
                new_att_id = uuid4().hex
                att_doc = {
                    "_id": new_att_id,
                    "project_slug": slug,
                    "note_id": new_note_id,
                    "storage_id": new_storage_id,
                    "filename": att["filename"],
                    "content_type": att.get("content_type", "application/octet-stream"),
                    "size_bytes": len(original_data),
                    "hash_sha256": att.get("hash_sha256", ""),
                    "state": "published",
                    "published_revision_id": new_rev_id,
                    "created_by": current_user["username"],
                    "created_at": now,
                }
                await evidence_attachments_collection().insert_one(att_doc)
                new_attachments.append(_attachment_view(att_doc))
                new_attachment_ids.append(new_att_id)
            except Exception:
                logger.warning("Could not duplicate attachment for copied evidence note")

    updated_markdown = source_rev.get("markdown", "")
    for old_att, new_att in zip(source_rev.get("attachments", []), new_attachments):
        old_href = f"/projects/{slug}/evidence/attachments/{old_att['id']}"
        new_href = f"/projects/{slug}/evidence/attachments/{new_att['id']}"
        updated_markdown = updated_markdown.replace(old_href, new_href)

    references = extract_internal_references(updated_markdown)
    new_rev = {
        "_id": new_rev_id,
        "note_id": new_note_id,
        "project_slug": slug,
        "number": 1,
        "previous_revision_id": None,
        "author": current_user["username"],
        "created_at": now,
        "title": new_title,
        "markdown": updated_markdown,
        "phase": source_rev.get("phase", "pre-engagement"),
        "tags": list(source_rev.get("tags", [])),
        "targets": list(source_rev.get("targets", [])),
        "finding_ids": list(source_rev.get("finding_ids", [])),
        "attachments": new_attachments,
        "attachment_ids": new_attachment_ids,
        "references": references,
        "search_text": f"{new_title} {updated_markdown}",
    }
    target_parent_id = (
        payload.target_parent_id
        if payload.target_parent_id is not None
        else source_note.get("parent_id")
    )
    new_note = {
        "_id": new_note_id,
        "project_slug": slug,
        "current_revision_id": new_rev_id,
        "created_by": current_user["username"],
        "created_at": now,
        "updated_at": now,
        "origin": "human",
        "parent_id": target_parent_id,
        "slug": slugify(new_title),
        "kind": source_note.get("kind", "page"),
        "position": source_note.get("position", 0) + 1,
        "pinned": False,
    }
    await evidence_revisions_collection().insert_one(new_rev)
    await evidence_collection().insert_one(new_note)
    await _record_activity(project, "evidence_copied", new_note_id, now, current_user["username"])
    return await evidence_note_detail(new_note)


@router.post("/projects/{slug}/evidence/notes/{note_id}/pin")
async def pin_evidence_note(
    slug: str,
    note_id: str,
    payload: EvidenceNodePin,
    current_user: dict = Depends(require_redmode_access),
):
    """Toggle note pinned status translated from pin_page.go."""
    project = await load_project_for_write(slug, current_user)
    note = await evidence_collection().find_one({"_id": note_id, "project_slug": slug})
    if not note:
        raise HTTPException(status_code=404, detail="evidence_not_found")
    now = datetime.now(timezone.utc)
    await evidence_collection().update_one(
        {"_id": note_id, "project_slug": slug},
        {"$set": {"pinned": payload.pinned, "updated_at": now}},
    )
    await _record_activity(
        project,
        "evidence_pinned" if payload.pinned else "evidence_unpinned",
        note_id,
        now,
        current_user["username"],
    )
    updated = await evidence_collection().find_one({"_id": note_id, "project_slug": slug})
    return await evidence_note_detail(updated)


@router.post("/projects/{slug}/evidence/tree/sort")
async def sort_evidence_tree(
    slug: str,
    payload: EvidenceTreeSort,
    current_user: dict = Depends(require_redmode_access),
):
    """Reorder siblings inside a section folder translated from sort_pages.go."""
    await load_project_for_write(slug, current_user)
    now = datetime.now(timezone.utc)
    for idx, nid in enumerate(payload.ordered_ids):
        await evidence_collection().update_one(
            {"_id": nid, "project_slug": slug},
            {"$set": {"position": idx, "updated_at": now}},
        )
    return {"status": "ok", "reordered": len(payload.ordered_ids)}


@router.get("/projects/{slug}/evidence/favorites")
async def list_evidence_favorites(
    slug: str,
    current_user: dict = Depends(require_redmode_access),
):
    """List personal user favorites translated from list_favorites.go."""
    await load_project_for_member(slug, current_user)
    cursor = evidence_favorites_collection().find({
        "project_slug": slug,
        "username": current_user["username"],
    })
    favorite_ids = [doc["note_id"] async for doc in cursor]
    items = []
    for nid in favorite_ids:
        note = await evidence_collection().find_one({"_id": nid, "project_slug": slug})
        if note:
            items.append(await evidence_note_summary(note))
    return {"favorites": items, "total": len(items)}


@router.post("/projects/{slug}/evidence/notes/{note_id}/favorite")
async def add_evidence_favorite(
    slug: str,
    note_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    """Add note to user favorites translated from add_favorite.go."""
    await load_project_for_member(slug, current_user)
    note = await evidence_collection().find_one({"_id": note_id, "project_slug": slug})
    if not note:
        raise HTTPException(status_code=404, detail="evidence_not_found")
    now = datetime.now(timezone.utc)
    doc_id = f"{slug}:{current_user['username']}:{note_id}"
    await evidence_favorites_collection().update_one(
        {"_id": doc_id},
        {"$set": {
            "_id": doc_id,
            "project_slug": slug,
            "username": current_user["username"],
            "note_id": note_id,
            "created_at": now,
        }},
        upsert=True,
    )
    return {"status": "ok", "favorited": True, "note_id": note_id}


@router.delete("/projects/{slug}/evidence/notes/{note_id}/favorite")
async def remove_evidence_favorite(
    slug: str,
    note_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    """Remove note from user favorites translated from remove_favorite.go."""
    await load_project_for_member(slug, current_user)
    doc_id = f"{slug}:{current_user['username']}:{note_id}"
    await evidence_favorites_collection().delete_one({"_id": doc_id})
    return {"status": "ok", "favorited": False, "note_id": note_id}


@router.get("/projects/{slug}/evidence/links/broken")
async def get_broken_evidence_links(
    slug: str,
    current_user: dict = Depends(require_redmode_access),
):
    """Detect broken wikilinks translated from internal/links/outgoing.go."""
    await load_project_for_member(slug, current_user)
    notes_cursor = evidence_collection().find({"project_slug": slug})
    notes_with_rev = []
    async for note in notes_cursor:
        rev = await _current_revision(note)
        notes_with_rev.append({
            "id": note["_id"],
            "title": rev.get("title", ""),
            "slug": note.get("slug") or slugify(rev.get("title", "")),
            "markdown": rev.get("markdown", ""),
        })

    findings_cursor = findings_collection().find({"project_slug": slug})
    known_findings = {f["_id"] async for f in findings_cursor}

    broken = detect_broken_links(notes_with_rev, known_findings)
    return {"broken_links": broken, "total": len(broken)}


@router.post("/projects/{slug}/evidence/links/refactor")
async def refactor_evidence_links(
    slug: str,
    payload: EvidenceLinkRefactor,
    current_user: dict = Depends(require_redmode_access),
):
    """Refactor wikilinks across notebook notes translated from internal/links/link_refactor.go."""
    await load_project_for_write(slug, current_user)
    notes_cursor = evidence_collection().find({"project_slug": slug})
    now = datetime.now(timezone.utc)
    total_rewritten_notes = 0
    total_rewritten_links = 0

    async for note in notes_cursor:
        rev = await _current_revision(note)
        old_md = rev.get("markdown", "")
        new_md, count = refactor_markdown_links(
            old_md,
            payload.old_title,
            payload.new_title,
            payload.old_slug,
            payload.new_slug,
        )
        if count > 0:
            total_rewritten_notes += 1
            total_rewritten_links += count
            new_rev_id = uuid4().hex
            new_references = extract_internal_references(new_md)
            new_rev = {
                "_id": new_rev_id,
                "note_id": note["_id"],
                "project_slug": slug,
                "number": rev["number"] + 1,
                "previous_revision_id": rev["_id"],
                "author": current_user["username"],
                "created_at": now,
                "title": rev["title"],
                "markdown": new_md,
                "phase": rev["phase"],
                "tags": rev["tags"],
                "targets": rev["targets"],
                "finding_ids": rev["finding_ids"],
                "attachments": rev.get("attachments", []),
                "attachment_ids": rev.get("attachment_ids", []),
                "references": new_references,
                "search_text": f"{rev['title']} {new_md}",
            }
            await evidence_revisions_collection().insert_one(new_rev)
            await evidence_collection().update_one(
                {"_id": note["_id"], "project_slug": slug},
                {"$set": {"current_revision_id": new_rev_id, "updated_at": now}},
            )

    return {
        "status": "ok",
        "notes_updated": total_rewritten_notes,
        "links_refactored": total_rewritten_links,
    }


@router.get("/projects/{slug}/evidence/tags")
async def get_evidence_tags_index(
    slug: str,
    current_user: dict = Depends(require_redmode_access),
):
    """Aggregate tags and note counts translated from internal/tags/tags_service.go."""
    await load_project_for_member(slug, current_user)
    notes_cursor = evidence_collection().find({"project_slug": slug})
    notes_list = []
    async for note in notes_cursor:
        rev = await _current_revision(note)
        notes_list.append({
            "id": note["_id"],
            "title": rev.get("title", ""),
            "tags": rev.get("tags", []),
            "phase": rev.get("phase", "pre-engagement"),
        })
    tags = aggregate_tags(notes_list)
    return {"tags": tags, "total": len(tags)}


@router.get("/projects/{slug}/evidence/export/bundle")
async def export_evidence_bundle(
    slug: str,
    current_user: dict = Depends(require_redmode_access),
):
    """Export whole notebook as zip bundle with frontmatter translated from LeafWiki export."""
    await load_project_for_member(slug, current_user)
    notes_cursor = evidence_collection().find({"project_slug": slug})
    notes_with_rev = []
    async for note in notes_cursor:
        rev = await _current_revision(note)
        notes_with_rev.append({
            "id": note["_id"],
            "title": rev.get("title", ""),
            "slug": note.get("slug") or slugify(rev.get("title", "")),
            "parent_id": note.get("parent_id"),
            "kind": note.get("kind", "page"),
            "pinned": bool(note.get("pinned", False)),
            "markdown": rev.get("markdown", ""),
            "phase": rev.get("phase", "pre-engagement"),
            "tags": rev.get("tags", []),
            "targets": rev.get("targets", []),
            "finding_ids": rev.get("finding_ids", []),
            "created_at": note.get("created_at"),
            "updated_at": note.get("updated_at"),
        })

    zip_bytes = export_bundle_as_zip(slug, notes_with_rev)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(f'{slug}-evidence-notebook.zip')}",
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/projects/{slug}/evidence/notes/{note_id}/export")
async def export_single_evidence_note(
    slug: str,
    note_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    """Export single note as markdown with YAML frontmatter."""
    note = await load_evidence(slug, note_id, current_user)
    rev = await _current_revision(note)
    meta = {
        "id": note["_id"],
        "title": rev.get("title", ""),
        "slug": note.get("slug") or slugify(rev.get("title", "")),
        "phase": rev.get("phase", "pre-engagement"),
        "kind": note.get("kind", "page"),
        "pinned": note.get("pinned", False),
        "tags": rev.get("tags", []),
        "targets": rev.get("targets", []),
        "finding_ids": rev.get("finding_ids", []),
    }
    content = dump_markdown_frontmatter(meta, rev.get("markdown", ""))
    filename = f"{note.get('slug') or slugify(rev.get('title', 'note'))}.md"
    return Response(
        content=content.encode("utf-8"),
        media_type="text/markdown",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/projects/{slug}/evidence/import", status_code=status.HTTP_201_CREATED)
async def import_evidence_note(
    slug: str,
    payload: EvidenceImportInput,
    current_user: dict = Depends(require_redmode_access),
):
    """Import Markdown document with frontmatter parsing translated from internal/wiki/importer."""
    meta, body = parse_markdown_frontmatter(payload.content)

    title = meta.get("title") or payload.filename.removesuffix(".md").replace("-", " ").title() or "Nota Importada"
    phase = meta.get("phase", "pre-engagement")
    if phase not in PTES_PHASES:
        phase = "pre-engagement"
    tags = meta.get("tags", [])
    if not isinstance(tags, list):
        tags = []
    targets = meta.get("targets", [])
    if not isinstance(targets, list):
        targets = []
    finding_ids = meta.get("finding_ids", [])
    if not isinstance(finding_ids, list):
        finding_ids = []

    note_input = EvidenceNoteInput(
        title=title[:MAX_NOTE_TITLE],
        markdown=body,
        phase=phase,
        tags=[str(t).strip() for t in tags if str(t).strip()][:MAX_NOTE_TAGS],
        targets=[str(t).strip() for t in targets if str(t).strip()][:MAX_NOTE_RELATIONS],
        finding_ids=[str(f).strip() for f in finding_ids if str(f).strip()][:MAX_NOTE_RELATIONS],
        parent_id=payload.parent_id,
        slug=slugify(title),
        kind="page",
    )
    return await create_evidence_note(slug, note_input, current_user)


async def _evidence_file_response(
    storage_id: str,
    info: dict,
    inline: bool = False,
) -> Response:
    try:
        content = await evidence_file_store().read(storage_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="evidence_file_unavailable") from exc
    return Response(
        content=content,
        media_type=info.get("content_type", "application/octet-stream"),
        headers={
            "Content-Disposition": (
                f"{'inline' if inline else 'attachment'}; "
                f"filename*=UTF-8''{quote(clean_filename(info['filename']))}"
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


@router.get("/projects/{slug}/evidence/{evidence_id}")
async def get_evidence(
    slug: str,
    evidence_id: str,
    current_user: dict = Depends(require_redmode_access),
):
    return await evidence_detail(await load_evidence(slug, evidence_id, current_user))


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


"""
Premium exposure router.

Provides the initial authenticated surface for premium exposure providers,
monitored assets, and recent normalized findings.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from audit import log_action
from auth import get_current_user
from db import db_manager
from exposure_contracts import build_exposure_asset_payload
from exposure_monitoring import (
    build_exposure_incident_document,
    build_exposure_monitored_asset_document,
    update_exposure_recurrence_state,
)
from exposure_runtime import (
    build_surface_monitor_asset,
    build_surface_monitor_provider_descriptor,
    normalize_surface_monitor_findings,
    run_surface_monitor_query,
)
from limiters import limiter

router = APIRouter(prefix="/exposure", tags=["exposure"])


def _get_exposure_providers() -> list[dict]:
    return [build_surface_monitor_provider_descriptor()]


def _customer_key_from_user(current_user: dict) -> str:
    return str(current_user.get("username") or "").strip().lower()


def _serialize_datetime(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _serialize_document(document: dict) -> dict:
    serialized = {}
    for key, value in document.items():
        if isinstance(value, dict):
            serialized[key] = {inner_key: _serialize_datetime(inner_value) for inner_key, inner_value in value.items()}
        elif isinstance(value, list):
            serialized[key] = [
                {inner_key: _serialize_datetime(inner_value) for inner_key, inner_value in item.items()}
                if isinstance(item, dict)
                else _serialize_datetime(item)
                for item in value
            ]
        else:
            serialized[key] = _serialize_datetime(value)
    return serialized


class ExposureAssetCreateRequest(BaseModel):
    asset_type: str
    value: str
    schedule_mode: str = "daily"
    tags: list[str] = Field(default_factory=list)
    provider_keys: list[str] | None = None

    @field_validator("asset_type", "value", "schedule_mode")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        return value.strip()


class ExposureBulkScanRequest(BaseModel):
    asset_ids: list[str] = Field(default_factory=list)


class ExposureAssetGroupRequest(BaseModel):
    name: str
    asset_ids: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        return value.strip()


class ExposureIncidentPromoteRequest(BaseModel):
    asset_id: str
    finding_ids: list[str] = Field(default_factory=list)
    title: str | None = None
    summary: str | None = None
    severity: str | None = None

    @field_validator("asset_id", "title", "summary", "severity")
    @classmethod
    def _strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()


class ExposureIncidentStatusRequest(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def _strip_status(cls, value: str) -> str:
        return value.strip()


async def _get_owned_asset_or_404(db, customer_key: str, asset_id: str):
    asset_doc = await db.exposure_monitored_assets.find_one(
        {"_id": asset_id, "customer_key": customer_key}
    )
    if not asset_doc:
        raise HTTPException(status_code=404, detail="exposure_asset_not_found")
    return asset_doc


async def _execute_asset_scan(db, *, customer_key: str, asset_doc: dict, current_user: dict, request: Request):
    asset_id = asset_doc["_id"]
    asset_payload = build_exposure_asset_payload(
        asset_type=asset_doc["asset_type"],
        value=asset_doc["value"],
        owner=asset_doc.get("owner"),
        schedule_mode=(asset_doc.get("recurrence") or {}).get("mode", "manual"),
        tags=asset_doc.get("tags") or [],
    )

    fetch_runner = getattr(request.app.state, "exposure_fetch_runner", None)
    now = datetime.now(timezone.utc)
    request_ip = request.client.host if request.client else ""
    raw_findings = await run_surface_monitor_query(asset_payload, fetch_runner=fetch_runner)
    findings = normalize_surface_monitor_findings(
        customer_key=customer_key,
        monitored_asset_id=asset_id,
        asset_payload=asset_payload,
        raw_findings=raw_findings,
    )
    for finding in findings:
        finding["_id"] = uuid4().hex
        await db.exposure_findings.insert_one(finding)

    asset_doc["updated_at"] = now
    asset_doc["recurrence"] = update_exposure_recurrence_state(
        asset_doc.get("recurrence"),
        timestamp=now,
        status="success",
    )
    await db.exposure_monitored_assets.replace_one({"_id": asset_id}, asset_doc)
    await log_action(
        db,
        user=current_user["username"],
        action="premium_exposure_scan",
        target=asset_doc["value"],
        ip=request_ip,
        result="success",
        detail=f"{asset_doc['asset_type']}:{len(findings)}",
    )
    return {
        "asset": _serialize_document(asset_doc),
        "items": [_serialize_document(item) for item in findings],
        "total_results": len(findings),
    }


@router.get("/providers")
async def list_exposure_providers(current_user: dict = Depends(get_current_user)):
    _ = current_user
    return {"items": _get_exposure_providers()}


@router.get("/assets")
async def list_exposure_assets(current_user: dict = Depends(get_current_user)):
    db = db_manager.db
    if db is None:
        return {"items": []}

    customer_key = _customer_key_from_user(current_user)
    asset_docs = await db.exposure_monitored_assets.find({"customer_key": customer_key}).to_list(length=200)
    asset_docs = sorted(asset_docs, key=lambda item: item.get("updated_at") or item.get("created_at"), reverse=True)

    items = []
    incident_docs = await db.exposure_incidents.find({"customer_key": customer_key}, {"_id": 0}).to_list(length=200)
    for asset_doc in asset_docs:
        asset_id = str(asset_doc.get("_id"))
        finding_docs = await db.exposure_findings.find(
            {
                "customer_key": customer_key,
                "monitored_asset_id": asset_id,
            }
        ).to_list(length=10)
        finding_docs = sorted(finding_docs, key=lambda item: item.get("timestamp"), reverse=True)
        incident_count = sum(
            1
            for incident in incident_docs
            if any(str(asset.get("monitored_asset_id")) == asset_id for asset in (incident.get("related_assets") or []))
        )
        items.append(
            {
                **_serialize_document(asset_doc),
                "_id": asset_id,
                "finding_count": len(finding_docs),
                "incident_count": incident_count,
                "recent_findings": [_serialize_document(doc) for doc in finding_docs[:5]],
            }
        )

    return {"items": items}


@router.get("/asset-groups")
async def list_exposure_asset_groups(current_user: dict = Depends(get_current_user)):
    db = db_manager.db
    if db is None:
        return {"items": []}

    customer_key = _customer_key_from_user(current_user)
    docs = await db.exposure_asset_groups.find({"customer_key": customer_key}).to_list(length=100)
    docs = sorted(docs, key=lambda item: item.get("updated_at") or item.get("created_at"), reverse=True)
    return {"items": [_serialize_document(doc) for doc in docs]}


@router.get("/incidents")
async def list_exposure_incidents(current_user: dict = Depends(get_current_user)):
    db = db_manager.db
    if db is None:
        return {"items": []}

    customer_key = _customer_key_from_user(current_user)
    docs = await db.exposure_incidents.find({"customer_key": customer_key}).to_list(length=200)
    docs = sorted(docs, key=lambda item: item.get("updated_at") or item.get("opened_at"), reverse=True)
    return {"items": [_serialize_document(doc) for doc in docs]}


@router.post("/assets")
@limiter.limit("10/minute", error_message="Too many premium exposure asset changes. Try again later.")
async def create_exposure_asset(
    body: ExposureAssetCreateRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=503, detail="database_unavailable")

    customer_key = _customer_key_from_user(current_user)
    request_ip = request.client.host if request.client else ""
    providers = _get_exposure_providers()
    allowed_provider_keys = {provider["key"] for provider in providers}
    provider_keys = body.provider_keys or [provider["key"] for provider in providers]
    unknown_keys = sorted(set(provider_keys) - allowed_provider_keys)
    if unknown_keys:
        raise HTTPException(status_code=400, detail=f"unknown_exposure_provider:{','.join(unknown_keys)}")

    asset_payload = build_surface_monitor_asset(
        asset_type=body.asset_type,
        value=body.value,
        owner=customer_key,
        schedule_mode=body.schedule_mode,
        tags=body.tags,
    )
    asset_id = uuid4().hex
    document = build_exposure_monitored_asset_document(
        customer_key=customer_key,
        asset_payload=asset_payload,
        created_by=current_user["username"],
        provider_keys=provider_keys,
    )
    document["_id"] = asset_id

    existing = await db.exposure_monitored_assets.find_one(
        {
            "customer_key": customer_key,
            "asset_type": document["asset_type"],
            "value": document["value"],
        }
    )
    if existing:
        await log_action(
            db,
            user=current_user["username"],
            action="premium_exposure_asset_create",
            target=document["value"],
            ip=request_ip,
            result="denied",
            detail="exposure_asset_already_exists",
        )
        raise HTTPException(status_code=409, detail="exposure_asset_already_exists")

    await db.exposure_monitored_assets.insert_one(document)
    await log_action(
        db,
        user=current_user["username"],
        action="premium_exposure_asset_create",
        target=document["value"],
        ip=request_ip,
        result="success",
        detail=document["asset_type"],
    )
    return {"item": _serialize_document(document)}


@router.post("/asset-groups", status_code=201)
async def create_exposure_asset_group(
    body: ExposureAssetGroupRequest,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=503, detail="database_unavailable")

    customer_key = _customer_key_from_user(current_user)
    assets = await db.exposure_monitored_assets.find({"customer_key": customer_key}).to_list(length=300)
    selected_ids = {str(value).strip() for value in body.asset_ids if str(value).strip()}
    related_assets = [
        {
            "monitored_asset_id": str(asset["_id"]),
            "asset_type": asset["asset_type"],
            "value": asset["value"],
        }
        for asset in assets
        if str(asset.get("_id")) in selected_ids
    ]
    if not related_assets:
        raise HTTPException(status_code=400, detail="exposure_group_assets_required")

    now = datetime.now(timezone.utc)
    group = {
        "_id": uuid4().hex,
        "customer_key": customer_key,
        "name": body.name,
        "assets": related_assets,
        "created_by": current_user["username"],
        "created_at": now,
        "updated_at": now,
    }
    await db.exposure_asset_groups.insert_one(group)
    return {"item": _serialize_document(group)}


@router.post("/assets/bulk-scan")
async def bulk_scan_exposure_assets(
    body: ExposureBulkScanRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=503, detail="database_unavailable")

    customer_key = _customer_key_from_user(current_user)
    results = []
    total_results = 0
    for asset_id in body.asset_ids:
        asset_doc = await _get_owned_asset_or_404(db, customer_key, asset_id)
        response = await _execute_asset_scan(db, customer_key=customer_key, asset_doc=asset_doc, current_user=current_user, request=request)
        results.append({"asset_id": asset_id, "total_results": response["total_results"]})
        total_results += response["total_results"]
    return {"assets_scanned": len(results), "total_results": total_results, "items": results}


@router.post("/asset-groups/{group_id}/scan")
async def scan_exposure_asset_group(
    group_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=503, detail="database_unavailable")

    customer_key = _customer_key_from_user(current_user)
    group = await db.exposure_asset_groups.find_one({"_id": group_id, "customer_key": customer_key})
    if not group:
        raise HTTPException(status_code=404, detail="exposure_asset_group_not_found")

    results = []
    total_results = 0
    for related_asset in group.get("assets") or []:
        asset_doc = await _get_owned_asset_or_404(db, customer_key, str(related_asset.get("monitored_asset_id")))
        response = await _execute_asset_scan(db, customer_key=customer_key, asset_doc=asset_doc, current_user=current_user, request=request)
        results.append({"asset_id": asset_doc["_id"], "total_results": response["total_results"]})
        total_results += response["total_results"]
    return {"group_id": group_id, "assets_scanned": len(results), "total_results": total_results, "items": results}


@router.post("/incidents/promote", status_code=201)
async def promote_exposure_findings_to_incident(
    body: ExposureIncidentPromoteRequest,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=503, detail="database_unavailable")

    customer_key = _customer_key_from_user(current_user)
    asset_doc = await _get_owned_asset_or_404(db, customer_key, body.asset_id)
    finding_docs = await db.exposure_findings.find(
        {"customer_key": customer_key, "monitored_asset_id": body.asset_id}
    ).to_list(length=100)
    selected_findings = [doc for doc in finding_docs if str(doc.get("_id")) in set(body.finding_ids)]
    if not selected_findings:
        raise HTTPException(status_code=400, detail="exposure_incident_findings_required")

    severity_order = {"critical": 5, "high": 4, "medium": 3, "low": 2, "info": 1}
    derived_severity = max(
        (str(doc.get("severity") or "medium").lower() for doc in selected_findings),
        key=lambda value: severity_order.get(value, 0),
    )
    incident = build_exposure_incident_document(
        customer_key=customer_key,
        title=body.title or f"Exposure incident for {asset_doc['value']}",
        summary=body.summary or f"{len(selected_findings)} finding(s) promoted for analyst triage.",
        severity=body.severity or derived_severity,
        source_finding_ids=[str(doc["_id"]) for doc in selected_findings],
        related_assets=[{
            "asset_type": asset_doc["asset_type"],
            "value": asset_doc["value"],
            "monitored_asset_id": body.asset_id,
        }],
        extra_fields={"created_by": current_user["username"]},
    )
    incident["_id"] = uuid4().hex
    await db.exposure_incidents.insert_one(incident)
    for doc in selected_findings:
        await db.exposure_findings.update_one({"_id": doc["_id"]}, {"$set": {"incident_id": incident["_id"]}})
    return {"item": _serialize_document(incident)}


@router.patch("/incidents/{incident_id}")
async def update_exposure_incident_status(
    incident_id: str,
    body: ExposureIncidentStatusRequest,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=503, detail="database_unavailable")

    customer_key = _customer_key_from_user(current_user)
    incident = await db.exposure_incidents.find_one({"_id": incident_id, "customer_key": customer_key})
    if not incident:
        raise HTTPException(status_code=404, detail="exposure_incident_not_found")

    incident["status"] = body.status.strip().lower()
    incident["updated_at"] = datetime.now(timezone.utc)
    await db.exposure_incidents.replace_one({"_id": incident_id}, incident)
    return {"item": _serialize_document(incident)}


@router.post("/assets/{asset_id}/scan")
@limiter.limit("5/minute", error_message="Too many premium exposure scans. Try again later.")
async def scan_exposure_asset(
    asset_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=503, detail="database_unavailable")

    customer_key = _customer_key_from_user(current_user)
    asset_doc = await _get_owned_asset_or_404(db, customer_key, asset_id)
    try:
        return await _execute_asset_scan(
            db,
            customer_key=customer_key,
            asset_doc=asset_doc,
            current_user=current_user,
            request=request,
        )
    except ValueError as exc:
        now = datetime.now(timezone.utc)
        request_ip = request.client.host if request.client else ""
        asset_doc["updated_at"] = now
        asset_doc["recurrence"] = update_exposure_recurrence_state(
            asset_doc.get("recurrence"),
            timestamp=now,
            status="error",
        )
        await db.exposure_monitored_assets.replace_one({"_id": asset_id}, asset_doc)
        await log_action(
            db,
            user=current_user["username"],
            action="premium_exposure_scan",
            target=asset_doc["value"],
            ip=request_ip,
            result="failure",
            detail=str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc

"""
Premium hunting router.

Provides the initial authenticated surface for premium hunting providers.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from audit import log_action
from auth import get_current_user
from hunting_runtime import (
    build_hunting_runtime_catalog,
    build_hunting_provider_catalog,
    get_hunting_provider_registry,
    resolve_hunting_provider_runtime,
)
from db import db_manager
from limiters import limiter

router = APIRouter(prefix="/hunting", tags=["hunting"])


def _get_hunting_providers(exec_runner=None) -> list[dict[str, Any]]:
    return build_hunting_provider_catalog(exec_runner=exec_runner)


class HuntingSearchRequest(BaseModel):
    artifact_type: str
    query: str
    provider_keys: list[str] | None = None

    @field_validator("artifact_type", "query")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        return value.strip()


class SavedHuntingSearchRequest(BaseModel):
    name: str
    artifact_type: str
    query: str
    provider_keys: list[str] = Field(default_factory=list)

    @field_validator("name", "artifact_type", "query")
    @classmethod
    def _strip_saved_text(cls, value: str) -> str:
        return value.strip()


class HuntingCaseNoteRequest(BaseModel):
    search_id: str
    note: str

    @field_validator("search_id", "note")
    @classmethod
    def _strip_note_text(cls, value: str) -> str:
        return value.strip()


@router.get("/providers")
async def list_hunting_providers(request: Request, current_user: dict = Depends(get_current_user)):
    _ = current_user
    exec_runner = getattr(request.app.state, "hunting_exec_runner", None)
    return {
        "items": _get_hunting_providers(exec_runner=exec_runner),
        "runtime": build_hunting_runtime_catalog(exec_runner=exec_runner),
    }


@router.get("/saved-searches")
async def list_saved_hunting_searches(current_user: dict = Depends(get_current_user)):
    db = db_manager.db
    if db is None:
        return {"items": []}

    docs = await db.hunting_saved_searches.find(
        {"analyst": current_user["username"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(50).to_list(length=50)
    return {"items": docs}


@router.post("/saved-searches", status_code=201)
async def create_saved_hunting_search(
    body: SavedHuntingSearchRequest,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=503, detail="database_unavailable")

    doc = {
        "_id": uuid4().hex,
        "analyst": current_user["username"],
        "name": body.name,
        "artifact_type": body.artifact_type,
        "query": body.query,
        "provider_keys": body.provider_keys,
        "created_at": datetime.now(timezone.utc),
        "last_used_at": None,
        "use_count": 0,
    }
    await db.hunting_saved_searches.insert_one(doc)
    return {"item": doc}


@router.delete("/saved-searches/{saved_search_id}")
async def delete_saved_hunting_search(
    saved_search_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=503, detail="database_unavailable")

    result = await db.hunting_saved_searches.delete_one(
        {"_id": saved_search_id, "analyst": current_user["username"]},
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="saved_hunting_search_not_found")
    return {"ok": True}


@router.get("/recent-searches")
async def list_recent_hunting_searches(current_user: dict = Depends(get_current_user)):
    db = db_manager.db
    if db is None:
        return {"items": []}

    docs = await db.hunting_results.find(
        {"analyst": current_user["username"]},
        {"_id": 0},
    ).sort("timestamp", -1).limit(250).to_list(length=250)

    grouped: dict[str, dict[str, Any]] = {}
    for doc in docs:
        search_id = doc.get("search_id")
        if not search_id:
            continue
        bucket = grouped.get(search_id)
        if bucket is None:
            bucket = {
                "search_id": search_id,
                "artifact_type": doc.get("artifact_type"),
                "query": doc.get("query"),
                "timestamp": doc.get("search_timestamp") or doc.get("timestamp"),
                "providers": set(),
                "result_count": 0,
            }
            grouped[search_id] = bucket
        bucket["providers"].add(doc.get("provider_key"))
        bucket["result_count"] += 1

    items = sorted(
        [
            {
                **value,
                "providers": sorted([provider for provider in value["providers"] if provider]),
            }
            for value in grouped.values()
        ],
        key=lambda item: item.get("timestamp") or datetime.now(timezone.utc),
        reverse=True,
    )[:20]
    return {"items": items}


@router.get("/searches/{search_id}")
async def get_hunting_search(
    search_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        return {"search_id": search_id, "query": None, "items": [], "total_results": 0}

    docs = await db.hunting_results.find(
        {"analyst": current_user["username"], "search_id": search_id},
        {"_id": 0},
    ).sort("timestamp", -1).limit(500).to_list(length=500)

    if not docs:
        raise HTTPException(status_code=404, detail="hunting_search_not_found")

    exec_runner = getattr(request.app.state, "hunting_exec_runner", None)
    provider_map = {
        provider["key"]: provider
        for provider in _get_hunting_providers(exec_runner=exec_runner)
    }

    grouped: dict[str, dict[str, Any]] = {}
    for doc in docs:
        provider_key = doc.get("provider_key")
        if not provider_key:
          continue
        bucket = grouped.get(provider_key)
        if bucket is None:
            bucket = {
                "provider": provider_map.get(
                    provider_key,
                    {
                        "key": provider_key,
                        "name": provider_key,
                        "runtimeStatus": {
                            "ready": False,
                            "state": "unknown",
                            "recommendedMode": None,
                            "preferredMode": None,
                            "activeMode": None,
                            "availableModes": [],
                            "wiredModes": [],
                            "blocker": None,
                        },
                    },
                ),
                "query": {
                    "artifact_type": doc.get("artifact_type"),
                    "query": doc.get("query"),
                },
                "status": "ok",
                "error": None,
                "results": [],
            }
            grouped[provider_key] = bucket
        bucket["results"].append(doc)

    first = docs[0]
    return {
        "search_id": search_id,
        "query": {
            "artifact_type": first.get("artifact_type"),
            "query": first.get("query"),
        },
        "items": list(grouped.values()),
        "total_results": len(docs),
    }


@router.get("/case-notes")
async def list_hunting_case_notes(
    search_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        return {"items": []}

    docs = await db.hunting_case_notes.find(
        {"analyst": current_user["username"], "search_id": search_id},
        {"_id": 0},
    ).sort("created_at", -1).limit(50).to_list(length=50)
    return {"items": docs}


@router.post("/case-notes", status_code=201)
async def create_hunting_case_note(
    body: HuntingCaseNoteRequest,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=503, detail="database_unavailable")

    note = {
        "_id": uuid4().hex,
        "analyst": current_user["username"],
        "search_id": body.search_id,
        "note": body.note,
        "created_at": datetime.now(timezone.utc),
    }
    await db.hunting_case_notes.insert_one(note)
    return {"item": note}


@router.post("/search")
@limiter.limit("5/minute", error_message="Too many premium hunting searches. Try again later.")
async def run_hunting_search(
    body: HuntingSearchRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    if not body.query:
        raise HTTPException(status_code=400, detail="query_required")
    if not body.artifact_type:
        raise HTTPException(status_code=400, detail="artifact_type_required")

    exec_runner = getattr(request.app.state, "hunting_exec_runner", None)
    providers = _get_hunting_providers(exec_runner=exec_runner)
    provider_registry = get_hunting_provider_registry()
    requested_keys = body.provider_keys or [provider["key"] for provider in providers]
    requested = [provider for provider in providers if provider["key"] in requested_keys]
    unknown_keys = sorted(set(requested_keys) - {provider["key"] for provider in providers})
    if unknown_keys:
        raise HTTPException(
            status_code=400,
            detail=f"unknown_hunting_provider:{','.join(unknown_keys)}",
        )

    provider_results: list[dict[str, Any]] = []
    total_results = 0
    db = db_manager.db
    search_id = uuid4().hex
    request_ip = request.client.host if request.client else ""

    for provider in requested:
        adapter = provider_registry.get(provider["key"])
        if adapter is None:
            provider_results.append(
                {
                    "provider": provider,
                    "query": {"artifact_type": body.artifact_type, "query": body.query},
                    "status": "error",
                    "error": "unknown_hunting_provider",
                    "results": [],
                }
            )
            continue

        build_query = adapter.get("build_query")
        run_query = adapter.get("run_query")
        normalize_results = adapter.get("normalize_results")
        supported_artifact_types = adapter.get("supported_artifact_types") or set()
        query_payload = (
            build_query(
                artifact_type=body.artifact_type,
                query=body.query,
                analyst=current_user["username"],
            )
            if callable(build_query)
            else {
                "artifact_type": body.artifact_type,
                "query": body.query,
                "analyst": current_user["username"],
            }
        )

        if body.artifact_type not in supported_artifact_types:
            provider_results.append(
                {
                    "provider": provider,
                    "query": query_payload,
                    "status": "unsupported",
                    "error": f"unsupported_artifact_type:{body.artifact_type}",
                    "results": [],
                }
            )
            continue

        runtime_status = provider.get("runtimeStatus") or resolve_hunting_provider_runtime(provider, exec_runner=exec_runner)
        if not runtime_status.get("ready"):
            provider_results.append(
                {
                    "provider": provider,
                    "query": query_payload,
                    "status": "error",
                    "error": runtime_status.get("blocker") or "provider_runtime_missing",
                    "results": [],
                }
            )
            continue

        if not callable(run_query) or not callable(normalize_results):
            provider_results.append(
                {
                    "provider": provider,
                    "query": query_payload,
                    "status": "error",
                    "error": "runtime_declared_but_not_wired",
                    "results": [],
                }
            )
            continue

        try:
            raw_output = await run_query(query_payload, exec_runner=exec_runner)
            results = normalize_results(query_payload, raw_output)
            if db is not None:
                for result in results:
                    result["_id"] = uuid4().hex
                    result["search_id"] = search_id
                    result["search_timestamp"] = datetime.now(timezone.utc)
                    result["data_boundary"] = "premium_hunting"
                    result["storage_scope"] = "user"
                    result["analyst"] = current_user["username"]
                    await db.hunting_results.insert_one(result)
            provider_results.append(
                {
                    "provider": provider,
                    "query": query_payload,
                    "status": "ok",
                    "error": None,
                    "results": results,
                }
            )
            total_results += len(results)
        except FileNotFoundError:
            provider_results.append(
                {
                    "provider": provider,
                    "query": query_payload,
                    "status": "error",
                    "error": "provider_runtime_missing",
                    "results": [],
                }
            )
        except RuntimeError as exc:
            provider_results.append(
                {
                    "provider": provider,
                    "query": query_payload,
                    "status": "error",
                    "error": str(exc),
                    "results": [],
                }
            )
        except ValueError as exc:
            provider_results.append(
                {
                    "provider": provider,
                    "query": query_payload,
                    "status": "error",
                    "error": str(exc),
                    "results": [],
                }
            )

    if db is not None:
        matching_saved = await db.hunting_saved_searches.find_one(
            {
                "analyst": current_user["username"],
                "artifact_type": body.artifact_type,
                "query": body.query,
            }
        )
        if matching_saved:
            await db.hunting_saved_searches.update_one(
                {"_id": matching_saved["_id"]},
                {"$set": {"last_used_at": datetime.now(timezone.utc), "provider_keys": requested_keys},
                 "$inc": {"use_count": 1}},
            )
        has_success = any(item["status"] == "ok" for item in provider_results)
        has_failure = any(item["status"] == "error" for item in provider_results)
        await log_action(
            db,
            user=current_user["username"],
            action="premium_hunting_search",
            target=body.query,
            ip=request_ip,
            result="failure" if has_failure and not has_success else "success",
            detail=f"{body.artifact_type}:{total_results}:{','.join(item['status'] for item in provider_results)}",
        )

    return {
        "query": {
            "artifact_type": body.artifact_type,
            "query": body.query,
        },
        "search_id": search_id,
        "items": provider_results,
        "total_results": total_results,
    }

"""
Premium hunting router.

Provides the initial authenticated surface for premium hunting providers.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator

from audit import log_action
from auth import get_current_user
from hunting_runtime import (
    SHERLOCK_SUPPORTED_ARTIFACT_TYPES,
    build_sherlock_provider_descriptor,
    build_sherlock_query,
    normalize_sherlock_results,
    run_sherlock_query,
)
from db import db_manager
from limiters import limiter

router = APIRouter(prefix="/hunting", tags=["hunting"])


def _get_hunting_providers() -> list[dict[str, Any]]:
    return [build_sherlock_provider_descriptor()]


class HuntingSearchRequest(BaseModel):
    artifact_type: str
    query: str
    provider_keys: list[str] | None = None

    @field_validator("artifact_type", "query")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        return value.strip()


@router.get("/providers")
async def list_hunting_providers(current_user: dict = Depends(get_current_user)):
    _ = current_user
    return {"items": _get_hunting_providers()}


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

    providers = _get_hunting_providers()
    requested_keys = body.provider_keys or [provider["key"] for provider in providers]
    requested = [provider for provider in providers if provider["key"] in requested_keys]
    unknown_keys = sorted(set(requested_keys) - {provider["key"] for provider in providers})
    if unknown_keys:
        raise HTTPException(
            status_code=400,
            detail=f"unknown_hunting_provider:{','.join(unknown_keys)}",
        )

    exec_runner = getattr(request.app.state, "hunting_exec_runner", None)
    provider_results: list[dict[str, Any]] = []
    total_results = 0
    db = db_manager.db
    search_id = uuid4().hex
    request_ip = request.client.host if request.client else ""

    for provider in requested:
        query_payload = build_sherlock_query(
            artifact_type=body.artifact_type,
            query=body.query,
            analyst=current_user["username"],
        )

        if body.artifact_type not in SHERLOCK_SUPPORTED_ARTIFACT_TYPES:
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

        try:
            raw_output = await run_sherlock_query(query_payload, exec_runner=exec_runner)
            results = normalize_sherlock_results(query_payload, raw_output)
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
        "items": provider_results,
        "total_results": total_results,
    }

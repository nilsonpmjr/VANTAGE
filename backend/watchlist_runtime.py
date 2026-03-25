from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from clients.api_client_async import AsyncThreatIntelClient
from scoring import compute_risk_score, compute_verdict


VALID_NOTIFICATION_ROUTES = {"email", "in_app", "both"}


def normalize_watchlist_notification_route(value: str | None) -> str:
    normalized = str(value or "email").strip().lower()
    if normalized not in VALID_NOTIFICATION_ROUTES:
        raise ValueError(f"unsupported_notification_route:{normalized}")
    return normalized


async def evaluate_watchlist_target(
    client: AsyncThreatIntelClient,
    target: str,
    target_type: str,
) -> dict[str, Any]:
    raw_results = await client.query_all(target, target_type)
    clean_results = {
        svc: resp.data
        for svc, resp in raw_results.items()
        if resp.success and resp.data is not None
    }

    if not clean_results:
        raise ValueError("watchlist_no_runtime_results")

    risk_score, total_sources = compute_risk_score(clean_results)
    verdict = compute_verdict(risk_score)
    return {
        "results": clean_results,
        "risk_score": risk_score,
        "total_sources": total_sources,
        "verdict": verdict,
    }


async def persist_watchlist_scan(
    db,
    item: dict[str, Any],
    *,
    verdict: str,
    scanned_at: datetime | None = None,
) -> dict[str, Any]:
    now = scanned_at or datetime.now(timezone.utc)
    previous_verdict = item.get("last_verdict")
    changed = previous_verdict is not None and previous_verdict != verdict

    await db.watchlist.update_one(
        {"_id": item["_id"]},
        {"$set": {"last_verdict": verdict, "last_scan_at": now}},
    )

    await db.watchlist_history.insert_one(
        {
            "watchlist_item_id": str(item["_id"]),
            "user": item["user"],
            "target": item["target"],
            "target_type": item.get("target_type", ""),
            "verdict": verdict,
            "previous_verdict": previous_verdict,
            "changed": changed,
            "scanned_at": now,
        }
    )

    return {
        "changed": changed,
        "previous_verdict": previous_verdict,
        "verdict": verdict,
        "scanned_at": now,
    }

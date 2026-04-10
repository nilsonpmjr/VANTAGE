from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.encoders import jsonable_encoder

from db import db_manager
from auth import require_role, require_api_scope
from logging_config import get_logger

logger = get_logger("StatsRouter")

router = APIRouter(prefix="", tags=["stats"])


@router.get("/stats")
async def get_dashboard_stats(
    period: str = "month",
    limit: int = Query(20, ge=1, le=100, description="Max recent scans to return"),
    skip: int = Query(0, ge=0, description="Number of recent scans to skip (pagination)"),
    current_user: dict = Depends(require_role(["admin", "manager", "tech"])),
    _scope=Depends(require_api_scope("stats")),
):
    """Aggregated threat intelligence statistics for the SOC Dashboard."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    try:
        now = datetime.now(timezone.utc)
        start_date = None

        if period == "day":
            start_date = now - timedelta(days=1)
        elif period == "week":
            start_date = now - timedelta(days=7)
        elif period == "month":
            start_date = now - timedelta(days=30)

        base_query = {}
        base_match = []
        if start_date:
            base_query = {"timestamp": {"$gte": start_date}}
            base_match = [{"$match": base_query}]

        # Total scans in period
        total_scans = await db.scans.count_documents(base_query)

        # Verdict distribution
        verdict_pipeline = base_match + [
            {"$group": {"_id": "$verdict", "count": {"$sum": 1}}}
        ]
        verdict_result = [
            {"name": item["_id"], "value": item["count"]}
            for item in await db.scans.aggregate(verdict_pipeline).to_list(length=None)
        ]

        # Top 5 most queried targets
        top_targets_pipeline = base_match + [
            {"$group": {
                "_id": {"target": "$target", "type": "$type"},
                "count": {"$sum": 1},
                "last_verdict": {"$last": "$verdict"},
            }},
            {"$sort": {"count": -1}},
            {"$limit": 5},
        ]
        top_targets_result = [
            {
                "target": item["_id"]["target"],
                "type": item["_id"]["type"],
                "count": item["count"],
                "verdict": item["last_verdict"],
            }
            for item in await db.scans.aggregate(top_targets_pipeline).to_list(length=None)
        ]

        # Threat trends (daily totals over the selected period)
        trend_start = start_date if start_date else (now - timedelta(days=30))
        trends_pipeline = [
            {"$match": {"timestamp": {"$gte": trend_start}}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                "total": {"$sum": 1},
                "malicious": {
                    "$sum": {"$cond": [{"$in": ["$verdict", ["HIGH RISK", "CRITICAL"]]}, 1, 0]}
                },
            }},
            {"$sort": {"_id": 1}},
        ]
        threat_trends = [
            {"date": item["_id"], "total": item["total"], "malicious": item["malicious"]}
            for item in await db.scans.aggregate(trends_pipeline).to_list(length=None)
        ]

        # Top threat types from AlienVault/Pulsedive tags
        tags_pipeline = base_match + [
            {"$project": {
                "av_pulses": {"$ifNull": ["$data.results.alienvault.pulse_info.pulses", []]},
                "pd_tags": {"$ifNull": ["$data.results.pulsedive.tags", []]},
            }},
            {"$facet": {
                "alienvault": [
                    {"$unwind": {"path": "$av_pulses", "preserveNullAndEmptyArrays": False}},
                    {"$unwind": {"path": "$av_pulses.tags", "preserveNullAndEmptyArrays": False}},
                    {"$match": {"av_pulses.tags": {"$type": "string"}}},
                    {"$project": {"tag": {"$toLower": "$av_pulses.tags"}}},
                ],
                "pulsedive": [
                    {"$unwind": {"path": "$pd_tags", "preserveNullAndEmptyArrays": False}},
                    {"$match": {"pd_tags": {"$type": "string"}}},
                    {"$project": {"tag": {"$toLower": "$pd_tags"}}},
                ],
            }},
            {"$project": {"all_tags": {"$concatArrays": ["$alienvault", "$pulsedive"]}}},
            {"$unwind": "$all_tags"},
            {"$group": {"_id": "$all_tags.tag", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5},
        ]
        try:
            top_threat_types = [
                {"name": item["_id"], "value": item["count"]}
                for item in await db.scans.aggregate(tags_pipeline).to_list(length=None)
                if item["_id"] and isinstance(item["_id"], str)
            ]
        except Exception:
            top_threat_types = []

        # Recent scans (paginated via skip + limit)
        recent_scans = await (
            db.scans.find(base_query, {"_id": 0, "data": 0})
            .sort("timestamp", -1)
            .skip(skip)
            .limit(limit)
            .to_list(length=limit)
        )

        # Critical incidents feed
        critical_query = {"verdict": {"$in": ["HIGH RISK", "CRITICAL"]}}
        if "timestamp" in base_query:
            critical_query["timestamp"] = base_query["timestamp"]
        critical_incidents = await (
            db.scans.find(critical_query, {"_id": 0, "data": 0})
            .sort("timestamp", -1)
            .limit(10)
            .to_list(length=10)
        )

        # Worker health status
        worker_status = await db.system_status.find_one({"module": "worker"}, {"_id": 0})

        # Recon Engine stats
        recon_base_query = {}
        if start_date:
            recon_base_query = {"created_at": {"$gte": start_date}}

        recon_total = await db.recon_jobs.count_documents(recon_base_query)

        recent_recon_raw = await (
            db.recon_jobs.find(
                recon_base_query,
                {
                    "_id": 1,
                    "target": 1,
                    "target_type": 1,
                    "modules": 1,
                    "analyst": 1,
                    "status": 1,
                    "created_at": 1,
                    "completed_at": 1,
                },
            )
            .sort("created_at", -1)
            .limit(10)
            .to_list(10)
        )
        recent_recon_jobs = [
            {**{k: v for k, v in doc.items() if k != "_id"}, "job_id": str(doc["_id"])}
            for doc in recent_recon_raw
        ]

        # Unified artifact history (analyze + recon), paginated together
        # Correct pagination: fetch (skip + limit) from each collection, merge, sort, slice
        fetch_size = skip + limit
        artifacts_scans_raw = await (
            db.scans.find(
                base_query,
                {
                    "_id": 0,
                    "target": 1,
                    "type": 1,
                    "verdict": 1,
                    "risk_score": 1,
                    "analyst": 1,
                    "timestamp": 1,
                },
            )
            .sort("timestamp", -1)
            .limit(fetch_size)
            .to_list(length=fetch_size)
        )
        artifacts_recon_raw = await (
            db.recon_jobs.find(
                recon_base_query,
                {
                    "_id": 1,
                    "target": 1,
                    "target_type": 1,
                    "modules": 1,
                    "analyst": 1,
                    "status": 1,
                    "created_at": 1,
                },
            )
            .sort("created_at", -1)
            .limit(fetch_size)
            .to_list(length=fetch_size)
        )

        unified: list[dict] = []
        for doc in artifacts_scans_raw:
            unified.append({
                "kind": "analyze",
                "timestamp": doc.get("timestamp"),
                "target": doc.get("target"),
                "target_type": doc.get("type"),
                "verdict": doc.get("verdict"),
                "risk_score": doc.get("risk_score"),
                "analyst": doc.get("analyst"),
            })
        for doc in artifacts_recon_raw:
            unified.append({
                "kind": "recon",
                "timestamp": doc.get("created_at"),
                "target": doc.get("target"),
                "target_type": doc.get("target_type"),
                "status": doc.get("status"),
                "modules": doc.get("modules") or [],
                "analyst": doc.get("analyst"),
                "job_id": str(doc["_id"]),
            })

        _epoch_min = datetime.min.replace(tzinfo=timezone.utc)

        def _sort_key(item: dict):
            ts = item.get("timestamp")
            return ts if ts is not None else _epoch_min

        unified.sort(key=_sort_key, reverse=True)  # descending by timestamp, None last
        recent_artifacts = unified[skip:skip + limit]
        total_artifacts = total_scans + recon_total

        result = {
            "totalScans": total_scans,
            "verdictDistribution": verdict_result,
            "topTargets": top_targets_result,
            "threatTrends": threat_trends,
            "topThreatTypes": top_threat_types,
            "recentScans": recent_scans,
            "criticalIncidents": critical_incidents,
            "workerHealth": worker_status,
            "reconTotal": recon_total,
            "recentReconJobs": recent_recon_jobs,
            "recentArtifacts": recent_artifacts,
            "totalArtifacts": total_artifacts,
        }

        return jsonable_encoder(result, custom_encoder={ObjectId: str})

    except Exception as e:
        logger.error(f"Failed to aggregate stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal DB Aggregation Error")

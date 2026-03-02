from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Depends

from db import db_manager
from auth import require_role
from logging_config import get_logger

logger = get_logger("StatsRouter")

router = APIRouter(prefix="", tags=["stats"])


@router.get("/stats")
async def get_dashboard_stats(
    period: str = "month",
    limit: int = Query(20, ge=1, le=100, description="Max recent scans to return"),
    current_user: dict = Depends(require_role(["admin", "manager"])),
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
                "tags": {"$concatArrays": [
                    {"$ifNull": ["$data.results.alienvault.pulse_info.pulses.tags", []]},
                    {"$ifNull": ["$data.results.pulsedive.tags", []]},
                ]}
            }},
            {"$unwind": {"path": "$tags", "preserveNullAndEmptyArrays": False}},
            {"$match": {"tags": {"$type": "string"}}},
            {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5},
        ]
        try:
            top_threat_types = [
                {"name": item["_id"] if isinstance(item["_id"], str) else "Unknown", "value": item["count"]}
                for item in await db.scans.aggregate(tags_pipeline).to_list(length=None)
                if item["_id"]
            ]
        except Exception:
            top_threat_types = []

        if not top_threat_types:
            top_threat_types = [
                {"name": "malware", "value": 0},
                {"name": "phishing", "value": 0},
                {"name": "botnet", "value": 0},
                {"name": "c2-server", "value": 0},
            ]

        # Recent scans (paginated via limit param)
        recent_scans = await (
            db.scans.find(base_query, {"_id": 0, "data": 0})
            .sort("timestamp", -1)
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

        return {
            "totalScans": total_scans,
            "verdictDistribution": verdict_result,
            "topTargets": top_targets_result,
            "threatTrends": threat_trends,
            "topThreatTypes": top_threat_types,
            "recentScans": recent_scans,
            "criticalIncidents": critical_incidents,
            "workerHealth": worker_status,
        }

    except Exception as e:
        logger.error(f"Failed to aggregate stats: {e}")
        raise HTTPException(status_code=500, detail="Internal DB Aggregation Error")

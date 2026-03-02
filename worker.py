import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from db import db_manager
from api_client_async import AsyncThreatIntelClient
from analyzer import generate_heuristic_report, format_report_to_markdown

logger = logging.getLogger("Worker")


def _compute_verdict(clean_results: Dict[str, Any]) -> dict:
    """
    Compute a summary verdict from clean API results.
    Mirrors the risk-scoring logic in main.py so the worker stays consistent.
    """
    risk_score = 0
    total_sources = len(clean_results)

    for svc, data in clean_results.items():
        if not data or "error" in data or "_meta_error" in data:
            continue
        if svc == "virustotal":
            malicious = data.get("data", {}).get("attributes", {}).get("last_analysis_stats", {}).get("malicious", 0)
            if malicious >= 3:
                risk_score += 1
        elif svc == "abuseipdb":
            if data.get("data", {}).get("abuseConfidenceScore", 0) >= 25:
                risk_score += 1
        elif svc == "alienvault":
            if data.get("pulse_info", {}).get("count", 0) > 0:
                risk_score += 1
        elif svc == "urlscan":
            if data.get("data", {}).get("verdict", {}).get("score", 0) > 0:
                risk_score += 1
        elif svc == "greynoise":
            if data.get("classification") == "malicious":
                risk_score += 1
        elif svc == "blacklistmaster":
            if not isinstance(data, dict) or data.get("_meta_msg") != "No content returned":
                risk_score += 1
        elif svc == "abusech":
            if data.get("query_status") == "ok" and isinstance(data.get("data"), list) and len(data["data"]) > 0:
                risk_score += 1
        elif svc == "pulsedive":
            if data.get("risk") in ["high", "critical"]:
                risk_score += 1

    verdict = "HIGH RISK" if risk_score >= 2 else ("SUSPICIOUS" if risk_score == 1 else "SAFE")
    return {"verdict": verdict, "risk_sources": risk_score, "total_sources": total_sources}


async def scan_safe_targets_job():
    """
    Background job to re-scan old SAFE targets to detect if their threat posture changed over time.
    """
    logger.info("Starting scheduled background scan for SAFE targets")

    if not db_manager.db:
        logger.error("Worker cannot run: Database not connected")
        return

    db = db_manager.db

    # Query: find up to 100 targets with verdict SAFE created more than 24 hours ago.
    # Fields "verdict" and "timestamp" match what main.py stores in db.scans.
    twenty_four_hours_ago = datetime.now(timezone.utc) - timedelta(hours=24)
    query = {
        "verdict": "SAFE",
        "timestamp": {"$lt": twenty_four_hours_ago},
    }

    cursor = db.scans.find(query).sort("timestamp", 1).limit(100)
    old_targets = await cursor.to_list(length=100)

    if not old_targets:
        logger.info("No old SAFE targets found that require re-scanning.")
        return

    logger.info(f"Found {len(old_targets)} SAFE targets for re-scanning.")

    altered_targets_count = 0

    async with AsyncThreatIntelClient() as client:
        batch_size = 5

        for i in range(0, len(old_targets), batch_size):
            batch = old_targets[i:i + batch_size]
            tasks = [
                process_single_target(client, db, item["target"], item["type"], item["_id"])
                for item in batch
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            for res in results:
                if isinstance(res, bool) and res:
                    altered_targets_count += 1
                elif isinstance(res, Exception):
                    logger.error(f"Error during async batch processing: {res}")

            # Short pause between batches to respect rate limits
            await asyncio.sleep(2)

    # Record health metrics for the Dashboard
    try:
        await db.system_status.update_one(
            {"module": "worker"},
            {"$set": {
                "last_run": datetime.now(timezone.utc),
                "altered_targets": altered_targets_count,
                "status": "Healthy",
            }},
            upsert=True,
        )
    except Exception as e:
        logger.error(f"Failed to update worker system status: {e}")

    logger.info(
        f"Scheduled background scan completed. "
        f"{altered_targets_count} targets changed status from SAFE to HIGH RISK or SUSPICIOUS."
    )


async def process_single_target(
    client: AsyncThreatIntelClient,
    db,
    target: str,
    target_type: str,
    document_id,
) -> bool:
    """
    Re-scans a single target and updates db.scans. Returns True if the verdict worsened from SAFE.
    """
    try:
        logger.debug(f"Worker re-scanning target: {target}")

        # 1. Fetch fresh data from multiple APIs in parallel
        raw_results = await client.query_all(target, target_type)

        clean_results = {
            svc: resp.data
            for svc, resp in raw_results.items()
            if resp.success and resp.data is not None
        }

        # 2. Compute aggregated verdict
        summary = _compute_verdict(clean_results)
        verdict = summary["verdict"]

        # 3. Generate heuristic reports for all supported languages
        report_pt = generate_heuristic_report(target, target_type, summary, clean_results, lang="pt")
        report_en = generate_heuristic_report(target, target_type, summary, clean_results, lang="en")
        report_es = generate_heuristic_report(target, target_type, summary, clean_results, lang="es")

        # 4. Update the document in db.scans (same collection used by main.py)
        update_doc = {
            "results": clean_results,
            "verdict": verdict,
            "risk_score": summary["risk_sources"],
            "analysis_report": format_report_to_markdown(report_pt),
            "analysis_reports": {
                "pt": format_report_to_markdown(report_pt),
                "en": format_report_to_markdown(report_en),
                "es": format_report_to_markdown(report_es),
            },
            "updated_at": datetime.now(timezone.utc),
        }

        await db.scans.update_one(
            {"_id": document_id},
            {"$set": update_doc},
        )

        # 5. Notify if threat posture worsened
        if verdict in ["HIGH RISK", "SUSPICIOUS"]:
            logger.warning(f"ALERT: Target {target} changed status from SAFE to {verdict}!")
            return True

        return False

    except Exception as e:
        logger.error(f"Worker failed to process target {target}: {e}")
        return False

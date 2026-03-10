import logging
import asyncio
from datetime import datetime, timezone, timedelta

from db import db_manager
from clients.api_client_async import AsyncThreatIntelClient
from analyzer import generate_heuristic_report, format_report_to_markdown
from scoring import compute_risk_score, compute_verdict

logger = logging.getLogger("Worker")


async def scan_safe_targets_job():
    """
    Background job to re-scan old SAFE targets to detect if their threat posture changed over time.
    """
    logger.info("Starting scheduled background scan for SAFE targets")

    if db_manager.db is None:
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

    altered_targets_count = 0

    if not old_targets:
        logger.info("No old SAFE targets found that require re-scanning.")
    else:
        logger.info(f"Found {len(old_targets)} SAFE targets for re-scanning.")

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

    # Record health metrics for the Dashboard (always, even when no targets found)
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
        risk_score, total_sources = compute_risk_score(clean_results)
        verdict = compute_verdict(risk_score)
        summary = {"verdict": verdict, "risk_sources": risk_score, "total_sources": total_sources}

        # 3. Generate heuristic reports for all supported languages
        report_pt = generate_heuristic_report(target, target_type, summary, clean_results, lang="pt")
        report_en = generate_heuristic_report(target, target_type, summary, clean_results, lang="en")
        report_es = generate_heuristic_report(target, target_type, summary, clean_results, lang="es")

        # 4. Update the document in db.scans (same collection used by main.py)
        update_doc = {
            "results": clean_results,
            "verdict": verdict,
            "risk_score": risk_score,
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


# ── Watchlist re-scan ────────────────────────────────────────────────────────

async def run_watchlist_scan():
    """
    Re-scan all watchlist targets and update their last_verdict.
    If verdict changes, mark changed=True for email notification.
    """
    if db_manager.db is None:
        logger.error("Watchlist scan: Database not connected")
        return

    db = db_manager.db
    cursor = db.watchlist.find({})
    items = await cursor.to_list(length=1000)

    if not items:
        logger.info("Watchlist scan: no items to scan.")
        return

    logger.info(f"Watchlist scan: processing {len(items)} item(s)")

    # Group by user for email consolidation later
    changes_by_user: dict[str, list] = {}

    async with AsyncThreatIntelClient() as client:
        for item in items:
            target = item["target"]
            target_type = item.get("target_type", "ip")
            old_verdict = item.get("last_verdict")

            try:
                raw_results = await client.query_all(target, target_type)
                clean_results = {
                    svc: resp.data
                    for svc, resp in raw_results.items()
                    if resp.success and resp.data is not None
                }

                if not clean_results:
                    logger.debug(f"Watchlist: no results for {target}, skipping")
                    continue

                risk_score, _ = compute_risk_score(clean_results)
                new_verdict = compute_verdict(risk_score)

                now = datetime.now(timezone.utc)
                update_fields = {
                    "last_verdict": new_verdict,
                    "last_scan_at": now,
                }

                changed = old_verdict is not None and old_verdict != new_verdict
                if changed:
                    logger.info(f"Watchlist: {target} changed {old_verdict} → {new_verdict}")
                    user = item["user"]
                    if user not in changes_by_user:
                        changes_by_user[user] = []
                    changes_by_user[user].append({
                        "target": target,
                        "old_verdict": old_verdict,
                        "new_verdict": new_verdict,
                    })

                await db.watchlist.update_one(
                    {"_id": item["_id"]},
                    {"$set": update_fields},
                )

                # Throttle between targets
                await asyncio.sleep(0.5)

            except Exception as e:
                logger.error(f"Watchlist scan error for {target}: {e}")

    # Send email alerts for users with notify_on_change items
    if changes_by_user:
        from mailer import send_watchlist_alert

        for username, changed_items in changes_by_user.items():
            try:
                user_doc = await db.users.find_one({"username": username})
                if not user_doc or not user_doc.get("email"):
                    continue

                # Check that at least one changed target has notify_on_change
                changed_targets = {c["target"] for c in changed_items}
                notify_items = await db.watchlist.find({
                    "user": username,
                    "target": {"$in": list(changed_targets)},
                    "notify_on_change": True,
                }).to_list(length=100)
                notify_targets = {d["target"] for d in notify_items}

                filtered = [c for c in changed_items if c["target"] in notify_targets]
                if filtered:
                    await send_watchlist_alert(user_doc["email"], filtered)

            except Exception as e:
                logger.error(f"Watchlist alert email failed for {username}: {e}")

    logger.info(
        f"Watchlist scan complete. "
        f"{sum(len(v) for v in changes_by_user.values())} change(s) detected "
        f"across {len(changes_by_user)} user(s)."
    )


# ── Recon scheduled scan processor ─────────────────────────────────────────

async def run_scheduled_recon():
    """
    Check for pending scheduled recon scans that are due and execute them.
    """
    if db_manager.db is None:
        return

    db = db_manager.db
    now = datetime.now(timezone.utc)

    # Find pending scans whose run_at has passed
    cursor = db.recon_scheduled.find({
        "status": "pending",
        "run_at": {"$lte": now},
    }).limit(10)
    items = await cursor.to_list(length=10)

    if not items:
        return

    logger.info(f"Recon scheduler: {len(items)} scheduled scan(s) due")

    from routers.recon import _process_scan, _job_queues

    for item in items:
        try:
            # Mark as running
            await db.recon_scheduled.update_one(
                {"_id": item["_id"]},
                {"$set": {"status": "running"}},
            )

            # Create a recon job just like submit_scan does
            import uuid
            job_id = str(uuid.uuid4())
            job_doc = {
                "_id": job_id,
                "target": item["target"],
                "target_type": item["target_type"],
                "modules": item["modules"],
                "analyst": item["analyst"],
                "status": "pending",
                "results": {},
                "created_at": now,
                "completed_at": None,
                "scheduled_id": str(item["_id"]),
            }
            await db.recon_jobs.insert_one(job_doc)

            queue = asyncio.Queue()
            _job_queues[job_id] = queue

            asyncio.create_task(
                _process_scan(job_id, item["target"], item["target_type"],
                              item["modules"], item["analyst"], "", queue)
            )

            # Mark scheduled item as done
            await db.recon_scheduled.update_one(
                {"_id": item["_id"]},
                {"$set": {"status": "done", "job_id": job_id}},
            )

            logger.info(f"Recon scheduler: launched job {job_id} for scheduled scan {item['_id']}")

        except Exception as e:
            logger.error(f"Recon scheduler: failed to process {item['_id']}: {e}")
            await db.recon_scheduled.update_one(
                {"_id": item["_id"]},
                {"$set": {"status": "error", "error": str(e)}},
            )


async def start_recon_scheduler():
    """
    Long-running task that checks for due scheduled scans every 60 seconds.
    """
    logger.info("Recon scheduler started — checking every 60s")
    await asyncio.sleep(10)  # Initial delay
    while True:
        try:
            await run_scheduled_recon()
        except Exception as e:
            logger.error(f"Recon scheduler error: {e}")
        await asyncio.sleep(60)


async def start_watchlist_worker():
    """
    Long-running task that runs the watchlist scan once per day.
    """
    logger.info("Watchlist worker started — first scan in 60s, then every 24h")
    await asyncio.sleep(60)  # Initial delay to let the app fully start
    while True:
        try:
            await run_watchlist_scan()
        except Exception as e:
            logger.error(f"Watchlist worker error: {e}")
        await asyncio.sleep(86400)  # 24 hours

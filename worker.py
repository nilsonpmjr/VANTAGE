import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any

from db import db_manager
from api_client_async import AsyncThreatIntelClient
from validators import validate_target
from analyzer import generate_heuristic_report

logger = logging.getLogger("Worker")

async def scan_safe_targets_job():
    """
    Background job to re-scan old SAFE targets to detect if their threat posture changed over time.
    """
    logger.info("Starting scheduled background scan for SAFE targets")
    
    if not db_manager.db:
        logger.error("Worker cannot run: Database not connected")
        return

    db = db_manager.db
    
    # Query logic: Find up to 100 targets that:
    # 1. Have "SAFE" overall status
    # 2. Were created more than 24 hours ago
    
    twenty_four_hours_ago = datetime.now(timezone.utc) - timedelta(hours=24)
    query = {
        "status": "safe",
        "created_at": {"$lt": twenty_four_hours_ago}
    }
    
    # Sort by oldest first to prioritize older targets
    cursor = db.analyses.find(query).sort("created_at", 1).limit(100)
    old_targets = await cursor.to_list(length=100)
    
    if not old_targets:
        logger.info("No old SAFE targets found that require re-scanning.")
        return
        
    logger.info(f"Found {len(old_targets)} SAFE targets for re-scanning.")
    
    altered_targets_count = 0
    
    async with AsyncThreatIntelClient() as client:
        # Process targets concurrently in small batches to respect rate limits
        batch_size = 5
        
        for i in range(0, len(old_targets), batch_size):
            batch = old_targets[i:i + batch_size]
            tasks = []
            
            for item in batch:
                target = item["target"]
                target_type = item["type"]
                tasks.append(process_single_target(client, db, target, target_type, item["_id"]))
                
            # Run batch concurrently
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for res in results:
                if isinstance(res, bool) and res:
                    altered_targets_count += 1
                elif isinstance(res, Exception):
                    logger.error(f"Error during async batch processing: {res}")
            
            # Short sleep between batches to preserve rate limiting
            await asyncio.sleep(2)
            
    logger.info(f"Scheduled background scan completed. {altered_targets_count} targets changed status to HIGH RISK or CRITICAL.")


async def process_single_target(client: AsyncThreatIntelClient, db, target: str, target_type: str, document_id) -> bool:
    """
    Re-scans a single target and updates MongoDB. Returns True if the status changed from SAFE.
    """
    try:
        logger.debug(f"Worker re-scanning target: {target}")
        
        # 1. Fetch fresh data from multiple APIs
        raw_results = await client.query_all(target, target_type)
        
        clean_results = {}
        for svc, resp in raw_results.items():
            if resp.success and resp.data is not None:
                clean_results[svc] = resp.data
                
        # 2. Analyze results heuristically
        analysis_report, overall_status, reports = generate_heuristic_report(target, target_type, clean_results)
        
        # 3. Update database
        now = datetime.now(timezone.utc)
        update_doc = {
            "results": clean_results,
            "status": overall_status.lower(),
            "analysis_report": analysis_report,
            "analysis_reports": reports,
            "updated_at": now
        }
        
        await db.analyses.update_one(
            {"_id": document_id},
            {"$set": update_doc}
        )
        
        # 4. Check if status has worsened
        if overall_status.lower() in ['high risk', 'critical']:
            logger.warning(f"ALERT: Target {target} changed status from SAFE to {overall_status.upper()}!")
            return True
            
        return False
        
    except Exception as e:
        logger.error(f"Worker failed to process target {target}: {e}")
        return False

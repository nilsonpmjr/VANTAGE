from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from db import db_manager
from config import settings
from logging_config import setup_logging, get_logger
from limiters import limiter
from extensions import load_extensions_registry
from operational_status import set_scheduler_runtime_provider
from threat_ingestion_runtime import start_threat_ingestion_worker
from worker import scan_safe_targets_job, start_watchlist_worker, start_recon_scheduler

from routers import auth, users, analyze, stats, admin, mfa, sessions, api_keys, batch, recon, watchlist, feed, hunting, exposure

logger = get_logger("WebAPI")
setup_logging(level=settings.log_level)

scheduler = AsyncIOScheduler()
set_scheduler_runtime_provider(
    lambda: {
        "running": bool(getattr(scheduler, "running", False)),
        "scheduled_jobs": len(scheduler.get_jobs()) if hasattr(scheduler, "get_jobs") else 0,
    }
)
API_CANONICAL_PREFIX = "/api"
API_LEGACY_PREFIX = "/api/v1"
API_V1_SUNSET = "Wed, 30 Sep 2026 00:00:00 GMT"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await db_manager.connect_db()

    # Create MongoDB indexes for query performance
    if db_manager.db is not None:
        db = db_manager.db
        try:
            await db.scans.create_index([("timestamp", -1)])
            await db.scans.create_index([("verdict", 1)])
            await db.scans.create_index([("analyst", 1), ("timestamp", -1)])
            await db.scans.create_index([("target", 1), ("timestamp", -1)])
            await db.users.create_index(
                [("normalized_email", 1)],
                unique=True,
                sparse=True,
                name="users_normalized_email_unique",
            )
            # TTL index to auto-purge expired refresh tokens (7d + 1h grace)
            await db.refresh_tokens.create_index(
                [("expires_at", 1)],
                expireAfterSeconds=3600,
            )
            await db.refresh_tokens.create_index(
                [("token_hash", 1)],
                unique=True,
                sparse=True,
                name="refresh_tokens_token_hash",
            )
            # Audit log indexes for query performance
            await db.audit_log.create_index([("timestamp", -1)])
            await db.audit_log.create_index([("user", 1), ("timestamp", -1)])
            await db.audit_log.create_index([("action", 1)])
            # TTL: auto-delete audit entries older than 90 days
            await db.audit_log.create_index(
                [("timestamp", 1)],
                expireAfterSeconds=90 * 24 * 3600,
                name="audit_log_ttl",
            )
            # TTL: auto-expire password reset tokens (MongoDB removes at expires_at)
            await db.password_reset_tokens.create_index(
                [("expires_at", 1)],
                expireAfterSeconds=0,
                name="reset_tokens_ttl",
            )
            await db.password_reset_tokens.create_index(
                [("username", 1)],
                name="reset_tokens_username",
            )
            # TTL: auto-expire completed batch jobs
            await db.batch_jobs.create_index(
                [("created_at", 1)],
                expireAfterSeconds=settings.batch_job_ttl_hours * 3600,
                name="batch_jobs_ttl",
            )
            await db.batch_jobs.create_index(
                [("analyst", 1), ("created_at", -1)],
                name="batch_jobs_analyst",
            )
            # Recon Engine indexes
            await db.recon_jobs.create_index(
                [("created_at", 1)],
                expireAfterSeconds=24 * 3600,
                name="recon_jobs_ttl",
            )
            await db.recon_jobs.create_index(
                [("analyst", 1), ("created_at", -1)],
                name="recon_jobs_analyst",
            )
            await db.recon_jobs.create_index(
                [("target", 1), ("created_at", -1)],
                name="recon_jobs_target",
            )
            await db.recon_results.create_index(
                [("scanned_at", 1)],
                expireAfterSeconds=settings.recon_cache_ttl_hours * 3600,
                name="recon_results_ttl",
            )
            await db.recon_results.create_index(
                [("cache_key", 1)],
                unique=True,
                name="recon_results_cache_key",
            )
            # Recon scheduled scans indexes
            await db.recon_scheduled.create_index(
                [("run_at", 1)],
                name="recon_scheduled_run_at",
            )
            await db.recon_scheduled.create_index(
                [("analyst", 1), ("status", 1)],
                name="recon_scheduled_analyst_status",
            )
            await db.recon_scheduled.create_index(
                [("created_at", 1)],
                expireAfterSeconds=8 * 24 * 3600,
                name="recon_scheduled_ttl",
            )
            # Watchlist indexes
            await db.watchlist.create_index(
                [("user", 1), ("target", 1)],
                unique=True,
                name="watchlist_user_target",
            )
            await db.watchlist.create_index(
                [("user", 1), ("created_at", -1)],
                name="watchlist_user_created",
            )
            await db.watchlist_history.create_index(
                [("user", 1), ("watchlist_item_id", 1), ("scanned_at", -1)],
                name="watchlist_history_user_item_scanned",
            )
            await db.threat_items.create_index(
                [("source_id", 1), ("external_id", 1)],
                unique=True,
                name="threat_items_source_external_id",
            )
            await db.threat_items.create_index(
                [("published_at", -1)],
                name="threat_items_published_at",
            )
            await db.threat_sync_status.create_index(
                [("source_id", 1)],
                unique=True,
                name="threat_sync_status_source_id",
            )
            await db.threat_sync_history.create_index(
                [("source_id", 1), ("recorded_at", -1)],
                name="threat_sync_history_source_recorded",
            )
            await db.operational_status_history.create_index(
                [("recorded_at", -1)],
                name="operational_status_history_recorded",
            )
            await db.extension_catalog_state.create_index(
                [("key", 1)],
                unique=True,
                name="extension_catalog_state_key",
            )
            await db.exposure_monitored_assets.create_index(
                [("customer_key", 1), ("asset_type", 1), ("value", 1)],
                unique=True,
                name="exposure_monitored_assets_customer_asset",
            )
            await db.exposure_monitored_assets.create_index(
                [("customer_key", 1), ("recurrence.mode", 1), ("is_active", 1)],
                name="exposure_monitored_assets_customer_recurrence",
            )
            await db.exposure_asset_groups.create_index(
                [("customer_key", 1), ("name", 1)],
                name="exposure_asset_groups_customer_name",
            )
            await db.exposure_findings.create_index(
                [("customer_key", 1), ("monitored_asset_id", 1), ("timestamp", -1)],
                name="exposure_findings_customer_asset_timestamp",
            )
            await db.exposure_findings.create_index(
                [("customer_key", 1), ("severity", 1), ("timestamp", -1)],
                name="exposure_findings_customer_severity_timestamp",
            )
            await db.exposure_incidents.create_index(
                [("customer_key", 1), ("status", 1), ("updated_at", -1)],
                name="exposure_incidents_customer_status_updated",
            )
            await db.hunting_results.create_index(
                [("analyst", 1), ("timestamp", -1)],
                name="hunting_results_analyst_timestamp",
            )
            await db.hunting_results.create_index(
                [("search_id", 1)],
                name="hunting_results_search_id",
            )
            await db.hunting_saved_searches.create_index(
                [("analyst", 1), ("created_at", -1)],
                name="hunting_saved_searches_analyst_created",
            )
            await db.hunting_case_notes.create_index(
                [("analyst", 1), ("search_id", 1), ("created_at", -1)],
                name="hunting_case_notes_analyst_search_created",
            )
            # Service quota indexes (daily API call tracking)
            await db.service_quota.create_index(
                [("service", 1), ("date", 1), ("user", 1)],
                unique=True,
                name="service_quota_unique",
            )
            await db.service_quota.create_index(
                [("created_at", 1)],
                expireAfterSeconds=2 * 24 * 3600,
                name="service_quota_ttl",
            )
            logger.info("MongoDB indexes created/verified.")

            # Clean up legacy refresh_tokens without session_id (created before session tracking)
            result = await db.refresh_tokens.delete_many({"session_id": {"$exists": False}})
            if result.deleted_count:
                logger.info(f"Cleaned up {result.deleted_count} legacy refresh token(s) without session_id.")
        except Exception as e:
            logger.warning(f"Could not create indexes: {e}")

    # Validate secrets before accepting traffic
    settings.validate_production()
    app.state.extensions_registry = load_extensions_registry(current_core_version=settings.core_version)
    logger.info("Extensions registry loaded.")

    scheduler.add_job(
        scan_safe_targets_job,
        trigger="interval",
        hours=24,
        id="scan_safe_targets_daily",
        next_run_time=datetime.now(timezone.utc),
    )
    scheduler.start()
    logger.info("Background Worker (APScheduler) started.")

    # Start background workers
    import asyncio as _aio
    _aio.create_task(start_watchlist_worker())
    logger.info("Watchlist worker task created.")
    _aio.create_task(start_recon_scheduler())
    logger.info("Recon scheduler task created.")
    _aio.create_task(start_threat_ingestion_worker())
    logger.info("Threat ingestion worker task created.")

    yield

    # Shutdown
    scheduler.shutdown()
    await db_manager.close_db()


app = FastAPI(
    title=f"{settings.app_name} API",
    description=f"{settings.app_name} — Threat intelligence platform for SOC analysts.",
    version=settings.core_version,
    lifespan=lifespan,
)

# Rate limiter state + exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# GZip responses ≥ 1 KB
app.add_middleware(GZipMiddleware, minimum_size=1000)


# Security headers (OWASP recommendations)
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if settings.environment == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# Content-size guard: reject bodies > 1 MB before they reach business logic
@app.middleware("http")
async def content_size_limit(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > 1_000_000:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request body too large (max 1MB)"},
                )
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={"detail": "Invalid Content-Length header"},
            )
    return await call_next(request)


@app.middleware("http")
async def api_v1_deprecation_notice(request: Request, call_next):
    response = await call_next(request)

    path = request.url.path
    if path == API_LEGACY_PREFIX or path.startswith(f"{API_LEGACY_PREFIX}/"):
        successor_path = path.removeprefix(API_LEGACY_PREFIX) or ""
        response.headers["Deprecation"] = "true"
        response.headers["Sunset"] = API_V1_SUNSET
        response.headers["Link"] = f'<{API_CANONICAL_PREFIX}{successor_path}>; rel="successor-version"'
        response.headers["Warning"] = '299 - "/api/v1 is deprecated; use /api"'

    return response


# CORS — restrict to known origins; never use "*" in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── Register routers ────────────────────────────────────────────────────────
_routers = [
    auth.router, users.router, analyze.router, stats.router,
    admin.router, mfa.router, sessions.router, api_keys.router,
    batch.router, recon.router, watchlist.router, feed.router, hunting.router, exposure.router,
]
for _prefix in ("/api", "/api/v1"):
    for _router in _routers:
        app.include_router(_router, prefix=_prefix)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

from contextlib import asynccontextmanager

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
from worker import scan_safe_targets_job

from routers import auth, users, analyze, stats, admin, mfa

logger = get_logger("WebAPI")
setup_logging(level=settings.log_level)

scheduler = AsyncIOScheduler()


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
            # TTL index to auto-purge expired refresh tokens (7d + 1h grace)
            await db.refresh_tokens.create_index(
                [("expires_at", 1)],
                expireAfterSeconds=3600,
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
            logger.info("MongoDB indexes created/verified.")
        except Exception as e:
            logger.warning(f"Could not create indexes: {e}")

    # Validate secrets before accepting traffic
    settings.validate_production()

    scheduler.add_job(
        scan_safe_targets_job,
        trigger="interval",
        hours=24,
        id="scan_safe_targets_daily",
    )
    scheduler.start()
    logger.info("Background Worker (APScheduler) started.")

    yield

    # Shutdown
    scheduler.shutdown()
    await db_manager.close_db()


app = FastAPI(
    title="Threat Intelligence API",
    description="API for scanning IPs, Domains, and Hashes against multiple Threat Intel sources.",
    version="1.0.0",
    lifespan=lifespan,
)

# Rate limiter state + exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# GZip responses ≥ 1 KB
app.add_middleware(GZipMiddleware, minimum_size=1000)


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

# CORS — restrict to known origins; never use "*" in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── Register routers ────────────────────────────────────────────────────────
# /api  (backward compat)
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(analyze.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(mfa.router, prefix="/api")

# /api/v1  (versioned)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(analyze.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(mfa.router, prefix="/api/v1")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

"""
Premium hunting router — thin adapter.

Mounts the Hunting extension router (from the `hunting` package in ExtensionsVantage)
by passing VANTAGE core dependencies (auth, audit, db, limiter) via factory injection.

The extension package must be installed in the venv:
    pip install -e <path>/ExtensionsVantage/Hunting/

Environment variables for remote orchestrator delegation:
    OSINT_ORCHESTRATOR_URL  — when set, searches are delegated to the remote orchestrator
    OSINT_API_KEY           — Bearer token for service-to-service auth
"""

from __future__ import annotations

from hunting.router import create_hunting_router

from audit import log_action
from auth import get_current_user
from db import db_manager
from limiters import limiter

router = create_hunting_router(
    get_current_user=get_current_user,
    log_action=log_action,
    get_db=lambda: db_manager.db,
    limiter=limiter,
)

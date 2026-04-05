"""
Thin adapter: wires the Exposure extension into the VANTAGE core.

A implementação completa está em ExtensionsVantage/Exposure/exposure/router.py
"""

from exposure.router import create_exposure_router
from audit import log_action
from auth import get_current_user
from db import db_manager
from limiters import limiter

router = create_exposure_router(
    get_current_user=get_current_user,
    log_action=log_action,
    get_db=lambda: db_manager.db,
    limiter=limiter,
)

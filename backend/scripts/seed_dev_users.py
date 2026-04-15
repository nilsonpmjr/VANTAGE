"""
Development-only user seed.

Creates default admin and tech users for local development environments.
NEVER run this in production — the application will refuse to boot if
DEV_SEED_USERS=true and ENV=production (enforced in config.validate_production).
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger("DevSeed")


async def seed_dev_users(db, admin_password: str, tech_password: str = "") -> None:
    """Seed development users into the database.

    Only called when DEV_SEED_USERS=true and ENV=development.
    Skips creation if a user with the same username already exists.
    """
    from auth import get_password_hash  # local import to avoid circular deps

    logger.warning(
        "[DEV SEED] ATTENTION: Creating development users. "
        "NEVER set DEV_SEED_USERS=true in production."
    )

    if not await db.users.find_one({"username": "admin"}):
        await db.users.insert_one({
            "username": "admin",
            "password_hash": get_password_hash(admin_password),
            "role": "admin",
            "name": "Dev Admin",
            "email": "admin@dev.local",
            "preferred_lang": "pt",
            "is_active": True,
            "failed_login_count": 0,
            "locked_until": None,
            "last_failed_at": None,
            "password_history": [],
            "password_changed_at": None,
            "force_password_reset": False,
            "last_login_at": None,
            "mfa_enabled": False,
            "mfa_secret_enc": None,
            "mfa_backup_codes": [],
            "extra_permissions": [],
            "created_at": datetime.now(timezone.utc),
        })
        logger.warning("[DEV SEED] Admin user created: admin / (password from DEV_ADMIN_PASSWORD)")

    if tech_password and not await db.users.find_one({"username": "tech"}):
        await db.users.insert_one({
            "username": "tech",
            "password_hash": get_password_hash(tech_password),
            "role": "tech",
            "name": "Dev Tech",
            "email": "tech@dev.local",
            "preferred_lang": "pt",
            "is_active": True,
            "failed_login_count": 0,
            "locked_until": None,
            "last_failed_at": None,
            "password_history": [],
            "password_changed_at": None,
            "force_password_reset": False,
            "last_login_at": None,
            "mfa_enabled": False,
            "mfa_secret_enc": None,
            "mfa_backup_codes": [],
            "extra_permissions": [],
            "created_at": datetime.now(timezone.utc),
        })
        logger.warning("[DEV SEED] Tech user created: tech / (password from DEV_TECH_PASSWORD)")

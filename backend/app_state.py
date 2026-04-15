"""
Application initialization state.

Tracks whether the system has been initialized (i.e., at least one admin user
exists in the database). The flag is set during lifespan startup and updated
by the setup:create-admin CLI command after a successful admin creation.
"""

import logging

logger = logging.getLogger("AppState")

# Global flag — False until check_initialization() confirms an admin exists.
APP_INITIALIZED: bool = False


async def check_initialization(db) -> bool:
    """Check whether the system has been initialized.

    Queries the database for the presence of at least one user with role 'admin'.
    Updates the global APP_INITIALIZED flag and returns its value.

    Should be called once during lifespan startup, after indexes are created.
    """
    global APP_INITIALIZED
    admin_count = await db.users.count_documents({"role": "admin"})
    APP_INITIALIZED = admin_count > 0

    if not APP_INITIALIZED:
        logger.warning(
            "[SETUP] System not initialized — no admin user found. "
            "Run the following command to create the first administrator:\n\n"
            "    docker compose exec backend python bin/console setup:create-admin\n"
        )
    else:
        logger.info("[SETUP] System initialized — admin user found.")

    return APP_INITIALIZED

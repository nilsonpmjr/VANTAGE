import asyncio
import os
import sys
from datetime import datetime, timezone
import logging

# Allow running as standalone script from any directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from auth import get_password_hash
from db import db_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DB_Seeder")


async def seed_admin_user():
    await db_manager.connect_db()
    db = db_manager.db

    if db is None:
        logger.error("Failed to connect to database.")
        return

    admin_exists = await db.users.find_one({"username": "admin"})

    if not admin_exists:
        logger.info("Initializing default Admin user...")
        admin_doc = {
            "username": "admin",
            "password_hash": get_password_hash("iteam123"),
            "role": "admin",
            "name": "Administrador SOC",
            "preferred_lang": "pt",
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(admin_doc)
        logger.info("Default Admin user created successfully. [admin / iteam123]")

        # Test: create a standard tech user
        tech_doc = {
            "username": "tech",
            "password_hash": get_password_hash("tech123"),
            "role": "tech",
            "name": "Analista Jr.",
            "preferred_lang": "pt",
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(tech_doc)
        logger.info("Default Tech user created successfully. [tech / tech123]")
    else:
        logger.info("Admin user already exists. Skipping seed.")

    await db_manager.close_db()

if __name__ == "__main__":
    asyncio.run(seed_admin_user())

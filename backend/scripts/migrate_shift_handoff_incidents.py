import asyncio
import logging
import os
import sys

CURRENT_DIR = os.path.dirname(__file__)
BACKEND_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from db import db_manager  # noqa: E402
from shift_handoff_migration import migrate_shift_handoff_incidents  # noqa: E402


async def main():
    logging.basicConfig(level=logging.INFO)
    await db_manager.connect_db()
    try:
        if db_manager.db is None:
            raise RuntimeError("database_not_available")
        result = await migrate_shift_handoff_incidents(db_manager.db)
        print(result)
    finally:
        await db_manager.close_db()


if __name__ == "__main__":
    asyncio.run(main())

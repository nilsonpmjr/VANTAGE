import re
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

logger = logging.getLogger(__name__)


def _mask_uri(uri: str) -> str:
    """Redact password from a MongoDB URI for safe logging."""
    return re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", uri)


class DatabaseManager:
    client: AsyncIOMotorClient = None
    db = None

    @classmethod
    async def connect_db(cls):
        """Create database connection."""
        mongo_url = settings.mongo_uri
        logger.info(f"Connecting to MongoDB at {_mask_uri(mongo_url)}")
        try:
            cls.client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
            cls.db = cls.client[settings.mongo_db_name]

            # Verify connection
            await cls.client.server_info()
            logger.info("Successfully connected to MongoDB.")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            cls.client = None
            cls.db = None

    @classmethod
    async def close_db(cls):
        """Close database connection."""
        if cls.client:
            logger.info("Closing MongoDB connection.")
            cls.client.close()


db_manager = DatabaseManager()


async def get_db():
    return db_manager.db

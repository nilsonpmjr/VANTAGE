"""
Shared pytest fixtures for backend tests.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone, timedelta

from main import app
from auth import get_password_hash, create_access_token


# ── In-memory test "database" ────────────────────────────────────────────────

class FakeCollection:
    """Minimal async collection shim for tests."""

    def __init__(self, data=None):
        self._data = list(data or [])

    async def find_one(self, query, *args, **kwargs):
        for doc in self._data:
            if all(doc.get(k) == v for k, v in query.items() if not isinstance(v, dict)):
                return doc
        return None

    async def insert_one(self, doc):
        self._data.append(doc)

    async def update_one(self, query, update):
        for doc in self._data:
            if all(doc.get(k) == v for k, v in query.items()):
                for op, fields in update.items():
                    if op == "$set":
                        doc.update(fields)
                return


class FakeDB:
    def __init__(self):
        self.users = FakeCollection([
            {
                "username": "admin",
                "password_hash": get_password_hash("admin123"),
                "role": "admin",
                "name": "Admin User",
                "preferred_lang": "pt",
                "is_active": True,
            },
            {
                "username": "inactive",
                "password_hash": get_password_hash("pass"),
                "role": "tech",
                "name": "Inactive",
                "preferred_lang": "pt",
                "is_active": False,
            },
        ])
        self.scans = FakeCollection()
        self.refresh_tokens = FakeCollection()
        self.system_status = FakeCollection()

    async def create_index(self, *args, **kwargs):
        pass


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def fake_db():
    return FakeDB()


@pytest_asyncio.fixture
async def async_client(fake_db, monkeypatch):
    """AsyncClient bound to the FastAPI app with a fake database."""
    from db import db_manager
    monkeypatch.setattr(db_manager, "db", fake_db)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


@pytest.fixture
def admin_token():
    return create_access_token({"sub": "admin", "role": "admin"})


@pytest.fixture
def tech_token():
    return create_access_token({"sub": "admin", "role": "tech"})


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

"""
Shared pytest fixtures for backend tests.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from main import app
from auth import get_password_hash, create_access_token


# ── In-memory test "database" ────────────────────────────────────────────────

class _DeleteResult:
    def __init__(self, deleted_count):
        self.deleted_count = deleted_count


class FakeCursor:
    """Minimal async cursor shim that supports sort/skip/limit chaining."""

    def __init__(self, data):
        self._data = list(data)

    def sort(self, *args, **kwargs):
        return self

    def limit(self, n):
        self._data = self._data[:n]
        return self

    def skip(self, n):
        self._data = self._data[n:]
        return self

    async def to_list(self, length=None):
        if length is not None:
            return self._data[:length]
        return self._data


class FakeCollection:
    """Minimal async collection shim for tests."""

    def __init__(self, data=None):
        self._data = list(data or [])

    async def find_one(self, query, *args, **kwargs):
        for doc in self._data:
            if all(doc.get(k) == v for k, v in query.items() if not isinstance(v, dict)):
                return doc
        return None

    def find(self, query=None, projection=None):
        if not query:
            return FakeCursor(list(self._data))
        results = []
        for doc in self._data:
            match = True
            for k, v in query.items():
                if isinstance(v, dict):
                    doc_val = doc.get(k)
                    if doc_val is None:
                        match = False; break
                    if "$gte" in v and doc_val < v["$gte"]:
                        match = False; break
                    if "$gt" in v and doc_val <= v["$gt"]:
                        match = False; break
                    if "$lte" in v and doc_val > v["$lte"]:
                        match = False; break
                    if "$lt" in v and doc_val >= v["$lt"]:
                        match = False; break
                else:
                    if doc.get(k) != v:
                        match = False; break
            if match:
                results.append(doc)
        return FakeCursor(results)

    def aggregate(self, pipeline):
        return FakeCursor([])

    async def insert_one(self, doc):
        self._data.append(doc)

    async def replace_one(self, query, replacement, upsert=False):
        for i, doc in enumerate(self._data):
            if all(doc.get(k) == v for k, v in query.items()):
                self._data[i] = replacement
                return
        if upsert:
            self._data.append(replacement)

    async def update_one(self, query, update, upsert=False):
        for doc in self._data:
            if all(doc.get(k) == v for k, v in query.items()):
                for op, fields in update.items():
                    if op == "$set":
                        doc.update(fields)
                return
        if upsert:
            new_doc = dict(query)
            for op, fields in update.items():
                if op == "$set":
                    new_doc.update(fields)
            self._data.append(new_doc)

    async def delete_one(self, query):
        for i, doc in enumerate(self._data):
            if all(doc.get(k) == v for k, v in query.items()):
                self._data.pop(i)
                return _DeleteResult(deleted_count=1)
        return _DeleteResult(deleted_count=0)

    async def count_documents(self, query):
        count = 0
        for doc in self._data:
            match = True
            for k, v in query.items():
                if isinstance(v, dict):
                    doc_val = doc.get(k)
                    if doc_val is None:
                        match = False
                        break
                    if "$gte" in v and doc_val < v["$gte"]:
                        match = False
                        break
                    if "$gt" in v and doc_val <= v["$gt"]:
                        match = False
                        break
                    if "$lte" in v and doc_val > v["$lte"]:
                        match = False
                        break
                    if "$lt" in v and doc_val >= v["$lt"]:
                        match = False
                        break
                else:
                    if doc.get(k) != v:
                        match = False
                        break
            if match:
                count += 1
        return count

    async def distinct(self, field, query=None):
        values = []
        for doc in self.find(query)._data:
            value = doc.get(field)
            if value not in values:
                values.append(value)
        return values


class FakeDB:
    def __init__(self):
        self.users = FakeCollection([
            {
                "username": "admin",
                "password_hash": get_password_hash("admin123"),
                "role": "admin",
                "name": "Admin User",
                "email": "admin@soc.local",
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
            },
            {
                "username": "inactive",
                "password_hash": get_password_hash("pass"),
                "role": "tech",
                "name": "Inactive",
                "email": None,
                "preferred_lang": "pt",
                "is_active": False,
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
            },
            {
                "username": "techuser",
                "password_hash": get_password_hash("tech123"),
                "role": "tech",
                "name": "Tech User",
                "email": "tech@soc.local",
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
            },
        ])
        self.scans = FakeCollection()
        self.refresh_tokens = FakeCollection()
        self.system_status = FakeCollection()
        self.lockout_policy = FakeCollection()
        self.password_policy = FakeCollection()
        self.audit_log = FakeCollection()
        self.api_keys = FakeCollection()
        self.sessions = FakeCollection()
        self.password_reset_tokens = FakeCollection()
        self.recon_jobs = FakeCollection()
        self.recon_scheduled = FakeCollection()
        self.recon_results = FakeCollection()
        self.batch_jobs = FakeCollection()
        self.watchlist = FakeCollection()
        self.service_quota = FakeCollection()

    async def create_index(self, *args, **kwargs):
        pass


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def fake_db():
    return FakeDB()


@pytest.fixture(autouse=True)
def disable_rate_limiter(monkeypatch):
    """Disable slowapi rate limiting during tests to prevent cross-test interference."""
    from limiters import limiter
    monkeypatch.setattr(limiter, 'enabled', False)


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

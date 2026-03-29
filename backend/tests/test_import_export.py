"""Tests for POST /api/admin/users/import and GET /api/admin/users/export."""

import io
import json
import pytest

from auth import create_access_token


# ── Helpers ───────────────────────────────────────────────────────────────────

def _csv(rows: list[str], header: str = "username,name,role,email,preferred_lang") -> bytes:
    lines = [header] + rows
    return "\n".join(lines).encode("utf-8")


@pytest.fixture
def admin_headers():
    token = create_access_token({"sub": "admin", "role": "admin"})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def tech_headers():
    token = create_access_token({"sub": "techuser", "role": "tech"})
    return {"Authorization": f"Bearer {token}"}


# ── Tests — Export ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_export_csv_returns_csv(async_client, admin_headers):
    resp = await async_client.get("/api/admin/users/export?format=csv", headers=admin_headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    text = resp.content.decode("utf-8-sig")
    assert "username" in text
    assert "admin" in text


@pytest.mark.asyncio
async def test_export_json_returns_json(async_client, admin_headers):
    resp = await async_client.get("/api/admin/users/export?format=json", headers=admin_headers)
    assert resp.status_code == 200
    assert "application/json" in resp.headers["content-type"]
    data = json.loads(resp.content)
    assert isinstance(data, list)
    assert any(u["username"] == "admin" for u in data)


@pytest.mark.asyncio
async def test_export_omits_sensitive_fields(async_client, admin_headers):
    resp = await async_client.get("/api/admin/users/export?format=json", headers=admin_headers)
    data = json.loads(resp.content)
    for u in data:
        assert "password_hash" not in u
        assert "mfa_secret_enc" not in u
        assert "mfa_backup_codes" not in u
        assert "password_history" not in u


@pytest.mark.asyncio
async def test_export_tech_forbidden(async_client, tech_headers):
    resp = await async_client.get("/api/admin/users/export", headers=tech_headers)
    assert resp.status_code == 403


# ── Tests — Import ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_import_creates_users(async_client, admin_headers):
    csv_data = _csv(["newuser1,New User One,tech,new1@test.com,pt"])
    resp = await async_client.post(
        "/api/admin/users/import",
        headers=admin_headers,
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 1
    assert body["skipped"] == 0
    assert body["errors"] == []
    assert len(body["temporary_credentials"]) == 1
    assert body["temporary_credentials"][0]["username"] == "newuser1"
    assert body["temporary_credentials"][0]["email"] == "new1@test.com"
    assert body["temporary_credentials"][0]["temporary_password"]


@pytest.mark.asyncio
async def test_import_skips_existing_username(async_client, admin_headers):
    csv_data = _csv(["admin,Admin Duplicate,admin,,pt"])
    resp = await async_client.post(
        "/api/admin/users/import",
        headers=admin_headers,
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 0
    assert body["skipped"] == 1


@pytest.mark.asyncio
async def test_import_rejects_invalid_role(async_client, admin_headers):
    csv_data = _csv(["baduser,Bad User,superadmin,,pt"])
    resp = await async_client.post(
        "/api/admin/users/import",
        headers=admin_headers,
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 0
    assert len(body["errors"]) == 1
    assert "invalid_role" in body["errors"][0]["reason"]


@pytest.mark.asyncio
async def test_import_rejects_invalid_email(async_client, admin_headers):
    csv_data = _csv(["emailuser,Email User,tech,not-an-email,pt"])
    resp = await async_client.post(
        "/api/admin/users/import",
        headers=admin_headers,
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 0
    assert body["errors"][0]["reason"] == "invalid_email"


@pytest.mark.asyncio
async def test_import_missing_username_is_error(async_client, admin_headers):
    csv_data = _csv([",No Username,tech,,pt"])
    resp = await async_client.post(
        "/api/admin/users/import",
        headers=admin_headers,
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["errors"][0]["reason"] == "missing_username"


@pytest.mark.asyncio
async def test_import_force_password_reset_set(async_client, fake_db, admin_headers, monkeypatch):
    from db import db_manager
    monkeypatch.setattr(db_manager, "db", fake_db)
    csv_data = _csv(["fpruser,FPR User,tech,,pt"])
    await async_client.post(
        "/api/admin/users/import",
        headers=admin_headers,
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
    )
    doc = await fake_db.users.find_one({"username": "fpruser"})
    assert doc is not None
    assert doc["force_password_reset"] is True
    assert "temporary_password" not in doc


@pytest.mark.asyncio
async def test_import_returns_passwords_matching_policy(async_client, fake_db, admin_headers):
    await fake_db.password_policy.update_one(
        {"_id": "singleton"},
        {"$set": {
            "_id": "singleton",
            "min_length": 14,
            "require_uppercase": True,
            "require_numbers": True,
            "require_symbols": True,
            "history_count": 5,
            "expiry_days": 0,
            "expiry_warning_days": 7,
        }},
        upsert=True,
    )
    csv_data = _csv(["policyuser,Policy User,tech,policy@test.com,pt"])
    resp = await async_client.post(
        "/api/admin/users/import",
        headers=admin_headers,
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
    )
    assert resp.status_code == 200
    temp_password = resp.json()["temporary_credentials"][0]["temporary_password"]
    assert len(temp_password) >= 14
    assert any(c.isupper() for c in temp_password)
    assert any(c.isdigit() for c in temp_password)
    assert any(not c.isalnum() for c in temp_password)


@pytest.mark.asyncio
async def test_import_max_500_exceeded(async_client, admin_headers):
    rows = [f"user{i},Name {i},tech,,pt" for i in range(501)]
    csv_data = _csv(rows)
    resp = await async_client.post(
        "/api/admin/users/import",
        headers=admin_headers,
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_import_rejects_non_csv(async_client, admin_headers):
    resp = await async_client.post(
        "/api/admin/users/import",
        headers=admin_headers,
        files={"file": ("users.json", io.BytesIO(b'[]'), "application/json")},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_import_tech_forbidden(async_client, tech_headers):
    csv_data = _csv(["someuser,Some,tech,,pt"])
    resp = await async_client.post(
        "/api/admin/users/import",
        headers=tech_headers,
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_import_mixed_valid_invalid(async_client, admin_headers):
    csv_data = _csv([
        "validuser,Valid User,tech,valid@test.com,pt",
        "admin,Dupe Admin,admin,,pt",          # skipped
        ",Missing Username,tech,,pt",           # error
        "badroleuser,Bad Role,superuser,,pt",   # error
    ])
    resp = await async_client.post(
        "/api/admin/users/import",
        headers=admin_headers,
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 1
    assert body["skipped"] == 1
    assert len(body["errors"]) == 2
    assert len(body["temporary_credentials"]) == 1


@pytest.mark.asyncio
async def test_import_rejects_duplicate_email_case_insensitive(async_client, admin_headers):
    csv_data = _csv(["dupemail,Duplicate Email,tech,ADMIN@SOC.LOCAL,pt"])
    resp = await async_client.post(
        "/api/admin/users/import",
        headers=admin_headers,
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 0
    assert body["errors"][0]["reason"] == "email_already_in_use"


@pytest.mark.asyncio
async def test_import_rejects_duplicate_email_in_same_file(async_client, admin_headers):
    csv_data = _csv([
        "usera,User A,tech,dup@test.com,pt",
        "userb,User B,tech,DUP@test.com,pt",
    ])
    resp = await async_client.post(
        "/api/admin/users/import",
        headers=admin_headers,
        files={"file": ("users.csv", io.BytesIO(csv_data), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 1
    assert body["errors"][0]["reason"] == "duplicate_email_in_file"

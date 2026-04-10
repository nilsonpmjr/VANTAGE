import pytest
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request

from limiters import limiter
from mailer import SMTPDeliveryError


@pytest.mark.asyncio
async def test_read_smtp_operational_config_requires_admin(async_client):
    resp = await async_client.get("/api/admin/operational-config/smtp")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_read_smtp_operational_config_returns_masked_view(async_client, auth_headers, fake_db):
    await fake_db.operational_config.insert_one(
        {
            "_id": "singleton",
            "values": {
                "smtp_host": "smtp.persisted.local",
                "smtp_port": 465,
                "smtp_user": "persisted-user",
                "smtp_from": "persisted@soc.local",
                "smtp_tls": True,
            },
            "secret_values": {"smtp_pass": "persisted-pass"},
        }
    )

    resp = await async_client.get("/api/admin/operational-config/smtp", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["host"]["value"] == "smtp.persisted.local"
    assert data["password"]["configured"] is True
    assert data["password"]["masked"] == "********"
    assert "persisted-pass" not in resp.text


@pytest.mark.asyncio
async def test_update_smtp_operational_config_persists_and_audits(async_client, auth_headers, fake_db):
    resp = await async_client.put(
        "/api/admin/operational-config/smtp",
        json={
            "host": "smtp.control.local",
            "port": 2525,
            "username": "control-user",
            "password": "control-pass",
            "from_email": "control@soc.local",
            "tls": False,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["host"]["value"] == "smtp.control.local"
    assert data["port"]["value"] == 2525
    assert data["password"]["configured"] is True
    assert data["password"]["masked"] == "********"

    doc = await fake_db.operational_config.find_one({"_id": "singleton"})
    assert doc["values"]["smtp_host"] == "smtp.control.local"
    assert doc["secret_values"]["smtp_pass"] == "control-pass"

    audit = await fake_db.audit_log.find_one({"action": "smtp_config_updated"})
    assert audit is not None
    assert "smtp_pass" in audit["detail"]


@pytest.mark.asyncio
async def test_update_smtp_operational_config_preserves_secret_when_password_omitted(async_client, auth_headers, fake_db):
    await fake_db.operational_config.insert_one(
        {
            "_id": "singleton",
            "values": {"smtp_host": "smtp.old.local"},
            "secret_values": {"smtp_pass": "keep-me"},
        }
    )

    resp = await async_client.put(
        "/api/admin/operational-config/smtp",
        json={"host": "smtp.new.local"},
        headers=auth_headers,
    )
    assert resp.status_code == 200

    doc = await fake_db.operational_config.find_one({"_id": "singleton"})
    assert doc["secret_values"]["smtp_pass"] == "keep-me"


@pytest.mark.asyncio
async def test_smtp_test_endpoint_sends_and_audits(async_client, auth_headers, fake_db, monkeypatch):
    async def _fake_send(to_email: str):
        assert to_email == "admin@soc.local"
        return {
            "message": "SMTP test email sent.",
            "to_email": to_email,
            "from_email": "noreply@soc.local",
            "host": "smtp.control.local",
            "port": 587,
            "tls": True,
        }

    monkeypatch.setattr("routers.admin.deliver_smtp_test_email", _fake_send)

    resp = await async_client.post(
        "/api/admin/operational-config/smtp/test",
        json={},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["to_email"] == "admin@soc.local"
    assert resp.json()["host"] == "smtp.control.local"

    audit = await fake_db.audit_log.find_one({"action": "smtp_test_sent"})
    assert audit is not None
    assert audit["target"] == "admin@soc.local"


@pytest.mark.asyncio
async def test_smtp_test_endpoint_requires_target_email_when_admin_has_no_email(async_client, auth_headers, fake_db, monkeypatch):
    await fake_db.users.update_one({"username": "admin"}, {"$set": {"email": None}})
    monkeypatch.setattr("routers.admin.deliver_smtp_test_email", lambda *_args, **_kwargs: True)

    resp = await async_client.post(
        "/api/admin/operational-config/smtp/test",
        json={},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "A target email is required for SMTP test."


@pytest.mark.asyncio
async def test_smtp_test_endpoint_failure_is_audited(async_client, auth_headers, fake_db, monkeypatch):
    async def _fake_send(_to_email: str):
        raise SMTPDeliveryError(
            code="smtp_auth_failed",
            message="O servidor SMTP rejeitou as credenciais informadas.",
            hint="Valide usuario e senha.",
        )

    monkeypatch.setattr("routers.admin.deliver_smtp_test_email", _fake_send)

    resp = await async_client.post(
        "/api/admin/operational-config/smtp/test",
        json={"to_email": "ops@soc.local"},
        headers=auth_headers,
    )
    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert detail["code"] == "smtp_auth_failed"
    assert detail["to_email"] == "ops@soc.local"

    audit = await fake_db.audit_log.find_one({"action": "smtp_test_failed"})
    assert audit is not None
    assert audit["target"] == "ops@soc.local"
    assert audit["detail"] == "code=smtp_auth_failed"


@pytest.mark.asyncio
async def test_smtp_test_endpoint_returns_bad_request_for_missing_runtime_config(async_client, auth_headers, fake_db, monkeypatch):
    async def _fake_send(_to_email: str):
        raise SMTPDeliveryError(
            code="smtp_not_configured",
            message="Nenhum host SMTP esta configurado para a instancia.",
            hint="Salve host, remetente e credenciais antes de executar o teste.",
        )

    monkeypatch.setattr("routers.admin.deliver_smtp_test_email", _fake_send)

    resp = await async_client.post(
        "/api/admin/operational-config/smtp/test",
        json={"to_email": "ops@soc.local"},
        headers=auth_headers,
    )

    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "smtp_not_configured"


@pytest.mark.asyncio
async def test_smtp_test_endpoint_is_rate_limited(monkeypatch):
    limiter.reset()
    monkeypatch.setattr(limiter, "enabled", True)
    from routers.admin import test_smtp_operational_config
    from main import app

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/admin/operational-config/smtp/test",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "app": app,
        }
    )

    for _ in range(3):
        limiter._check_request_limit(request, test_smtp_operational_config.__wrapped__, False)

    with pytest.raises(RateLimitExceeded) as exc_info:
        limiter._check_request_limit(request, test_smtp_operational_config.__wrapped__, False)

    response = _rate_limit_exceeded_handler(request, exc_info.value)
    assert response.status_code == 429
    assert response.body == b'{"error":"Rate limit exceeded: Too many SMTP test attempts. Try again later."}'
    limiter.reset()

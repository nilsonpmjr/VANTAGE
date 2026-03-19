"""
Tests for mailer.py — password reset email dispatch.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_send_reset_email_no_smtp_returns_false(fake_db, monkeypatch):
    """When SMTP is not configured, mailer returns False without attempting send."""
    from config import settings
    from db import db_manager
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(db_manager, "db", fake_db)

    from mailer import send_password_reset_email
    result = await send_password_reset_email("user@example.com", "tok123")
    assert result is False


@pytest.mark.asyncio
async def test_send_reset_email_smtp_configured_sends_and_returns_true(fake_db, monkeypatch):
    """When SMTP is configured, aiosmtplib.send is called and True is returned."""
    from config import settings
    from db import db_manager
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_user", "user")
    monkeypatch.setattr(settings, "smtp_pass", "pass")
    monkeypatch.setattr(settings, "smtp_tls", True)
    monkeypatch.setattr(settings, "smtp_from", "noreply@soc.local")
    monkeypatch.setattr(settings, "frontend_url", "http://localhost:5173")
    monkeypatch.setattr(db_manager, "db", fake_db)

    mock_send = AsyncMock(return_value=None)
    mock_aiosmtplib = MagicMock()
    mock_aiosmtplib.send = mock_send

    with patch.dict("sys.modules", {"aiosmtplib": mock_aiosmtplib}):
        # Force reimport to pick up the patched module
        import importlib
        import mailer as mailer_mod
        importlib.reload(mailer_mod)

        result = await mailer_mod.send_password_reset_email("user@example.com", "tok123")

    assert result is True
    mock_send.assert_called_once()


@pytest.mark.asyncio
async def test_send_reset_email_smtp_error_returns_false(fake_db, monkeypatch):
    """When aiosmtplib raises, mailer catches and returns False."""
    from config import settings
    from db import db_manager
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(db_manager, "db", fake_db)

    mock_aiosmtplib = MagicMock()
    mock_aiosmtplib.send = AsyncMock(side_effect=Exception("connection refused"))

    with patch.dict("sys.modules", {"aiosmtplib": mock_aiosmtplib}):
        import importlib
        import mailer as mailer_mod
        importlib.reload(mailer_mod)

        result = await mailer_mod.send_password_reset_email("user@example.com", "tok123")

    assert result is False


@pytest.mark.asyncio
async def test_send_reset_email_link_contains_token(fake_db, monkeypatch):
    """The reset link logged in dev mode contains the token."""
    from config import settings
    from db import db_manager
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "frontend_url", "http://localhost:5173")
    monkeypatch.setattr(db_manager, "db", fake_db)

    from mailer import send_password_reset_email
    import logging

    await fake_db.operational_config.insert_one(
        {
            "_id": "singleton",
            "values": {},
            "secret_values": {},
        }
    )

    with patch.object(logging.getLogger("Mailer"), "warning") as mock_warn:
        await send_password_reset_email("dev@soc.local", "abc-token-xyz")
        assert mock_warn.called
        logged_msg = mock_warn.call_args[0][0]
        assert "abc-token-xyz" in logged_msg


@pytest.mark.asyncio
async def test_mailer_prefers_persisted_operational_config_over_env(fake_db, monkeypatch):
    from config import settings
    from db import db_manager

    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(db_manager, "db", fake_db)

    await fake_db.operational_config.insert_one(
        {
            "_id": "singleton",
            "values": {
                "smtp_host": "smtp.persisted.local",
                "smtp_port": 2525,
                "smtp_user": "persisted-user",
                "smtp_from": "persisted@soc.local",
                "smtp_tls": False,
            },
            "secret_values": {"smtp_pass": "persisted-pass"},
        }
    )

    mock_send = AsyncMock(return_value=None)
    mock_aiosmtplib = MagicMock()
    mock_aiosmtplib.send = mock_send

    with patch.dict("sys.modules", {"aiosmtplib": mock_aiosmtplib}):
        import importlib
        import mailer as mailer_mod
        importlib.reload(mailer_mod)

        result = await mailer_mod.send_password_reset_email("user@example.com", "tok123")

    assert result is True
    assert mock_send.await_args.kwargs["hostname"] == "smtp.persisted.local"
    assert mock_send.await_args.kwargs["port"] == 2525
    assert mock_send.await_args.kwargs["username"] == "persisted-user"
    assert mock_send.await_args.kwargs["password"] == "persisted-pass"
    assert mock_send.await_args.kwargs["use_tls"] is False

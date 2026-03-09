"""
Tests for mailer.py — password reset email dispatch.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_send_reset_email_no_smtp_returns_false(monkeypatch):
    """When SMTP is not configured, mailer returns False without attempting send."""
    from config import settings
    monkeypatch.setattr(settings, "smtp_host", "")

    from mailer import send_password_reset_email
    result = await send_password_reset_email("user@example.com", "tok123")
    assert result is False


@pytest.mark.asyncio
async def test_send_reset_email_smtp_configured_sends_and_returns_true(monkeypatch):
    """When SMTP is configured, aiosmtplib.send is called and True is returned."""
    from config import settings
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_user", "user")
    monkeypatch.setattr(settings, "smtp_pass", "pass")
    monkeypatch.setattr(settings, "smtp_tls", True)
    monkeypatch.setattr(settings, "smtp_from", "noreply@soc.local")
    monkeypatch.setattr(settings, "frontend_url", "http://localhost:5173")

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
async def test_send_reset_email_smtp_error_returns_false(monkeypatch):
    """When aiosmtplib raises, mailer catches and returns False."""
    from config import settings
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")

    mock_aiosmtplib = MagicMock()
    mock_aiosmtplib.send = AsyncMock(side_effect=Exception("connection refused"))

    with patch.dict("sys.modules", {"aiosmtplib": mock_aiosmtplib}):
        import importlib
        import mailer as mailer_mod
        importlib.reload(mailer_mod)

        result = await mailer_mod.send_password_reset_email("user@example.com", "tok123")

    assert result is False


@pytest.mark.asyncio
async def test_send_reset_email_link_contains_token(monkeypatch):
    """The reset link logged in dev mode contains the token."""
    from config import settings
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "frontend_url", "http://localhost:5173")

    from mailer import send_password_reset_email
    import logging

    with patch.object(logging.getLogger("Mailer"), "warning") as mock_warn:
        await send_password_reset_email("dev@soc.local", "abc-token-xyz")
        assert mock_warn.called
        logged_msg = mock_warn.call_args[0][0]
        assert "abc-token-xyz" in logged_msg

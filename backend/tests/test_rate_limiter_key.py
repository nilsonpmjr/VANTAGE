"""Tests for rate limiter key extraction — C-01 fix validation."""

from datetime import timedelta
from unittest.mock import MagicMock

import pytest

from auth import create_access_token
from limiters import _get_rate_limit_key


def _fake_request(token: str | None = None, remote_addr: str = "10.0.0.1"):
    """Build a minimal Starlette-like request for limiter testing."""
    request = MagicMock()
    if token:
        request.headers = {"authorization": f"Bearer {token}"}
    else:
        request.headers = {}
    request.client.host = remote_addr
    request.scope = {"type": "http"}
    return request


def test_valid_token_returns_user_key():
    token = create_access_token({"sub": "analyst1", "role": "tech"})
    request = _fake_request(token=token)
    key = _get_rate_limit_key(request)
    assert key == "user:analyst1"


def test_expired_token_falls_back_to_ip():
    token = create_access_token(
        {"sub": "analyst1", "role": "tech"},
        expires_delta=timedelta(seconds=-10),
    )
    request = _fake_request(token=token, remote_addr="192.168.1.50")
    key = _get_rate_limit_key(request)
    assert key == "192.168.1.50"


def test_no_token_falls_back_to_ip():
    request = _fake_request(token=None, remote_addr="172.16.0.1")
    key = _get_rate_limit_key(request)
    assert key == "172.16.0.1"


def test_invalid_token_falls_back_to_ip():
    request = _fake_request(token="garbage.token.here", remote_addr="10.10.10.10")
    key = _get_rate_limit_key(request)
    assert key == "10.10.10.10"

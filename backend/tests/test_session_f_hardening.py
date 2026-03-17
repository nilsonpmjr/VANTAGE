"""
Regression tests for Phase 2 — Session F hardening.
"""

import socket

import httpx
import pytest

from auth import create_access_token
from network_security import UnsafeTargetError, validate_public_scan_target, validate_public_url
from recon.modules.web_module import WebModule


def _auth_headers(username: str, role: str) -> dict:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


def test_validate_public_scan_target_blocks_private_ip():
    with pytest.raises(UnsafeTargetError):
        validate_public_scan_target("127.0.0.1")


def test_validate_public_scan_target_blocks_domains_resolving_private(monkeypatch):
    monkeypatch.setattr("network_security.resolve_hostname_ips", lambda _: ["10.10.10.10"])

    with pytest.raises(UnsafeTargetError):
        validate_public_scan_target("portal.example.com")


def test_validate_public_scan_target_allows_unresolved_domains(monkeypatch):
    def _raise_dns(_hostname: str):
        raise socket.gaierror("nxdomain")

    monkeypatch.setattr("network_security.resolve_hostname_ips", _raise_dns)

    validated = validate_public_scan_target("example.com")
    assert validated.sanitized == "example.com"
    assert validated.target_type == "domain"


def test_validate_public_url_rejects_private_destinations(monkeypatch):
    monkeypatch.setattr("network_security.resolve_hostname_ips", lambda _: ["192.168.1.10"])

    with pytest.raises(UnsafeTargetError):
        validate_public_url("https://portal.example.com")


@pytest.mark.asyncio
async def test_api_v1_routes_emit_deprecation_headers(async_client):
    resp = await async_client.get(
        "/api/v1/recon/modules",
        headers=_auth_headers("admin", "admin"),
    )

    assert resp.status_code == 200
    assert resp.headers["Deprecation"] == "true"
    assert resp.headers["Sunset"] == "Wed, 30 Sep 2026 00:00:00 GMT"
    assert resp.headers["Link"] == "</api/recon/modules>; rel=\"successor-version\""


@pytest.mark.asyncio
async def test_recon_scan_rejects_private_targets(async_client):
    resp = await async_client.post(
        "/api/recon/scan",
        json={"target": "127.0.0.1", "modules": ["dns"]},
        headers=_auth_headers("techuser", "tech"),
    )

    assert resp.status_code == 400
    assert "not allowed" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_web_module_uses_manual_redirects_and_tls_verification(monkeypatch):
    captured: dict = {}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            captured.update(kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url):
            request = httpx.Request("GET", url)
            return httpx.Response(200, request=request, text="<title>Example</title>")

    monkeypatch.setattr("recon.modules.web_module.httpx.AsyncClient", FakeClient)
    monkeypatch.setattr("recon.modules.web_module.validate_public_url", lambda url: url)

    result = await WebModule().run("example.com", "domain")

    assert captured["follow_redirects"] is False
    assert captured.get("verify", True) is True
    assert result["title"] == "Example"


@pytest.mark.asyncio
async def test_web_module_blocks_redirects_to_private_destinations(monkeypatch):
    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url):
            request = httpx.Request("GET", url)
            return httpx.Response(302, headers={"location": "http://127.0.0.1/admin"}, request=request)

    def _validate(url: str):
        if "127.0.0.1" in url:
            raise UnsafeTargetError("redirect blocked")
        return url

    monkeypatch.setattr("recon.modules.web_module.httpx.AsyncClient", lambda *args, **kwargs: FakeClient())
    monkeypatch.setattr("recon.modules.web_module.validate_public_url", _validate)

    result = await WebModule().run("example.com", "domain")

    assert "redirect blocked" in result["https_error"]

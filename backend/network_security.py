"""
Network-safety helpers for outbound recon traffic.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from validators import ValidatedTarget, ValidationError, validate_target


class UnsafeTargetError(ValidationError):
    """Raised when a target or URL resolves to a forbidden network range."""


def _is_forbidden_ip(value: str | ipaddress._BaseAddress) -> bool:
    ip = value if isinstance(value, ipaddress._BaseAddress) else ipaddress.ip_address(value)
    return (
        ip.is_private
        or ip.is_reserved
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_unspecified
        or ip.is_multicast
        or not ip.is_global
    )


def resolve_hostname_ips(hostname: str) -> list[ipaddress._BaseAddress]:
    """Resolve a hostname and return deduplicated IP addresses."""
    results: list[ipaddress._BaseAddress] = []
    seen: set[str] = set()

    for family, _, _, _, sockaddr in socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM):
        if family not in (socket.AF_INET, socket.AF_INET6):
            continue
        candidate = sockaddr[0]
        if candidate in seen:
            continue
        seen.add(candidate)
        results.append(ipaddress.ip_address(candidate))

    return results


def validate_public_scan_target(raw: str) -> ValidatedTarget:
    """
    Validate a recon target and block IPs/domains that land in non-public space.

    Unresolvable domains remain allowed for non-web recon modules such as DNS/WHOIS.
    """
    validated = validate_target(raw)

    if validated.target_type not in {"ip", "domain"}:
        raise UnsafeTargetError("Recon targets must be a public IP address or a domain.")

    if validated.target_type == "ip":
        if _is_forbidden_ip(validated.sanitized):
            raise UnsafeTargetError("Private, loopback, reserved, or non-public IP targets are not allowed.")
        return validated

    try:
        resolved_ips = resolve_hostname_ips(validated.sanitized)
    except socket.gaierror:
        return validated

    blocked = [str(ip) for ip in resolved_ips if _is_forbidden_ip(ip)]
    if blocked:
        raise UnsafeTargetError(
            "Targets resolving to private, loopback, reserved, or non-public IPs are not allowed."
        )

    return validated


def validate_public_url(url: str) -> str:
    """Validate an outbound URL before the web recon module fetches it."""
    parsed = urlparse(url)

    if parsed.scheme not in {"http", "https"}:
        raise UnsafeTargetError("Only http and https URLs are allowed for web reconnaissance.")
    if not parsed.hostname:
        raise UnsafeTargetError("Web reconnaissance requires an absolute URL with hostname.")

    hostname = parsed.hostname
    try:
        if _is_forbidden_ip(hostname):
            raise UnsafeTargetError("Web reconnaissance cannot fetch private or non-public IP destinations.")
        return url
    except ValueError:
        pass

    try:
        resolved_ips = resolve_hostname_ips(hostname)
    except socket.gaierror as exc:
        raise UnsafeTargetError("Web reconnaissance requires a resolvable public hostname.") from exc

    blocked = [str(ip) for ip in resolved_ips if _is_forbidden_ip(ip)]
    if blocked:
        raise UnsafeTargetError("Web reconnaissance cannot follow redirects to private or non-public destinations.")

    return url

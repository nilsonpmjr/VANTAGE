"""Deterministic, offline projections for explicitly declared scope assets."""

from __future__ import annotations

import ipaddress
import re
from functools import lru_cache
from importlib.resources import files
from urllib.parse import urlsplit, urlunsplit

import idna


ASN_RE = re.compile(r"^AS([0-9]+)$", re.IGNORECASE)
PSL_VERSION_RE = re.compile(r"^// VERSION: (.+)$", re.MULTILINE)
MAX_ASN = 4_294_967_295


class ScopeNormalizationError(ValueError):
    """The supplied value is not a supported, valid scope asset."""


@lru_cache(maxsize=1)
def _public_suffix_rules() -> tuple[frozenset[str], frozenset[str], frozenset[str], str]:
    data = files("whois").joinpath("data/public_suffix_list.dat").read_text(encoding="utf-8")
    exact = set()
    wildcard = set()
    exceptions = set()
    for raw_line in data.splitlines():
        rule = raw_line.strip()
        if not rule or rule.startswith("//"):
            continue
        target = exact
        if rule.startswith("!"):
            target = exceptions
            rule = rule[1:]
        elif rule.startswith("*."):
            target = wildcard
            rule = rule[2:]
        try:
            target.add(idna.encode(rule, uts46=True, std3_rules=True).decode("ascii").lower())
        except idna.IDNAError as exc:  # A malformed vendored list must fail closed.
            raise RuntimeError("scope_public_suffix_list_invalid") from exc
    version_match = PSL_VERSION_RE.search(data)
    version = version_match.group(1) if version_match else "python-whois-0.9.6"
    return frozenset(exact), frozenset(wildcard), frozenset(exceptions), version


def public_suffix_list_version() -> str:
    return _public_suffix_rules()[3]


def _canonical_domain(value: str) -> str:
    candidate = value.rstrip(".").lower()
    if "." not in candidate:
        raise ScopeNormalizationError("scope_domain_invalid")
    try:
        canonical = idna.encode(candidate, uts46=True, std3_rules=True).decode("ascii").lower()
    except idna.IDNAError as exc:
        raise ScopeNormalizationError("scope_domain_invalid") from exc
    labels = canonical.split(".")
    if labels[-1].isdigit() or len(canonical) > 253 or any(len(label) > 63 for label in labels):
        raise ScopeNormalizationError("scope_domain_invalid")
    return canonical


def _domain_parts(canonical: str) -> dict:
    exact, wildcard, exceptions, version = _public_suffix_rules()
    labels = canonical.split(".")
    exception_length = 0
    rule_length = 1  # PSL prevailing rule: "*"
    for index in range(len(labels)):
        candidate = ".".join(labels[index:])
        candidate_length = len(labels) - index
        if candidate in exceptions:
            exception_length = max(exception_length, candidate_length)
        if candidate in exact:
            rule_length = max(rule_length, candidate_length)
        if index > 0 and candidate in wildcard:
            rule_length = max(rule_length, candidate_length + 1)
    public_suffix_length = exception_length - 1 if exception_length else rule_length
    public_suffix = ".".join(labels[-public_suffix_length:])
    if len(labels) <= public_suffix_length:
        registrable_domain = None
        subdomain = None
    else:
        registrable_domain = ".".join(labels[-(public_suffix_length + 1):])
        subdomain_labels = labels[:-(public_suffix_length + 1)]
        subdomain = ".".join(subdomain_labels) or None
    return {
        "public_suffix": public_suffix,
        "registrable_domain": registrable_domain,
        "subdomain": subdomain,
        "psl_version": version,
    }


def _base_projection(kind: str, original: str, canonical: str, attributes: dict) -> dict:
    return {
        "classification": "declared",
        "kind": kind,
        "original": original,
        "canonical": canonical,
        "attributes": attributes,
        "relations": [],
        "enrichments": [],
    }


def _normalize_url(original: str) -> dict:
    parsed = urlsplit(original)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise ScopeNormalizationError("scope_url_invalid")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ScopeNormalizationError("scope_url_invalid") from exc
    host = parsed.hostname
    domain_parts = {
        "public_suffix": None,
        "registrable_domain": None,
        "subdomain": None,
        "psl_version": public_suffix_list_version(),
    }
    try:
        address = ipaddress.ip_address(host)
        canonical_host = str(address)
        host_for_authority = f"[{canonical_host}]" if address.version == 6 else canonical_host
        family = address.version
    except ValueError:
        canonical_host = _canonical_domain(host)
        host_for_authority = canonical_host
        domain_parts = _domain_parts(canonical_host)
        family = None
    authority = host_for_authority if port is None else f"{host_for_authority}:{port}"
    canonical = urlunsplit((
        parsed.scheme.lower(),
        authority,
        parsed.path,
        parsed.query,
        parsed.fragment,
    ))
    return _base_projection("url", original, canonical, {
        "scheme": parsed.scheme.lower(),
        "host": canonical_host,
        "host_ip_family": family,
        "port": port,
        "path": parsed.path,
        **domain_parts,
    })


def normalize_declared_target(kind: str, original: str) -> dict:
    """Normalize one explicit target without DNS, WHOIS, RDAP, or other I/O."""
    if kind == "url":
        return _normalize_url(original)
    if kind == "ip":
        try:
            address = ipaddress.ip_address(original.strip("[]"))
        except ValueError as exc:
            raise ScopeNormalizationError("scope_ip_invalid") from exc
        return _base_projection("ip", original, str(address), {"family": address.version})
    if kind == "cidr":
        try:
            network = ipaddress.ip_network(original, strict=True)
        except ValueError as exc:
            raise ScopeNormalizationError("scope_cidr_invalid") from exc
        return _base_projection("cidr", original, str(network), {
            "family": network.version,
            "prefix": network.prefixlen,
            "first_address": str(network.network_address),
            "last_address": str(network.broadcast_address),
            "address_count": str(network.num_addresses),
        })
    if kind == "domain":
        canonical = _canonical_domain(original)
        return _base_projection("domain", original, canonical, _domain_parts(canonical))
    if kind == "asn":
        match = ASN_RE.fullmatch(original)
        if match is None:
            raise ScopeNormalizationError("scope_asn_invalid")
        number = int(match.group(1))
        if number > MAX_ASN:
            raise ScopeNormalizationError("scope_asn_invalid")
        return _base_projection("asn", original, f"AS{number}", {"number": str(number)})
    raise ScopeNormalizationError("scope_target_type_not_supported")


def parse_declared_target(token: str) -> dict:
    """Recognize and normalize one token extracted from operator input."""
    original = token.strip(".,;()<>\"'")
    if not original or ("@" in original and not original.lower().startswith(("http://", "https://"))):
        raise ScopeNormalizationError("scope_target_invalid")
    if original.lower().startswith(("http://", "https://")):
        original = original.rstrip(".,;)")
        return normalize_declared_target("url", original)
    candidate = original.strip("[]")
    if ASN_RE.fullmatch(candidate):
        return normalize_declared_target("asn", candidate)
    try:
        kind = "cidr" if "/" in candidate else "ip"
        return normalize_declared_target(kind, candidate)
    except ScopeNormalizationError:
        pass
    return normalize_declared_target("domain", candidate)


def derive_scope_relations(rules: list[dict]) -> list[dict]:
    """Attach local relationships while leaving executable declarations unchanged."""
    networks = []
    for rule in rules:
        if rule["kind"] != "cidr":
            continue
        networks.append((ipaddress.ip_network(rule["value"]), rule))
    for rule in rules:
        if rule["kind"] != "ip":
            continue
        address = ipaddress.ip_address(rule["value"])
        rule["normalized"]["relations"] = [
            {
                "classification": "derived",
                "type": "contained_by",
                "kind": "cidr",
                "canonical": str(network),
                "category": network_rule["category"],
            }
            for network, network_rule in networks
            if network.version == address.version and address in network
        ]
    return rules

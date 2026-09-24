"""Extract explicit scope targets from operator-supplied plain text.

The parser never resolves DNS or invents related hosts/networks. Its output is
data for a future authorization service, not permission to execute a tool.
"""

from __future__ import annotations

import ipaddress
import re
import unicodedata
from urllib.parse import urlsplit


TOKEN_RE = re.compile(r"https?://[^\s<>\"']+|[A-Za-z0-9_.:@/\-\[\]]+", re.IGNORECASE)
DOMAIN_RE = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$", re.IGNORECASE)
PRIORITY = {"client": 1, "third_party": 2, "excluded": 3}


def _plain(value: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFD", value.lower())
        if unicodedata.category(char) != "Mn"
    )


def _category_for_line(line: str, current: str) -> str:
    plain = _plain(line.strip())
    if "exclu" in plain or any(marker in plain for marker in ("fora do escopo", "out of scope")):
        return "excluded"
    if "terceir" in plain or any(marker in plain for marker in ("third party", "third-party", "third parties", "third_party", "fornecedor")):
        return "third_party"
    if plain.startswith(("cliente:", "cliente ", "escopo:", "in scope:", "incluido:", "client:", "client ", '"client":', '"cliente":')):
        return "client"
    return current


def _target_from_token(token: str) -> tuple[str, str] | None:
    token = token.strip(".,;()<>\"'")
    if not token or "@" in token:
        return None

    if token.lower().startswith(("http://", "https://")):
        token = token.rstrip(".,;)")
        parsed = urlsplit(token)
        try:
            host, _port = parsed.hostname, parsed.port
        except ValueError:
            return None
        if not host:
            return None
        try:
            ipaddress.ip_address(host)
        except ValueError:
            if not DOMAIN_RE.fullmatch(host):
                return None
        return "url", token

    candidate = token.strip("[]")
    try:
        if "/" in candidate:
            return "cidr", str(ipaddress.ip_network(candidate, strict=True))
        return "ip", str(ipaddress.ip_address(candidate))
    except ValueError:
        pass
    if DOMAIN_RE.fullmatch(candidate):
        return "domain", candidate.lower()
    return None


def compile_scope_text(text: str, source_id: str = "text") -> list[dict]:
    """Return deduplicated explicit targets; exclusions take precedence."""
    if not text.strip():
        raise ValueError("scope_has_no_targets")

    rules: dict[tuple[str, str], dict] = {}
    category = "client"
    for line_number, line in enumerate(text.splitlines(), start=1):
        new_category = _category_for_line(line, category)
        targets = [parsed for match in TOKEN_RE.finditer(line) if (parsed := _target_from_token(match.group()))]
        if not targets and new_category != category:
            category = new_category
        line_category = new_category
        for parsed in targets:
            kind, value = parsed
            key = (kind, value)
            if key not in rules:
                rules[key] = {
                    "kind": kind,
                    "value": value,
                    "category": line_category,
                    "origin_lines": [line_number],
                    "origins": [{"source_id": source_id, "line": line_number}],
                }
                continue
            rule = rules[key]
            if PRIORITY[line_category] > PRIORITY[rule["category"]]:
                rule["category"] = line_category
            if line_number not in rule["origin_lines"]:
                rule["origin_lines"].append(line_number)
            origin = {"source_id": source_id, "line": line_number}
            if origin not in rule["origins"]:
                rule["origins"].append(origin)

    if not rules:
        raise ValueError("scope_has_no_targets")
    return list(rules.values())


def merge_scope_rules(groups: list[list[dict]]) -> list[dict]:
    """Combine rules from text/files, retaining every origin and strongest category."""
    merged: dict[tuple[str, str], dict] = {}
    for group in groups:
        for rule in group:
            key = (rule["kind"], rule["value"])
            if key not in merged:
                merged[key] = {**rule, "origin_lines": list(rule["origin_lines"]), "origins": list(rule["origins"])}
                continue
            current = merged[key]
            if PRIORITY[rule["category"]] > PRIORITY[current["category"]]:
                current["category"] = rule["category"]
            for origin in rule["origins"]:
                if origin not in current["origins"]:
                    current["origins"].append(origin)
            for line in rule["origin_lines"]:
                if line not in current["origin_lines"]:
                    current["origin_lines"].append(line)
    return list(merged.values())

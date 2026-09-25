"""Extract explicit scope targets from operator-supplied plain text.

The parser never resolves DNS or invents related hosts/networks. Its output is
data for a future authorization service, not permission to execute a tool.
"""

from __future__ import annotations

from copy import deepcopy
import re
import unicodedata

from redmode_scope_normalizer import (
    ScopeNormalizationError,
    derive_scope_relations,
    parse_declared_target,
)


TOKEN_RE = re.compile(r"https?://[^\s<>\"']+|[\w_.:@/\-\[\]]+", re.IGNORECASE)
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


def _target_from_token(token: str) -> dict | None:
    try:
        return parse_declared_target(token)
    except ScopeNormalizationError:
        return None


def _add_item(items: dict, normalized: dict, category: str, source_id: str, line_number: int) -> None:
    key = (normalized["kind"], normalized["canonical"])
    original = normalized["original"]
    if key not in items:
        items[key] = {
            "kind": normalized["kind"],
            "value": normalized["canonical"],
            "original_value": original,
            "original_values": [original],
            "category": category,
            "classification": "declared",
            "executable": normalized["kind"] != "asn",
            "origin_lines": [line_number],
            "origins": [{"source_id": source_id, "line": line_number}],
            "normalized": normalized,
        }
        return
    item = items[key]
    if PRIORITY[category] > PRIORITY[item["category"]]:
        item["category"] = category
    if original not in item["original_values"]:
        item["original_values"].append(original)
    if line_number not in item["origin_lines"]:
        item["origin_lines"].append(line_number)
    origin = {"source_id": source_id, "line": line_number}
    if origin not in item["origins"]:
        item["origins"].append(origin)


def compile_scope_document(text: str, source_id: str = "text") -> dict[str, list[dict]]:
    """Return executable declarations and explicit non-executable context."""
    if not text.strip():
        raise ValueError("scope_has_no_targets")

    rules: dict[tuple[str, str], dict] = {}
    context_assets: dict[tuple[str, str], dict] = {}
    category = "client"
    for line_number, line in enumerate(text.splitlines(), start=1):
        new_category = _category_for_line(line, category)
        targets = [parsed for match in TOKEN_RE.finditer(line) if (parsed := _target_from_token(match.group()))]
        if not targets and new_category != category:
            category = new_category
        line_category = new_category
        for normalized in targets:
            destination = context_assets if normalized["kind"] == "asn" else rules
            _add_item(destination, normalized, line_category, source_id, line_number)

    if not rules and not context_assets:
        raise ValueError("scope_has_no_targets")
    return {"rules": list(rules.values()), "context_assets": list(context_assets.values())}


def compile_scope_text(text: str, source_id: str = "text") -> list[dict]:
    """Return deduplicated executable targets; exclusions take precedence."""
    document = compile_scope_document(text, source_id)
    if not document["rules"]:
        raise ValueError("scope_has_no_targets")
    return derive_scope_relations(document["rules"])


def _merge_scope_items(groups: list[list[dict]]) -> list[dict]:
    merged: dict[tuple[str, str], dict] = {}
    for group in groups:
        for item in group:
            key = (item["kind"], item["value"])
            if key not in merged:
                merged[key] = deepcopy(item)
                continue
            current = merged[key]
            if PRIORITY[item["category"]] > PRIORITY[current["category"]]:
                current["category"] = item["category"]
            for origin in item["origins"]:
                if origin not in current["origins"]:
                    current["origins"].append(origin)
            for line in item["origin_lines"]:
                if line not in current["origin_lines"]:
                    current["origin_lines"].append(line)
            for original in item.get("original_values", [item.get("original_value", item["value"])]):
                if original not in current["original_values"]:
                    current["original_values"].append(original)
    return list(merged.values())


def merge_scope_rules(groups: list[list[dict]]) -> list[dict]:
    """Combine rules from text/files, retaining every origin and strongest category."""
    return derive_scope_relations(_merge_scope_items(groups))


def merge_scope_context_assets(groups: list[list[dict]]) -> list[dict]:
    """Combine explicit non-executable context such as ASNs."""
    return _merge_scope_items(groups)

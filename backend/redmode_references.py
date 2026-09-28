"""Stable internal-reference syntax for RedMode Markdown documents."""

from __future__ import annotations

import re

from markdown_it import MarkdownIt


REFERENCE_TYPES = frozenset({"evidence", "finding", "source", "target"})
MAX_INTERNAL_REFERENCES = 100
_SIMPLE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_SCOPED_ID_PATTERN = re.compile(
    r"^[A-Za-z0-9._~-]{1,128}/[A-Za-z0-9._~-]{1,128}$"
)
_MARKDOWN_PARSER = MarkdownIt("commonmark")
_ESCAPED_OPEN_BRACKET = "\ue000"
_ESCAPED_CLOSE_BRACKET = "\ue001"


class ReferenceSyntaxError(ValueError):
    """Raised when Markdown contains a malformed internal reference."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def parse_reference_key(value: str) -> dict[str, str]:
    """Parse a reference body such as ``evidence:abc`` into stable fields."""
    kind, separator, identifier = value.partition(":")
    if not separator or kind not in REFERENCE_TYPES:
        raise ReferenceSyntaxError("evidence_reference_type_invalid")
    pattern = _SCOPED_ID_PATTERN if kind in {"source", "target"} else _SIMPLE_ID_PATTERN
    if not pattern.fullmatch(identifier):
        raise ReferenceSyntaxError("evidence_reference_syntax_invalid")
    return {"kind": kind, "id": identifier, "key": f"{kind}:{identifier}"}


def extract_internal_references(
    markdown: str,
    *,
    strict: bool = False,
) -> list[dict[str, str]]:
    """Return unique references in document order without storing display labels."""
    references = []
    seen = set()
    escaped_markdown = markdown.replace(
        r"\[", _ESCAPED_OPEN_BRACKET
    ).replace(r"\]", _ESCAPED_CLOSE_BRACKET)
    for token in _MARKDOWN_PARSER.parse(escaped_markdown):
        if token.type != "inline":
            continue
        for child in token.children or []:
            if child.type != "text":
                continue
            text = child.content
            cursor = 0
            while True:
                start = text.find("[[", cursor)
                if start < 0:
                    break
                end = text.find("]]", start + 2)
                if end < 0:
                    if strict:
                        raise ReferenceSyntaxError(
                            "evidence_reference_syntax_invalid"
                        )
                    break
                cursor = end + 2
                try:
                    reference = parse_reference_key(text[start + 2:end])
                except ReferenceSyntaxError:
                    if strict:
                        raise
                    continue
                if reference["key"] in seen:
                    continue
                seen.add(reference["key"])
                references.append(reference)
                if strict and len(references) > MAX_INTERNAL_REFERENCES:
                    raise ReferenceSyntaxError("too_many_evidence_references")
    return references


def reference_context(markdown: str, key: str, radius: int = 90) -> str:
    """Return a compact plain-text fragment around a stored reference."""
    token = f"[[{key}]]"
    position = markdown.find(token)
    if position < 0:
        return ""
    start = max(0, position - radius)
    end = min(len(markdown), position + len(token) + radius)
    fragment = markdown[start:end]
    fragment = re.sub(r"[`*_>#|\[\]()]", " ", fragment)
    fragment = re.sub(r"\s+", " ", fragment).strip()
    if start:
        fragment = f"…{fragment}"
    if end < len(markdown):
        fragment = f"{fragment}…"
    return fragment


def evidence_search_text(
    title: str,
    markdown: str,
    tags: list[str],
    references: list[dict[str, str]],
) -> str:
    """Build the persisted, case-folded projection used by notebook search."""
    return " ".join([
        title,
        markdown,
        *tags,
        *[reference["key"] for reference in references],
    ]).casefold()

"""Stable RedMode Markdown reference parsing."""

import pytest

from redmode_references import (
    ReferenceSyntaxError,
    evidence_search_text,
    extract_internal_references,
    reference_context,
)


def test_extracts_unique_typed_references_in_document_order():
    markdown = (
        "Veja [[evidence:note-1]], [[finding:finding_2]], "
        "[[source:version-1/text]] e [[target:version-1/asset_1]]. "
        "A nota [[evidence:note-1]] aparece novamente."
    )
    assert extract_internal_references(markdown, strict=True) == [
        {"kind": "evidence", "id": "note-1", "key": "evidence:note-1"},
        {"kind": "finding", "id": "finding_2", "key": "finding:finding_2"},
        {
            "kind": "source",
            "id": "version-1/text",
            "key": "source:version-1/text",
        },
        {
            "kind": "target",
            "id": "version-1/asset_1",
            "key": "target:version-1/asset_1",
        },
    ]


@pytest.mark.parametrize(
    "markdown,code",
    [
        ("[[unknown:item]]", "evidence_reference_type_invalid"),
        ("[[source:missing-version]]", "evidence_reference_syntax_invalid"),
        ("[[evidence:has spaces]]", "evidence_reference_syntax_invalid"),
        ("[[evidence:unfinished", "evidence_reference_syntax_invalid"),
    ],
)
def test_strict_parser_rejects_unknown_or_malformed_references(markdown, code):
    with pytest.raises(ReferenceSyntaxError) as raised:
        extract_internal_references(markdown, strict=True)
    assert raised.value.code == code


def test_ignores_references_in_code_and_escaped_markdown():
    markdown = (
        "`[[finding:inline-code]]`\n\n"
        "```text\n[[evidence:fenced-code]]\n```\n\n"
        r"\[[finding:escaped]] and [[finding:live]]"
    )
    assert extract_internal_references(markdown, strict=True) == [{
        "kind": "finding",
        "id": "live",
        "key": "finding:live",
    }]


def test_context_and_search_projection_keep_stable_identifier():
    markdown = "Antes da referência [[finding:finding-1]] havia contexto."
    references = extract_internal_references(markdown, strict=True)
    assert "finding:finding-1" in reference_context(markdown, references[0]["key"])
    search = evidence_search_text("Título", markdown, ["WEB"], references)
    assert all(value in search for value in ("título", "web", "finding:finding-1"))

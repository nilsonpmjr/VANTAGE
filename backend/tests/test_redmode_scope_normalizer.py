"""Offline normalization of explicitly declared offensive scope assets."""

import pytest

from redmode_scope import (
    compile_scope_document,
    merge_scope_context_assets,
    merge_scope_rules,
)
from redmode_scope_normalizer import ScopeNormalizationError, normalize_declared_target


def test_ip_and_cidr_projection_preserves_original_and_decimal_size():
    address = normalize_declared_target("ip", "2001:0DB8:0000:0000:0000:0000:0000:0001")
    assert address["original"] == "2001:0DB8:0000:0000:0000:0000:0000:0001"
    assert address["canonical"] == "2001:db8::1"
    assert address["attributes"] == {"family": 6}

    network = normalize_declared_target("cidr", "2001:db8::/64")
    assert network["canonical"] == "2001:db8::/64"
    assert network["attributes"] == {
        "family": 6,
        "prefix": 64,
        "first_address": "2001:db8::",
        "last_address": "2001:db8::ffff:ffff:ffff:ffff",
        "address_count": "18446744073709551616",
    }


def test_domain_uses_local_psl_and_idna():
    domain = normalize_declared_target("domain", "Loja.Exämple.CO.UK")
    assert domain["original"] == "Loja.Exämple.CO.UK"
    assert domain["canonical"] == "loja.xn--exmple-cua.co.uk"
    assert domain["attributes"]["public_suffix"] == "co.uk"
    assert domain["attributes"]["registrable_domain"] == "xn--exmple-cua.co.uk"
    assert domain["attributes"]["subdomain"] == "loja"
    assert domain["attributes"]["psl_version"]


def test_url_keeps_complete_value_and_projects_authority_and_path():
    url = normalize_declared_target(
        "url",
        "HTTPS://Portal.Example.CO.UK:8443/a/b?next=%2Fhome#form",
    )
    assert url["original"] == "HTTPS://Portal.Example.CO.UK:8443/a/b?next=%2Fhome#form"
    assert url["canonical"] == "https://portal.example.co.uk:8443/a/b?next=%2Fhome#form"
    assert url["attributes"]["scheme"] == "https"
    assert url["attributes"]["host"] == "portal.example.co.uk"
    assert url["attributes"]["port"] == 8443
    assert url["attributes"]["path"] == "/a/b"
    assert url["attributes"]["registrable_domain"] == "example.co.uk"


def test_explicit_asn_is_context_only_and_validated():
    document = compile_scope_document("192.0.2.10\nAS064512")
    assert [rule["value"] for rule in document["rules"]] == ["192.0.2.10"]
    assert [asset["value"] for asset in document["context_assets"]] == ["AS64512"]
    context = document["context_assets"][0]
    assert context["classification"] == "declared"
    assert context["executable"] is False
    assert context["normalized"]["attributes"]["number"] == "64512"

    with pytest.raises(ScopeNormalizationError):
        normalize_declared_target("asn", "AS4294967296")


def test_ip_relationship_to_declared_cidr_is_derived_not_executable():
    document = compile_scope_document("192.0.2.10\n192.0.2.0/24\nAS64512")
    rules = merge_scope_rules([document["rules"]])
    contexts = merge_scope_context_assets([document["context_assets"]])
    assert {(rule["kind"], rule["value"]) for rule in rules} == {
        ("ip", "192.0.2.10"),
        ("cidr", "192.0.2.0/24"),
    }
    ip_rule = next(rule for rule in rules if rule["kind"] == "ip")
    assert ip_rule["normalized"]["relations"] == [{
        "classification": "derived",
        "type": "contained_by",
        "kind": "cidr",
        "canonical": "192.0.2.0/24",
        "category": "client",
    }]
    assert all(rule["classification"] == "declared" and rule["executable"] for rule in rules)
    assert contexts[0]["value"] == "AS64512"
    assert not any(rule["value"] == "AS64512" for rule in rules)


def test_normalized_duplicates_keep_origins_originals_and_category_precedence():
    client = compile_scope_document("Loja.Exämple.com", source_id="text")
    excluded = compile_scope_document("Excluído: loja.xn--exmple-cua.com", source_id="file")
    rules = merge_scope_rules([client["rules"], excluded["rules"]])
    assert len(rules) == 1
    rule = rules[0]
    assert rule["value"] == "loja.xn--exmple-cua.com"
    assert rule["category"] == "excluded"
    assert rule["original_values"] == ["Loja.Exämple.com", "loja.xn--exmple-cua.com"]
    assert {origin["source_id"] for origin in rule["origins"]} == {"text", "file"}


@pytest.mark.parametrize("kind,value", [
    ("ip", "999.999.999.999"),
    ("cidr", "192.0.2.1/24"),
    ("domain", "not_a_domain"),
    ("url", "https://:443/path"),
    ("asn", "64512"),
])
def test_invalid_value_is_rejected(kind, value):
    with pytest.raises(ScopeNormalizationError):
        normalize_declared_target(kind, value)

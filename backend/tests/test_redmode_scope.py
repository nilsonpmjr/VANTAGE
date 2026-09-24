"""Deterministic scope extraction from trusted operator text."""

import pytest

from redmode_scope import compile_scope_text


def rule_by_value(rules, value):
    return next(rule for rule in rules if rule["value"] == value)


def test_explicit_targets_default_to_client_with_line_provenance():
    rules = compile_scope_text(
        "192.0.2.10\n192.0.2.0/24\nhttps://app.example.test:8443/login\nexample.test"
    )
    assert rule_by_value(rules, "192.0.2.10")["category"] == "client"
    assert rule_by_value(rules, "192.0.2.0/24")["kind"] == "cidr"
    assert rule_by_value(rules, "https://app.example.test:8443/login")["kind"] == "url"
    assert rule_by_value(rules, "example.test")["origin_lines"] == [4]


def test_exclusions_override_client_and_third_party_overrides_default():
    rules = compile_scope_text(
        "192.0.2.10\nTerceiros:\n203.0.113.10\nExclusões:\n192.0.2.10"
    )
    assert rule_by_value(rules, "192.0.2.10")["category"] == "excluded"
    assert rule_by_value(rules, "192.0.2.10")["origin_lines"] == [1, 5]
    assert rule_by_value(rules, "203.0.113.10")["category"] == "third_party"


def test_inline_labels_and_duplicates_are_handled():
    rules = compile_scope_text("Cliente: demo.example.test\nTerceiro: demo.example.test\nExcluir: 198.51.100.0/24")
    assert rule_by_value(rules, "demo.example.test")["category"] == "third_party"
    assert rule_by_value(rules, "demo.example.test")["origin_lines"] == [1, 2]
    assert rule_by_value(rules, "198.51.100.0/24")["category"] == "excluded"


def test_invalid_or_unidentified_input_is_not_executable():
    with pytest.raises(ValueError):
        compile_scope_text("Reunião de alinhamento sem alvos identificáveis.")
    with pytest.raises(ValueError):
        compile_scope_text("999.999.999.999")


def test_ipv6_is_supported_and_email_is_not_a_target():
    rules = compile_scope_text("2001:db8::1\nanalista@example.test")
    assert [(rule["kind"], rule["value"]) for rule in rules] == [("ip", "2001:db8::1")]

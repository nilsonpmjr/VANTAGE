"""
Compatibility re-export — hunting_contracts.

All symbols now live in the `hunting` extension package.
Import directly from `hunting.contracts` in new code.

When the hunting extension package is not installed, all symbols degrade
to safe no-op stubs so the core backend can boot without the premium
extension present.
"""

try:
    from hunting.contracts import *  # noqa: F401, F403
    from hunting.contracts import (
        VALID_HUNTING_ARTIFACT_TYPES,
        VALID_HUNTING_PROVIDER_SCOPES,
        VALID_HUNTING_EXECUTION_MODES,
        VALID_HUNTING_DEPENDENCY_WEIGHTS,
        VALID_HUNTING_RESULT_KINDS,
        normalize_hunting_artifact_type,
        recommend_hunting_execution_profile,
        build_hunting_provider_descriptor,
        build_hunting_query_payload,
        build_hunting_result_payload,
        build_hunting_result_document,
        extract_hunting_result_payload,
    )
except ModuleNotFoundError:
    VALID_HUNTING_ARTIFACT_TYPES: set = set()
    VALID_HUNTING_PROVIDER_SCOPES: set = set()
    VALID_HUNTING_EXECUTION_MODES: set = set()
    VALID_HUNTING_DEPENDENCY_WEIGHTS: set = set()
    VALID_HUNTING_RESULT_KINDS: set = set()

    def normalize_hunting_artifact_type(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def recommend_hunting_execution_profile(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def build_hunting_provider_descriptor(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def build_hunting_query_payload(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def build_hunting_result_payload(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def build_hunting_result_document(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def extract_hunting_result_payload(*a, **kw):
        raise RuntimeError("hunting extension not installed")

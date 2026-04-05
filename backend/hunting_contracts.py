"""
Compatibility re-export — hunting_contracts.

All symbols now live in the `hunting` extension package.
Import directly from `hunting.contracts` in new code.
"""

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

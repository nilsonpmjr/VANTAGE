"""
Compatibility re-export — hunting_runtime.

All symbols now live in the `hunting` extension package.
Import directly from `hunting.runtime` in new code.

When the hunting extension package is not installed, all symbols degrade
to safe no-op stubs so the core backend can boot without the premium
extension present.
"""

try:
    from hunting.runtime import *  # noqa: F401, F403
    from hunting.runtime import (
        TRUTHY_VALUES,
        SHERLOCK_SUPPORTED_ARTIFACT_TYPES,
        MAIGRET_SUPPORTED_ARTIFACT_TYPES,
        HOLEHE_SUPPORTED_ARTIFACT_TYPES,
        SOCIALSCAN_SUPPORTED_ARTIFACT_TYPES,
        SHERLOCK_FOUND_LINE_RE,
        build_hunting_runtime_catalog,
        build_sherlock_provider_descriptor,
        build_maigret_provider_descriptor,
        build_holehe_provider_descriptor,
        build_socialscan_provider_descriptor,
        build_hunting_provider_catalog,
        resolve_hunting_provider_runtime,
        build_sherlock_command,
        run_sherlock_query,
        normalize_sherlock_results,
        build_sherlock_query,
        get_hunting_provider_registry,
    )
except ModuleNotFoundError:
    TRUTHY_VALUES: set = {"1", "true", "yes", "on"}
    SHERLOCK_SUPPORTED_ARTIFACT_TYPES: set = set()
    MAIGRET_SUPPORTED_ARTIFACT_TYPES: set = set()
    HOLEHE_SUPPORTED_ARTIFACT_TYPES: set = set()
    SOCIALSCAN_SUPPORTED_ARTIFACT_TYPES: set = set()
    SHERLOCK_FOUND_LINE_RE = None

    def build_hunting_runtime_catalog(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def build_sherlock_provider_descriptor(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def build_maigret_provider_descriptor(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def build_holehe_provider_descriptor(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def build_socialscan_provider_descriptor(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def build_hunting_provider_catalog(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def resolve_hunting_provider_runtime(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def build_sherlock_command(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def run_sherlock_query(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def normalize_sherlock_results(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def build_sherlock_query(*a, **kw):
        raise RuntimeError("hunting extension not installed")

    def get_hunting_provider_registry(*a, **kw):
        raise RuntimeError("hunting extension not installed")

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from config import settings
from exposure_contracts import build_exposure_provider_descriptor
from hunting_contracts import build_hunting_provider_descriptor, recommend_hunting_execution_profile
from recon.engine import get_module_inventory

MANIFEST_FILENAME = "vantage-plugin.json"
VALID_KINDS = {"brand_pack", "recon_module", "report_exporter", "premium_feature"}
VALID_STATUSES = {"detected", "invalid", "disabled", "enabled", "incompatible"}
VALID_DISTRIBUTION_TIERS = {"core", "local", "premium"}
VALID_REPOSITORY_VISIBILITIES = {"public", "private"}
VALID_UPDATE_CHANNELS = {"bundled", "manual", "licensed"}
VALID_OWNERSHIP_BOUNDARIES = {"core_team", "customer_local", "vantage_premium"}
VALID_PREMIUM_FEATURE_TYPES = {"hunting_provider", "exposure_provider"}
PLUGIN_ROOT = Path(__file__).resolve().parent / "plugins"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
WEB_SOURCE_ROOT = PROJECT_ROOT / "web/src"
BRANDING_SOURCE_ROOT = PROJECT_ROOT / "web/src/branding"
BRANDING_PUBLIC_ROOT = PROJECT_ROOT / "web/public/branding"
LOCAL_PLUGIN_ROOT = PROJECT_ROOT / "backend/extensions/local_plugins"
APPROVED_PUBLIC_ASSET_PREFIXES = ("/branding/",)
REQUIRED_MANIFEST_FIELDS = ("key", "name", "version", "license", "author", "kind", "compatibleCore")


def _version_tuple(raw: str) -> tuple[int, int, int]:
    text = str(raw).strip()
    parts = [int(part) for part in text.split(".")[:3] if part.isdigit()]
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:3])


def _is_core_compatible(spec: str, current_version: str) -> bool:
    spec = str(spec or "").strip()
    current_version = str(current_version or settings.core_version).strip()
    if not spec or spec == "*":
        return True
    if spec == current_version:
        return True
    if spec.endswith(".x"):
        return current_version.startswith(spec[:-2])
    if spec.startswith(">="):
        return _version_tuple(current_version) >= _version_tuple(spec[2:])
    return False


def _safe_load_manifest(manifest_path: Path) -> tuple[dict[str, Any] | None, list[str]]:
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return None, [f"invalid_json:{exc.msg}"]
    except OSError as exc:
        return None, [f"manifest_unreadable:{exc}"]

    if not isinstance(payload, dict):
        return None, ["manifest_must_be_object"]
    return payload, []


def _serialize_manifest_path(manifest_path: Path) -> str:
    backend_root = Path(__file__).resolve().parents[1]
    try:
        return str(manifest_path.relative_to(backend_root))
    except ValueError:
        return str(manifest_path)


def _is_path_under(root: Path, candidate: Path) -> bool:
    root = root.resolve()
    candidate = candidate.resolve()
    return candidate == root or root in candidate.parents


def _resolve_configured_path(raw_path: str) -> Path:
    candidate = Path(str(raw_path).strip())
    if not candidate.is_absolute():
        candidate = PROJECT_ROOT / candidate
    return candidate.resolve()


def _parse_root_list(raw_roots: str) -> list[str]:
    if not raw_roots:
        return []
    return [item.strip() for item in str(raw_roots).split(",") if item.strip()]


def get_configured_plugin_roots() -> list[dict[str, Any]]:
    roots = [
        {
            "path": PLUGIN_ROOT.resolve(),
            "scope": "core",
            "repositoryVisibility": "public",
            "label": "bundled-core",
        },
        {
            "path": _resolve_configured_path(settings.local_plugin_root),
            "scope": "local",
            "repositoryVisibility": "public",
            "label": "local-plugins",
        },
    ]

    for index, raw_root in enumerate(_parse_root_list(settings.premium_plugin_roots), start=1):
        roots.append(
            {
                "path": _resolve_configured_path(raw_root),
                "scope": "premium",
                "repositoryVisibility": "private",
                "label": f"premium-root-{index}",
            }
        )

    return roots


def _normalize_distribution_fields(
    payload: dict[str, Any],
    root_scope: str,
    root_visibility: str,
) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    if not payload.get("distributionTier"):
        warnings.append("distribution_tier_inferred")

    distribution_tier = payload.get("distributionTier") or root_scope or ("core" if payload.get("builtin") else "local")
    repository_visibility = payload.get("repositoryVisibility") or (
        "private" if distribution_tier == "premium" else root_visibility
    )
    update_channel = payload.get("updateChannel") or (
        "bundled" if distribution_tier == "core" else "licensed" if distribution_tier == "premium" else "manual"
    )
    ownership_boundary = payload.get("ownershipBoundary") or (
        "core_team" if distribution_tier == "core" else "vantage_premium" if distribution_tier == "premium" else "customer_local"
    )

    return (
        {
            "distributionTier": distribution_tier,
            "repositoryVisibility": repository_visibility,
            "updateChannel": update_channel,
            "ownershipBoundary": ownership_boundary,
        },
        warnings,
    )


def _validate_manifest(
    payload: dict[str, Any],
    current_core_version: str,
    root_scope: str,
    root_visibility: str,
) -> tuple[list[str], str, dict[str, Any]]:
    errors: list[str] = []
    distribution, warnings = _normalize_distribution_fields(payload, root_scope, root_visibility)

    for field in REQUIRED_MANIFEST_FIELDS:
        if not payload.get(field):
            errors.append(f"missing_{field}")

    if payload.get("kind") and payload["kind"] not in VALID_KINDS:
        errors.append("invalid_kind")

    if distribution["distributionTier"] not in VALID_DISTRIBUTION_TIERS:
        errors.append("invalid_distribution_tier")
    if distribution["repositoryVisibility"] not in VALID_REPOSITORY_VISIBILITIES:
        errors.append("invalid_repository_visibility")
    if distribution["updateChannel"] not in VALID_UPDATE_CHANNELS:
        errors.append("invalid_update_channel")
    if distribution["ownershipBoundary"] not in VALID_OWNERSHIP_BOUNDARIES:
        errors.append("invalid_ownership_boundary")

    if root_scope == "core" and distribution["distributionTier"] != "core":
        errors.append("core_root_requires_core_distribution")
    if root_scope == "premium" and distribution["distributionTier"] != "premium":
        errors.append("premium_root_requires_premium_distribution")
    if distribution["distributionTier"] == "premium" and root_scope != "premium":
        errors.append("premium_plugin_must_live_in_premium_root")

    if distribution["distributionTier"] == "core":
        if not payload.get("builtin", False):
            errors.append("core_plugins_must_be_builtin")
        if payload.get("source") not in (None, "", "core"):
            errors.append("core_plugins_must_use_core_source")
        if distribution["repositoryVisibility"] != "public":
            errors.append("core_plugins_must_be_public")
        if distribution["updateChannel"] != "bundled":
            errors.append("core_plugins_must_use_bundled_update_channel")
        if distribution["ownershipBoundary"] != "core_team":
            errors.append("core_plugins_must_use_core_team_ownership")

    if distribution["distributionTier"] == "local":
        if payload.get("builtin", False):
            errors.append("local_plugins_cannot_be_builtin")

    if distribution["distributionTier"] == "premium":
        if payload.get("builtin", False):
            errors.append("premium_plugins_cannot_be_builtin")
        if distribution["repositoryVisibility"] != "private":
            errors.append("premium_plugins_must_be_private")
        if distribution["ownershipBoundary"] != "vantage_premium":
            errors.append("premium_plugins_must_use_vantage_premium_ownership")

    if payload.get("kind") == "premium_feature" and not payload.get("entrypoint"):
        errors.append("missing_entrypoint")
    if payload.get("kind") == "premium_feature":
        premium_feature_type = payload.get("premiumFeatureType")
        if not premium_feature_type:
            errors.append("missing_premium_feature_type")
        elif premium_feature_type not in VALID_PREMIUM_FEATURE_TYPES:
            errors.append("invalid_premium_feature_type")
        elif premium_feature_type == "hunting_provider":
            try:
                build_hunting_provider_descriptor(
                    key=str(payload.get("key") or ""),
                    name=str(payload.get("name") or ""),
                    version=str(payload.get("version") or ""),
                    artifact_types=list(payload.get("huntingArtifactTypes") or []),
                    provider_scope=list(payload.get("providerScope") or []),
                    entrypoint=str(payload.get("entrypoint") or ""),
                    runtime=str(payload.get("runtime") or "plugin_premium"),
                    isolation_mode=str(payload.get("isolationMode") or "local_process"),
                    capabilities=list(payload.get("capabilities") or []),
                    required_secrets=list(payload.get("requiredSecrets") or payload.get("permissions") or []),
                    requires_kali=bool(payload.get("requiresKali", False)),
                    execution_profile=recommend_hunting_execution_profile(
                        requires_custom_binaries=bool(payload.get("requiresCustomBinaries", False)),
                        requires_browser_automation=bool(payload.get("requiresBrowserAutomation", False)),
                        requires_privileged_network=bool(payload.get("requiresPrivilegedNetwork", False)),
                        requires_linux_toolchain=bool(payload.get("requiresLinuxToolchain", False)),
                        handles_untrusted_targets=bool(payload.get("handlesUntrustedTargets", False)),
                        dependency_weight=str(payload.get("dependencyWeight") or "light"),
                    ),
                )
            except ValueError as exc:
                errors.append(str(exc))
        elif premium_feature_type == "exposure_provider":
            try:
                build_exposure_provider_descriptor(
                    key=str(payload.get("key") or ""),
                    name=str(payload.get("name") or ""),
                    version=str(payload.get("version") or ""),
                    asset_types=list(payload.get("exposureAssetTypes") or []),
                    provider_scope=list(payload.get("providerScope") or []),
                    entrypoint=str(payload.get("entrypoint") or ""),
                    runtime=str(payload.get("runtime") or "plugin_premium"),
                    capabilities=list(payload.get("capabilities") or []),
                    required_secrets=list(payload.get("requiredSecrets") or payload.get("permissions") or []),
                    recommended_schedule=str(payload.get("recommendedSchedule") or "daily"),
                )
            except ValueError as exc:
                errors.append(str(exc))

    public_asset_root = payload.get("publicAssetRoot")
    if public_asset_root and not str(public_asset_root).startswith(APPROVED_PUBLIC_ASSET_PREFIXES):
        errors.append("public_asset_root_not_approved")

    if payload.get("kind") == "brand_pack":
        source_of_truth_path = payload.get("sourceOfTruthPath")
        if not source_of_truth_path:
            errors.append("missing_source_of_truth_path")
        else:
            source_path = (PROJECT_ROOT / str(source_of_truth_path)).resolve()
            if not _is_path_under(BRANDING_SOURCE_ROOT, source_path):
                errors.append("source_of_truth_path_not_approved")
            elif not source_path.exists():
                errors.append("source_of_truth_path_missing")

        if public_asset_root:
            public_asset_path = (BRANDING_PUBLIC_ROOT / str(public_asset_root).replace("/branding/", "", 1)).resolve()
            if not _is_path_under(BRANDING_PUBLIC_ROOT, public_asset_path):
                errors.append("public_asset_root_not_approved")
            elif not public_asset_path.exists():
                errors.append("public_asset_root_missing")

    if payload.get("kind") == "report_exporter":
        source_of_truth_path = payload.get("sourceOfTruthPath")
        if not source_of_truth_path:
            errors.append("missing_source_of_truth_path")
        else:
            source_path = (PROJECT_ROOT / str(source_of_truth_path)).resolve()
            if not _is_path_under(WEB_SOURCE_ROOT, source_path):
                errors.append("source_of_truth_path_not_approved")
            elif not source_path.exists():
                errors.append("source_of_truth_path_missing")

    if errors:
        return [*errors, *warnings], "invalid", distribution

    compatible = _is_core_compatible(str(payload["compatibleCore"]), current_core_version)
    return warnings, "enabled" if compatible else "incompatible", distribution


def _build_descriptor(
    payload: dict[str, Any],
    manifest_path: Path,
    errors: list[str],
    status: str,
    current_core_version: str,
    distribution: dict[str, Any],
    root_scope: str,
    root_label: str,
) -> dict[str, Any]:
    descriptor = {
        "key": payload.get("key") or manifest_path.parent.name,
        "name": payload.get("name") or manifest_path.parent.name,
        "version": payload.get("version"),
        "license": payload.get("license"),
        "author": payload.get("author"),
        "kind": payload.get("kind"),
        "compatibleCore": payload.get("compatibleCore"),
        "status": status if status in VALID_STATUSES else "invalid",
        "errors": errors,
        "description": payload.get("description"),
        "capabilities": payload.get("capabilities", []),
        "permissions": payload.get("permissions", []),
        "entrypoint": payload.get("entrypoint"),
        "publicAssetRoot": payload.get("publicAssetRoot"),
        "sourceOfTruthPath": payload.get("sourceOfTruthPath"),
        "source": payload.get("source", "local"),
        "builtin": bool(payload.get("builtin", False)),
        "distributionTier": distribution["distributionTier"],
        "repositoryVisibility": distribution["repositoryVisibility"],
        "updateChannel": distribution["updateChannel"],
        "ownershipBoundary": distribution["ownershipBoundary"],
        "premiumFeatureType": payload.get("premiumFeatureType"),
        "huntingArtifactTypes": payload.get("huntingArtifactTypes", []),
        "exposureAssetTypes": payload.get("exposureAssetTypes", []),
        "providerScope": payload.get("providerScope", []),
        "requiredSecrets": payload.get("requiredSecrets", []),
        "recommendedSchedule": payload.get("recommendedSchedule"),
        "isolationMode": payload.get("isolationMode"),
        "requiresKali": bool(payload.get("requiresKali", False)),
        "requiresCustomBinaries": bool(payload.get("requiresCustomBinaries", False)),
        "requiresBrowserAutomation": bool(payload.get("requiresBrowserAutomation", False)),
        "requiresPrivilegedNetwork": bool(payload.get("requiresPrivilegedNetwork", False)),
        "requiresLinuxToolchain": bool(payload.get("requiresLinuxToolchain", False)),
        "handlesUntrustedTargets": bool(payload.get("handlesUntrustedTargets", False)),
        "dependencyWeight": payload.get("dependencyWeight"),
        "searchRootScope": root_scope,
        "searchRootLabel": root_label,
        "manifestPath": _serialize_manifest_path(manifest_path),
        "coreVersion": current_core_version,
    }
    return descriptor


def _list_builtin_recon_modules() -> list[dict[str, Any]]:
    return get_module_inventory()


def _enrich_descriptor(descriptor: dict[str, Any]) -> dict[str, Any]:
    if descriptor["kind"] == "recon_module" and descriptor.get("entrypoint") == "backend.recon.modules":
        modules = _list_builtin_recon_modules()
        required_binaries = sorted({binary for module in modules for binary in module["requiredBinaries"]})
        unavailable_modules = [module["key"] for module in modules if not module["available"]]
        supported_target_types = sorted({target for module in modules for target in module["supportedTargetTypes"]})

        descriptor["runtime"] = "builtin_compat"
        descriptor["adapterMode"] = "registry_compat"
        descriptor["preservesCurrentOutput"] = True
        descriptor["modules"] = modules
        descriptor["moduleCount"] = len(modules)
        descriptor["availableModuleCount"] = sum(1 for module in modules if module["available"])
        descriptor["supportedTargetTypes"] = supported_target_types
        descriptor["requiredBinaries"] = required_binaries
        descriptor["unavailableModules"] = unavailable_modules
    if descriptor["kind"] == "report_exporter":
        source_of_truth = descriptor.get("sourceOfTruthPath")
        source_path = (PROJECT_ROOT / str(source_of_truth)).resolve() if source_of_truth else None
        entrypoint = str(descriptor.get("entrypoint") or "")

        descriptor["runtime"] = "frontend_builtin"
        descriptor["delivery"] = "download"
        descriptor["preservesCurrentFlow"] = True
        descriptor["formats"] = list(descriptor.get("capabilities", []))
        descriptor["moduleEntrypoint"] = entrypoint.split(":", 1)[0] if ":" in entrypoint else entrypoint
        descriptor["exportFunction"] = entrypoint.split(":", 1)[1] if ":" in entrypoint else None
        descriptor["sourceFiles"] = (
            [str(source_path.relative_to(PROJECT_ROOT))]
            if source_path and source_path.exists() and source_path.is_file()
            else []
        )
        descriptor["sourceFileCount"] = len(descriptor["sourceFiles"])
    if descriptor["kind"] == "brand_pack":
        descriptor["themes"] = descriptor.get("capabilities", [])
        source_of_truth = descriptor.get("sourceOfTruthPath")
        public_asset_root = descriptor.get("publicAssetRoot")
        source_path = (PROJECT_ROOT / str(source_of_truth)).resolve() if source_of_truth else None
        public_path = (
            BRANDING_PUBLIC_ROOT / str(public_asset_root).replace("/branding/", "", 1)
        ).resolve() if public_asset_root else None
        descriptor["sourceFiles"] = (
            sorted(
                str(path.relative_to(PROJECT_ROOT))
                for path in source_path.glob("*")
                if path.is_file()
            )
            if source_path and source_path.exists()
            else []
        )
        descriptor["publicAssets"] = (
            sorted(
                str(path.relative_to(PROJECT_ROOT))
                for path in public_path.glob("*")
                if path.is_file()
            )
            if public_path and public_path.exists()
            else []
        )
        descriptor["sourceFileCount"] = len(descriptor["sourceFiles"])
        descriptor["publicAssetCount"] = len(descriptor["publicAssets"])
    if descriptor["kind"] == "premium_feature":
        descriptor["runtime"] = descriptor.get("runtime") or "plugin_premium"
        descriptor["delivery"] = descriptor.get("delivery") or "licensed_package"
        descriptor["productSurface"] = descriptor.get("productSurface") or descriptor.get("capabilities", [])
        descriptor["requiresLicenseSecret"] = bool(descriptor.get("permissions"))
        if descriptor["status"] != "invalid" and descriptor.get("premiumFeatureType") == "hunting_provider":
            hunting_provider = build_hunting_provider_descriptor(
                key=str(descriptor.get("key") or ""),
                name=str(descriptor.get("name") or ""),
                version=str(descriptor.get("version") or ""),
                artifact_types=list(descriptor.get("huntingArtifactTypes") or descriptor.get("capabilities") or []),
                provider_scope=list(descriptor.get("providerScope") or []),
                entrypoint=str(descriptor.get("entrypoint") or ""),
                runtime=str(descriptor.get("runtime") or "plugin_premium"),
                isolation_mode=str(descriptor.get("isolationMode") or "local_process"),
                capabilities=list(descriptor.get("capabilities") or []),
                required_secrets=list(descriptor.get("requiredSecrets") or descriptor.get("permissions") or []),
                requires_kali=bool(descriptor.get("requiresKali", False)),
                execution_profile=recommend_hunting_execution_profile(
                    requires_custom_binaries=bool(descriptor.get("requiresCustomBinaries", False)),
                    requires_browser_automation=bool(descriptor.get("requiresBrowserAutomation", False)),
                    requires_privileged_network=bool(descriptor.get("requiresPrivilegedNetwork", False)),
                    requires_linux_toolchain=bool(descriptor.get("requiresLinuxToolchain", False)),
                    handles_untrusted_targets=bool(descriptor.get("handlesUntrustedTargets", False)),
                    dependency_weight=str(descriptor.get("dependencyWeight") or "light"),
                ),
            )
            descriptor["huntingProvider"] = hunting_provider
            descriptor["productSurface"] = hunting_provider["providerScope"]
            descriptor["huntingArtifactTypes"] = hunting_provider["artifactTypes"]
            descriptor["providerScope"] = hunting_provider["providerScope"]
            descriptor["requiredSecrets"] = hunting_provider["requiredSecrets"]
            descriptor["isolationMode"] = hunting_provider["executionProfile"]["mode"]
            descriptor["requiresKali"] = hunting_provider["requiresKali"]
            descriptor["executionProfile"] = hunting_provider["executionProfile"]
        if descriptor["status"] != "invalid" and descriptor.get("premiumFeatureType") == "exposure_provider":
            exposure_provider = build_exposure_provider_descriptor(
                key=str(descriptor.get("key") or ""),
                name=str(descriptor.get("name") or ""),
                version=str(descriptor.get("version") or ""),
                asset_types=list(descriptor.get("exposureAssetTypes") or descriptor.get("capabilities") or []),
                provider_scope=list(descriptor.get("providerScope") or []),
                entrypoint=str(descriptor.get("entrypoint") or ""),
                runtime=str(descriptor.get("runtime") or "plugin_premium"),
                capabilities=list(descriptor.get("capabilities") or []),
                required_secrets=list(descriptor.get("requiredSecrets") or descriptor.get("permissions") or []),
                recommended_schedule=str(descriptor.get("recommendedSchedule") or "daily"),
            )
            descriptor["exposureProvider"] = exposure_provider
            descriptor["productSurface"] = exposure_provider["providerScope"]
            descriptor["exposureAssetTypes"] = exposure_provider["assetTypes"]
            descriptor["providerScope"] = exposure_provider["providerScope"]
            descriptor["requiredSecrets"] = exposure_provider["requiredSecrets"]
            descriptor["recommendedSchedule"] = exposure_provider["recommendedSchedule"]
    return descriptor


def load_extensions_registry(
    plugin_root: Path | None = None,
    current_core_version: str | None = None,
    plugin_roots: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    current_version = current_core_version or settings.core_version
    descriptors: list[dict[str, Any]] = []
    roots = plugin_roots or [
        {
            "path": (plugin_root or PLUGIN_ROOT).resolve(),
            "scope": "core" if plugin_root is None else "local",
            "repositoryVisibility": "public",
            "label": "bundled-core" if plugin_root is None else "ad-hoc-root",
        }
    ]

    for root in roots:
        root_path = Path(root["path"]).resolve()
        root_scope = str(root["scope"])
        root_visibility = str(root["repositoryVisibility"])
        root_label = str(root.get("label") or root_scope)

        if not root_path.exists():
            continue

        for manifest_path in sorted(root_path.glob(f"*/{MANIFEST_FILENAME}")):
            payload, load_errors = _safe_load_manifest(manifest_path)
            if payload is None:
                descriptors.append(
                    {
                        "key": manifest_path.parent.name,
                        "name": manifest_path.parent.name,
                        "version": None,
                        "license": None,
                        "author": None,
                        "kind": None,
                        "compatibleCore": None,
                        "status": "invalid",
                        "errors": load_errors,
                        "description": None,
                        "capabilities": [],
                        "permissions": [],
                        "entrypoint": None,
                        "publicAssetRoot": None,
                        "source": "local",
                        "builtin": False,
                        "distributionTier": root_scope,
                        "repositoryVisibility": root_visibility,
                        "updateChannel": None,
                        "ownershipBoundary": None,
                        "searchRootScope": root_scope,
                        "searchRootLabel": root_label,
                        "manifestPath": _serialize_manifest_path(manifest_path),
                        "coreVersion": current_version,
                    }
                )
                continue

            validation_errors, status, distribution = _validate_manifest(
                payload,
                current_version,
                root_scope,
                root_visibility,
            )
            descriptor = _build_descriptor(
                payload,
                manifest_path,
                validation_errors,
                status,
                current_version,
                distribution,
                root_scope,
                root_label,
            )
            descriptors.append(_enrich_descriptor(descriptor))

    by_key: dict[str, list[dict[str, Any]]] = {}
    for descriptor in descriptors:
        by_key.setdefault(str(descriptor["key"]), []).append(descriptor)

    for key, items in by_key.items():
        if len(items) <= 1:
            continue
        for descriptor in items:
            descriptor["status"] = "invalid"
            descriptor["errors"] = sorted(set([*descriptor.get("errors", []), f"duplicate_key:{key}"]))

    return descriptors


def get_extensions_catalog(app, refresh: bool = False) -> list[dict[str, Any]]:
    registry = getattr(app.state, "extensions_registry", None)
    if registry is None or refresh:
        registry = load_extensions_registry(plugin_roots=get_configured_plugin_roots())
        app.state.extensions_registry = registry
    return registry

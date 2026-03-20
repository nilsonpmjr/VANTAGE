from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from config import settings
from recon.engine import get_module_inventory

MANIFEST_FILENAME = "vantage-plugin.json"
VALID_KINDS = {"brand_pack", "recon_module", "report_exporter"}
VALID_STATUSES = {"detected", "invalid", "disabled", "enabled", "incompatible"}
PLUGIN_ROOT = Path(__file__).resolve().parent / "plugins"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
WEB_SOURCE_ROOT = PROJECT_ROOT / "web/src"
BRANDING_SOURCE_ROOT = PROJECT_ROOT / "web/src/branding"
BRANDING_PUBLIC_ROOT = PROJECT_ROOT / "web/public/branding"
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


def _validate_manifest(payload: dict[str, Any], current_core_version: str) -> tuple[list[str], str]:
    errors: list[str] = []

    for field in REQUIRED_MANIFEST_FIELDS:
        if not payload.get(field):
            errors.append(f"missing_{field}")

    if payload.get("kind") and payload["kind"] not in VALID_KINDS:
        errors.append("invalid_kind")

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
        return errors, "invalid"

    compatible = _is_core_compatible(str(payload["compatibleCore"]), current_core_version)
    return [], "enabled" if compatible else "incompatible"


def _build_descriptor(
    payload: dict[str, Any],
    manifest_path: Path,
    errors: list[str],
    status: str,
    current_core_version: str,
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
    return descriptor


def load_extensions_registry(
    plugin_root: Path | None = None,
    current_core_version: str | None = None,
) -> list[dict[str, Any]]:
    root = plugin_root or PLUGIN_ROOT
    current_version = current_core_version or settings.core_version
    descriptors: list[dict[str, Any]] = []

    if not root.exists():
        return descriptors

    for manifest_path in sorted(root.glob(f"*/{MANIFEST_FILENAME}")):
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
                    "manifestPath": _serialize_manifest_path(manifest_path),
                    "coreVersion": current_version,
                }
            )
            continue

        validation_errors, status = _validate_manifest(payload, current_version)
        descriptor = _build_descriptor(payload, manifest_path, validation_errors, status, current_version)
        descriptors.append(_enrich_descriptor(descriptor))

    return descriptors


def get_extensions_catalog(app, refresh: bool = False) -> list[dict[str, Any]]:
    registry = getattr(app.state, "extensions_registry", None)
    if registry is None or refresh:
        registry = load_extensions_registry()
        app.state.extensions_registry = registry
    return registry

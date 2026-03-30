from __future__ import annotations

import json

import pytest
from bson import ObjectId

from extensions.registry import load_extensions_registry
from main import app
from recon.engine import get_available_modules


def test_load_extensions_registry_discovers_builtin_manifests():
    registry = load_extensions_registry()

    keys = {item["key"] for item in registry}
    assert "brand-vantage" in keys
    assert "brand-generic" in keys
    assert "recon-builtins" in keys
    assert "report-exporter-pdf" in keys

    recon_descriptor = next(item for item in registry if item["key"] == "recon-builtins")
    assert recon_descriptor["status"] == "enabled"
    assert recon_descriptor["kind"] == "recon_module"
    assert recon_descriptor["runtime"] == "builtin_compat"
    assert recon_descriptor["adapterMode"] == "registry_compat"
    assert recon_descriptor["preservesCurrentOutput"] is True
    assert recon_descriptor["moduleCount"] >= 1
    assert recon_descriptor["availableModuleCount"] >= 1
    assert "domain" in recon_descriptor["supportedTargetTypes"] or "both" in recon_descriptor["supportedTargetTypes"]
    assert "requiredBinaries" in recon_descriptor
    assert "unavailableModules" in recon_descriptor
    assert len(recon_descriptor["modules"]) >= 1
    assert {
        "key",
        "name",
        "runtime",
        "entrypoint",
        "requiredBinaries",
        "supportedTargetTypes",
        "timeoutSeconds",
        "available",
        "preservesCurrentOutput",
    }.issubset(recon_descriptor["modules"][0].keys())

    brand_descriptor = next(item for item in registry if item["key"] == "brand-vantage")
    assert brand_descriptor["status"] == "enabled"
    assert brand_descriptor["kind"] == "brand_pack"
    assert brand_descriptor["distributionTier"] == "core"
    assert brand_descriptor["repositoryVisibility"] == "public"
    assert brand_descriptor["updateChannel"] == "bundled"
    assert brand_descriptor["ownershipBoundary"] == "core_team"
    assert brand_descriptor["sourceOfTruthPath"] == "web/src/branding/vantage"
    assert brand_descriptor["sourceFileCount"] >= 1
    assert brand_descriptor["publicAssetCount"] >= 1

    report_descriptor = next(item for item in registry if item["key"] == "report-exporter-pdf")
    assert report_descriptor["status"] == "enabled"
    assert report_descriptor["kind"] == "report_exporter"
    assert report_descriptor["runtime"] == "frontend_builtin"
    assert report_descriptor["delivery"] == "download"
    assert report_descriptor["preservesCurrentFlow"] is True
    assert report_descriptor["formats"] == ["pdf"]
    assert report_descriptor["moduleEntrypoint"] == "frontend_operational_architect.src.utils.pdfReport"
    assert report_descriptor["exportFunction"] == "generatePdfReport"
    assert report_descriptor["sourceFiles"] == ["web/src/utils/pdfReport.ts"]
    assert report_descriptor["sourceFileCount"] == 1


def test_load_extensions_registry_marks_invalid_manifest(tmp_path):
    plugin_dir = tmp_path / "broken-plugin"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text("{ invalid json", encoding="utf-8")

    registry = load_extensions_registry(plugin_root=tmp_path, current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["key"] == "broken-plugin"
    assert registry[0]["status"] == "invalid"
    assert registry[0]["errors"]


def test_load_extensions_registry_marks_incompatible_manifest(tmp_path):
    plugin_dir = tmp_path / "future-plugin"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text(json.dumps({
        "key": "future-plugin",
        "name": "Future Plugin",
        "version": "1.0.0",
        "license": "AGPL-3.0-or-later",
        "author": "QA",
        "kind": "report_exporter",
        "compatibleCore": "2.x",
        "distributionTier": "local",
        "repositoryVisibility": "public",
        "updateChannel": "manual",
        "ownershipBoundary": "customer_local",
        "sourceOfTruthPath": "web/src/utils/pdfReport.ts",
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_root=tmp_path, current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["status"] == "incompatible"


def test_load_extensions_registry_supports_local_plugin_root(tmp_path):
    local_root = tmp_path / "local"
    plugin_dir = local_root / "customer-brand"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text(json.dumps({
        "key": "customer-brand",
        "name": "Customer Brand",
        "version": "1.0.0",
        "license": "Private",
        "author": "Customer",
        "kind": "brand_pack",
        "compatibleCore": "1.x",
        "distributionTier": "local",
        "repositoryVisibility": "public",
        "updateChannel": "manual",
        "ownershipBoundary": "customer_local",
        "publicAssetRoot": "/branding/generic",
        "sourceOfTruthPath": "web/src/branding/generic",
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_roots=[
        {
            "path": local_root,
            "scope": "local",
            "repositoryVisibility": "public",
            "label": "local-plugins",
        }
    ], current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["key"] == "customer-brand"
    assert registry[0]["status"] == "enabled"
    assert registry[0]["distributionTier"] == "local"
    assert registry[0]["ownershipBoundary"] == "customer_local"
    assert registry[0]["searchRootScope"] == "local"


def test_load_extensions_registry_marks_brand_pack_invalid_when_source_missing(tmp_path):
    plugin_dir = tmp_path / "brand-missing"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text(json.dumps({
        "key": "brand-missing",
        "name": "Broken Brand",
        "version": "1.0.0",
        "license": "AGPL-3.0-or-later",
        "author": "QA",
        "kind": "brand_pack",
        "compatibleCore": "1.x",
        "distributionTier": "local",
        "repositoryVisibility": "public",
        "updateChannel": "manual",
        "ownershipBoundary": "customer_local",
        "publicAssetRoot": "/branding/missing",
        "sourceOfTruthPath": "web/src/branding/missing"
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_root=tmp_path, current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["status"] == "invalid"
    assert "source_of_truth_path_missing" in registry[0]["errors"]


def test_load_extensions_registry_marks_report_exporter_invalid_when_source_missing(tmp_path):
    plugin_dir = tmp_path / "report-exporter-missing"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text(json.dumps({
        "key": "report-exporter-missing",
        "name": "Broken Exporter",
        "version": "1.0.0",
        "license": "AGPL-3.0-or-later",
        "author": "QA",
        "kind": "report_exporter",
        "compatibleCore": "1.x",
        "distributionTier": "local",
        "repositoryVisibility": "public",
        "updateChannel": "manual",
        "ownershipBoundary": "customer_local",
        "capabilities": ["pdf"],
        "entrypoint": "frontend_operational_architect.src.utils.pdfReport:generatePdfReport",
        "sourceOfTruthPath": "web/src/utils/missing.ts"
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_root=tmp_path, current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["status"] == "invalid"
    assert "source_of_truth_path_missing" in registry[0]["errors"]


def test_get_available_modules_keeps_existing_sidebar_shape():
    modules = get_available_modules()

    assert modules
    assert set(modules[0].keys()) == {"name", "display_name", "target_types", "timeout_seconds"}


@pytest.mark.asyncio
async def test_admin_extensions_catalog_returns_registry(async_client, auth_headers):
    resp = await async_client.get("/api/admin/extensions", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["core_version"] == "1.0.0"
    assert any(root["scope"] == "core" for root in data["search_roots"])
    assert any(item["key"] == "brand-vantage" for item in data["items"])


@pytest.mark.asyncio
async def test_admin_extensions_catalog_can_force_refresh(async_client, auth_headers):
    app.state.extensions_registry = [{"key": "stale-plugin", "status": "enabled"}]

    resp = await async_client.get("/api/admin/extensions?refresh=true", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    keys = {item["key"] for item in data["items"]}
    assert "stale-plugin" not in keys
    assert "brand-vantage" in keys


@pytest.mark.asyncio
async def test_admin_extensions_catalog_applies_runtime_disable(async_client, auth_headers):
    disable_resp = await async_client.post("/api/admin/extensions/brand-vantage/disable", headers=auth_headers)
    assert disable_resp.status_code == 200

    resp = await async_client.get("/api/admin/extensions", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    brand = next(item for item in data["items"] if item["key"] == "brand-vantage")
    assert brand["status"] == "disabled"
    assert brand["operationalState"]["enabled"] is False


@pytest.mark.asyncio
async def test_admin_extensions_catalog_serializes_existing_runtime_state(async_client, auth_headers, fake_db):
    fake_db.extension_catalog_state._data.append(
        {
            "_id": ObjectId(),
            "key": "brand-vantage",
            "enabled": True,
            "hidden": False,
            "last_action": "install",
        }
    )

    response = await async_client.post("/api/admin/extensions/brand-vantage/disable", headers=auth_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["key"] == "brand-vantage"
    assert payload["state"]["enabled"] is False
    assert "_id" not in payload["state"]


@pytest.mark.asyncio
async def test_admin_extensions_catalog_forbids_tech(async_client):
    from auth import create_access_token

    tech_headers = {"Authorization": f"Bearer {create_access_token({'sub': 'techuser', 'role': 'tech'})}"}
    resp = await async_client.get("/api/admin/extensions", headers=tech_headers)

    assert resp.status_code == 403


def test_load_extensions_registry_supports_external_premium_root(tmp_path):
    premium_root = tmp_path / "premium"
    plugin_dir = premium_root / "premium-hunting"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text(json.dumps({
        "key": "premium-hunting",
        "name": "Premium Hunting",
        "version": "0.1.0",
        "license": "Commercial",
        "author": "VANTAGE Premium",
        "kind": "premium_feature",
        "premiumFeatureType": "hunting_provider",
        "compatibleCore": "1.x",
        "distributionTier": "premium",
        "repositoryVisibility": "private",
        "updateChannel": "licensed",
        "ownershipBoundary": "vantage_premium",
        "capabilities": ["hunting"],
        "providerScope": ["identity", "social"],
        "huntingArtifactTypes": ["username", "alias", "email"],
        "requiredSecrets": ["license.local"],
        "requiresCustomBinaries": True,
        "handlesUntrustedTargets": True,
        "dependencyWeight": "medium",
        "entrypoint": "premium.hunting",
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_roots=[
        {
            "path": premium_root,
            "scope": "premium",
            "repositoryVisibility": "private",
            "label": "premium-root-1",
        }
    ], current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["key"] == "premium-hunting"
    assert registry[0]["status"] == "enabled"
    assert registry[0]["distributionTier"] == "premium"
    assert registry[0]["repositoryVisibility"] == "private"
    assert registry[0]["searchRootScope"] == "premium"
    assert registry[0]["runtime"] == "plugin_premium"
    assert registry[0]["premiumFeatureType"] == "hunting_provider"
    assert registry[0]["huntingArtifactTypes"] == ["alias", "email", "username"]
    assert registry[0]["providerScope"] == ["identity", "social"]
    assert registry[0]["requiredSecrets"] == ["license.local"]
    assert registry[0]["isolationMode"] == "isolated_container"
    assert registry[0]["requiresKali"] is False
    assert registry[0]["executionProfile"]["operationalRisk"] == "medium"
    assert registry[0]["executionProfile"]["performanceProfile"] == "balanced"


def test_load_extensions_registry_supports_exposure_provider_metadata(tmp_path):
    premium_root = tmp_path / "premium"
    plugin_dir = premium_root / "premium-exposure"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text(json.dumps({
        "key": "premium-exposure",
        "name": "Premium Exposure",
        "version": "0.1.0",
        "license": "Commercial",
        "author": "VANTAGE Premium",
        "kind": "premium_feature",
        "premiumFeatureType": "exposure_provider",
        "compatibleCore": "1.x",
        "distributionTier": "premium",
        "repositoryVisibility": "private",
        "updateChannel": "licensed",
        "ownershipBoundary": "vantage_premium",
        "capabilities": ["credential", "brand"],
        "providerScope": ["credential", "brand"],
        "exposureAssetTypes": ["domain", "brand_keyword"],
        "requiredSecrets": ["license.local"],
        "recommendedSchedule": "daily",
        "entrypoint": "premium.exposure",
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_roots=[
        {
            "path": premium_root,
            "scope": "premium",
            "repositoryVisibility": "private",
            "label": "premium-root-1",
        }
    ], current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["status"] == "enabled"
    assert registry[0]["premiumFeatureType"] == "exposure_provider"
    assert registry[0]["exposureAssetTypes"] == ["brand_keyword", "domain"]
    assert registry[0]["providerScope"] == ["brand", "credential"]
    assert registry[0]["requiredSecrets"] == ["license.local"]
    assert registry[0]["recommendedSchedule"] == "daily"


def test_load_extensions_registry_requires_exposure_metadata_for_premium_provider(tmp_path):
    premium_root = tmp_path / "premium"
    plugin_dir = premium_root / "premium-exposure-missing-assets"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text(json.dumps({
        "key": "premium-exposure-missing-assets",
        "name": "Premium Exposure Missing Assets",
        "version": "0.1.0",
        "license": "Commercial",
        "author": "VANTAGE Premium",
        "kind": "premium_feature",
        "premiumFeatureType": "exposure_provider",
        "compatibleCore": "1.x",
        "distributionTier": "premium",
        "repositoryVisibility": "private",
        "updateChannel": "licensed",
        "ownershipBoundary": "vantage_premium",
        "providerScope": ["credential"],
        "entrypoint": "premium.exposure",
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_roots=[
        {
            "path": premium_root,
            "scope": "premium",
            "repositoryVisibility": "private",
            "label": "premium-root-1",
        }
    ], current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["status"] == "invalid"
    assert "exposure_asset_types_required" in registry[0]["errors"]


def test_load_extensions_registry_warns_when_distribution_tier_is_inferred(tmp_path):
    premium_root = tmp_path / "premium"
    plugin_dir = premium_root / "premium-hunting"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text(json.dumps({
        "key": "premium-hunting",
        "name": "Premium Hunting",
        "version": "0.1.0",
        "license": "Commercial",
        "author": "VANTAGE Premium",
        "kind": "premium_feature",
        "premiumFeatureType": "hunting_provider",
        "compatibleCore": "1.x",
        "repositoryVisibility": "private",
        "updateChannel": "licensed",
        "ownershipBoundary": "vantage_premium",
        "providerScope": ["identity"],
        "huntingArtifactTypes": ["username"],
        "requiredSecrets": ["license.local"],
        "entrypoint": "premium.hunting",
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_roots=[
        {
            "path": premium_root,
            "scope": "premium",
            "repositoryVisibility": "private",
            "label": "premium-root-1",
        }
    ], current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["status"] == "enabled"
    assert "distribution_tier_inferred" in registry[0]["errors"]


def test_load_extensions_registry_allows_kali_only_under_explicit_gate(tmp_path):
    premium_root = tmp_path / "premium"
    plugin_dir = premium_root / "premium-spiderfoot"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text(json.dumps({
        "key": "premium-spiderfoot",
        "name": "Premium SpiderFoot",
        "version": "0.1.0",
        "license": "Commercial",
        "author": "VANTAGE Premium",
        "kind": "premium_feature",
        "premiumFeatureType": "hunting_provider",
        "compatibleCore": "1.x",
        "distributionTier": "premium",
        "repositoryVisibility": "private",
        "updateChannel": "licensed",
        "ownershipBoundary": "vantage_premium",
        "providerScope": ["correlation"],
        "huntingArtifactTypes": ["account"],
        "requiredSecrets": ["license.local"],
        "requiresPrivilegedNetwork": True,
        "requiresLinuxToolchain": True,
        "dependencyWeight": "heavy",
        "requiresKali": True,
        "entrypoint": "premium.spiderfoot",
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_roots=[
        {
            "path": premium_root,
            "scope": "premium",
            "repositoryVisibility": "private",
            "label": "premium-root-1",
        }
    ], current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["status"] == "enabled"
    assert registry[0]["isolationMode"] == "kali_container"
    assert registry[0]["requiresKali"] is True
    assert registry[0]["executionProfile"]["allowedByDefault"] is False


def test_load_extensions_registry_requires_entrypoint_for_premium_feature(tmp_path):
    premium_root = tmp_path / "premium"
    plugin_dir = premium_root / "premium-missing-entrypoint"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text(json.dumps({
        "key": "premium-missing-entrypoint",
        "name": "Premium Missing Entrypoint",
        "version": "0.1.0",
        "license": "Commercial",
        "author": "VANTAGE Premium",
        "kind": "premium_feature",
        "premiumFeatureType": "hunting_provider",
        "compatibleCore": "1.x",
        "distributionTier": "premium",
        "repositoryVisibility": "private",
        "updateChannel": "licensed",
        "ownershipBoundary": "vantage_premium",
        "providerScope": ["identity"],
        "huntingArtifactTypes": ["username"],
        "requiredSecrets": ["license.local"],
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_roots=[
        {
            "path": premium_root,
            "scope": "premium",
            "repositoryVisibility": "private",
            "label": "premium-root-1",
        }
    ], current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["status"] == "invalid"
    assert "missing_entrypoint" in registry[0]["errors"]


def test_load_extensions_registry_requires_hunting_metadata_for_premium_provider(tmp_path):
    premium_root = tmp_path / "premium"
    plugin_dir = premium_root / "premium-hunting-missing-scope"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text(json.dumps({
        "key": "premium-hunting-missing-scope",
        "name": "Premium Hunting Missing Scope",
        "version": "0.1.0",
        "license": "Commercial",
        "author": "VANTAGE Premium",
        "kind": "premium_feature",
        "premiumFeatureType": "hunting_provider",
        "compatibleCore": "1.x",
        "distributionTier": "premium",
        "repositoryVisibility": "private",
        "updateChannel": "licensed",
        "ownershipBoundary": "vantage_premium",
        "huntingArtifactTypes": ["username"],
        "entrypoint": "premium.hunting",
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_roots=[
        {
            "path": premium_root,
            "scope": "premium",
            "repositoryVisibility": "private",
            "label": "premium-root-1",
        }
    ], current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["status"] == "invalid"
    assert "provider_scope_required" in registry[0]["errors"]


def test_load_extensions_registry_rejects_premium_plugin_inside_core_root(tmp_path):
    plugin_dir = tmp_path / "premium-inside-core"
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "vantage-plugin.json").write_text(json.dumps({
        "key": "premium-inside-core",
        "name": "Premium Inside Core",
        "version": "0.1.0",
        "license": "Commercial",
        "author": "QA",
        "kind": "premium_feature",
        "premiumFeatureType": "hunting_provider",
        "compatibleCore": "1.x",
        "distributionTier": "premium",
        "repositoryVisibility": "private",
        "updateChannel": "licensed",
        "ownershipBoundary": "vantage_premium",
        "providerScope": ["identity"],
        "huntingArtifactTypes": ["username"],
        "entrypoint": "premium.hunting",
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_roots=[
        {
            "path": tmp_path,
            "scope": "core",
            "repositoryVisibility": "public",
            "label": "bundled-core",
        }
    ], current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["status"] == "invalid"
    assert "core_root_requires_core_distribution" in registry[0]["errors"]
    assert "premium_plugin_must_live_in_premium_root" in registry[0]["errors"]

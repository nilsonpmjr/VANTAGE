from __future__ import annotations

import json

import pytest

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
    assert report_descriptor["moduleEntrypoint"] == "web.src.utils.pdfGenerator"
    assert report_descriptor["exportFunction"] == "generatePDFReport"
    assert report_descriptor["sourceFiles"] == ["web/src/utils/pdfGenerator.js"]
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
        "sourceOfTruthPath": "web/src/utils/pdfGenerator.js",
    }), encoding="utf-8")

    registry = load_extensions_registry(plugin_root=tmp_path, current_core_version="1.0.0")

    assert len(registry) == 1
    assert registry[0]["status"] == "incompatible"


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
        "capabilities": ["pdf"],
        "entrypoint": "web.src.utils.pdfGenerator:generatePDFReport",
        "sourceOfTruthPath": "web/src/utils/missing.js"
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
async def test_admin_extensions_catalog_forbids_tech(async_client):
    from auth import create_access_token

    tech_headers = {"Authorization": f"Bearer {create_access_token({'sub': 'techuser', 'role': 'tech'})}"}
    resp = await async_client.get("/api/admin/extensions", headers=tech_headers)

    assert resp.status_code == 403

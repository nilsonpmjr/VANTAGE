"""Manual findings keep immutable revisions and project isolation."""

from datetime import datetime, timezone

import pytest

from auth import create_access_token


def headers_for(username: str, role: str = "tech"):
    return {"Authorization": f"Bearer {create_access_token({'sub': username, 'role': role})}"}


async def project(async_client, slug: str):
    response = await async_client.post("/api/redmode/projects", json={"slug": slug, "display_name": slug}, headers=headers_for("admin", "admin"))
    assert response.status_code == 201


def payload(evidence_ids=None):
    return {
        "title": "Serviço exposto", "description": "Observação do operador",
        "severity": "medium", "phase": "vulnerability-analysis",
        "targets": ["192.0.2.10"], "evidence_ids": evidence_ids or [],
    }


@pytest.mark.asyncio
async def test_create_edit_revisions_and_private_activity(async_client, fake_db):
    await project(async_client, "cliente-demo")
    evidence = await async_client.post("/api/redmode/projects/cliente-demo/evidence", data={"text": "prova", "phase": "reporting"}, headers=headers_for("admin", "admin"))
    assert evidence.status_code == 201
    path = "/api/redmode/projects/cliente-demo/findings"
    created = await async_client.post(path, json=payload([evidence.json()["id"]]), headers=headers_for("admin", "admin"))
    assert created.status_code == 201, created.text
    first = created.json()
    assert first["origin"] == "human"
    assert first["revision"]["number"] == 1
    assert first["revision"]["previous_revision_id"] is None
    assert first["evidence_ids"] == [evidence.json()["id"]]
    detail = await async_client.get(f"{path}/{first['id']}", headers=headers_for("admin", "admin"))
    assert detail.json()["title"] == "Serviço exposto"

    changed = payload([evidence.json()["id"]])
    changed["description"] = "Nova observação"
    changed["expected_revision_id"] = first["revision"]["id"]
    updated = await async_client.put(f"{path}/{first['id']}", json=changed, headers=headers_for("admin", "admin"))
    assert updated.status_code == 200, updated.text
    second = updated.json()
    assert second["revision"]["number"] == 2
    assert second["revision"]["previous_revision_id"] == first["revision"]["id"]
    history = await async_client.get(f"{path}/{first['id']}/revisions", headers=headers_for("admin", "admin"))
    assert [item["description"] for item in history.json()["items"]] == ["Nova observação", "Observação do operador"]
    conflict = await async_client.put(f"{path}/{first['id']}", json=changed, headers=headers_for("admin", "admin"))
    assert conflict.status_code == 409
    activity = await async_client.get("/api/redmode/projects/cliente-demo/activity", headers=headers_for("admin", "admin"))
    assert [item["type"] for item in activity.json()["items"]][-2:] == ["finding_created", "finding_updated"]
    assert "Nova observação" not in str(activity.json())

    await fake_db.users.update_one({"username": "techuser"}, {"$set": {"extra_permissions": ["redmode:access"]}})
    for endpoint in (path, f"{path}/{first['id']}", f"{path}/{first['id']}/revisions"):
        assert (await async_client.get(endpoint, headers=headers_for("techuser"))).status_code == 403
    assert (await async_client.put(f"{path}/{first['id']}", json=changed, headers=headers_for("techuser"))).status_code == 403
    feed = await async_client.get("/api/redmode/projects", headers=headers_for("techuser"))
    assert "Serviço exposto" not in feed.text


@pytest.mark.asyncio
async def test_rejects_foreign_evidence_and_invalid_fields(async_client):
    await project(async_client, "cliente-demo")
    await project(async_client, "outro-cliente")
    evidence = await async_client.post("/api/redmode/projects/outro-cliente/evidence", data={"text": "prova", "phase": "reporting"}, headers=headers_for("admin", "admin"))
    path = "/api/redmode/projects/cliente-demo/findings"
    foreign = await async_client.post(path, json=payload([evidence.json()["id"]]), headers=headers_for("admin", "admin"))
    assert foreign.status_code == 422
    invalid = payload()
    invalid["severity"] = "urgent"
    assert (await async_client.post(path, json=invalid, headers=headers_for("admin", "admin"))).status_code == 422
    assert (await async_client.get(path, headers=headers_for("admin", "admin"))).json()["items"] == []


@pytest.mark.asyncio
async def test_evidence_created_for_finding_appears_in_its_associations(async_client):
    await project(async_client, "cliente-demo")
    path = "/api/redmode/projects/cliente-demo/findings"
    finding = await async_client.post(path, json=payload(), headers=headers_for("admin", "admin"))
    assert finding.status_code == 201
    evidence = await async_client.post(
        "/api/redmode/projects/cliente-demo/evidence",
        data={"text": "prova posterior", "phase": "reporting", "finding_id": finding.json()["id"]},
        headers=headers_for("admin", "admin"),
    )
    assert evidence.status_code == 201
    detail = await async_client.get(f"{path}/{finding.json()['id']}", headers=headers_for("admin", "admin"))
    assert detail.json()["evidence_ids"] == [evidence.json()["id"]]
    revisions = await async_client.get(f"{path}/{finding.json()['id']}/revisions", headers=headers_for("admin", "admin"))
    assert revisions.json()["items"][0]["evidence_ids"] == []


@pytest.mark.asyncio
async def test_document_draft_starts_from_template_is_private_and_publishes_markdown(async_client, fake_db):
    await project(async_client, "cliente-demo")
    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"extra_permissions": ["redmode:access"]}},
    )
    await fake_db.redmode_projects.update_one(
        {"_id": "cliente-demo"},
        {"$set": {"members": ["admin", "techuser"]}},
    )
    note = await async_client.post(
        "/api/redmode/projects/cliente-demo/evidence/notes",
        json={
            "title": "Captura HTTP", "markdown": "Resposta do serviço",
            "phase": "vulnerability-analysis", "tags": [], "targets": [],
            "finding_ids": [], "attachment_ids": [],
        },
        headers=headers_for("admin", "admin"),
    )
    assert note.status_code == 201, note.text

    drafts_path = "/api/redmode/projects/cliente-demo/finding-drafts"
    created = await async_client.post(drafts_path, headers=headers_for("admin", "admin"))
    assert created.status_code == 201, created.text
    draft = created.json()
    assert [heading for heading in ("# Resumo", "# Impacto", "# Evidências", "# Reprodução", "# Recomendação") if heading in draft["description"]]
    assert (await async_client.get(drafts_path, headers=headers_for("techuser"))).json()["items"] == []
    assert (await async_client.get(f"{drafts_path}/{draft['finding_id']}", headers=headers_for("techuser"))).status_code == 404

    body = {
        "title": "Injeção refletida",
        "description": f"# Resumo\n\n<script>alert(1)</script>\n\n[[evidence:{note.json()['id']}]]",
        "severity": "high", "phase": "vulnerability-analysis",
        "targets": ["https://app.example.test"], "evidence_ids": [note.json()["id"]],
        "base_revision_id": None, "expected_version": draft["version"],
    }
    saved = await async_client.put(
        f"{drafts_path}/{draft['finding_id']}", json=body,
        headers=headers_for("admin", "admin"),
    )
    assert saved.status_code == 200, saved.text
    published = await async_client.post(
        f"{drafts_path}/{draft['finding_id']}/publish",
        json={"expected_version": saved.json()["version"]},
        headers=headers_for("admin", "admin"),
    )
    assert published.status_code == 200, published.text
    assert published.json()["description"].startswith("# Resumo")
    assert published.json()["references"] == [{
        "kind": "evidence", "id": note.json()["id"],
        "key": f"evidence:{note.json()['id']}",
    }]
    assert (await async_client.get(drafts_path, headers=headers_for("admin", "admin"))).json()["items"] == []


@pytest.mark.asyncio
async def test_document_draft_detects_revision_conflict_and_rebases_without_losing_content(async_client):
    await project(async_client, "cliente-demo")
    findings_path = "/api/redmode/projects/cliente-demo/findings"
    created = await async_client.post(findings_path, json=payload(), headers=headers_for("admin", "admin"))
    finding = created.json()
    draft_body = {
        **payload(), "description": "Texto privado preservado",
        "base_revision_id": finding["revision"]["id"], "expected_version": 0,
    }
    saved = await async_client.put(
        f"/api/redmode/projects/cliente-demo/finding-drafts/{finding['id']}",
        json=draft_body, headers=headers_for("admin", "admin"),
    )
    assert saved.status_code == 200, saved.text

    concurrent = {**payload(), "description": "Mudança concorrente", "expected_revision_id": finding["revision"]["id"]}
    updated = await async_client.put(
        f"{findings_path}/{finding['id']}", json=concurrent,
        headers=headers_for("admin", "admin"),
    )
    assert updated.status_code == 200
    publish_path = f"/api/redmode/projects/cliente-demo/finding-drafts/{finding['id']}/publish"
    conflict = await async_client.post(
        publish_path, json={"expected_version": saved.json()["version"]},
        headers=headers_for("admin", "admin"),
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "finding_draft_conflict"
    rebased = await async_client.post(
        f"/api/redmode/projects/cliente-demo/finding-drafts/{finding['id']}/rebase",
        json={"expected_version": saved.json()["version"], "current_revision_id": updated.json()["revision"]["id"]},
        headers=headers_for("admin", "admin"),
    )
    assert rebased.status_code == 200, rebased.text
    assert rebased.json()["description"] == "Texto privado preservado"
    published = await async_client.post(
        publish_path, json={"expected_version": rebased.json()["version"]},
        headers=headers_for("admin", "admin"),
    )
    assert published.status_code == 200, published.text
    assert published.json()["description"] == "Texto privado preservado"
    assert published.json()["revision"]["number"] == 3


@pytest.mark.asyncio
async def test_document_revisions_compare_properties_and_search_current_content(async_client):
    await project(async_client, "cliente-demo")
    path = "/api/redmode/projects/cliente-demo/findings"
    first_payload = {**payload(), "description": "<img src=x onerror=alert(1)> removido"}
    created = await async_client.post(path, json=first_payload, headers=headers_for("admin", "admin"))
    first = created.json()
    second_payload = {
        **payload(), "title": "Serviço administrativo exposto", "description": "Documento seguro atualizado",
        "severity": "critical", "phase": "exploitation", "targets": ["192.0.2.50"],
        "expected_revision_id": first["revision"]["id"],
    }
    updated = await async_client.put(f"{path}/{first['id']}", json=second_payload, headers=headers_for("admin", "admin"))
    second = updated.json()
    comparison = await async_client.get(
        f"{path}/{first['id']}/revisions/compare",
        params={"base_revision_id": first["revision"]["id"], "revision_id": second["revision"]["id"]},
        headers=headers_for("admin", "admin"),
    )
    assert comparison.status_code == 200, comparison.text
    assert "-<img src=x onerror=alert(1)> removido" in comparison.json()["document_diff"]
    assert comparison.json()["property_changes"]["severity"] == {"before": "medium", "after": "critical"}
    assert comparison.json()["property_changes"]["targets"]["after"] == ["192.0.2.50"]

    search = await async_client.get(
        path,
        params={"q": "seguro atualizado", "severity": "critical", "phase": "exploitation"},
        headers=headers_for("admin", "admin"),
    )
    assert search.status_code == 200
    assert [item["id"] for item in search.json()["items"]] == [first["id"]]
    stale = await async_client.get(path, params={"q": "removido"}, headers=headers_for("admin", "admin"))
    assert stale.json()["items"] == []


@pytest.mark.asyncio
async def test_finding_links_create_backlinks_for_notes_sources_and_other_findings(async_client, fake_db):
    await project(async_client, "cliente-demo")
    note = await async_client.post(
        "/api/redmode/projects/cliente-demo/evidence/notes",
        json={
            "title": "Prova publicada", "markdown": "conteúdo", "phase": "reporting",
            "tags": [], "targets": [], "finding_ids": [], "attachment_ids": [],
        },
        headers=headers_for("admin", "admin"),
    )
    first = await async_client.post(
        "/api/redmode/projects/cliente-demo/findings",
        json={**payload(), "title": "Finding de destino"}, headers=headers_for("admin", "admin"),
    )
    version_id = "scope-version-1"
    source_id = "source-1"
    await fake_db.redmode_scope_versions.insert_one({
        "_id": version_id, "project_slug": "cliente-demo", "author": "admin",
        "created_at": datetime.now(timezone.utc),
        "source": {"kind": "bundle", "text": "", "files": [], "sha256": "a" * 64},
        "rules": [], "context_assets": [],
    })
    await fake_db.redmode_scope_sources.insert_one({
        "_id": "source-document-1", "project_slug": "cliente-demo",
        "version_id": version_id, "source_id": source_id, "name": "Escopo original",
        "created_at": datetime.now(timezone.utc),
    })
    second = await async_client.post(
        "/api/redmode/projects/cliente-demo/findings",
        json={
            **payload(), "title": "Finding com links",
            "description": (
                f"Veja [[evidence:{note.json()['id']}]], [[finding:{first.json()['id']}]] "
                f"e [[source:{version_id}/{source_id}]]."
            ),
        },
        headers=headers_for("admin", "admin"),
    )
    assert second.status_code == 201, second.text

    note_links = await async_client.get(
        f"/api/redmode/projects/cliente-demo/evidence/notes/{note.json()['id']}/links",
        headers=headers_for("admin", "admin"),
    )
    assert [(item["type"], item["id"]) for item in note_links.json()["backlinks"]] == [("finding", second.json()["id"])]
    finding_links = await async_client.get(
        f"/api/redmode/projects/cliente-demo/findings/{first.json()['id']}/links",
        headers=headers_for("admin", "admin"),
    )
    assert [(item["type"], item["id"]) for item in finding_links.json()["backlinks"]] == [("finding", second.json()["id"])]
    source_links = await async_client.get(
        "/api/redmode/projects/cliente-demo/references/backlinks",
        params={"key": f"source:{version_id}/{source_id}"},
        headers=headers_for("admin", "admin"),
    )
    assert source_links.status_code == 200, source_links.text
    assert [(item["type"], item["id"]) for item in source_links.json()["items"]] == [("finding", second.json()["id"])]


@pytest.mark.asyncio
async def test_draft_rejects_foreign_evidence_and_publish_rejects_foreign_reference(async_client):
    await project(async_client, "cliente-demo")
    await project(async_client, "outro-cliente")
    foreign_note = await async_client.post(
        "/api/redmode/projects/outro-cliente/evidence/notes",
        json={
            "title": "Segredo externo", "markdown": "não vazar", "phase": "reporting",
            "tags": [], "targets": [], "finding_ids": [], "attachment_ids": [],
        },
        headers=headers_for("admin", "admin"),
    )
    draft = await async_client.post(
        "/api/redmode/projects/cliente-demo/finding-drafts",
        headers=headers_for("admin", "admin"),
    )
    draft_path = f"/api/redmode/projects/cliente-demo/finding-drafts/{draft.json()['finding_id']}"
    invalid_evidence = {
        **payload([foreign_note.json()["id"]]), "base_revision_id": None,
        "expected_version": draft.json()["version"],
    }
    assert (await async_client.put(draft_path, json=invalid_evidence, headers=headers_for("admin", "admin"))).status_code == 422
    invalid_reference = {
        **payload(), "description": f"[[evidence:{foreign_note.json()['id']}]]",
        "base_revision_id": None, "expected_version": draft.json()["version"],
    }
    saved = await async_client.put(draft_path, json=invalid_reference, headers=headers_for("admin", "admin"))
    assert saved.status_code == 200
    rejected = await async_client.post(
        f"{draft_path}/publish", json={"expected_version": saved.json()["version"]},
        headers=headers_for("admin", "admin"),
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "evidence_reference_not_in_project"

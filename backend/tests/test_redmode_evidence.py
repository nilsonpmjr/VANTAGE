"""Manual RedMode evidence stays inside the project boundary."""

import pytest

from auth import create_access_token


def headers_for(username: str, role: str = "tech") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


async def grant_redmode(fake_db, username: str) -> None:
    await fake_db.users.update_one({"username": username}, {"$set": {"extra_permissions": ["redmode:access"]}})


@pytest.mark.asyncio
async def test_evidence_note_and_file_are_private_and_audited(async_client, fake_db, monkeypatch):
    import routers.redmode_evidence as module

    class MemoryStore:
        def __init__(self):
            self.files = {}

        async def save(self, filename, content, metadata):
            self.files["file-1"] = content
            return "file-1"

        async def read(self, file_id):
            if file_id not in self.files:
                raise FileNotFoundError(file_id)
            return self.files[file_id]

        async def delete(self, file_id):
            self.files.pop(file_id, None)

    store = MemoryStore()
    monkeypatch.setattr(module, "evidence_file_store", lambda: store)
    await async_client.post("/api/redmode/projects", json={"slug": "cliente-demo", "display_name": "Cliente Demo"}, headers=headers_for("admin", "admin"))
    await grant_redmode(fake_db, "techuser")
    path = "/api/redmode/projects/cliente-demo/evidence"
    created = await async_client.post(path, data={"text": "Observação manual", "phase": "reconnaissance", "target": "192.0.2.10"}, files={"file": ("proof.txt", b"secret proof", "text/plain")}, headers=headers_for("admin", "admin"))
    assert created.status_code == 201, created.text
    evidence = created.json()
    assert evidence["author"] == "admin"
    assert evidence["file"]["filename"] == "proof.txt"
    assert evidence["phase"] == "reconnaissance"
    assert "secret proof" not in str(evidence)

    listed = await async_client.get(path, headers=headers_for("admin", "admin"))
    assert listed.status_code == 200
    assert listed.json()["items"][0]["id"] == evidence["id"]
    detail = await async_client.get(f"{path}/{evidence['id']}", headers=headers_for("admin", "admin"))
    assert detail.json()["text"] == "Observação manual"
    download = await async_client.get(f"{path}/{evidence['id']}/file", headers=headers_for("admin", "admin"))
    assert download.status_code == 200
    assert download.content == b"secret proof"
    assert download.headers["cache-control"] == "private, no-store"
    activity = await async_client.get("/api/redmode/projects/cliente-demo/activity", headers=headers_for("admin", "admin"))
    event = activity.json()["items"][-1]
    assert event["type"] == "evidence_created"
    assert event["subject"] == evidence["id"]
    assert "Observação manual" not in str(event)

    for endpoint in (path, f"{path}/{evidence['id']}", f"{path}/{evidence['id']}/file"):
        denied = await async_client.get(endpoint, headers=headers_for("techuser"))
        assert denied.status_code == 403
    denied_upload = await async_client.post(path, data={"text": "mine", "phase": "reporting"}, headers=headers_for("techuser"))
    assert denied_upload.status_code == 403
    feed = await async_client.get("/api/redmode/projects", headers=headers_for("techuser"))
    assert "Observação manual" not in feed.text
    assert evidence["id"] not in feed.text


@pytest.mark.asyncio
async def test_evidence_validates_content_phase_and_size(async_client, monkeypatch):
    from config import settings

    await async_client.post("/api/redmode/projects", json={"slug": "cliente-demo", "display_name": "Cliente Demo"}, headers=headers_for("admin", "admin"))
    path = "/api/redmode/projects/cliente-demo/evidence"
    for data in ({"phase": "reporting"}, {"text": "note", "phase": "unknown"}):
        response = await async_client.post(path, data=data, headers=headers_for("admin", "admin"))
        assert response.status_code == 422
    monkeypatch.setattr(settings, "redmode_evidence_max_file_bytes", 4)
    too_large = await async_client.post(path, data={"phase": "reporting"}, files={"file": ("proof.txt", b"12345", "text/plain")}, headers=headers_for("admin", "admin"))
    assert too_large.status_code == 413
    assert (await async_client.get(path, headers=headers_for("admin", "admin"))).json()["items"] == []


@pytest.mark.asyncio
async def test_evidence_link_must_be_same_project(async_client):
    await async_client.post("/api/redmode/projects", json={"slug": "cliente-demo", "display_name": "Cliente Demo"}, headers=headers_for("admin", "admin"))
    response = await async_client.post("/api/redmode/projects/cliente-demo/evidence", data={"text": "note", "phase": "reporting", "finding_id": "missing"}, headers=headers_for("admin", "admin"))
    assert response.status_code == 422


def note_payload(**overrides):
    payload = {
        "title": "Acesso administrativo exposto",
        "markdown": "## Evidência\n\nResposta observada no serviço.",
        "phase": "vulnerability-analysis",
        "tags": ["painel", "externo"],
        "targets": ["192.0.2.10", "admin.example.test"],
        "finding_ids": [],
        "attachment_ids": [],
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_revisioned_notes_publish_summaries_and_detect_conflicts(async_client):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    path = "/api/redmode/projects/cliente-demo/evidence/notes"
    created = await async_client.post(
        path,
        json=note_payload(),
        headers=headers_for("admin", "admin"),
    )
    assert created.status_code == 201, created.text
    first = created.json()
    assert first["created_by"] == "admin"
    assert first["revision"]["number"] == 1
    assert first["targets"] == ["192.0.2.10", "admin.example.test"]

    listed = await async_client.get(path, headers=headers_for("admin", "admin"))
    assert listed.status_code == 200
    summary = listed.json()["items"][0]
    assert summary["title"] == first["title"]
    assert summary["excerpt"].startswith("Evidência")
    assert summary["target_count"] == 2
    assert "markdown" not in summary

    edit = note_payload(
        title="Acesso administrativo confirmado",
        markdown="## Evidência atualizada\n\nAcesso confirmado.",
    )
    edit["expected_revision_id"] = first["revision"]["id"]
    updated = await async_client.put(
        f"{path}/{first['id']}",
        json=edit,
        headers=headers_for("admin", "admin"),
    )
    assert updated.status_code == 200, updated.text
    second = updated.json()
    assert second["revision"]["number"] == 2
    assert second["revision"]["previous_revision_id"] == first["revision"]["id"]

    conflict = await async_client.put(
        f"{path}/{first['id']}",
        json=edit,
        headers=headers_for("admin", "admin"),
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "evidence_changed_retry"

    history = await async_client.get(
        f"{path}/{first['id']}/revisions",
        headers=headers_for("admin", "admin"),
    )
    assert [item["number"] for item in history.json()["items"]] == [2, 1]
    old_revision = await async_client.get(
        f"{path}/{first['id']}/revisions/{first['revision']['id']}",
        headers=headers_for("admin", "admin"),
    )
    assert old_revision.json()["markdown"] == note_payload()["markdown"]

    activity = await async_client.get(
        "/api/redmode/projects/cliente-demo/activity",
        headers=headers_for("admin", "admin"),
    )
    assert [item["type"] for item in activity.json()["items"]][-2:] == [
        "evidence_created",
        "evidence_updated",
    ]
    assert all(item["subject"] == first["id"] for item in activity.json()["items"][-2:])
    assert "Acesso administrativo" not in str(activity.json()["items"][-2:])

    home = await async_client.get("/api/redmode/home", headers=headers_for("admin", "admin"))
    assert sum(item["evidence"] for item in home.json()["charts"]["activity_30d"]) == 1


@pytest.mark.asyncio
async def test_legacy_evidence_is_adapted_without_destructive_migration(async_client, fake_db):
    from datetime import datetime, timezone

    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    created_at = datetime.now(timezone.utc)
    await fake_db.redmode_evidence.insert_one({
        "_id": "legacy-note",
        "project_slug": "cliente-demo",
        "text": "# Varredura inicial\n\nPorta 443 respondeu.",
        "phase": "reconnaissance",
        "target": "192.0.2.10",
        "finding_id": None,
        "file": {
            "id": "legacy-file",
            "filename": "scan.txt",
            "size": 12,
            "sha256": "abc",
        },
        "author": "admin",
        "created_at": created_at,
    })
    path = "/api/redmode/projects/cliente-demo/evidence/notes/legacy-note"
    detail = await async_client.get(path, headers=headers_for("admin", "admin"))
    assert detail.status_code == 200
    legacy = detail.json()
    assert legacy["title"] == "Varredura inicial"
    assert legacy["markdown"].startswith("# Varredura")
    assert legacy["targets"] == ["192.0.2.10"]
    assert legacy["attachments"][0]["filename"] == "scan.txt"
    assert legacy["revision"]["id"] == "legacy:legacy-note"

    await fake_db.redmode_evidence.insert_one({
        "_id": "legacy-file-only",
        "project_slug": "cliente-demo",
        "text": "",
        "phase": "reporting",
        "target": None,
        "finding_id": None,
        "file": {
            "id": "report-file",
            "filename": "relatorio-final.pdf",
            "size": 20,
            "sha256": "def",
        },
        "author": "admin",
        "created_at": created_at,
    })
    file_only = await async_client.get(
        "/api/redmode/projects/cliente-demo/evidence/notes/legacy-file-only",
        headers=headers_for("admin", "admin"),
    )
    assert file_only.json()["title"] == "relatorio-final.pdf"
    legacy_list = await async_client.get(
        "/api/redmode/projects/cliente-demo/evidence/notes",
        headers=headers_for("admin", "admin"),
    )
    assert legacy_list.json()["total"] == 2
    assert all("markdown" not in item for item in legacy_list.json()["items"])

    edit = note_payload(
        title="Varredura revisada",
        markdown="# Varredura revisada",
        phase="reconnaissance",
        tags=["recon"],
        targets=["192.0.2.10"],
        attachment_ids=["legacy-file"],
    )
    edit["expected_revision_id"] = legacy["revision"]["id"]
    revised = await async_client.put(
        path,
        json=edit,
        headers=headers_for("admin", "admin"),
    )
    assert revised.status_code == 200, revised.text
    assert revised.json()["revision"]["number"] == 2

    history = await async_client.get(
        f"{path}/revisions",
        headers=headers_for("admin", "admin"),
    )
    assert [item["title"] for item in history.json()["items"]] == [
        "Varredura revisada",
        "Varredura inicial",
    ]
    stored = await fake_db.redmode_evidence.find_one({"_id": "legacy-note"})
    assert stored["text"] == "# Varredura inicial\n\nPorta 443 respondeu."
    assert stored["target"] == "192.0.2.10"
    legacy_api = await async_client.get(
        "/api/redmode/projects/cliente-demo/evidence/legacy-note",
        headers=headers_for("admin", "admin"),
    )
    assert legacy_api.json()["text"] == "# Varredura revisada"


@pytest.mark.asyncio
async def test_note_relations_are_multiple_and_engagement_scoped(async_client, fake_db):
    for slug in ("cliente-demo", "outro-cliente"):
        await async_client.post(
            "/api/redmode/projects",
            json={"slug": slug, "display_name": slug},
            headers=headers_for("admin", "admin"),
        )
    for finding_id, slug in (
        ("finding-1", "cliente-demo"),
        ("finding-2", "cliente-demo"),
        ("finding-foreign", "outro-cliente"),
    ):
        await fake_db.redmode_findings.insert_one({
            "_id": finding_id,
            "project_slug": slug,
        })
    for attachment_id, slug in (
        ("attachment-1", "cliente-demo"),
        ("attachment-2", "cliente-demo"),
        ("attachment-foreign", "outro-cliente"),
    ):
        await fake_db.redmode_evidence_attachments.insert_one({
            "_id": attachment_id,
            "id": attachment_id,
            "project_slug": slug,
            "note_id": None,
            "filename": f"{attachment_id}.txt",
            "size": 10,
            "sha256": attachment_id,
            "state": "published",
        })

    path = "/api/redmode/projects/cliente-demo/evidence/notes"
    payload = note_payload(
        finding_ids=["finding-1", "finding-2"],
        attachment_ids=["attachment-1", "attachment-2"],
    )
    created = await async_client.post(
        path,
        json=payload,
        headers=headers_for("admin", "admin"),
    )
    assert created.status_code == 201, created.text
    assert created.json()["finding_ids"] == ["finding-1", "finding-2"]
    assert created.json()["attachment_ids"] == ["attachment-1", "attachment-2"]

    foreign_finding = note_payload(finding_ids=["finding-foreign"])
    assert (
        await async_client.post(
            path,
            json=foreign_finding,
            headers=headers_for("admin", "admin"),
        )
    ).status_code == 422
    foreign_attachment = note_payload(attachment_ids=["attachment-foreign"])
    assert (
        await async_client.post(
            path,
            json=foreign_attachment,
            headers=headers_for("admin", "admin"),
        )
    ).status_code == 422

    await grant_redmode(fake_db, "techuser")
    assert (
        await async_client.get(path, headers=headers_for("techuser"))
    ).status_code == 403

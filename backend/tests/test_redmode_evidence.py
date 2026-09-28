"""Manual RedMode evidence stays inside the project boundary."""

from datetime import datetime, timezone
from hashlib import sha256

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


@pytest.mark.asyncio
async def test_private_drafts_autosave_per_author_without_activity(async_client, fake_db):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    await grant_redmode(fake_db, "techuser")
    await async_client.put(
        "/api/redmode/projects/cliente-demo/members/techuser",
        headers=headers_for("admin", "admin"),
    )
    notes_path = "/api/redmode/projects/cliente-demo/evidence/notes"
    published = await async_client.post(
        notes_path,
        json=note_payload(),
        headers=headers_for("admin", "admin"),
    )
    note = published.json()
    activity_before = (
        await async_client.get(
            "/api/redmode/projects/cliente-demo/activity",
            headers=headers_for("admin", "admin"),
        )
    ).json()["items"]

    draft_payload = note_payload(markdown="rascunho privado de admin")
    draft_payload.update({
        "base_revision_id": note["revision"]["id"],
        "expected_version": 0,
    })
    admin_saved = await async_client.put(
        f"/api/redmode/projects/cliente-demo/evidence/drafts/{note['id']}",
        json=draft_payload,
        headers=headers_for("admin", "admin"),
    )
    assert admin_saved.status_code == 200, admin_saved.text
    assert admin_saved.json()["version"] == 1

    assert (
        await async_client.get(
            f"/api/redmode/projects/cliente-demo/evidence/drafts/{note['id']}",
            headers=headers_for("techuser"),
        )
    ).status_code == 404
    tech_payload = note_payload(markdown="rascunho privado de tech")
    tech_payload.update({
        "base_revision_id": note["revision"]["id"],
        "expected_version": 0,
    })
    tech_saved = await async_client.put(
        f"/api/redmode/projects/cliente-demo/evidence/drafts/{note['id']}",
        json=tech_payload,
        headers=headers_for("techuser"),
    )
    assert tech_saved.status_code == 200, tech_saved.text
    admin_reloaded = await async_client.get(
        f"/api/redmode/projects/cliente-demo/evidence/drafts/{note['id']}",
        headers=headers_for("admin", "admin"),
    )
    assert admin_reloaded.json()["markdown"] == "rascunho privado de admin"
    listed = await async_client.get(
        "/api/redmode/projects/cliente-demo/evidence/drafts",
        headers=headers_for("techuser"),
    )
    assert [item["note_id"] for item in listed.json()["items"]] == [note["id"]]

    activity_after = (
        await async_client.get(
            "/api/redmode/projects/cliente-demo/activity",
            headers=headers_for("admin", "admin"),
        )
    ).json()["items"]
    assert activity_after == activity_before


@pytest.mark.asyncio
async def test_draft_publish_conflict_and_explicit_rebase_preserve_text(async_client, fake_db):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    await grant_redmode(fake_db, "techuser")
    await async_client.put(
        "/api/redmode/projects/cliente-demo/members/techuser",
        headers=headers_for("admin", "admin"),
    )
    notes_path = "/api/redmode/projects/cliente-demo/evidence/notes"
    note = (
        await async_client.post(
            notes_path,
            json=note_payload(),
            headers=headers_for("admin", "admin"),
        )
    ).json()
    draft_path = f"/api/redmode/projects/cliente-demo/evidence/drafts/{note['id']}"
    for username, markdown in (("admin", "texto local intacto"), ("techuser", "texto remoto")):
        payload = note_payload(markdown=markdown)
        payload.update({
            "base_revision_id": note["revision"]["id"],
            "expected_version": 0,
        })
        saved = await async_client.put(
            draft_path,
            json=payload,
            headers=headers_for(username, "admin" if username == "admin" else "tech"),
        )
        assert saved.status_code == 200, saved.text

    remote_publish = await async_client.post(
        f"{draft_path}/publish",
        json={"expected_version": 1},
        headers=headers_for("techuser"),
    )
    assert remote_publish.status_code == 200, remote_publish.text
    current = remote_publish.json()
    assert current["markdown"] == "texto remoto"

    stale_payload = note_payload(markdown="texto local ainda mais recente")
    stale_payload.update({
        "base_revision_id": note["revision"]["id"],
        "expected_version": 1,
    })
    conflict = await async_client.put(
        draft_path,
        json=stale_payload,
        headers=headers_for("admin", "admin"),
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "evidence_draft_conflict"
    preserved = await async_client.get(
        draft_path,
        headers=headers_for("admin", "admin"),
    )
    assert preserved.json()["markdown"] == "texto local intacto"

    rebased = await async_client.post(
        f"{draft_path}/rebase",
        json={
            "expected_version": preserved.json()["version"],
            "current_revision_id": current["revision"]["id"],
        },
        headers=headers_for("admin", "admin"),
    )
    assert rebased.status_code == 200, rebased.text
    assert rebased.json()["markdown"] == "texto local intacto"
    published = await async_client.post(
        f"{draft_path}/publish",
        json={"expected_version": rebased.json()["version"]},
        headers=headers_for("admin", "admin"),
    )
    assert published.status_code == 200, published.text
    assert published.json()["markdown"] == "texto local intacto"
    assert published.json()["revision"]["number"] == 3


@pytest.mark.asyncio
async def test_draft_attachments_are_private_embeddable_and_immutable_after_publish(
    async_client,
    fake_db,
    monkeypatch,
):
    import routers.redmode_evidence as module

    class MemoryStore:
        def __init__(self):
            self.files = {}

        async def save(self, filename, content, metadata):
            file_id = f"stored-{metadata['attachment_id']}"
            self.files[file_id] = content
            return file_id

        async def read(self, file_id):
            if file_id not in self.files:
                raise FileNotFoundError(file_id)
            return self.files[file_id]

        async def delete(self, file_id):
            self.files.pop(file_id, None)

    store = MemoryStore()
    monkeypatch.setattr(module, "evidence_file_store", lambda: store)
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    await grant_redmode(fake_db, "techuser")
    draft = (
        await async_client.post(
            "/api/redmode/projects/cliente-demo/evidence/drafts",
            headers=headers_for("admin", "admin"),
        )
    ).json()
    draft_path = f"/api/redmode/projects/cliente-demo/evidence/drafts/{draft['note_id']}"
    saved_payload = note_payload(title="Provas com anexos", markdown="provas")
    saved_payload.update({"base_revision_id": None, "expected_version": draft["version"]})
    saved = await async_client.put(
        draft_path,
        json=saved_payload,
        headers=headers_for("admin", "admin"),
    )
    uploaded = await async_client.post(
        f"{draft_path}/attachments",
        data={"expected_version": str(saved.json()["version"])},
        files=[
            ("files", ("captura.png", b"fake-png", "image/png")),
            ("files", ("saida.txt", b"secret output", "text/plain")),
        ],
        headers=headers_for("admin", "admin"),
    )
    assert uploaded.status_code == 200, uploaded.text
    attachments = uploaded.json()["attachments"]
    assert len(attachments) == 2
    assert attachments[0]["content_type"] == "image/png"
    assert len(attachments[0]["sha256"]) == 64
    image_id, text_id = [item["id"] for item in attachments]
    download_path = (
        f"/api/redmode/projects/cliente-demo/evidence/notes/{draft['note_id']}"
        f"/attachments/{image_id}?inline=true"
    )
    image = await async_client.get(download_path, headers=headers_for("admin", "admin"))
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
    assert image.headers["content-disposition"].startswith("inline;")
    assert (
        await async_client.get(download_path, headers=headers_for("techuser"))
    ).status_code == 403

    removed = await async_client.delete(
        f"{draft_path}/attachments/{text_id}",
        headers=headers_for("admin", "admin"),
    )
    assert removed.status_code == 200
    assert text_id not in removed.json()["attachment_ids"]
    assert all(b"secret output" != content for content in store.files.values())

    published = await async_client.post(
        f"{draft_path}/publish",
        json={"expected_version": removed.json()["version"]},
        headers=headers_for("admin", "admin"),
    )
    assert published.status_code == 200, published.text
    assert published.json()["attachment_ids"] == [image_id]
    stored = await fake_db.redmode_evidence_attachments.find_one({"_id": image_id})
    assert stored["state"] == "published"
    assert (
        await async_client.delete(
            f"{draft_path}/attachments/{image_id}",
            headers=headers_for("admin", "admin"),
        )
    ).status_code == 404
    assert (
        await async_client.get(
            download_path,
            headers=headers_for("admin", "admin"),
        )
    ).content == b"fake-png"


@pytest.mark.asyncio
async def test_abandoned_draft_cleanup_never_removes_published_files(
    async_client,
    fake_db,
    monkeypatch,
):
    from datetime import datetime, timedelta, timezone
    import routers.redmode_evidence as module

    class MemoryStore:
        def __init__(self):
            self.files = {"draft-storage": b"draft", "published-storage": b"published"}

        async def delete(self, file_id):
            self.files.pop(file_id, None)

    store = MemoryStore()
    monkeypatch.setattr(module, "evidence_file_store", lambda: store)
    now = datetime.now(timezone.utc)
    old = now - timedelta(days=10)
    await fake_db.redmode_evidence_drafts.insert_one({
        "_id": "cliente-demo:note-old:admin",
        "note_id": "note-old",
        "project_slug": "cliente-demo",
        "author": "admin",
        "version": 2,
        "base_revision_id": None,
        "created_at": old,
        "updated_at": old,
        "attachment_ids": ["draft-file"],
    })
    for attachment_id, state, storage_id in (
        ("draft-file", "draft", "draft-storage"),
        ("published-file", "published", "published-storage"),
    ):
        await fake_db.redmode_evidence_attachments.insert_one({
            "_id": attachment_id,
            "id": attachment_id,
            "project_slug": "cliente-demo",
            "note_id": "note-old",
            "state": state,
            "created_by": "admin",
            "created_at": old,
            "storage_id": storage_id,
        })

    result = await module.cleanup_abandoned_evidence_drafts(now=now)
    assert result == {"drafts": 1, "attachments": 1}
    assert await fake_db.redmode_evidence_drafts.find_one({"_id": "cliente-demo:note-old:admin"}) is None
    assert await fake_db.redmode_evidence_attachments.find_one({"_id": "draft-file"}) is None
    assert await fake_db.redmode_evidence_attachments.find_one({"_id": "published-file"}) is not None
    assert store.files == {"published-storage": b"published"}


@pytest.mark.asyncio
async def test_internal_references_search_backlinks_and_engagement_isolation(
    async_client,
    fake_db,
):
    admin = headers_for("admin", "admin")
    for slug in ("cliente-demo", "outro-cliente"):
        created = await async_client.post(
            "/api/redmode/projects",
            json={"slug": slug, "display_name": slug},
            headers=admin,
        )
        assert created.status_code == 201, created.text

    notes_path = "/api/redmode/projects/cliente-demo/evidence/notes"
    target_note = (
        await async_client.post(
            notes_path,
            json=note_payload(title="Nota de destino", tags=["destino"]),
            headers=admin,
        )
    ).json()
    foreign_note = (
        await async_client.post(
            "/api/redmode/projects/outro-cliente/evidence/notes",
            json=note_payload(title="Nota de outro engagement"),
            headers=admin,
        )
    ).json()
    finding = (
        await async_client.post(
            "/api/redmode/projects/cliente-demo/findings",
            json={
                "title": "Finding relacionado",
                "description": "Descrição publicada",
                "severity": "medium",
                "phase": "vulnerability-analysis",
                "targets": ["192.0.2.10"],
                "evidence_ids": [],
            },
            headers=admin,
        )
    ).json()

    now = datetime.now(timezone.utc)
    version_id = "scope-version-1"
    source_id = "scope-source-1"
    canonical_target = "192.0.2.10"
    asset_id = sha256(f"ip\0{canonical_target}".encode()).hexdigest()
    await fake_db.redmode_scope_versions.insert_one({
        "_id": version_id,
        "project_slug": "cliente-demo",
        "author": "admin",
        "created_at": now,
        "source": {"kind": "bundle", "text": "", "files": [], "sha256": "a" * 64},
        "rules": [],
        "context_assets": [],
    })
    await fake_db.redmode_scope_sources.insert_one({
        "_id": "source-document-1",
        "project_slug": "cliente-demo",
        "version_id": version_id,
        "source_id": source_id,
        "name": "Arquivo de escopo",
        "created_at": now,
    })
    await fake_db.redmode_scope_assets.insert_one({
        "_id": "asset-document-1",
        "project_slug": "cliente-demo",
        "version_id": version_id,
        "asset_id": asset_id,
        "kind": "ip",
        "value": canonical_target,
        "search_text": f"ip client {canonical_target}",
    })
    await fake_db.redmode_projects.update_one(
        {"_id": "cliente-demo"},
        {"$set": {
            "active_scope_version": version_id,
            "scope_history": [version_id],
        }},
    )

    markdown = (
        f"Liga [[evidence:{target_note['id']}]] ao "
        f"[[finding:{finding['id']}]], à "
        f"[[source:{version_id}/{source_id}]] e ao "
        f"[[target:{version_id}/{asset_id}]]."
    )
    referencing = await async_client.post(
        notes_path,
        json=note_payload(
            title="Nota referenciadora",
            markdown=markdown,
            tags=["ligações"],
        ),
        headers=admin,
    )
    assert referencing.status_code == 201, referencing.text
    referencing_note = referencing.json()
    stored_revision = await fake_db.redmode_evidence_revisions.find_one({
        "_id": referencing_note["revision"]["id"],
    })
    assert stored_revision["reference_keys"] == [
        f"evidence:{target_note['id']}",
        f"finding:{finding['id']}",
        f"source:{version_id}/{source_id}",
        f"target:{version_id}/{asset_id}",
    ]
    assert "nota referenciadora" in stored_revision["search_text"]

    foreign = await async_client.post(
        notes_path,
        json=note_payload(markdown=f"[[evidence:{foreign_note['id']}]]"),
        headers=admin,
    )
    assert foreign.status_code == 422
    assert foreign.json()["detail"] == "evidence_reference_not_in_project"
    invalid_type = await async_client.post(
        notes_path,
        json=note_payload(markdown="[[unknown:item]]"),
        headers=admin,
    )
    assert invalid_type.status_code == 422
    assert invalid_type.json()["detail"] == "evidence_reference_type_invalid"

    links_path = f"{notes_path}/{referencing_note['id']}/links"
    links = await async_client.get(links_path, headers=admin)
    assert links.status_code == 200, links.text
    assert [item["label"] for item in links.json()["outgoing"]] == [
        "Nota de destino",
        "Finding relacionado",
        "Arquivo de escopo",
        canonical_target,
    ]
    assert all(item["context"] for item in links.json()["outgoing"])

    backlinks = await async_client.get(
        f"{notes_path}/{target_note['id']}/links",
        headers=admin,
    )
    assert [item["id"] for item in backlinks.json()["backlinks"]] == [
        referencing_note["id"],
    ]

    renamed_payload = note_payload(title="Nota renomeada", tags=["destino"])
    renamed_payload["expected_revision_id"] = target_note["revision"]["id"]
    renamed = await async_client.put(
        f"{notes_path}/{target_note['id']}",
        json=renamed_payload,
        headers=admin,
    )
    assert renamed.status_code == 200, renamed.text
    renamed_links = await async_client.get(links_path, headers=admin)
    assert renamed_links.json()["outgoing"][0]["label"] == "Nota renomeada"

    by_title = await async_client.get(
        "/api/redmode/projects/cliente-demo/notebook/search",
        params={"q": "referenciadora", "type": "evidence"},
        headers=admin,
    )
    assert [item["id"] for item in by_title.json()["items"]] == [
        referencing_note["id"],
    ]
    wrong_phase = await async_client.get(
        "/api/redmode/projects/cliente-demo/notebook/search",
        params={
            "q": "referenciadora",
            "type": "evidence",
            "phase": "post-exploitation",
        },
        headers=admin,
    )
    assert wrong_phase.json()["items"] == []
    old_period = await async_client.get(
        "/api/redmode/projects/cliente-demo/notebook/search",
        params={
            "q": "referenciadora",
            "type": "evidence",
            "date_to": "2000-01-01T00:00:00Z",
        },
        headers=admin,
    )
    assert old_period.json()["items"] == []
    by_reference = await async_client.get(
        "/api/redmode/projects/cliente-demo/notebook/search",
        params={"q": f"source:{version_id}/{source_id}", "type": "evidence"},
        headers=admin,
    )
    assert by_reference.json()["total"] == 1
    scope_results = await async_client.get(
        "/api/redmode/projects/cliente-demo/notebook/search",
        params={"q": "Arquivo", "type": "source"},
        headers=admin,
    )
    assert scope_results.json()["items"][0]["reference"] == (
        f"[[source:{version_id}/{source_id}]]"
    )
    target_results = await async_client.get(
        "/api/redmode/projects/cliente-demo/notebook/search",
        params={"q": canonical_target, "type": "target"},
        headers=admin,
    )
    assert target_results.json()["items"][0]["label"] == canonical_target

    suggestions = await async_client.get(
        "/api/redmode/projects/cliente-demo/references/suggest",
        params={"q": "finding:relacionado"},
        headers=admin,
    )
    assert suggestions.json()["items"][0]["reference"] == (
        f"[[finding:{finding['id']}]]"
    )

    await grant_redmode(fake_db, "techuser")
    denied = await async_client.get(
        "/api/redmode/projects/cliente-demo/notebook/search",
        params={"q": "referenciadora"},
        headers=headers_for("techuser"),
    )
    assert denied.status_code == 403
    await async_client.put(
        "/api/redmode/projects/cliente-demo/members/techuser",
        headers=admin,
    )
    draft = (
        await async_client.post(
            "/api/redmode/projects/cliente-demo/evidence/drafts",
            headers=admin,
        )
    ).json()
    draft_payload = note_payload(title="Segredo do admin", markdown="privado")
    draft_payload.update({
        "base_revision_id": None,
        "expected_version": draft["version"],
    })
    await async_client.put(
        f"/api/redmode/projects/cliente-demo/evidence/drafts/{draft['note_id']}",
        json=draft_payload,
        headers=admin,
    )
    admin_search = await async_client.get(
        "/api/redmode/projects/cliente-demo/notebook/search",
        params={"q": "Segredo", "type": "draft"},
        headers=admin,
    )
    assert admin_search.json()["total"] == 1
    member_search = await async_client.get(
        "/api/redmode/projects/cliente-demo/notebook/search",
        params={"q": "Segredo", "type": "draft"},
        headers=headers_for("techuser"),
    )
    assert member_search.json()["items"] == []

    await fake_db.redmode_evidence.delete_one({"_id": target_note["id"]})
    broken_links = await async_client.get(links_path, headers=admin)
    broken = broken_links.json()["outgoing"][0]
    assert broken["kind"] == "evidence"
    assert broken["id"] == target_note["id"]
    assert broken["key"] == f"evidence:{target_note['id']}"
    assert broken["label"] == "Referência indisponível"
    assert broken["href"] is None
    assert broken["broken"] is True
    assert "Nota de destino" not in str(broken)

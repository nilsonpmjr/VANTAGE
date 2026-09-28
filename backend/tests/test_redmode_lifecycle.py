"""Lifecycle rules for Offensive Mode engagements."""

import asyncio

import pytest

from auth import create_access_token


class MemoryFiles:
    def __init__(self):
        self.files = {}

    async def save(self, filename, content, metadata):
        file_id = f"file-{len(self.files) + 1}"
        self.files[file_id] = content
        return file_id

    async def read(self, file_id):
        if file_id not in self.files:
            raise FileNotFoundError(file_id)
        return self.files[file_id]

    async def delete(self, file_id):
        self.files.pop(file_id, None)


@pytest.fixture(autouse=True)
def lifecycle_file_stores(monkeypatch):
    import routers.redmode as redmode
    import routers.redmode_evidence as evidence

    scope_files = MemoryFiles()
    scope_sources = MemoryFiles()
    evidence_files = MemoryFiles()
    monkeypatch.setattr(redmode, "file_store", lambda: scope_files)
    monkeypatch.setattr(redmode, "source_text_store", lambda: scope_sources)
    monkeypatch.setattr(evidence, "evidence_file_store", lambda: evidence_files)


def headers_for(username: str, role: str = "tech") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


async def grant_redmode(fake_db, username: str) -> None:
    await fake_db.users.update_one(
        {"username": username},
        {"$set": {"extra_permissions": ["redmode:access"]}},
    )


async def create_project(async_client, slug: str = "cliente-demo"):
    response = await async_client.post(
        "/api/redmode/projects",
        json={"slug": slug, "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    assert response.status_code == 201
    return response


async def change_status(async_client, current: str, target: str, slug: str = "cliente-demo"):
    return await async_client.put(
        f"/api/redmode/projects/{slug}/status",
        json={"status": target, "expected_status": current},
        headers=headers_for("admin", "admin"),
    )


async def archive_project(async_client, slug: str = "cliente-demo") -> None:
    assert (await change_status(async_client, "active", "completed", slug)).status_code == 200
    assert (await change_status(async_client, "completed", "archived", slug)).status_code == 200


@pytest.mark.asyncio
async def test_responsible_can_use_every_valid_transition_and_dates_are_current(async_client):
    await create_project(async_client)

    completed = await change_status(async_client, "active", "completed")
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
    assert completed.json()["completed_at"]
    assert "archived_at" not in completed.json()

    active = await change_status(async_client, "completed", "active")
    assert active.status_code == 200
    assert active.json()["status"] == "active"
    assert "completed_at" not in active.json()
    assert "archived_at" not in active.json()

    assert (await change_status(async_client, "active", "completed")).status_code == 200
    archived = await change_status(async_client, "completed", "archived")
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"
    assert archived.json()["archived_at"]
    assert "completed_at" not in archived.json()

    reactivated = await change_status(async_client, "archived", "active")
    assert reactivated.status_code == 200
    assert reactivated.json()["status"] == "active"
    assert "archived_at" not in reactivated.json()

    activity = await async_client.get(
        "/api/redmode/projects/cliente-demo/activity",
        headers=headers_for("admin", "admin"),
    )
    changes = [item for item in activity.json()["items"] if item["type"] == "status_changed"]
    assert [(item["previous_status"], item["new_status"]) for item in changes] == [
        ("active", "completed"),
        ("completed", "active"),
        ("active", "completed"),
        ("completed", "archived"),
        ("archived", "active"),
    ]
    assert all(item["author"] == "admin" and item["at"] for item in changes)


@pytest.mark.asyncio
async def test_invalid_stale_and_member_status_changes_are_rejected(async_client, fake_db):
    await create_project(async_client)

    invalid = await change_status(async_client, "active", "archived")
    assert invalid.status_code == 409
    assert invalid.json()["detail"] == "project_status_transition_invalid"

    assert (await change_status(async_client, "active", "completed")).status_code == 200
    stale = await change_status(async_client, "active", "completed")
    assert stale.status_code == 409
    assert stale.json()["detail"] == "project_status_changed_retry"

    await grant_redmode(fake_db, "techuser")
    assert (
        await async_client.put(
            "/api/redmode/projects/cliente-demo/members/techuser",
            headers=headers_for("admin", "admin"),
        )
    ).status_code == 200
    forbidden = await async_client.put(
        "/api/redmode/projects/cliente-demo/status",
        json={"status": "active", "expected_status": "completed"},
        headers=headers_for("techuser"),
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"] == "project_responsible_required"


@pytest.mark.asyncio
async def test_status_change_uses_compare_and_set_under_concurrency(async_client):
    await create_project(async_client)
    assert (await change_status(async_client, "active", "completed")).status_code == 200

    responses = await asyncio.gather(
        change_status(async_client, "completed", "active"),
        change_status(async_client, "completed", "archived"),
    )
    assert sorted(response.status_code for response in responses) == [200, 409]
    assert next(response for response in responses if response.status_code == 409).json()[
        "detail"
    ] == "project_status_changed_retry"


@pytest.mark.asyncio
async def test_legacy_project_without_status_is_active(async_client, fake_db):
    await create_project(async_client)
    project = await fake_db.redmode_projects.find_one({"_id": "cliente-demo"})
    project.pop("status")

    detail = await async_client.get(
        "/api/redmode/projects/cliente-demo",
        headers=headers_for("admin", "admin"),
    )
    assert detail.status_code == 200
    assert detail.json()["status"] == "active"
    home = await async_client.get(
        "/api/redmode/home",
        headers=headers_for("admin", "admin"),
    )
    assert home.status_code == 200
    assert home.json()["metrics"]["active_engagements"] == 1
    assert (await change_status(async_client, "active", "completed")).status_code == 200


@pytest.mark.asyncio
async def test_archived_project_rejects_every_write_area(async_client):
    await create_project(async_client)
    await archive_project(async_client)
    headers = headers_for("admin", "admin")
    base = "/api/redmode/projects/cliente-demo"
    requests = [
        ("PUT", f"{base}/phase", {"json": {"phase": "reconnaissance"}}),
        ("PUT", f"{base}/members/techuser", {}),
        ("PUT", f"{base}/enrichment/policy", {
            "json": {"mode": "local_only", "expected_revision": 0},
        }),
        ("PUT", f"{base}/identity/confirmations", {
            "json": {"kind": "domain", "value": "example.com", "expected_revision": 0},
        }),
        ("POST", f"{base}/scope/text", {"json": {"text": "example.com"}}),
        ("POST", f"{base}/scope/submit", {"data": {"text": "example.com"}}),
        ("POST", f"{base}/evidence/drafts", {}),
        ("POST", f"{base}/evidence/notes", {"json": {
            "title": "Registro inicial",
            "markdown": "Conteúdo",
            "phase": "reconnaissance",
            "tags": [],
            "targets": [],
            "finding_ids": [],
            "attachment_ids": [],
        }}),
        ("POST", f"{base}/evidence", {"data": {
            "phase": "reconnaissance",
            "text": "Conteúdo",
        }}),
        ("POST", f"{base}/findings", {"json": {
            "title": "Finding bloqueado",
            "description": "Conteúdo",
            "severity": "medium",
            "phase": "reconnaissance",
            "targets": [],
            "evidence_ids": [],
        }}),
        ("POST", f"{base}/finding-drafts", {}),
    ]

    for method, path, kwargs in requests:
        response = await async_client.request(method, path, headers=headers, **kwargs)
        assert response.status_code == 409, (method, path, response.text)
        assert response.json()["detail"] == "project_archived_read_only"


@pytest.mark.asyncio
async def test_archived_project_keeps_history_revisions_and_downloads_readable(async_client):
    await create_project(async_client)
    headers = headers_for("admin", "admin")
    base = "/api/redmode/projects/cliente-demo"

    scope = await async_client.post(
        f"{base}/scope/text",
        json={"text": "example.com"},
        headers=headers,
    )
    assert scope.status_code == 201
    scope_id = scope.json()["id"]

    evidence = await async_client.post(
        f"{base}/evidence",
        data={"phase": "reconnaissance", "text": "Prova"},
        files={"file": ("prova.txt", b"conteudo", "text/plain")},
        headers=headers,
    )
    assert evidence.status_code == 201
    evidence_id = evidence.json()["id"]

    finding = await async_client.post(
        f"{base}/findings",
        json={
            "title": "Finding legível",
            "description": "Conteúdo",
            "severity": "medium",
            "phase": "reconnaissance",
            "targets": [],
            "evidence_ids": [],
        },
        headers=headers,
    )
    assert finding.status_code == 201
    finding_id = finding.json()["id"]

    await archive_project(async_client)

    paths = [
        base,
        f"{base}/activity",
        f"{base}/identity",
        f"{base}/enrichment/policy",
        f"{base}/scope/active",
        f"{base}/scope/versions",
        f"{base}/scope/versions/{scope_id}",
        f"{base}/scope/versions/{scope_id}/sources/text/representation",
        f"{base}/evidence",
        f"{base}/evidence/{evidence_id}",
        f"{base}/evidence/{evidence_id}/file",
        f"{base}/findings",
        f"{base}/findings/{finding_id}",
        f"{base}/findings/{finding_id}/revisions",
    ]
    for path in paths:
        response = await async_client.get(path, headers=headers)
        assert response.status_code == 200, (path, response.text)

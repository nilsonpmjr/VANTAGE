"""First RedMode slice: workspace permission, project feed, and creator access."""

import io

import pytest
from docx import Document

from auth import create_access_token


class MemoryScopeFiles:
    def __init__(self):
        self.files = {}
        self.fail_save = False

    async def save(self, filename, content, metadata):
        if self.fail_save:
            raise RuntimeError("storage unavailable")
        file_id = f"file-{len(self.files) + 1}"
        self.files[file_id] = content
        return file_id

    async def read(self, file_id):
        if file_id not in self.files:
            raise FileNotFoundError(file_id)
        return self.files[file_id]

    async def delete(self, file_id):
        self.files.pop(file_id, None)


@pytest.fixture
def scope_files(monkeypatch):
    import routers.redmode as redmode
    store = MemoryScopeFiles()
    monkeypatch.setattr(redmode, "file_store", lambda: store)
    return store


def headers_for(username: str, role: str = "tech") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


async def grant_redmode(fake_db, username: str) -> None:
    await fake_db.users.update_one(
        {"username": username},
        {"$set": {"extra_permissions": ["redmode:access"]}},
    )


@pytest.mark.asyncio
async def test_workspace_requires_redmode_permission(async_client):
    response = await async_client.get("/api/redmode/projects", headers=headers_for("techuser"))
    assert response.status_code == 403

    response = await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("techuser"),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_creator_is_member_and_feed_is_summary_only(async_client, fake_db):
    await grant_redmode(fake_db, "techuser")
    created = await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("techuser"),
    )
    assert created.status_code == 201
    body = created.json()
    assert body["slug"] == "cliente-demo"
    assert body["members"] == ["techuser"]
    assert body["responsible"] == "techuser"

    detail = await async_client.get(
        "/api/redmode/projects/cliente-demo", headers=headers_for("techuser")
    )
    assert detail.status_code == 200
    assert detail.json()["members"] == ["techuser"]

    feed = await async_client.get("/api/redmode/projects", headers=headers_for("techuser"))
    assert feed.status_code == 200
    assert feed.json()["total"] == 1
    item = feed.json()["items"][0]
    assert set(item) == {"slug", "display_name", "phase", "status", "responsible", "last_activity_at"}
    assert item["slug"] == "cliente-demo"
    assert "members" not in item


@pytest.mark.asyncio
async def test_enabled_nonmember_sees_summary_but_not_detail(async_client, fake_db):
    created = await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    assert created.status_code == 201
    await grant_redmode(fake_db, "techuser")

    feed = await async_client.get("/api/redmode/projects", headers=headers_for("techuser"))
    assert feed.status_code == 200
    assert feed.json()["total"] == 1
    detail = await async_client.get(
        "/api/redmode/projects/cliente-demo", headers=headers_for("techuser")
    )
    assert detail.status_code == 403


@pytest.mark.asyncio
async def test_admin_without_membership_cannot_open_project(async_client, fake_db):
    await grant_redmode(fake_db, "techuser")
    created = await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("techuser"),
    )
    assert created.status_code == 201

    detail = await async_client.get(
        "/api/redmode/projects/cliente-demo", headers=headers_for("admin", "admin")
    )
    assert detail.status_code == 403


@pytest.mark.asyncio
async def test_project_feed_can_be_paginated(async_client):
    for slug in ("cliente-um", "cliente-dois"):
        response = await async_client.post(
            "/api/redmode/projects",
            json={"slug": slug, "display_name": slug},
            headers=headers_for("admin", "admin"),
        )
        assert response.status_code == 201
    response = await async_client.get(
        "/api/redmode/projects?limit=1&offset=1", headers=headers_for("admin", "admin")
    )
    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert len(response.json()["items"]) == 1


@pytest.mark.asyncio
async def test_duplicate_project_identifier_is_rejected(async_client):
    payload = {"slug": "cliente-demo", "display_name": "Cliente Demo"}
    first = await async_client.post(
        "/api/redmode/projects", json=payload, headers=headers_for("admin", "admin")
    )
    second = await async_client.post(
        "/api/redmode/projects", json=payload, headers=headers_for("admin", "admin")
    )
    assert first.status_code == 201
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_invalid_project_identifier_is_rejected(async_client):
    response = await async_client.post(
        "/api/redmode/projects",
        json={"slug": "../segredo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_responsible_can_add_and_remove_enabled_member(async_client, fake_db):
    await grant_redmode(fake_db, "techuser")
    created = await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    assert created.status_code == 201

    added = await async_client.put(
        "/api/redmode/projects/cliente-demo/members/techuser",
        headers=headers_for("admin", "admin"),
    )
    assert added.status_code == 200
    assert added.json()["members"] == ["admin", "techuser"]
    member_detail = await async_client.get(
        "/api/redmode/projects/cliente-demo", headers=headers_for("techuser")
    )
    assert member_detail.status_code == 200

    activity = await async_client.get(
        "/api/redmode/projects/cliente-demo/activity", headers=headers_for("techuser")
    )
    assert activity.status_code == 200
    assert activity.json()["items"][-1]["type"] == "member_added"

    removed = await async_client.delete(
        "/api/redmode/projects/cliente-demo/members/techuser",
        headers=headers_for("admin", "admin"),
    )
    assert removed.status_code == 200
    assert removed.json()["members"] == ["admin"]
    revoked = await async_client.get(
        "/api/redmode/projects/cliente-demo", headers=headers_for("techuser")
    )
    assert revoked.status_code == 403
    revoked_activity = await async_client.get(
        "/api/redmode/projects/cliente-demo/activity", headers=headers_for("techuser")
    )
    assert revoked_activity.status_code == 403

    activity = await async_client.get(
        "/api/redmode/projects/cliente-demo/activity", headers=headers_for("admin", "admin")
    )
    assert [item["type"] for item in activity.json()["items"]] == [
        "project_created", "member_added", "member_removed"
    ]


@pytest.mark.asyncio
async def test_only_responsible_can_change_members(async_client, fake_db):
    await grant_redmode(fake_db, "techuser")
    created = await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    assert created.status_code == 201
    await async_client.put(
        "/api/redmode/projects/cliente-demo/members/techuser",
        headers=headers_for("admin", "admin"),
    )
    response = await async_client.delete(
        "/api/redmode/projects/cliente-demo/members/admin",
        headers=headers_for("techuser"),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_cannot_add_disabled_or_unenabled_user(async_client, fake_db):
    created = await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    assert created.status_code == 201
    for username in ("techuser", "inactive"):
        response = await async_client.put(
            f"/api/redmode/projects/cliente-demo/members/{username}",
            headers=headers_for("admin", "admin"),
        )
        assert response.status_code == 422
    detail = await async_client.get(
        "/api/redmode/projects/cliente-demo", headers=headers_for("admin", "admin")
    )
    assert detail.json()["members"] == ["admin"]


@pytest.mark.asyncio
async def test_text_scope_publishes_version_without_review(async_client, fake_db):
    created = await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    assert created.status_code == 201
    first = await async_client.post(
        "/api/redmode/projects/cliente-demo/scope/text",
        json={"text": "192.0.2.10\nTerceiros:\n203.0.113.10"},
        headers=headers_for("admin", "admin"),
    )
    assert first.status_code == 201
    scope = first.json()
    assert scope["author"] == "admin"
    assert scope["source"]["sha256"]
    assert {rule["category"] for rule in scope["rules"]} == {"client", "third_party"}
    active = await async_client.get(
        "/api/redmode/projects/cliente-demo/scope/active", headers=headers_for("admin", "admin")
    )
    assert active.status_code == 200
    assert active.json()["id"] == scope["id"]
    history = await async_client.get(
        "/api/redmode/projects/cliente-demo/scope/versions", headers=headers_for("admin", "admin")
    )
    assert history.status_code == 200
    assert [item["id"] for item in history.json()["items"]] == [scope["id"]]

    await grant_redmode(fake_db, "techuser")
    denied = await async_client.get(
        "/api/redmode/projects/cliente-demo/scope/active", headers=headers_for("techuser")
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_invalid_text_scope_keeps_previous_version(async_client):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    first = await async_client.post(
        "/api/redmode/projects/cliente-demo/scope/text",
        json={"text": "192.0.2.10"},
        headers=headers_for("admin", "admin"),
    )
    assert first.status_code == 201
    failed = await async_client.post(
        "/api/redmode/projects/cliente-demo/scope/text",
        json={"text": "Nenhum endereço informado."},
        headers=headers_for("admin", "admin"),
    )
    assert failed.status_code == 422
    active = await async_client.get(
        "/api/redmode/projects/cliente-demo/scope/active", headers=headers_for("admin", "admin")
    )
    assert active.json()["id"] == first.json()["id"]


@pytest.mark.asyncio
async def test_scope_history_keeps_previous_versions(async_client):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    versions = []
    for text in ("192.0.2.10", "192.0.2.20"):
        response = await async_client.post(
            "/api/redmode/projects/cliente-demo/scope/text",
            json={"text": text},
            headers=headers_for("admin", "admin"),
        )
        assert response.status_code == 201
        versions.append(response.json()["id"])
    history = await async_client.get(
        "/api/redmode/projects/cliente-demo/scope/versions", headers=headers_for("admin", "admin")
    )
    assert [item["id"] for item in history.json()["items"]] == versions[::-1]
    previous = await async_client.get(
        f"/api/redmode/projects/cliente-demo/scope/versions/{versions[0]}",
        headers=headers_for("admin", "admin"),
    )
    assert previous.json()["rules"][0]["value"] == "192.0.2.10"
    active = await async_client.get(
        "/api/redmode/projects/cliente-demo/scope/active", headers=headers_for("admin", "admin")
    )
    assert active.json()["id"] == versions[1]


@pytest.mark.asyncio
async def test_text_scope_limit_is_enforced(async_client):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    response = await async_client.post(
        "/api/redmode/projects/cliente-demo/scope/text",
        json={"text": "x" * 500001},
        headers=headers_for("admin", "admin"),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_mixed_scope_upload_and_private_download(async_client, fake_db, scope_files):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    response = await async_client.post(
        "/api/redmode/projects/cliente-demo/scope/submit",
        data={"text": "192.0.2.10"},
        files=[
            ("files", ("scope.csv", b"category,target\nthird_party,203.0.113.10", "text/csv")),
            ("files", ("scope.json", b'{"excluded":["192.0.2.10"]}', "application/json")),
        ],
        headers=headers_for("admin", "admin"),
    )
    assert response.status_code == 201
    version = response.json()
    assert len(version["source"]["files"]) == 2
    assert {rule["value"]: rule["category"] for rule in version["rules"]} == {
        "192.0.2.10": "excluded", "203.0.113.10": "third_party"
    }
    excluded = next(rule for rule in version["rules"] if rule["value"] == "192.0.2.10")
    assert {origin["source_id"] for origin in excluded["origins"]} == {
        "text", version["source"]["files"][1]["source_id"]
    }
    file_id = version["source"]["files"][0]["id"]
    path = f"/api/redmode/projects/cliente-demo/scope/versions/{version['id']}/files/{file_id}"
    downloaded = await async_client.get(path, headers=headers_for("admin", "admin"))
    assert downloaded.status_code == 200
    assert downloaded.content == scope_files.files[file_id]
    assert downloaded.headers["cache-control"] == "private, no-store"

    await grant_redmode(fake_db, "techuser")
    denied = await async_client.get(path, headers=headers_for("techuser"))
    assert denied.status_code == 403
    denied_upload = await async_client.post(
        "/api/redmode/projects/cliente-demo/scope/submit",
        files=[("files", ("other.txt", b"198.51.100.10", "text/plain"))],
        headers=headers_for("techuser"),
    )
    assert denied_upload.status_code == 403


@pytest.mark.asyncio
async def test_invalid_file_does_not_replace_active_scope(async_client, scope_files):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    first = await async_client.post(
        "/api/redmode/projects/cliente-demo/scope/text",
        json={"text": "192.0.2.10"},
        headers=headers_for("admin", "admin"),
    )
    failed = await async_client.post(
        "/api/redmode/projects/cliente-demo/scope/submit",
        files=[("files", ("scope.pdf", b"not a pdf", "application/pdf"))],
        headers=headers_for("admin", "admin"),
    )
    assert failed.status_code == 422
    assert scope_files.files == {}
    active = await async_client.get(
        "/api/redmode/projects/cliente-demo/scope/active", headers=headers_for("admin", "admin")
    )
    assert active.json()["id"] == first.json()["id"]


@pytest.mark.asyncio
async def test_scope_upload_limits_are_enforced(async_client, scope_files, monkeypatch):
    from config import settings
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    monkeypatch.setattr(settings, "redmode_scope_max_file_bytes", 4)
    response = await async_client.post(
        "/api/redmode/projects/cliente-demo/scope/submit",
        files=[("files", ("scope.txt", b"192.0.2.10", "text/plain"))],
        headers=headers_for("admin", "admin"),
    )
    assert response.status_code == 413
    assert scope_files.files == {}


@pytest.mark.asyncio
async def test_file_storage_failure_does_not_publish_scope(async_client, scope_files):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    scope_files.fail_save = True
    response = await async_client.post(
        "/api/redmode/projects/cliente-demo/scope/submit",
        files=[("files", ("scope.txt", b"192.0.2.10", "text/plain"))],
        headers=headers_for("admin", "admin"),
    )
    assert response.status_code == 503
    active = await async_client.get(
        "/api/redmode/projects/cliente-demo/scope/active", headers=headers_for("admin", "admin")
    )
    assert active.status_code == 404


@pytest.mark.asyncio
async def test_document_scope_has_position_and_preserves_previous_on_no_text(async_client, scope_files):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "cliente-demo", "display_name": "Cliente Demo"},
        headers=headers_for("admin", "admin"),
    )
    document = Document()
    document.add_paragraph("198.51.100.10")
    output = io.BytesIO()
    document.save(output)
    published = await async_client.post(
        "/api/redmode/projects/cliente-demo/scope/submit",
        files=[("files", ("scope.docx", output.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))],
        headers=headers_for("admin", "admin"),
    )
    assert published.status_code == 201
    assert published.json()["rules"][0]["origins"][0]["position"] == "parágrafo 1"

    blank = Document()
    blank_output = io.BytesIO()
    blank.save(blank_output)
    failed = await async_client.post(
        "/api/redmode/projects/cliente-demo/scope/submit",
        files=[("files", ("blank.docx", blank_output.getvalue(), "application/octet-stream"))],
        headers=headers_for("admin", "admin"),
    )
    assert failed.status_code == 422
    assert failed.json()["detail"] == "scope_file_no_text"
    active = await async_client.get(
        "/api/redmode/projects/cliente-demo/scope/active", headers=headers_for("admin", "admin")
    )
    assert active.json()["id"] == published.json()["id"]

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
    assert event["type"] == "evidence_added"
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

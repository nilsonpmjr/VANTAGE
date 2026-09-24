"""Manual findings keep immutable revisions and project isolation."""

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

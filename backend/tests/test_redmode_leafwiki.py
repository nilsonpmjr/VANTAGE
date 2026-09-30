"""Tests for LeafWiki features translated to RedMode: tree, sections, move, copy, pin, favorites, refactor, tags, import/export."""

import io
import zipfile
import pytest

from auth import create_access_token


def headers_for(username: str, role: str = "tech") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


async def grant_redmode(fake_db, username: str) -> None:
    await fake_db.users.update_one(
        {"username": username},
        {"$set": {"extra_permissions": ["redmode:access"]}},
    )


@pytest.mark.asyncio
async def test_leafwiki_tree_sections_and_move(async_client, fake_db):
    # Setup project
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "leafwiki-proj", "display_name": "LeafWiki Proj"},
        headers=headers_for("admin", "admin"),
    )

    # 1. Create a section folder
    section_res = await async_client.post(
        "/api/redmode/projects/leafwiki-proj/evidence/sections",
        json={"title": "Reconnaissance", "phase": "reconnaissance"},
        headers=headers_for("admin", "admin"),
    )
    assert section_res.status_code == 201, section_res.text
    section = section_res.json()
    assert section["kind"] == "section"
    assert section["title"] == "Reconnaissance"

    # 2. Create a child page inside the section
    child_res = await async_client.post(
        "/api/redmode/projects/leafwiki-proj/evidence/notes",
        json={
            "title": "Subdomains List",
            "markdown": "Discovered subdomains via [[Missing Note]]",
            "phase": "reconnaissance",
            "parent_id": section["id"],
        },
        headers=headers_for("admin", "admin"),
    )
    assert child_res.status_code == 201, child_res.text
    child = child_res.json()
    assert child["parent_id"] == section["id"]

    # 3. Create a root page
    root_page_res = await async_client.post(
        "/api/redmode/projects/leafwiki-proj/evidence/notes",
        json={
            "title": "Initial Scoping",
            "markdown": "Scope definition notes",
            "phase": "pre-engagement",
        },
        headers=headers_for("admin", "admin"),
    )
    assert root_page_res.status_code == 201
    root_page = root_page_res.json()

    # 4. Fetch tree
    tree_res = await async_client.get(
        "/api/redmode/projects/leafwiki-proj/evidence/tree",
        headers=headers_for("admin", "admin"),
    )
    assert tree_res.status_code == 200
    tree_data = tree_res.json()
    assert tree_data["total"] == 3
    # Look for section node
    section_node = next(n for n in tree_data["tree"] if n["id"] == section["id"])
    assert len(section_node["children"]) == 1
    assert section_node["children"][0]["id"] == child["id"]
    assert section_node["children"][0]["path"] == "reconnaissance/subdomains-list"

    # 5. Move root page into section
    move_res = await async_client.post(
        f"/api/redmode/projects/leafwiki-proj/evidence/notes/{root_page['id']}/move",
        json={"parent_id": section["id"], "position": 0},
        headers=headers_for("admin", "admin"),
    )
    assert move_res.status_code == 200
    moved = move_res.json()
    assert moved["parent_id"] == section["id"]

    # 6. Cycle check: moving section into child should fail with 422
    cycle_res = await async_client.post(
        f"/api/redmode/projects/leafwiki-proj/evidence/notes/{section['id']}/move",
        json={"parent_id": child["id"]},
        headers=headers_for("admin", "admin"),
    )
    assert cycle_res.status_code == 422


@pytest.mark.asyncio
async def test_leafwiki_copy_pin_and_favorites(async_client, fake_db):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "leafwiki-proj-2", "display_name": "LeafWiki Proj 2"},
        headers=headers_for("admin", "admin"),
    )

    # Create note
    created = await async_client.post(
        "/api/redmode/projects/leafwiki-proj-2/evidence/notes",
        json={
            "title": "Original Note",
            "markdown": "Important pentest evidence content",
            "phase": "exploitation",
            "tags": ["critical", "rce"],
        },
        headers=headers_for("admin", "admin"),
    )
    assert created.status_code == 201
    orig = created.json()

    # 1. Pin note
    pin_res = await async_client.post(
        f"/api/redmode/projects/leafwiki-proj-2/evidence/notes/{orig['id']}/pin",
        json={"pinned": True},
        headers=headers_for("admin", "admin"),
    )
    assert pin_res.status_code == 200
    assert pin_res.json()["pinned"] is True

    # 2. Copy note
    copy_res = await async_client.post(
        f"/api/redmode/projects/leafwiki-proj-2/evidence/notes/{orig['id']}/copy",
        json={"new_title": "Original Note (Duplicated)"},
        headers=headers_for("admin", "admin"),
    )
    assert copy_res.status_code == 201
    copied = copy_res.json()
    assert copied["id"] != orig["id"]
    assert copied["title"] == "Original Note (Duplicated)"
    assert copied["markdown"] == orig["markdown"]
    assert "rce" in copied["tags"]

    # 3. Add to favorites
    fav_res = await async_client.post(
        f"/api/redmode/projects/leafwiki-proj-2/evidence/notes/{orig['id']}/favorite",
        headers=headers_for("admin", "admin"),
    )
    assert fav_res.status_code == 200
    assert fav_res.json()["favorited"] is True

    # List favorites
    fav_list = await async_client.get(
        "/api/redmode/projects/leafwiki-proj-2/evidence/favorites",
        headers=headers_for("admin", "admin"),
    )
    assert fav_list.status_code == 200
    assert fav_list.json()["total"] == 1
    assert fav_list.json()["favorites"][0]["id"] == orig["id"]

    # Remove from favorites
    unfav_res = await async_client.delete(
        f"/api/redmode/projects/leafwiki-proj-2/evidence/notes/{orig['id']}/favorite",
        headers=headers_for("admin", "admin"),
    )
    assert unfav_res.status_code == 200
    assert unfav_res.json()["favorited"] is False


@pytest.mark.asyncio
async def test_leafwiki_broken_links_and_refactor(async_client, fake_db):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "leafwiki-links", "display_name": "Links Test"},
        headers=headers_for("admin", "admin"),
    )

    # Note A: references Note B
    res_b = await async_client.post(
        "/api/redmode/projects/leafwiki-links/evidence/notes",
        json={
            "title": "Target Server",
            "markdown": "Target server details",
            "phase": "reconnaissance",
        },
        headers=headers_for("admin", "admin"),
    )
    assert res_b.status_code == 201

    res_a = await async_client.post(
        "/api/redmode/projects/leafwiki-links/evidence/notes",
        json={
            "title": "Attack Plan",
            "markdown": "We will target [[Target Server]] and also check [[Ghost Server]]",
            "phase": "threat-modeling",
        },
        headers=headers_for("admin", "admin"),
    )
    assert res_a.status_code == 201

    # Check broken links
    broken_res = await async_client.get(
        "/api/redmode/projects/leafwiki-links/evidence/links/broken",
        headers=headers_for("admin", "admin"),
    )
    assert broken_res.status_code == 200
    broken_data = broken_res.json()
    assert broken_data["total"] == 1
    assert broken_data["broken_links"][0]["target"] == "Ghost Server"

    # Refactor links from "Target Server" to "Target Bastion"
    refactor_res = await async_client.post(
        "/api/redmode/projects/leafwiki-links/evidence/links/refactor",
        json={
            "old_title": "Target Server",
            "new_title": "Target Bastion",
        },
        headers=headers_for("admin", "admin"),
    )
    assert refactor_res.status_code == 200
    refactor_data = refactor_res.json()
    assert refactor_data["notes_updated"] == 1
    assert refactor_data["links_refactored"] == 1

    # Verify Note A markdown now has [[Target Bastion]]
    note_a_check = await async_client.get(
        f"/api/redmode/projects/leafwiki-links/evidence/notes/{res_a.json()['id']}",
        headers=headers_for("admin", "admin"),
    )
    assert note_a_check.status_code == 200
    assert "[[Target Bastion]]" in note_a_check.json()["markdown"]


@pytest.mark.asyncio
async def test_leafwiki_tags_and_import_export(async_client, fake_db):
    await async_client.post(
        "/api/redmode/projects",
        json={"slug": "leafwiki-io", "display_name": "IO Test"},
        headers=headers_for("admin", "admin"),
    )

    # 1. Import markdown with YAML frontmatter
    md_content = """---
title: Active Directory Audit
phase: exploitation
tags:
  - active-directory
  - kerberos
targets:
  - 10.0.0.1
---

# AD Findings
Dumped tickets using mimikatz.
"""
    import_res = await async_client.post(
        "/api/redmode/projects/leafwiki-io/evidence/import",
        json={
            "filename": "ad-audit.md",
            "content": md_content,
        },
        headers=headers_for("admin", "admin"),
    )
    assert import_res.status_code == 201, import_res.text
    imported_note = import_res.json()
    assert imported_note["title"] == "Active Directory Audit"
    assert "active-directory" in imported_note["tags"]
    assert "kerberos" in imported_note["tags"]
    assert "10.0.0.1" in imported_note["targets"]

    # 2. Check tags index
    tags_res = await async_client.get(
        "/api/redmode/projects/leafwiki-io/evidence/tags",
        headers=headers_for("admin", "admin"),
    )
    assert tags_res.status_code == 200
    tags_list = tags_res.json()["tags"]
    tag_names = {t["tag"] for t in tags_list}
    assert "active-directory" in tag_names
    assert "kerberos" in tag_names

    # 3. Export single note
    export_note_res = await async_client.get(
        f"/api/redmode/projects/leafwiki-io/evidence/notes/{imported_note['id']}/export",
        headers=headers_for("admin", "admin"),
    )
    assert export_note_res.status_code == 200
    assert "---" in export_note_res.text
    assert "title: Active Directory Audit" in export_note_res.text

    # 4. Export whole bundle as zip
    bundle_res = await async_client.get(
        "/api/redmode/projects/leafwiki-io/evidence/export/bundle",
        headers=headers_for("admin", "admin"),
    )
    assert bundle_res.status_code == 200
    assert bundle_res.headers["content-type"] == "application/zip"
    zf = zipfile.ZipFile(io.BytesIO(bundle_res.content))
    filenames = zf.namelist()
    assert any("active-directory-audit.md" in f for f in filenames)

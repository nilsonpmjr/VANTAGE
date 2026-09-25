"""Member-scoped contract for the Offensive Mode Home."""

from datetime import datetime, timedelta, timezone

import pytest

from auth import create_access_token


def headers_for(username: str, role: str = "tech") -> dict[str, str]:
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}


async def grant_offensive_access(fake_db, username: str) -> None:
    await fake_db.users.update_one(
        {"username": username},
        {"$set": {"extra_permissions": ["redmode:access"]}},
    )


def project_doc(
    slug: str,
    *,
    members: list[str],
    last_activity_at: datetime,
    status: str = "active",
    phase: str = "reconnaissance",
    active_scope_version: str | None = None,
    activity_events: list[dict] | None = None,
) -> dict:
    return {
        "_id": slug,
        "display_name": slug.replace("-", " ").title(),
        "phase": phase,
        "status": status,
        "responsible": members[0],
        "members": members,
        "created_at": last_activity_at - timedelta(days=10),
        "last_activity_at": last_activity_at,
        "active_scope_version": active_scope_version,
        "activity_events": activity_events or [],
    }


@pytest.mark.asyncio
async def test_home_requires_offensive_access(async_client):
    response = await async_client.get(
        "/api/redmode/home",
        headers=headers_for("techuser"),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_home_returns_zero_values_without_member_engagements(async_client, fake_db):
    await grant_offensive_access(fake_db, "techuser")

    response = await async_client.get(
        "/api/redmode/home",
        headers=headers_for("techuser"),
    )

    assert response.status_code == 200
    assert response.json()["resume"] is None
    assert response.json()["metrics"] == {
        "active_engagements": 0,
        "scopes_needing_attention": 0,
        "high_critical_findings": 0,
        "activity_7d": 0,
    }
    assert response.json()["charts"] == {
        "ptes_pipeline": [
            {"phase": phase, "count": 0}
            for phase in (
                "pre-engagement",
                "reconnaissance",
                "threat-modeling",
                "vulnerability-analysis",
                "exploitation",
                "post-exploitation",
                "reporting",
            )
        ],
        "finding_severity": [
            {"severity": severity, "count": 0}
            for severity in ("informational", "low", "medium", "high", "critical")
        ],
        "scope_readiness": {"with_active_scope": 0, "without_active_scope": 0},
    }


@pytest.mark.asyncio
async def test_home_metrics_and_resume_only_include_member_engagements(async_client, fake_db):
    await grant_offensive_access(fake_db, "techuser")
    now = datetime.now(timezone.utc)
    await fake_db.redmode_projects.insert_one(project_doc(
        "recent-member",
        members=["techuser"],
        last_activity_at=now,
        activity_events=[
            {"type": "evidence_added", "author": "techuser", "subject": "ev-1", "at": now},
            {"type": "finding_created", "author": "techuser", "subject": "old", "at": now - timedelta(days=8)},
        ],
    ))
    await fake_db.redmode_projects.insert_one(project_doc(
        "remembered-member",
        members=["techuser"],
        last_activity_at=now - timedelta(days=1),
        phase="reporting",
        active_scope_version="scope-member",
    ))
    await fake_db.redmode_projects.insert_one(project_doc(
        "outsider-project",
        members=["admin"],
        last_activity_at=now + timedelta(minutes=1),
        activity_events=[
            {"type": "scope_published", "author": "admin", "subject": "scope-out", "at": now},
        ],
    ))
    await fake_db.redmode_scope_versions.insert_one({
        "_id": "scope-member",
        "project_slug": "remembered-member",
        "author": "techuser",
        "created_at": now - timedelta(days=2),
        "source": {"kind": "text", "text": "", "sha256": "member", "files": []},
        "rules": [],
    })
    for finding_id, project_slug, revision_id, severity in (
        ("finding-member", "recent-member", "revision-member", "high"),
        ("finding-outsider", "outsider-project", "revision-outsider", "critical"),
    ):
        await fake_db.redmode_findings.insert_one({
            "_id": finding_id,
            "project_slug": project_slug,
            "current_revision_id": revision_id,
            "created_at": now,
            "updated_at": now,
        })
        await fake_db.redmode_finding_revisions.insert_one({
            "_id": revision_id,
            "finding_id": finding_id,
            "project_slug": project_slug,
            "severity": severity,
        })
    await fake_db.redmode_finding_revisions.insert_one({
        "_id": "revision-member-old",
        "finding_id": "finding-member",
        "project_slug": "recent-member",
        "severity": "critical",
    })
    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"last_offensive_engagement": "remembered-member"}},
    )

    response = await async_client.get(
        "/api/redmode/home",
        headers=headers_for("techuser"),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["metrics"] == {
        "active_engagements": 2,
        "scopes_needing_attention": 1,
        "high_critical_findings": 1,
        "activity_7d": 1,
    }
    assert data["resume"]["slug"] == "remembered-member"
    assert data["resume"]["active_scope"]["id"] == "scope-member"
    assert data["charts"]["ptes_pipeline"] == [
        {"phase": "pre-engagement", "count": 0},
        {"phase": "reconnaissance", "count": 1},
        {"phase": "threat-modeling", "count": 0},
        {"phase": "vulnerability-analysis", "count": 0},
        {"phase": "exploitation", "count": 0},
        {"phase": "post-exploitation", "count": 0},
        {"phase": "reporting", "count": 1},
    ]
    assert data["charts"]["finding_severity"] == [
        {"severity": "informational", "count": 0},
        {"severity": "low", "count": 0},
        {"severity": "medium", "count": 0},
        {"severity": "high", "count": 1},
        {"severity": "critical", "count": 0},
    ]
    assert data["charts"]["scope_readiness"] == {
        "with_active_scope": 1,
        "without_active_scope": 1,
    }
    assert "outsider-project" not in str(data)

    await fake_db.users.update_one(
        {"username": "techuser"},
        {"$set": {"last_offensive_engagement": "outsider-project"}},
    )
    fallback = await async_client.get(
        "/api/redmode/home",
        headers=headers_for("techuser"),
    )
    assert fallback.status_code == 200
    assert fallback.json()["resume"]["slug"] == "recent-member"


@pytest.mark.asyncio
async def test_opened_engagement_is_remembered_only_for_members(async_client, fake_db):
    await grant_offensive_access(fake_db, "techuser")
    now = datetime.now(timezone.utc)
    await fake_db.redmode_projects.insert_one(project_doc(
        "member-project",
        members=["techuser"],
        last_activity_at=now,
    ))
    await fake_db.redmode_projects.insert_one(project_doc(
        "outsider-project",
        members=["admin"],
        last_activity_at=now,
    ))

    remembered = await async_client.put(
        "/api/redmode/projects/member-project/resume",
        headers=headers_for("techuser"),
    )
    assert remembered.status_code == 200
    assert remembered.json() == {"slug": "member-project"}
    user = await fake_db.users.find_one({"username": "techuser"})
    assert user["last_offensive_engagement"] == "member-project"

    denied = await async_client.put(
        "/api/redmode/projects/outsider-project/resume",
        headers=headers_for("techuser"),
    )
    assert denied.status_code == 403
    user = await fake_db.users.find_one({"username": "techuser"})
    assert user["last_offensive_engagement"] == "member-project"

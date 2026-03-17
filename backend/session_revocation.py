"""
Helpers for revoking refresh-token-backed sessions.
"""

from __future__ import annotations


_ROLE_RANK = {
    "admin": 3,
    "manager": 2,
    "tech": 1,
}


async def revoke_user_refresh_tokens(db, username: str, exclude_session_id: str | None = None) -> int:
    """
    Revoke all active refresh-token sessions for a user.

    Returns the number of sessions revoked.
    """
    if db is None:
        return 0

    docs = await db.refresh_tokens.find(
        {"username": username, "revoked": False},
    ).to_list(length=1000)

    revoked_count = 0
    for doc in docs:
        session_id = doc.get("session_id")
        if not session_id or session_id == exclude_session_id:
            continue
        await db.refresh_tokens.update_one(
            {"session_id": session_id},
            {"$set": {"revoked": True}},
        )
        revoked_count += 1

    return revoked_count


async def revoke_refresh_session(db, session_id: str, username: str | None = None) -> bool:
    """
    Revoke a specific refresh-token-backed session.

    If `username` is provided, the session must also belong to that user.
    """
    if db is None:
        return False

    query = {"session_id": session_id, "revoked": False}
    if username is not None:
        query["username"] = username

    doc = await db.refresh_tokens.find_one(query)
    if not doc:
        return False

    await db.refresh_tokens.update_one(
        {"session_id": session_id},
        {"$set": {"revoked": True}},
    )
    return True


def is_sensitive_role_downgrade(old_role: str | None, new_role: str | None) -> bool:
    """
    Return True when a privileged role is downgraded to a lower-privilege one.
    """
    if not old_role or not new_role or old_role == new_role:
        return False
    if old_role not in {"admin", "manager"}:
        return False
    return _ROLE_RANK.get(new_role, 0) < _ROLE_RANK.get(old_role, 0)

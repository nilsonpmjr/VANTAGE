"""
Identity helpers for normalized email handling.
"""

from __future__ import annotations


def normalize_email(email: str | None) -> str | None:
    if email is None:
        return None
    normalized = email.strip().lower()
    return normalized or None


async def find_user_by_normalized_email(db, normalized_email: str | None):
    """
    Resolve a user by normalized email, with a fallback to legacy `email` data.
    """
    if db is None or not normalized_email:
        return None

    user = await db.users.find_one({"normalized_email": normalized_email})
    if user is not None:
        return user

    return await db.users.find_one({"email": normalized_email})


async def email_in_use(db, normalized_email: str | None, exclude_username: str | None = None) -> bool:
    """
    Return True if a normalized email is already assigned to a different user.
    """
    if not normalized_email:
        return False

    user = await find_user_by_normalized_email(db, normalized_email)
    if user is None:
        return False
    return user.get("username") != exclude_username

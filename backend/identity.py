"""
Identity helpers for normalized email handling.
"""

from __future__ import annotations

import re


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(email: str | None) -> str | None:
    if email is None:
        return None
    normalized = email.strip().lower()
    return normalized or None


def is_valid_email_format(email: str | None) -> bool:
    if not email:
        return False
    return EMAIL_RE.match(email) is not None


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


async def find_user_by_password_reset_email(db, normalized_email: str | None):
    """
    Resolve a user by recovery email first, then by the primary account email.
    """
    if db is None or not normalized_email:
        return None

    for field in ("normalized_recovery_email", "recovery_email", "normalized_email", "email"):
        user = await db.users.find_one({field: normalized_email})
        if user is not None:
            return user

    return None


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


async def any_contact_email_in_use(
    db,
    normalized_email: str | None,
    exclude_username: str | None = None,
) -> bool:
    """
    Return True if this email is already used as a primary or recovery email
    by another user.
    """
    if db is None or not normalized_email:
        return False

    users = await db.users.find(
        {},
        {
            "username": 1,
            "normalized_email": 1,
            "email": 1,
            "normalized_recovery_email": 1,
            "recovery_email": 1,
        },
    ).to_list(length=1000)

    for user in users:
        if user.get("username") == exclude_username:
            continue
        values = {
            user.get("normalized_email"),
            user.get("email"),
            user.get("normalized_recovery_email"),
            user.get("recovery_email"),
        }
        if normalized_email in values:
            return True

    return False

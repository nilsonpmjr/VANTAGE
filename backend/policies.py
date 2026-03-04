"""
Shared password and lockout policy helpers.

Separate module to avoid circular imports between auth.py ↔ admin routers.
"""

from datetime import datetime, timezone
from typing import Optional


DEFAULT_PASSWORD_POLICY = {
    "min_length": 8,
    "require_uppercase": False,
    "require_numbers": False,
    "require_symbols": False,
    "history_count": 5,
    "expiry_days": 0,           # 0 = disabled
    "expiry_warning_days": 7,
}


async def get_password_policy(db) -> dict:
    """Return the current password policy, falling back to defaults."""
    policy = await db.password_policy.find_one({"_id": "singleton"})
    if not policy:
        return dict(DEFAULT_PASSWORD_POLICY)
    return {k: policy.get(k, v) for k, v in DEFAULT_PASSWORD_POLICY.items()}


def validate_password(password: str, policy: dict) -> list:
    """
    Validate a password against the policy.
    Returns a list of error code strings. Empty list = password is valid.
    """
    errors = []
    min_len = policy.get("min_length", 8)
    if len(password) < min_len:
        errors.append(f"password_too_short:{min_len}")
    if policy.get("require_uppercase") and not any(c.isupper() for c in password):
        errors.append("password_needs_uppercase")
    if policy.get("require_numbers") and not any(c.isdigit() for c in password):
        errors.append("password_needs_number")
    if policy.get("require_symbols") and not any(not c.isalnum() for c in password):
        errors.append("password_needs_symbol")
    return errors


def compute_expiry_days_left(user: dict, policy: dict) -> Optional[int]:
    """
    Returns days until password expires, or None if expiry is disabled.
    Returns 0 if the password has already expired.
    """
    expiry_days = policy.get("expiry_days", 0)
    if not expiry_days:
        return None

    changed_at = user.get("password_changed_at")
    if not changed_at:
        # No recorded change date → treat as expired
        return 0

    now = datetime.now(timezone.utc)
    if changed_at.tzinfo is None:
        changed_at = changed_at.replace(tzinfo=timezone.utc)

    elapsed = (now - changed_at).days
    return max(0, expiry_days - elapsed)

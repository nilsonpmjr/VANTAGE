"""
Audit logging middleware for security-relevant actions.

Stores records in MongoDB `audit_log` collection.
Usage:
    from audit import log_action
    await log_action(db, user="admin", action="login", target="admin", ip="1.2.3.4", result="success")
"""

from datetime import datetime, timezone
from logging_config import get_logger

logger = get_logger("Audit")


async def log_action(
    db,
    user: str,
    action: str,
    target: str = "",
    ip: str = "",
    result: str = "success",
    detail: str = "",
) -> None:
    """
    Persist an audit event.  Silently skips if db is None.

    Args:
        db:     Motor database instance.
        user:   Username performing the action.
        action: Action identifier (e.g. "login", "analyze", "delete_user").
        target: Affected resource (e.g. username or IP being analyzed).
        ip:     Source IP of the request.
        result: "success" | "failure" | "denied".
        detail: Optional free-form context.
    """
    if db is None:
        return
    try:
        await db.audit_log.insert_one({
            "timestamp": datetime.now(timezone.utc),
            "user": user,
            "action": action,
            "target": target,
            "ip": ip,
            "result": result,
            "detail": detail,
        })
    except Exception as e:
        logger.warning(f"Audit log write failed: {e}")

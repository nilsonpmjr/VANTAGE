from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional

from db import db_manager
from auth import require_role
from policies import get_password_policy, DEFAULT_PASSWORD_POLICY
from logging_config import get_logger

logger = get_logger("AdminRouter")

router = APIRouter(prefix="/admin", tags=["admin"])

_DEFAULT_MAX_ATTEMPTS = 5
_DEFAULT_LOCKOUT_MINUTES = 15


async def get_lockout_policy(db) -> dict:
    """Return the current lockout policy, falling back to defaults."""
    policy = await db.lockout_policy.find_one({"_id": "singleton"})
    if not policy:
        return {"max_attempts": _DEFAULT_MAX_ATTEMPTS, "lockout_minutes": _DEFAULT_LOCKOUT_MINUTES}
    return {"max_attempts": policy["max_attempts"], "lockout_minutes": policy["lockout_minutes"]}


class LockoutPolicyUpdate(BaseModel):
    max_attempts: int = Field(..., ge=1, le=100)
    lockout_minutes: int = Field(..., ge=1, le=1440)


@router.get("/lockout-policy")
async def read_lockout_policy(current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    return await get_lockout_policy(db)


@router.put("/lockout-policy")
async def update_lockout_policy(
    policy: LockoutPolicyUpdate,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    await db.lockout_policy.update_one(
        {"_id": "singleton"},
        {"$set": {"max_attempts": policy.max_attempts, "lockout_minutes": policy.lockout_minutes}},
        upsert=True,
    )
    logger.info(
        f"Admin '{current_user['username']}' updated lockout policy: "
        f"max_attempts={policy.max_attempts}, lockout_minutes={policy.lockout_minutes}"
    )
    return {"max_attempts": policy.max_attempts, "lockout_minutes": policy.lockout_minutes}


class PasswordPolicyUpdate(BaseModel):
    min_length: Optional[int] = Field(None, ge=6, le=128)
    require_uppercase: Optional[bool] = None
    require_numbers: Optional[bool] = None
    require_symbols: Optional[bool] = None
    history_count: Optional[int] = Field(None, ge=0, le=24)
    expiry_days: Optional[int] = Field(None, ge=0, le=3650)
    expiry_warning_days: Optional[int] = Field(None, ge=1, le=90)


@router.get("/password-policy")
async def read_password_policy(current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    return await get_password_policy(db)


@router.put("/password-policy")
async def update_password_policy(
    policy: PasswordPolicyUpdate,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    # Build the update from current policy, applying only provided fields
    current = await get_password_policy(db)
    updates = policy.model_dump(exclude_none=True)
    current.update(updates)

    await db.password_policy.update_one(
        {"_id": "singleton"},
        {"$set": current},
        upsert=True,
    )
    logger.info(f"Admin '{current_user['username']}' updated password policy: {updates}")
    return current


@router.get("/stats")
async def get_admin_stats(current_user: dict = Depends(require_role(["admin", "manager"]))):
    """IAM metrics for the admin dashboard."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(hours=24)

    all_users = await db.users.find({}).to_list(length=1000)

    total_users = len(all_users)
    active_users = sum(1 for u in all_users if u.get("is_active", True) is not False)
    suspended_users = total_users - active_users
    locked_accounts = sum(
        1 for u in all_users
        if u.get("locked_until") and u["locked_until"] > now
    )
    users_with_mfa = sum(1 for u in all_users if u.get("mfa_enabled", False))
    failed_logins_24h = sum(
        1 for u in all_users
        if u.get("last_failed_at") and u["last_failed_at"] > yesterday
    )

    return {
        "total_users": total_users,
        "active_users": active_users,
        "suspended_users": suspended_users,
        "locked_accounts": locked_accounts,
        "users_with_mfa": users_with_mfa,
        "active_sessions": 0,
        "failed_logins_24h": failed_logins_24h,
        "active_api_keys": 0,
    }


@router.post("/users/{username}/unlock")
async def unlock_user(
    username: str,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    user = await db.users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.users.update_one(
        {"username": username},
        {"$set": {"failed_login_count": 0, "locked_until": None, "last_failed_at": None}},
    )
    logger.info(f"Admin '{current_user['username']}' unlocked user '{username}'")
    return {"message": f"User '{username}' has been unlocked."}

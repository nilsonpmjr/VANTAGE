from fastapi import APIRouter, HTTPException, Depends, Request, Query
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional

from db import db_manager
from auth import get_password_hash, verify_password, get_current_user, get_current_user_allow_expired, require_role
from policies import get_password_policy, validate_password
from audit import log_action
from logging_config import get_logger

logger = get_logger("UsersRouter")

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    name: str


class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    name: Optional[str] = None
    is_active: Optional[bool] = None
    force_password_reset: Optional[bool] = None


class UserPreferencesUpdate(BaseModel):
    password: Optional[str] = None
    preferred_lang: Optional[str] = None
    avatar_base64: Optional[str] = None


VALID_ROLES = {"admin", "manager", "tech"}


@router.get("")
async def list_users(current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    users_cursor = db.users.find({}, {"password_hash": 0, "password_history": 0, "_id": 0})
    return await users_cursor.to_list(length=100)


@router.post("")
async def create_user(request: Request, user: UserCreate, current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    if await db.users.find_one({"username": user.username}):
        raise HTTPException(status_code=400, detail="Username already exists")

    if user.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role specified")

    policy = await get_password_policy(db)
    errors = validate_password(user.password, policy)
    if errors:
        raise HTTPException(status_code=400, detail=errors[0])

    password_hash = get_password_hash(user.password)
    new_user = {
        "username": user.username,
        "password_hash": password_hash,
        "role": user.role,
        "name": user.name,
        "preferred_lang": "pt",
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "password_history": [password_hash],
        "password_changed_at": datetime.now(timezone.utc),
        "force_password_reset": False,
    }
    await db.users.insert_one(new_user)
    ip = request.client.host if request.client else ""
    await log_action(db, user=current_user["username"], action="user_created",
                     target=user.username, ip=ip, result="success",
                     detail=f"role={user.role}")
    return {"status": "success", "message": f"User {user.username} created successfully"}


@router.put("/me")
async def update_my_preferences(
    prefs: UserPreferencesUpdate,
    current_user: dict = Depends(get_current_user_allow_expired),
):
    """
    Update own preferences (language, avatar, password).
    Uses allow_expired so users with expired/force-reset passwords can still
    change their credentials.
    """
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    username = current_user["username"]
    update_data = {}

    if prefs.preferred_lang is not None:
        update_data["preferred_lang"] = prefs.preferred_lang
    if prefs.avatar_base64 is not None:
        update_data["avatar_base64"] = prefs.avatar_base64

    password_changed = False
    if prefs.password is not None:
        policy = await get_password_policy(db)
        errors = validate_password(prefs.password, policy)
        if errors:
            raise HTTPException(status_code=400, detail=errors[0])

        # Check password history
        user_doc = await db.users.find_one({"username": username})
        history = user_doc.get("password_history", []) if user_doc else []
        history_count = policy.get("history_count", 5)
        for old_hash in history[-history_count:]:
            if verify_password(prefs.password, old_hash):
                raise HTTPException(
                    status_code=400,
                    detail="password_reuse_denied",
                )

        new_hash = get_password_hash(prefs.password)
        update_data["password_hash"] = new_hash
        update_data["password_changed_at"] = datetime.now(timezone.utc)
        update_data["force_password_reset"] = False

        # Append to history, keep only last history_count entries
        new_history = (history + [new_hash])[-history_count:]
        update_data["password_history"] = new_history
        password_changed = True

    if not update_data:
        return {"status": "success", "message": "No fields to update"}

    await db.users.update_one({"username": username}, {"$set": update_data})

    if password_changed:
        await log_action(db, user=username, action="password_changed",
                         target=username, result="success")

    return {"status": "success", "message": "Preferences updated successfully"}


@router.get("/me/audit-logs")
async def get_my_audit_logs(
    current_user: dict = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=200),
):
    """Returns the authenticated user's own audit log entries."""
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")
    items = await db.audit_log.find(
        {"user": current_user["username"]},
        {"_id": 0},
    ).sort("timestamp", -1).limit(limit).to_list(length=limit)
    for item in items:
        ts = item.get("timestamp")
        if hasattr(ts, "isoformat"):
            item["timestamp"] = ts.isoformat()
    return items


@router.delete("/{username}")
async def delete_user(request: Request, username: str, current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    if current_user["username"] == username:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")

    result = await db.users.delete_one({"username": username})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    ip = request.client.host if request.client else ""
    await log_action(db, user=current_user["username"], action="user_deleted",
                     target=username, ip=ip, result="success")
    return {"status": "success", "message": f"User {username} deleted successfully"}


@router.put("/{username}")
async def update_user(
    request: Request,
    username: str,
    user_update: UserUpdate,
    current_user: dict = Depends(require_role(["admin"])),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    existing = await db.users.find_one({"username": username})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = {}
    if user_update.name is not None:
        update_data["name"] = user_update.name
    if user_update.role is not None:
        if user_update.role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role specified")
        if (current_user["username"] == username
                and existing.get("role") == "admin"
                and user_update.role != "admin"):
            raise HTTPException(status_code=400, detail="You cannot demote your own admin account")
        update_data["role"] = user_update.role
    if user_update.password is not None:
        policy = await get_password_policy(db)
        errors = validate_password(user_update.password, policy)
        if errors:
            raise HTTPException(status_code=400, detail=errors[0])
        new_hash = get_password_hash(user_update.password)
        update_data["password_hash"] = new_hash
        update_data["password_changed_at"] = datetime.now(timezone.utc)
        update_data["force_password_reset"] = False
        history = existing.get("password_history", [])
        history_count = policy.get("history_count", 5)
        update_data["password_history"] = (history + [new_hash])[-history_count:]
    if user_update.is_active is not None:
        if current_user["username"] == username and user_update.is_active is False:
            raise HTTPException(status_code=400, detail="You cannot suspend your own account")
        update_data["is_active"] = user_update.is_active
    if user_update.force_password_reset is not None:
        update_data["force_password_reset"] = user_update.force_password_reset

    if not update_data:
        return {"status": "success", "message": "No fields to update"}

    await db.users.update_one({"username": username}, {"$set": update_data})

    ip = request.client.host if request.client else ""
    # Emit granular audit events
    if "role" in update_data:
        await log_action(db, user=current_user["username"], action="role_changed",
                         target=username, ip=ip, result="success",
                         detail=f"new_role={update_data['role']}")
    if update_data.get("force_password_reset") is True:
        await log_action(db, user=current_user["username"], action="password_reset_forced",
                         target=username, ip=ip, result="success")
    if "is_active" in update_data:
        action_name = "user_reactivated" if update_data["is_active"] else "user_suspended"
        await log_action(db, user=current_user["username"], action=action_name,
                         target=username, ip=ip, result="success")
    else:
        await log_action(db, user=current_user["username"], action="user_updated",
                         target=username, ip=ip, result="success")

    return {"status": "success", "message": f"User {username} updated successfully"}

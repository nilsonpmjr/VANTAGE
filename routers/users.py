from fastapi import APIRouter, HTTPException, Depends, status
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional

from db import db_manager
from auth import get_password_hash, get_current_user, require_role
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
    users_cursor = db.users.find({}, {"password_hash": 0, "_id": 0})
    return await users_cursor.to_list(length=100)


@router.post("")
async def create_user(user: UserCreate, current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    if await db.users.find_one({"username": user.username}):
        raise HTTPException(status_code=400, detail="Username already exists")

    if user.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role specified")

    new_user = {
        "username": user.username,
        "password_hash": get_password_hash(user.password),
        "role": user.role,
        "name": user.name,
        "preferred_lang": "pt",
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(new_user)
    return {"status": "success", "message": f"User {user.username} created successfully"}


@router.put("/me")
async def update_my_preferences(
    prefs: UserPreferencesUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    username = current_user["username"]
    update_data = {}
    if prefs.preferred_lang is not None:
        update_data["preferred_lang"] = prefs.preferred_lang
    if prefs.avatar_base64 is not None:
        update_data["avatar_base64"] = prefs.avatar_base64
    if prefs.password is not None and len(prefs.password) >= 6:
        update_data["password_hash"] = get_password_hash(prefs.password)

    if not update_data:
        return {"status": "success", "message": "No fields to update"}

    await db.users.update_one({"username": username}, {"$set": update_data})
    return {"status": "success", "message": "Preferences updated successfully"}


@router.delete("/{username}")
async def delete_user(username: str, current_user: dict = Depends(require_role(["admin"]))):
    db = db_manager.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not connected")

    if current_user["username"] == username:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")

    result = await db.users.delete_one({"username": username})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "success", "message": f"User {username} deleted successfully"}


@router.put("/{username}")
async def update_user(
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
    if user_update.password is not None and len(user_update.password) >= 6:
        update_data["password_hash"] = get_password_hash(user_update.password)
    if user_update.is_active is not None:
        if current_user["username"] == username and user_update.is_active is False:
            raise HTTPException(status_code=400, detail="You cannot suspend your own account")
        update_data["is_active"] = user_update.is_active

    if not update_data:
        return {"status": "success", "message": "No fields to update"}

    await db.users.update_one({"username": username}, {"$set": update_data})
    return {"status": "success", "message": f"User {username} updated successfully"}

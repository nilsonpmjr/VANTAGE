"""
Global platform credential manager.

Runtime flow:
  1. On boot, `.env` values are loaded into os.environ by pydantic-settings.
  2. `bootstrap_from_env()` copies any .env-sourced TI credentials into Mongo
     (encrypted with Fernet) if they are not already persisted there.
  3. From that point on, Mongo is the source of truth. Writes via the admin
     UI persist encrypted values to Mongo AND mirror the plaintext into
     os.environ so AsyncThreatIntelClient and other consumers pick up the
     new value without a restart.
  4. On reload (rotation, platform toggle), we re-hydrate os.environ from
     Mongo and ask AsyncThreatIntelClient.reset_instance() to rebuild its
     per-service api_keys dict on next use.

Design rationale (deviation from PRD §4):
  The backend container receives .env via docker-compose env_file, which
  injects values as environment variables but does NOT mount the file as
  writable storage. Writing to a path inside the container would not
  survive restarts and would not be visible to other workers. Mongo is
  the only cross-worker, durable store already available, so it becomes
  the canonical credential store while .env remains the bootstrap source
  on first boot (as the user requested: "a manipulação das chaves no UI
  irá conversar diretamente com o .env" — in practice, UI writes persist
  to a durable store and are mirrored into the process environment, which
  is the read path consumed by every client that currently does os.getenv).
"""

from __future__ import annotations

import asyncio
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from crypto import decrypt_secret, encrypt_secret
from db import db_manager
from logging_config import get_logger

logger = get_logger("CredentialManager")

PLATFORM_REGISTRY_COLLECTION = "platform_registry"
GLOBAL_CREDENTIALS_COLLECTION = "global_credentials"


def _find_dotenv_path() -> Optional[Path]:
    """Locate a `.env` file by walking up from this module."""
    here = Path(__file__).resolve()
    for candidate in [here.parent, *here.parents]:
        env_file = candidate / ".env"
        if env_file.is_file():
            return env_file
    return None


def _parse_dotenv(path: Path) -> dict[str, str]:
    """Minimal KEY=VALUE parser; ignores comments, blanks, and malformed lines."""
    parsed: dict[str, str] = {}
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return parsed
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped[len("export "):].lstrip()
        if "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip()
        if (len(value) >= 2) and ((value[0] == value[-1] == '"') or (value[0] == value[-1] == "'")):
            value = value[1:-1]
        if key:
            parsed[key] = value
    return parsed


def _resolve_env_value(env_var: str, dotenv_cache: dict[str, str]) -> str:
    """os.environ takes precedence; fall back to parsed `.env` contents."""
    current = (os.environ.get(env_var) or "").strip()
    if current:
        return current
    return (dotenv_cache.get(env_var) or "").strip()

BUILTIN_PLATFORMS: list[dict[str, Any]] = [
    {
        "_id": "virustotal",
        "display_name": "VirusTotal",
        "env_var": "VT_API_KEY",
        "base_url": "https://www.virustotal.com/api/v3",
        "auth_type": "header",
        "auth_key_name": "x-apikey",
        "rate_limit_calls": 4,
        "rate_limit_window_seconds": 60,
        "health_check_path": "/users/current",
    },
    {
        "_id": "abuseipdb",
        "display_name": "AbuseIPDB",
        "env_var": "ABUSEIPDB_API_KEY",
        "base_url": "https://api.abuseipdb.com/api/v2",
        "auth_type": "header",
        "auth_key_name": "Key",
        "rate_limit_calls": 10,
        "rate_limit_window_seconds": 60,
        "health_check_path": "/check?ipAddress=8.8.8.8",
    },
    {
        "_id": "shodan",
        "display_name": "Shodan",
        "env_var": "SHODAN_API_KEY",
        "base_url": "https://api.shodan.io",
        "auth_type": "query_param",
        "auth_key_name": "key",
        "rate_limit_calls": 1,
        "rate_limit_window_seconds": 1,
        "health_check_path": "/api-info",
    },
    {
        "_id": "alienvault",
        "display_name": "AlienVault OTX",
        "env_var": "OTX_API_KEY",
        "base_url": "https://otx.alienvault.com/api/v1",
        "auth_type": "header",
        "auth_key_name": "X-OTX-API-KEY",
        "rate_limit_calls": 10,
        "rate_limit_window_seconds": 60,
        "health_check_path": "/user/me",
    },
    {
        "_id": "greynoise",
        "display_name": "GreyNoise",
        "env_var": "GREYNOISE_API_KEY",
        "base_url": "https://api.greynoise.io/v3",
        "auth_type": "header",
        "auth_key_name": "key",
        "rate_limit_calls": 10,
        "rate_limit_window_seconds": 60,
        "health_check_path": "/community/8.8.8.8",
    },
    {
        "_id": "urlscan",
        "display_name": "urlscan.io",
        "env_var": "URLSCAN_API_KEY",
        "base_url": "https://urlscan.io/api/v1",
        "auth_type": "header",
        "auth_key_name": "API-Key",
        "rate_limit_calls": 10,
        "rate_limit_window_seconds": 60,
        "health_check_path": "/search/?q=domain:example.com&size=1",
    },
    {
        "_id": "blacklistmaster",
        "display_name": "BlacklistMaster",
        "env_var": "BLACKLISTMASTER_API_KEY",
        "base_url": "https://www.blacklistmaster.com/restapi/v1",
        "auth_type": "query_param",
        "auth_key_name": "apikey",
        "rate_limit_calls": 10,
        "rate_limit_window_seconds": 60,
        "health_check_path": "/status",
    },
    {
        "_id": "abusech",
        "display_name": "Abuse.ch ThreatFox",
        "env_var": "ABUSECH_API_KEY",
        "base_url": "https://threatfox-api.abuse.ch/api/v1",
        "auth_type": "header",
        "auth_key_name": "Auth-Key",
        "rate_limit_calls": 10,
        "rate_limit_window_seconds": 60,
        "health_check_path": "/",
    },
    {
        "_id": "urlhaus",
        "display_name": "Abuse.ch URLhaus",
        "env_var": "URLHAUS_API_KEY",
        "base_url": "https://urlhaus-api.abuse.ch/v1",
        "auth_type": "header",
        "auth_key_name": "Auth-Key",
        "rate_limit_calls": 10,
        "rate_limit_window_seconds": 60,
        "health_check_path": "/",
    },
    {
        "_id": "pulsedive",
        "display_name": "Pulsedive",
        "env_var": "PULSEDIVE_API_KEY",
        "base_url": "https://pulsedive.com/api",
        "auth_type": "query_param",
        "auth_key_name": "key",
        "rate_limit_calls": 10,
        "rate_limit_window_seconds": 60,
        "health_check_path": "/info.php?indicator=8.8.8.8",
    },
    {
        "_id": "ip2location",
        "display_name": "IP2Location",
        "env_var": "IP2LOCATION_API_KEY",
        "base_url": "https://api.ip2location.io",
        "auth_type": "query_param",
        "auth_key_name": "key",
        "rate_limit_calls": 10,
        "rate_limit_window_seconds": 60,
        "health_check_path": "/?ip=8.8.8.8",
    },
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "•" * len(value)
    return f"{value[:2]}••••{value[-4:]}"


async def _ensure_indexes() -> None:
    db = db_manager.db
    if db is None:
        return
    await db[GLOBAL_CREDENTIALS_COLLECTION].create_index("service_id", unique=True)
    await db[PLATFORM_REGISTRY_COLLECTION].create_index("env_var", unique=True)


async def seed_builtin_platforms() -> None:
    """Insert built-in platform definitions if the registry is empty or missing them."""
    db = db_manager.db
    if db is None:
        logger.warning("seed_builtin_platforms: database not connected; skipping")
        return

    await _ensure_indexes()
    for entry in BUILTIN_PLATFORMS:
        doc = {
            **entry,
            "built_in": True,
            "disabled": False,
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db[PLATFORM_REGISTRY_COLLECTION].update_one(
            {"_id": entry["_id"]},
            {
                "$setOnInsert": doc,
                "$set": {
                    "display_name": entry["display_name"],
                    "env_var": entry["env_var"],
                    "base_url": entry["base_url"],
                    "auth_type": entry["auth_type"],
                    "auth_key_name": entry["auth_key_name"],
                    "rate_limit_calls": entry["rate_limit_calls"],
                    "rate_limit_window_seconds": entry["rate_limit_window_seconds"],
                    "health_check_path": entry["health_check_path"],
                    "built_in": True,
                },
            },
            upsert=True,
        )


async def bootstrap_from_env() -> None:
    """
    On boot, copy TI credentials already present in os.environ (or, as a
    dev-friendly fallback, declared in `.env`) into the global_credentials
    collection if not yet persisted there. One-time migration from pure-.env
    to durable storage without operator effort.

    The `.env` fallback is important: undeclared TI keys (VT_API_KEY etc.)
    are not loaded into os.environ by pydantic-settings; they only reach the
    process env when docker-compose injects them. Parsing `.env` directly
    covers local non-Docker runs and cases where compose didn't export.
    """
    db = db_manager.db
    if db is None:
        return

    await _ensure_indexes()

    dotenv_path = _find_dotenv_path()
    dotenv_cache = _parse_dotenv(dotenv_path) if dotenv_path else {}
    if dotenv_path:
        logger.info(f"bootstrap_from_env: loaded {len(dotenv_cache)} entries from {dotenv_path}")

    registry = await db[PLATFORM_REGISTRY_COLLECTION].find({}).to_list(length=500)
    migrated = 0
    for entry in registry:
        env_var = entry.get("env_var")
        if not env_var:
            continue
        current = await db[GLOBAL_CREDENTIALS_COLLECTION].find_one({"service_id": entry["_id"]})
        if current:
            continue
        env_value = _resolve_env_value(env_var, dotenv_cache)
        if not env_value:
            continue
        await db[GLOBAL_CREDENTIALS_COLLECTION].insert_one({
            "service_id": entry["_id"],
            "env_var": env_var,
            "value_enc": encrypt_secret(env_value),
            "created_at": _now(),
            "updated_at": _now(),
            "last_rotated_at": _now(),
            "created_by": "bootstrap",
        })
        # Mirror into os.environ so consumers that already imported see the value.
        os.environ[env_var] = env_value
        migrated += 1
        logger.info(f"bootstrap_from_env: migrated {env_var} into DB")
    if migrated:
        logger.info(f"bootstrap_from_env: imported {migrated} credential(s) from .env")


async def hydrate_os_environ() -> None:
    """Populate os.environ from the durable credential store."""
    db = db_manager.db
    if db is None:
        return
    cursor = db[GLOBAL_CREDENTIALS_COLLECTION].find({})
    async for doc in cursor:
        try:
            plaintext = decrypt_secret(doc["value_enc"])
        except Exception:
            logger.exception(f"Failed to decrypt credential for {doc.get('service_id')}")
            continue
        env_var = doc.get("env_var")
        if env_var and plaintext:
            os.environ[env_var] = plaintext


async def list_platforms() -> list[dict[str, Any]]:
    """Return registry merged with masked credential status for admin UI."""
    db = db_manager.db
    if db is None:
        return []
    registry = await db[PLATFORM_REGISTRY_COLLECTION].find({}).sort("display_name", 1).to_list(length=500)
    creds = await db[GLOBAL_CREDENTIALS_COLLECTION].find({}).to_list(length=500)
    cred_by_service = {c["service_id"]: c for c in creds}

    result: list[dict[str, Any]] = []
    for entry in registry:
        cred = cred_by_service.get(entry["_id"])
        plaintext = ""
        if cred:
            try:
                plaintext = decrypt_secret(cred["value_enc"])
            except Exception:
                plaintext = ""
        result.append({
            "service_id": entry["_id"],
            "display_name": entry.get("display_name", entry["_id"]),
            "env_var": entry.get("env_var"),
            "base_url": entry.get("base_url"),
            "auth_type": entry.get("auth_type"),
            "auth_key_name": entry.get("auth_key_name"),
            "rate_limit_calls": entry.get("rate_limit_calls"),
            "rate_limit_window_seconds": entry.get("rate_limit_window_seconds"),
            "health_check_path": entry.get("health_check_path"),
            "built_in": entry.get("built_in", False),
            "disabled": entry.get("disabled", False),
            "configured": bool(plaintext),
            "masked_value": _mask(plaintext),
            "last_rotated_at": cred.get("last_rotated_at") if cred else None,
            "last_checked_at": entry.get("last_checked_at"),
            "last_check_status": entry.get("last_check_status"),
        })
    return result


async def set_credential(service_id: str, value: str, actor: str) -> None:
    """Persist new credential value for a service and mirror into os.environ."""
    db = db_manager.db
    if db is None:
        raise RuntimeError("Database not connected")
    entry = await db[PLATFORM_REGISTRY_COLLECTION].find_one({"_id": service_id})
    if not entry:
        raise ValueError(f"Unknown service: {service_id}")

    env_var = entry["env_var"]
    value = value.strip()
    if value:
        await db[GLOBAL_CREDENTIALS_COLLECTION].update_one(
            {"service_id": service_id},
            {
                "$set": {
                    "service_id": service_id,
                    "env_var": env_var,
                    "value_enc": encrypt_secret(value),
                    "updated_at": _now(),
                    "last_rotated_at": _now(),
                    "updated_by": actor,
                },
                "$setOnInsert": {"created_at": _now(), "created_by": actor},
            },
            upsert=True,
        )
        os.environ[env_var] = value
    else:
        # Blank means clear
        await db[GLOBAL_CREDENTIALS_COLLECTION].delete_one({"service_id": service_id})
        os.environ.pop(env_var, None)

    _reset_client_cache()


async def reveal_credential(service_id: str) -> Optional[str]:
    db = db_manager.db
    if db is None:
        return None
    cred = await db[GLOBAL_CREDENTIALS_COLLECTION].find_one({"service_id": service_id})
    if not cred:
        return None
    try:
        return decrypt_secret(cred["value_enc"])
    except Exception:
        logger.exception(f"Failed to decrypt credential for {service_id}")
        return None


async def set_disabled(service_id: str, disabled: bool) -> None:
    db = db_manager.db
    if db is None:
        raise RuntimeError("Database not connected")
    await db[PLATFORM_REGISTRY_COLLECTION].update_one(
        {"_id": service_id},
        {"$set": {"disabled": disabled, "updated_at": _now()}},
    )
    _reset_client_cache()


async def register_platform(entry: dict[str, Any], actor: str) -> dict[str, Any]:
    db = db_manager.db
    if db is None:
        raise RuntimeError("Database not connected")
    doc = {
        **entry,
        "built_in": False,
        "disabled": False,
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": actor,
    }
    await db[PLATFORM_REGISTRY_COLLECTION].insert_one(doc)
    _reset_client_cache()
    return doc


async def delete_platform(service_id: str) -> None:
    db = db_manager.db
    if db is None:
        raise RuntimeError("Database not connected")
    entry = await db[PLATFORM_REGISTRY_COLLECTION].find_one({"_id": service_id})
    if not entry:
        raise ValueError(f"Unknown service: {service_id}")
    if entry.get("built_in"):
        raise ValueError("Built-in platforms cannot be deleted; disable instead")
    env_var = entry.get("env_var")
    await db[PLATFORM_REGISTRY_COLLECTION].delete_one({"_id": service_id})
    await db[GLOBAL_CREDENTIALS_COLLECTION].delete_one({"service_id": service_id})
    if env_var:
        os.environ.pop(env_var, None)
    _reset_client_cache()


async def record_health_check(service_id: str, status_code: int) -> None:
    db = db_manager.db
    if db is None:
        return
    await db[PLATFORM_REGISTRY_COLLECTION].update_one(
        {"_id": service_id},
        {"$set": {
            "last_checked_at": _now(),
            "last_check_status": status_code,
        }},
    )


def _reset_client_cache() -> None:
    """
    Clients are instantiated per-request and read os.environ at construction,
    so mirroring new values into os.environ (done in set_credential) is enough.
    This hook is kept for symmetry in case a future client caches keys.
    """
    logger.debug("credential change applied; clients will re-read on next request")


# ── Simple in-memory reveal rate limiter ───────────────────────────────────────
# 10 reveals per admin per hour; resets on process restart.
_reveal_history: dict[str, list[datetime]] = {}
_reveal_lock = asyncio.Lock()


async def check_reveal_rate(actor: str, limit: int = 10, window_seconds: int = 3600) -> bool:
    async with _reveal_lock:
        now = _now()
        history = _reveal_history.setdefault(actor, [])
        cutoff = now.timestamp() - window_seconds
        history[:] = [t for t in history if t.timestamp() > cutoff]
        if len(history) >= limit:
            return False
        history.append(now)
        return True


def new_request_nonce() -> str:
    """Short-lived nonce for reveal confirmation; returned to client then required back."""
    return secrets.token_urlsafe(16)

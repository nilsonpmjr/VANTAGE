"""
Operational configuration layer for admin-managed runtime settings.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

from config import settings

OPERATIONAL_CONFIG_ID = "singleton"

SMTP_PUBLIC_SPECS = {
    "smtp_host": {"default": "", "type": "str"},
    "smtp_port": {"default": 587, "type": "int"},
    "smtp_user": {"default": "", "type": "str"},
    "smtp_from": {"default": "noreply@soc.local", "type": "str"},
    "smtp_tls": {"default": True, "type": "bool"},
}

SMTP_SECRET_SPECS = {
    "smtp_pass": {"default": "", "type": "str"},
}

ALL_OPERATIONAL_FIELDS = set(SMTP_PUBLIC_SPECS) | set(SMTP_SECRET_SPECS)


def _coerce_value(field: str, value):
    spec = SMTP_PUBLIC_SPECS.get(field) or SMTP_SECRET_SPECS.get(field)
    if spec is None:
        raise ValueError(f"Unknown operational config field: {field}")

    if spec["type"] == "int":
        coerced = int(value)
        if coerced <= 0 or coerced > 65535:
            raise ValueError(f"Invalid value for {field}")
        return coerced

    if spec["type"] == "bool":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"true", "1", "yes", "on"}:
                return True
            if lowered in {"false", "0", "no", "off"}:
                return False
        raise ValueError(f"Invalid value for {field}")

    if value is None:
        return ""
    return str(value).strip()


def _base_effective_config() -> dict:
    return {
        "smtp_host": settings.smtp_host,
        "smtp_port": settings.smtp_port,
        "smtp_user": settings.smtp_user,
        "smtp_pass": settings.smtp_pass,
        "smtp_from": settings.smtp_from,
        "smtp_tls": settings.smtp_tls,
    }


async def get_operational_config_document(db) -> dict:
    if db is None:
        return {"_id": OPERATIONAL_CONFIG_ID, "values": {}, "secret_values": {}}

    doc = await db.operational_config.find_one({"_id": OPERATIONAL_CONFIG_ID})
    if not doc:
        return {"_id": OPERATIONAL_CONFIG_ID, "values": {}, "secret_values": {}}

    doc.setdefault("values", {})
    doc.setdefault("secret_values", {})
    return doc


async def get_effective_operational_config(db) -> dict:
    effective = _base_effective_config()
    doc = await get_operational_config_document(db)
    effective.update(doc.get("values", {}))
    effective.update(doc.get("secret_values", {}))
    return effective


def _field_source(field: str, doc: dict) -> str:
    if field in doc.get("secret_values", {}):
        return "persisted"
    if field in doc.get("values", {}):
        return "persisted"

    current = getattr(settings, field)
    spec = SMTP_PUBLIC_SPECS.get(field) or SMTP_SECRET_SPECS.get(field)
    if spec is not None and current == spec["default"]:
        return "default"
    return "env"


async def get_public_operational_config(db) -> dict:
    doc = await get_operational_config_document(db)
    effective = await get_effective_operational_config(db)

    return {
        "smtp": {
            "host": {"value": effective["smtp_host"], "source": _field_source("smtp_host", doc)},
            "port": {"value": effective["smtp_port"], "source": _field_source("smtp_port", doc)},
            "username": {"value": effective["smtp_user"], "source": _field_source("smtp_user", doc)},
            "from": {"value": effective["smtp_from"], "source": _field_source("smtp_from", doc)},
            "tls": {"value": effective["smtp_tls"], "source": _field_source("smtp_tls", doc)},
            "password": {
                "configured": bool(effective["smtp_pass"]),
                "masked": "********" if effective["smtp_pass"] else "",
                "source": _field_source("smtp_pass", doc),
            },
        }
    }


def normalize_operational_config_patch(patch: dict) -> tuple[dict, dict]:
    if not isinstance(patch, dict):
        raise ValueError("Operational config patch must be an object.")

    public_values: dict = {}
    secret_values: dict = {}

    for field, value in patch.items():
        if field not in ALL_OPERATIONAL_FIELDS:
            raise ValueError(f"Unknown operational config field: {field}")
        coerced = _coerce_value(field, value)
        if field in SMTP_SECRET_SPECS:
            secret_values[field] = coerced
        else:
            public_values[field] = coerced

    return public_values, secret_values


async def update_operational_config(db, patch: dict, updated_by: str | None = None) -> dict:
    public_values, secret_values = normalize_operational_config_patch(patch)
    doc = await get_operational_config_document(db)
    next_doc = deepcopy(doc)
    next_doc["values"].update(public_values)
    next_doc["secret_values"].update(secret_values)
    next_doc["updated_at"] = datetime.now(timezone.utc)
    next_doc["updated_by"] = updated_by

    if db is not None:
        await db.operational_config.replace_one(
            {"_id": OPERATIONAL_CONFIG_ID},
            next_doc,
            upsert=True,
        )

    return await get_public_operational_config(db)

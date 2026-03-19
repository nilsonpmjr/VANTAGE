import pytest

from operational_config import (
    get_effective_operational_config,
    get_operational_config_document,
    get_public_operational_config,
    normalize_operational_config_patch,
    update_operational_config,
)


@pytest.mark.asyncio
async def test_effective_operational_config_uses_env_defaults(fake_db, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "smtp_host", "smtp.env.local")
    monkeypatch.setattr(settings, "smtp_port", 2525)
    monkeypatch.setattr(settings, "smtp_user", "env-user")
    monkeypatch.setattr(settings, "smtp_pass", "env-pass")
    monkeypatch.setattr(settings, "smtp_from", "env@soc.local")
    monkeypatch.setattr(settings, "smtp_tls", False)

    effective = await get_effective_operational_config(fake_db)

    assert effective["smtp_host"] == "smtp.env.local"
    assert effective["smtp_port"] == 2525
    assert effective["smtp_user"] == "env-user"
    assert effective["smtp_pass"] == "env-pass"
    assert effective["smtp_from"] == "env@soc.local"
    assert effective["smtp_tls"] is False


@pytest.mark.asyncio
async def test_update_operational_config_persists_public_and_secret_separately(fake_db):
    public_view = await update_operational_config(
        fake_db,
        {
            "smtp_host": "smtp.persisted.local",
            "smtp_port": 465,
            "smtp_user": "persisted-user",
            "smtp_pass": "persisted-pass",
            "smtp_from": "persisted@soc.local",
            "smtp_tls": True,
        },
        updated_by="admin",
    )

    doc = await get_operational_config_document(fake_db)
    effective = await get_effective_operational_config(fake_db)

    assert doc["values"]["smtp_host"] == "smtp.persisted.local"
    assert doc["values"]["smtp_port"] == 465
    assert doc["values"]["smtp_user"] == "persisted-user"
    assert doc["values"]["smtp_from"] == "persisted@soc.local"
    assert doc["values"]["smtp_tls"] is True
    assert doc["secret_values"]["smtp_pass"] == "persisted-pass"
    assert doc["updated_by"] == "admin"

    assert effective["smtp_host"] == "smtp.persisted.local"
    assert effective["smtp_pass"] == "persisted-pass"

    assert public_view["smtp"]["password"]["configured"] is True
    assert public_view["smtp"]["password"]["masked"] == "********"


@pytest.mark.asyncio
async def test_public_operational_config_reports_sources(fake_db, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "smtp_host", "smtp.env.local")
    monkeypatch.setattr(settings, "smtp_pass", "env-pass")

    await update_operational_config(fake_db, {"smtp_host": "smtp.persisted.local"}, updated_by="admin")
    public_view = await get_public_operational_config(fake_db)

    assert public_view["smtp"]["host"]["value"] == "smtp.persisted.local"
    assert public_view["smtp"]["host"]["source"] == "persisted"
    assert public_view["smtp"]["password"]["configured"] is True
    assert public_view["smtp"]["password"]["source"] == "env"


def test_normalize_operational_config_patch_rejects_unknown_field():
    with pytest.raises(ValueError):
        normalize_operational_config_patch({"smtp_magic": "nope"})

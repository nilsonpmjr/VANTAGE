"""
setup:create-admin — Create the first administrator account.

Interactive mode (default):
    python bin/console setup:create-admin

Non-interactive mode (CI/CD):
    python bin/console setup:create-admin \\
        --name "Admin" --username admin \\
        --email admin@example.com \\
        --password "$(cat /run/secrets/admin_pass)" \\
        --lang pt --no-interaction
"""

import asyncio
import getpass
import re
import sys
from datetime import datetime, timezone


# ── Validation helpers ────────────────────────────────────────────────────────

def _validate_username(value: str) -> str:
    if not re.fullmatch(r"[a-zA-Z0-9_]{3,32}", value):
        raise ValueError("Username must be 3–32 characters: letters, digits, underscores only.")
    return value


def _validate_email(value: str) -> str:
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
        raise ValueError("Invalid e-mail format.")
    return value


def _validate_password(value: str) -> str:
    if len(value) < 12:
        raise ValueError("Password must be at least 12 characters.")
    return value


def _validate_lang(value: str) -> str:
    if value not in ("pt", "en", "es"):
        raise ValueError("Language must be one of: pt, en, es.")
    return value


# ── Prompt helpers ────────────────────────────────────────────────────────────

def _prompt(label: str, validator, secret: bool = False) -> str:
    while True:
        try:
            raw = getpass.getpass(f"{label}: ") if secret else input(f"{label}: ")
            return validator(raw.strip())
        except ValueError as exc:
            print(f"  [!] {exc}", file=sys.stderr)


# ── Main command ──────────────────────────────────────────────────────────────

async def _run(args) -> int:
    # Import here so the script can be run from inside the backend container
    # where sys.path already includes the backend root.
    import os
    import sys as _sys
    _sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

    from auth import get_password_hash
    from db import db_manager
    from config import settings

    await db_manager.connect_db()
    db = db_manager.db
    if db is None:
        print("[ERROR] Could not connect to the database.", file=sys.stderr)
        await db_manager.close_db()
        return 1

    # Guard — refuse to run if an admin already exists
    admin_count = await db.users.count_documents({"role": "admin"})
    if admin_count > 0:
        print(
            "[WARNING] System already initialized. "
            "This command cannot be run again.",
            file=sys.stderr,
        )
        await db_manager.close_db()
        return 1

    no_interaction = args.no_interaction

    print("\n=== VANTAGE — Initial Setup ===\n")
    print("Creating the first administrator account.")
    print("This command can only be run once.\n")

    # ── Collect fields ────────────────────────────────────────────────────────

    if no_interaction:
        # Validate flags
        errors = []
        try:
            full_name = args.name.strip()
            if not full_name:
                errors.append("--name is required.")
        except AttributeError:
            errors.append("--name is required.")

        try:
            username = _validate_username(args.username)
        except (ValueError, AttributeError) as e:
            errors.append(f"--username: {e}")
            username = ""

        try:
            email = _validate_email(args.email)
        except (ValueError, AttributeError) as e:
            errors.append(f"--email: {e}")
            email = ""

        try:
            password = _validate_password(args.password)
        except (ValueError, AttributeError) as e:
            errors.append(f"--password: {e}")
            password = ""  # nosec B105

        lang = args.lang or "pt"
        try:
            lang = _validate_lang(lang)
        except ValueError as e:
            errors.append(f"--lang: {e}")

        if errors:
            for err in errors:
                print(f"[ERROR] {err}", file=sys.stderr)
            await db_manager.close_db()
            return 1
    else:
        full_name = _prompt("Full name", lambda v: v if v else (_ for _ in ()).throw(ValueError("Name cannot be empty.")))
        username = _prompt("Username", _validate_username)

        # Check uniqueness before continuing
        if await db.users.find_one({"username": username}):
            print(f"[ERROR] Username '{username}' is already taken.", file=sys.stderr)
            await db_manager.close_db()
            return 1

        email = _prompt("E-mail", _validate_email)
        if await db.users.find_one({"email": email}):
            print(f"[ERROR] E-mail '{email}' is already in use.", file=sys.stderr)
            await db_manager.close_db()
            return 1

        while True:
            password = _prompt("Password (hidden)", _validate_password, secret=True)
            confirm = getpass.getpass("Confirm password: ")
            if password == confirm:
                break
            print("  [!] Passwords do not match. Try again.", file=sys.stderr)

        lang_raw = input("Preferred language [pt/en/es, default: pt]: ").strip() or "pt"
        try:
            lang = _validate_lang(lang_raw)
        except ValueError as e:
            print(f"  [!] {e} Using 'pt'.", file=sys.stderr)
            lang = "pt"

    # ── Uniqueness checks in non-interactive mode ─────────────────────────────
    if no_interaction:
        if await db.users.find_one({"username": username}):
            print(f"[ERROR] Username '{username}' is already taken.", file=sys.stderr)
            await db_manager.close_db()
            return 1
        if await db.users.find_one({"email": email}):
            print(f"[ERROR] E-mail '{email}' is already in use.", file=sys.stderr)
            await db_manager.close_db()
            return 1

    # ── Persist ───────────────────────────────────────────────────────────────
    await db.users.insert_one({
        "username": username,
        "password_hash": get_password_hash(password),
        "role": "admin",
        "name": full_name,
        "email": email,
        "preferred_lang": lang,
        "is_active": True,
        "failed_login_count": 0,
        "locked_until": None,
        "last_failed_at": None,
        "password_history": [],
        "password_changed_at": None,  # nosec B105
        "force_password_reset": False,  # nosec B105
        "last_login_at": None,
        "mfa_enabled": False,
        "mfa_secret_enc": None,  # nosec B105
        "mfa_backup_codes": [],
        "extra_permissions": [],
        "created_at": datetime.now(timezone.utc),
    })

    frontend_url = getattr(settings, "frontend_url", "http://localhost")
    print("\n\u2713 Administrator created successfully!")
    print(f"\u2713 Access the system at: {frontend_url}\n")

    await db_manager.close_db()
    return 0


def register(subparsers):
    """Register this command with the console entry point."""
    parser = subparsers.add_parser(
        "setup:create-admin",
        help="Create the first administrator account (run once on a fresh install).",
    )
    parser.add_argument("--name",           help="Full name")
    parser.add_argument("--username",       help="Username (3–32 chars, alphanumeric + underscores)")
    parser.add_argument("--email",          help="E-mail address")
    parser.add_argument("--password",       help="Password (min 12 chars) — use $(cat secret_file) in CI/CD")
    parser.add_argument("--lang",           help="Preferred language: pt, en, es (default: pt)", default="pt")
    parser.add_argument("--no-interaction", action="store_true", help="Non-interactive mode (requires all flags)")
    parser.set_defaults(func=lambda args: asyncio.run(_run(args)))

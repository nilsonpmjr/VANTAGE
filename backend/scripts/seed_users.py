"""
DEPRECATED — this file is no longer used by the application.

The automatic seed with hardcoded credentials (admin/vantage123, tech/tech123)
was removed as a security fix. See: PRD-deploy-glpi-aligned.md

For production: use `docker compose exec backend python bin/console setup:create-admin`
For development: set DEV_SEED_USERS=true and DEV_ADMIN_PASSWORD= in .env
                 (see scripts/seed_dev_users.py)
"""

raise ImportError(
    "scripts.seed_users is deprecated and must not be imported. "
    "Use 'python bin/console setup:create-admin' for production setup, "
    "or DEV_SEED_USERS=true for development environments."
)

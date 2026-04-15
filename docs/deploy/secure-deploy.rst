Secure Deployment
=================

This page mirrors the intent of the GLPI "End of Installation" wizard — a checklist of
security-critical steps that **must** be completed before a VANTAGE instance is exposed
to untrusted networks.

.. admonition:: Security baseline
   :class: tip

   A deployment that passes all checks below is considered production-ready from a
   security standpoint. Items marked **CRITICAL** will be flagged by automated audits.

Pre-launch checklist
---------------------

Credentials & secrets
^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 10 90

   * - ☐
     - Action
   * - ☐
     - ``SECRET_KEY`` is a random 256-bit value (``openssl rand -hex 32``)
   * - ☐
     - ``MONGO_PASSWORD`` is a strong, unique password (not the example value)
   * - ☐
     - No hardcoded credentials exist in the image: ``grep -r "vantage123\|tech123" backend/`` returns empty
   * - ☐
     - ``.env`` is **not** committed to version control (``.gitignore`` already includes it)
   * - ☐
     - ``DEV_SEED_USERS`` is absent or set to ``false`` in the production ``.env``

Initialization
^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 10 90

   * - ☐
     - Action
   * - ☐
     - ``/health/ready`` returns ``HTTP 200`` (system initialized)
   * - ☐
     - First admin was created via ``setup:create-admin`` with a password of at least 12 characters
   * - ☐
     - ``setup:create-admin`` re-run attempt returns exit code 1 (idempotency verified)

Network exposure
^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 10 90

   * - ☐
     - Action
   * - ☐
     - Backend port (8000) is **not** exposed to the internet — only accessible via internal network or reverse proxy
   * - ☐
     - MongoDB port (27017) is **not** exposed to the internet
   * - ☐
     - ``mongo-express`` profile is **not** running in production (``docker compose --profile dev up`` must not be used in prod)
   * - ☐
     - TLS is terminated at the reverse proxy — all traffic over ``HTTPS``
   * - ☐
     - ``CORS_ORIGINS`` is restricted to the production frontend URL

Auth & access control
^^^^^^^^^^^^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 10 90

   * - ☐
     - Action
   * - ☐
     - MFA enforcement policy is reviewed — consider requiring MFA for admin accounts
   * - ☐
     - Session timeout is configured to an appropriate value for your environment
   * - ☐
     - Password policy (complexity, history, expiry) is configured under Admin → Security Policies

Ongoing security posture
-------------------------

* Review the **Audit Log** (Admin → Audit Log) regularly for unexpected access patterns.
* Rotate ``SECRET_KEY`` periodically — this will invalidate all active sessions.
* Monitor ``/health`` for worker and database connectivity status.
* Keep Docker images updated with ``docker compose build --pull`` before each deployment.

See also
--------

* :doc:`environment-variables` — full ``.env`` reference including security-sensitive variables
* :doc:`../install/first-run` — setup CLI reference
* :doc:`../configuration/auth` — JWT and cookie configuration
* :doc:`../configuration/password-policy` — password complexity rules

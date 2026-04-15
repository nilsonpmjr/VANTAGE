Backend Architecture
====================

The backend is a `FastAPI <https://fastapi.tiangolo.com/>`_ application running on
Python 3.12, structured as a collection of domain-focused modules.

Module map
----------

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Module
     - Responsibility
   * - ``main.py``
     - App factory, lifespan (startup / shutdown), middleware, router mounts
   * - ``app_state.py``
     - Initialization flag (``APP_INITIALIZED``), ``check_initialization()``
   * - ``config.py``
     - Pydantic settings, ``validate_production()``
   * - ``db.py``
     - MongoDB connection management via ``motor``
   * - ``auth.py``
     - JWT creation/validation, Argon2 password hashing, cookie handling
   * - ``analyzer.py``
     - Parallel threat-intelligence query orchestration
   * - ``scoring.py``
     - Multi-source verdict aggregation
   * - ``report_generator.py``
     - AI-generated natural-language summaries
   * - ``audit.py``
     - Audit log writes
   * - ``worker.py``
     - Background re-scan and feed ingestion worker
   * - ``mailer.py``
     - SMTP email dispatch
   * - ``limiters.py``
     - Rate-limiting decorators

Routers (``routers/``)
----------------------

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Router
     - Endpoints
   * - ``auth.py``
     - Login, logout, refresh token, password change
   * - ``users.py``
     - User CRUD (admin)
   * - ``analyze.py``
     - Single and batch analysis
   * - ``stats.py``
     - Dashboard statistics
   * - ``admin.py``
     - System administration surfaces
   * - ``mfa.py``
     - TOTP setup, verification, backup codes
   * - ``sessions.py``
     - Active sessions list and per-session revocation
   * - ``api_keys.py``
     - API key creation and management
   * - ``feed.py``
     - Threat feed management
   * - ``hunting.py``
     - Hunting workspace
   * - ``watchlist.py``
     - Watchlist management
   * - ``exposure.py``
     - Exposure monitoring
   * - ``recon.py``
     - Reconnaissance workspace
   * - ``batch.py``
     - Bulk analysis jobs
   * - ``shift_handoff.py``
     - Shift handoff reports

Initialization flow
--------------------

On startup (``lifespan`` in ``main.py``):

1. Connect to MongoDB.
2. Create indexes.
3. Call ``check_initialization()`` from ``app_state.py``.
4. If no admin exists → set ``APP_INITIALIZED = False``, log setup instruction.
5. If admin exists → set ``APP_INITIALIZED = True``, boot normally.

A middleware layer intercepts all authenticated requests and returns ``HTTP 503`` while
``APP_INITIALIZED`` is ``False``.

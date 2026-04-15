API Keys
========

VANTAGE supports scoped API keys for programmatic access — CI/CD pipelines, scripts,
and integrations that cannot use cookie-based auth.

Properties
----------

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Property
     - Details
   * - Storage
     - SHA-256 hash only — the plaintext key is shown **once** at creation
   * - Scopes
     - Granular: ``analyze:read``, ``analyze:write``, ``watchlist:read``, ``watchlist:write``, etc.
   * - TTL
     - Configurable expiry (or non-expiring)
   * - Ownership
     - Each key is tied to a user account and inherits that user's role ceiling

Creating a key (UI)
-------------------

Navigate to **Profile → API Keys → Create Key**.

Creating a key (API)
---------------------

.. code-block:: bash

   POST /api/api-keys
   Authorization: Bearer <token>

   {
     "name": "ci-pipeline",
     "scopes": ["analyze:write"],
     "expires_in_days": 90
   }

Response (key shown once):

.. code-block:: json

   {
     "id": "...",
     "name": "ci-pipeline",
     "key": "vtg_xxxxxxxxxxxxxxxxxxxx",
     "expires_at": "2026-07-14T00:00:00Z"
   }

Using a key
-----------

.. code-block:: bash

   curl -H "X-API-Key: vtg_xxxxxxxxxxxxxxxxxxxx" \
        -X POST https://vantage.example.com/api/analyze \
        -d '{"target": "1.2.3.4"}'

Database
========

VANTAGE uses `MongoDB 8 <https://www.mongodb.com/>`_ as its document store.
The ``motor`` async driver is used throughout the backend.

Collections
-----------

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Collection
     - Contents
   * - ``users``
     - User accounts — username, hashed password, role, MFA secret (AES-256 encrypted), preferences
   * - ``sessions``
     - Active sessions — JWT ID, user ID, expiry, last-seen, user agent
   * - ``api_keys``
     - API keys — SHA-256 hash, scopes, TTL, owner
   * - ``audit_log``
     - Immutable audit trail — action, actor, target, timestamp, IP
   * - ``analyses``
     - Analysis results — target, verdict, score, source data, AI report
   * - ``watchlist``
     - Watchlisted targets for background re-scan
   * - ``feed_items``
     - Ingested threat-feed articles and IOCs
   * - ``hunting_sessions``
     - Hunting workspace state
   * - ``exposure_assets``
     - Tracked assets for exposure monitoring

Indexes
-------

Indexes are created automatically during the backend startup lifespan.
Key indexes:

* ``users.username`` — unique
* ``users.email`` — unique
* ``users.role`` — used by ``check_initialization()``
* ``audit_log.timestamp`` — range queries for log export
* ``analyses.target`` + ``analyses.created_at`` — lookup and history queries
* ``sessions.jti`` — session revocation lookups

Backup
------

Data is stored in the ``mongodb_data`` Docker volume. To back up:

.. code-block:: bash

   # Dump to a local directory
   docker compose exec mongodb mongodump \
     --username $MONGO_USER \
     --password $MONGO_PASSWORD \
     --authenticationDatabase admin \
     --out /tmp/vantage-backup

   # Copy out of the container
   docker cp vantage_mongo:/tmp/vantage-backup ./backup-$(date +%Y%m%d)

To restore:

.. code-block:: bash

   docker compose exec -T mongodb mongorestore \
     --username $MONGO_USER \
     --password $MONGO_PASSWORD \
     --authenticationDatabase admin \
     /tmp/vantage-backup

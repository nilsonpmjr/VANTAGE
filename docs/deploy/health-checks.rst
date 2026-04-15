Health Checks
=============

The backend exposes two health endpoints for monitoring and orchestration.

Endpoints
---------

``GET /health``
^^^^^^^^^^^^^^^

Returns overall system status. Always responds — use for uptime monitoring.

.. code-block:: bash

   curl -s http://localhost:8000/health | python -m json.tool

Example response:

.. code-block:: json

   {
     "status": "ok",
     "version": "1.0.0",
     "database": "connected",
     "worker": "running"
   }

``GET /health/ready``
^^^^^^^^^^^^^^^^^^^^^

Returns ``HTTP 200`` only when the system is **fully initialized and ready to serve traffic**.
Use this endpoint for load-balancer health checks and readiness probes.

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - HTTP status
     - Meaning
   * - ``200``
     - System initialized, database connected, ready for traffic
   * - ``503``
     - System not yet initialized — run ``setup:create-admin``

.. code-block:: bash

   curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health/ready

Docker Compose health check
----------------------------

The ``backend`` service in ``docker-compose.yml`` uses ``/health/ready`` as its
healthcheck target. The frontend service depends on the backend being ``healthy``,
preventing traffic before the system is ready.

.. code-block:: bash

   # Wait until backend is healthy before running the setup command
   until [ "$(docker inspect --format='{{.State.Health.Status}}' vantage_backend)" = "healthy" ]; do
     sleep 2
   done
   docker compose exec -T backend python bin/console setup:create-admin \
     --no-interaction ...

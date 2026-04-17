Docker Compose Reference
========================

VANTAGE ships three Compose files for different operational profiles.

Files
-----

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - File
     - Purpose
   * - ``docker-compose.yml``
     - Standard production stack (MongoDB + backend + frontend)
   * - ``docker-compose.hunting-kali.yml``
     - Optional extension overlay that adds a Kali Linux container for hunting integrations
   * - ``docker-compose.operational-architect.yml``
     - Extended stack for operational architecture scenarios

Services — standard stack
--------------------------

.. list-table::
   :header-rows: 1
   :widths: 25 15 60

   * - Service
     - Port
     - Notes
   * - ``mongodb``
     - 27017 (internal)
     - Not exposed to the host by default
   * - ``mongo-express``
     - 127.0.0.1:8081
     - Only available with ``--profile dev``
   * - ``backend``
     - 127.0.0.1:8000
     - Bound to localhost — access via reverse proxy in production
   * - ``frontend``
     - 80
     - Nginx serving the React build

Common commands
---------------

.. code-block:: bash

   # Start (detached)
   docker compose up -d

   # Start with dev profile (adds mongo-express)
   docker compose --profile dev up -d

   # View logs
   docker compose logs -f backend

   # Check health
   docker compose ps

   # Stop
   docker compose down

   # Stop and remove volumes (DESTRUCTIVE — erases all data)
   docker compose down -v

Running the setup CLI
---------------------

.. code-block:: bash

   docker compose exec backend python bin/console setup:create-admin

See :doc:`../install/first-run` for the full CLI reference.

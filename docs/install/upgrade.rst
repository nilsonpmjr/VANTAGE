Upgrading VANTAGE
=================

VANTAGE uses a rolling-upgrade model via Docker Compose. No database migrations are
required for the 1.x series unless explicitly noted in the release notes.

Standard upgrade procedure
----------------------------

.. code-block:: bash

   # 1. Pull latest changes
   git pull origin main

   # 2. Rebuild images
   docker compose build --pull

   # 3. Restart with zero manual intervention
   docker compose up -d

   # 4. Verify all containers are healthy
   docker compose ps

.. note::

   The ``setup:create-admin`` command is **not needed** on upgrade — it is a no-op
   if an admin account already exists in the database.

Checking the running version
-----------------------------

.. code-block:: bash

   curl -s http://localhost/health | python -m json.tool

Rollback
--------

If an upgrade introduces a regression, roll back by checking out the previous tag:

.. code-block:: bash

   git checkout v1.x.y
   docker compose build
   docker compose up -d

Data is preserved in the ``mongodb_data`` Docker volume and is not affected by image rollbacks.

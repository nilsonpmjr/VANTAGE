Quick Start
===========

Get VANTAGE running from scratch in under 5 minutes.

.. admonition:: No default credentials
   :class: warning

   The system ships with **no pre-created users**. Step 3 below is mandatory —
   skip it and the platform will refuse all authenticated requests.

Prerequisites: Docker Engine 24+ and Docker Compose 2.20+ installed and running.

Step 1 — Clone the repository
------------------------------

.. code-block:: bash

   git clone https://github.com/nilsonpmjr/Vantage.git
   cd Vantage

Step 2 — Configure the environment
------------------------------------

.. code-block:: bash

   cp .env.example .env

Open ``.env`` and fill in the required values. At minimum:

.. code-block:: text

   # MongoDB credentials (choose your own)
   MONGO_USER=vantage
   MONGO_PASSWORD=<strong-password>

   # JWT secret (generate with: openssl rand -hex 32)
   SECRET_KEY=<your-secret>

   # At least one threat-intelligence API key
   VIRUSTOTAL_API_KEY=<your-key>

See :doc:`../deploy/environment-variables` for the full variable reference.

Step 3 — Start the stack
-------------------------

.. code-block:: bash

   docker compose up -d

Wait for all containers to become healthy:

.. code-block:: bash

   docker compose ps

The ``vantage_backend`` container must show ``healthy`` before proceeding.

Step 4 — Create the first admin account
-----------------------------------------

.. code-block:: bash

   docker compose exec backend python bin/console setup:create-admin

You will be prompted interactively:

.. code-block:: text

   === VANTAGE — Initial Setup ===

   Creating the first administrator account.
   This command can only be run once.

   Full name: _
   Username: _
   E-mail: _
   Password: _ (hidden)
   Confirm password: _ (hidden)
   Preferred language [pt/en/es, default: pt]: _

   ✓ Administrator created successfully!
   ✓ Access the system at: http://localhost

Step 5 — Open the platform
----------------------------

Navigate to ``http://localhost`` (or the host you configured in ``CORS_ORIGINS``).

Log in with the credentials you created in step 4.

----

.. rubric:: What's next?

* :doc:`../deploy/secure-deploy` — harden the deployment for production
* :doc:`../deploy/environment-variables` — review all available options
* :doc:`../configuration/threat-feeds` — configure additional threat-intelligence sources
* :doc:`../configuration/rbac` — set up roles and additional users

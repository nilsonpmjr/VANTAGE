Development Environment
=======================

Setting up a local dev environment takes about 5 minutes.

Prerequisites
-------------

* Docker Engine 24+ and Docker Compose 2.20+
* Python 3.12 (for running tests outside Docker)
* Node.js 20+ (for frontend development)

Quick setup
-----------

.. code-block:: bash

   git clone https://github.com/nilsonpmjr/Vantage.git
   cd Vantage
   cp .env.example .env

Edit ``.env`` — for development, set:

.. code-block:: text

   ENV=development
   DEV_SEED_USERS=true
   DEV_ADMIN_PASSWORD=DevAdmin123!

.. warning::

   ``DEV_SEED_USERS=true`` automatically creates ``admin`` and ``tech`` users at startup.
   **Never set this in production** — the backend will refuse to start.

Start the stack:

.. code-block:: bash

   docker compose --profile dev up -d

The system will auto-initialize with dev users — no need to run ``setup:create-admin`` in
development mode.

Running backend tests
---------------------

.. code-block:: bash

   cd backend
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements-dev.txt
   pytest -v

Or inside the container:

.. code-block:: bash

   docker compose exec backend pytest -v

Running frontend dev server
----------------------------

.. code-block:: bash

   cd web
   npm install
   npm run dev

The dev server runs at ``http://localhost:5173`` and proxies API calls to the backend.

Type checking
-------------

.. code-block:: bash

   cd web && npx tsc --noEmit

Code style
----------

* Backend: ``ruff`` for linting and formatting
* Frontend: ESLint + Prettier (config in ``web/package.json``)

.. code-block:: bash

   # Backend
   cd backend && ruff check . && ruff format .

   # Frontend
   cd web && npm run lint

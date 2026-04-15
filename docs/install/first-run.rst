First Run — Setup CLI
======================

VANTAGE follows the same initialization model as GLPI: the system ships with no default
users and refuses to serve authenticated requests until an administrator account exists.

The ``setup:create-admin`` command is the **only** way to initialize a fresh installation.

How it works
------------

When the backend starts, it checks whether any user with ``role: admin`` exists in the
database:

* **Admin found** → normal boot, all endpoints available.
* **No admin found** → the system enters *uninitialized mode*:

  * ``/health/ready`` returns ``HTTP 503`` (prevents load-balancers from routing traffic).
  * All authenticated endpoints return ``HTTP 503`` with an instructive message.
  * Public endpoints (``/health``, ``/api/auth/login``) continue responding normally.
  * The backend emits a log line with the exact command to run.

Running the setup command
--------------------------

Interactive mode (recommended for first install)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   docker compose exec backend python bin/console setup:create-admin

Prompts:

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Field
     - Validation rules
   * - Full name
     - 1–128 characters
   * - Username
     - Alphanumeric + underscores, 3–32 characters, unique in the database
   * - E-mail
     - Valid e-mail format, unique in the database
   * - Password
     - Minimum 12 characters (entered via ``getpass`` — not echoed)
   * - Confirm password
     - Must match the password field
   * - Language
     - One of ``pt``, ``en``, ``es`` (default: ``pt``)

Non-interactive mode (CI/CD)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   docker compose exec -T backend python bin/console setup:create-admin \
     --name    "Admin"           \
     --username admin            \
     --email   admin@example.com \
     --password "$(cat /run/secrets/admin_pass)" \
     --lang    pt                \
     --no-interaction

.. caution::

   Never pass the password as a literal string in shell history.
   Use ``$(cat /run/secrets/file)`` or a secrets manager.

What happens after setup
-------------------------

* The admin account is created with an Argon2-hashed password.
* The system transitions to *initialized mode* — ``/health/ready`` returns ``200``.
* The command cannot be run again. If attempted:

  .. code-block:: text

     [WARNING] System already initialized. This command cannot be run again.

  The process exits with code ``1``.

Verifying initialization
-------------------------

.. code-block:: bash

   curl -s http://localhost/health/ready | python -m json.tool

Before setup returns:

.. code-block:: json

   {"status": "not_initialized"}

After setup returns:

.. code-block:: json

   {"status": "ok"}

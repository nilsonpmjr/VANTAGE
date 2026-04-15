Admin API
=========

All admin endpoints require the ``admin`` role.

Users
-----

.. code-block:: http

   GET    /api/admin/users          # list users
   POST   /api/admin/users          # create user
   GET    /api/admin/users/{id}     # get user
   PUT    /api/admin/users/{id}     # update user
   DELETE /api/admin/users/{id}     # delete user
   POST   /api/admin/users/{id}/unlock   # unlock locked account

Audit log
---------

.. code-block:: http

   GET /api/admin/audit?page=1&limit=50&user_id=...&action=...

Export:

.. code-block:: http

   GET /api/admin/audit/export?format=csv
   GET /api/admin/audit/export?format=json

System health
-------------

.. code-block:: http

   GET /api/admin/health

Returns worker status, database connectivity, ingestion queue depth, and
external API availability.

Security policies
-----------------

.. code-block:: http

   GET  /api/admin/policies    # get current policies
   PUT  /api/admin/policies    # update policies

Example — update password policy:

.. code-block:: json

   {
     "min_password_length": 14,
     "require_uppercase": true,
     "require_digit": true,
     "require_special": true,
     "password_history": 5,
     "max_password_age_days": 90,
     "lockout_threshold": 5,
     "lockout_duration_minutes": 15
   }

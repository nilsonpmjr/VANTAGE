Authentication API
==================

Login
-----

.. code-block:: http

   POST /api/auth/login

Request body:

.. code-block:: json

   {
     "username": "admin",
     "password": "YourPassword123!"
   }

On success, sets HttpOnly cookies ``access_token`` and ``refresh_token``.
Returns ``HTTP 200``:

.. code-block:: json

   {
     "message": "Login successful",
     "user": {
       "id": "...",
       "username": "admin",
       "role": "admin",
       "full_name": "Admin"
     }
   }

If MFA is required, returns ``HTTP 202``:

.. code-block:: json

   {
     "mfa_required": true,
     "mfa_token": "..."
   }

Submit the TOTP code:

.. code-block:: http

   POST /api/mfa/verify

.. code-block:: json

   {
     "mfa_token": "...",
     "code": "123456"
   }

Logout
------

.. code-block:: http

   POST /api/auth/logout

Clears the auth cookies and revokes the current session. Returns ``HTTP 200``.

Refresh token
-------------

.. code-block:: http

   POST /api/auth/refresh

Uses the ``refresh_token`` cookie to issue a new ``access_token``. Called automatically
by the frontend. Returns ``HTTP 200`` with a new access token cookie.

Current user
------------

.. code-block:: http

   GET /api/auth/me

Returns the authenticated user's profile. Used by the frontend to restore session state
on page reload.

.. code-block:: json

   {
     "id": "...",
     "username": "admin",
     "role": "admin",
     "full_name": "Admin",
     "email": "admin@example.com",
     "mfa_enabled": false,
     "preferred_language": "pt"
   }

Error responses
---------------

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - HTTP status
     - Meaning
   * - ``401``
     - Invalid credentials or expired token
   * - ``423``
     - Account locked (too many failed attempts)
   * - ``503``
     - System not initialized — run ``setup:create-admin``

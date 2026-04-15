Authentication Configuration
============================

JWT tokens
----------

VANTAGE uses short-lived JWT access tokens delivered via **HttpOnly cookies**.
The signing secret is controlled by:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``SECRET_KEY``
     - HMAC-SHA256 signing secret. Rotate to invalidate all sessions. Generate: ``openssl rand -hex 32``
   * - ``ACCESS_TOKEN_EXPIRE_MINUTES``
     - Access token lifetime in minutes (default: ``30``)
   * - ``REFRESH_TOKEN_EXPIRE_DAYS``
     - Refresh token lifetime in days (default: ``7``)

Session inactivity
------------------

Sessions expire after 30 minutes of inactivity by default. The frontend renews the
session via the refresh token endpoint while the user is active.

Cookie security
---------------

All auth cookies are set with:

* ``HttpOnly`` — inaccessible to JavaScript
* ``SameSite=Strict`` — CSRF mitigation
* ``Secure`` — only sent over HTTPS (enforced when ``ENV=production``)

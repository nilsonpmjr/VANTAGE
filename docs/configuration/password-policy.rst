Password Policy
===============

Admins configure the password policy under **Admin → Security Policies**.

Settings
--------

.. list-table::
   :header-rows: 1
   :widths: 35 65

   * - Setting
     - Description
   * - Minimum length
     - Minimum number of characters (system minimum: 12)
   * - Complexity requirements
     - Require uppercase, lowercase, digit, and/or special character
   * - Password history
     - Number of previous passwords that cannot be reused (0 = disabled)
   * - Maximum age (days)
     - Force password change after N days (0 = never)
   * - Account lockout threshold
     - Failed login attempts before lockout (0 = disabled)
   * - Lockout duration (minutes)
     - How long an account stays locked (0 = until admin unlocks)

Defaults
--------

Fresh installations ship with:

* Minimum 12 characters
* At least one uppercase, one lowercase, one digit
* History: 5
* Max age: 90 days
* Lockout: 5 attempts / 15-minute lockout

Unlocking an account
--------------------

Admins can unlock a locked account from **Admin → Users & Roles → [user] → Unlock**.

Via API:

.. code-block:: bash

   POST /api/admin/users/{user_id}/unlock
   Authorization: Bearer <admin-token>

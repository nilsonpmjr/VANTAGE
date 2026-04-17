RBAC — Roles & Permissions
===========================

VANTAGE ships with three built-in roles.

Roles
-----

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - Role
     - Capabilities
   * - ``admin``
     - Full access — user management, system configuration, security policies, all analyst features
   * - ``manager``
     - All analyst features + read access to admin surfaces (audit log, system health). Cannot modify users or policies.
   * - ``tech``
     - Analyst workspace — feed, recon, watchlist, shift handoff, and analysis. No admin surfaces.

Managing users
--------------

Users are managed via **Admin → Users & Roles** in the UI, or via the API:

.. code-block:: bash

   POST /api/admin/users
   Authorization: Bearer <token>

   {
     "username": "analyst1",
     "email": "analyst1@example.com",
     "password": "SecurePassword123!",
     "role": "tech",
     "full_name": "SOC Analyst"
   }

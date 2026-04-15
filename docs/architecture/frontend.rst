Frontend Architecture
======================

The frontend is a `React <https://react.dev/>`_ 18 single-page application built with
`Vite <https://vitejs.dev/>`_ and served in production by Nginx.

Structure
---------

.. code-block:: text

   web/src/
   ├── components/
   │   ├── auth/          — Login, MFA, password change
   │   ├── admin/         — Users, roles, policies, audit log, system health
   │   ├── dashboard/     — Home, statistics widgets
   │   ├── layout/        — Shell, sidebar, navigation
   │   └── shared/        — Reusable UI primitives
   ├── context/           — React context providers (auth, theme)
   └── main.tsx           — App entry point

Design system
--------------

* Glassmorphism aesthetic with dark mode as the primary theme.
* Light/dark toggle persisted in ``localStorage``.
* Responsive layout — tested at 1280px+ and 1024px (compact mode).
* Guided tour on first login via an onboarding overlay.

Authentication
--------------

Auth state is managed via a React context that reads from the ``/api/auth/me`` endpoint.
Tokens are stored in **HttpOnly cookies** — JavaScript has no direct access to them,
mitigating XSS-based token theft.

Build output
------------

.. code-block:: bash

   cd web && npm run build

Produces ``web/dist/``, which is copied into the Nginx container during ``docker compose build``.

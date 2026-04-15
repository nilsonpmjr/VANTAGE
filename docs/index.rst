VANTAGE Documentation
=====================

.. image:: https://github.com/nilsonpmjr/Vantage/actions/workflows/ci.yml/badge.svg
   :target: https://github.com/nilsonpmjr/Vantage/actions/workflows/ci.yml
   :alt: CI

.. image:: https://img.shields.io/badge/Python-3.12-blue.svg
   :target: https://www.python.org/
   :alt: Python

.. image:: https://img.shields.io/badge/License-AGPLv3-blue.svg
   :target: https://github.com/nilsonpmjr/Vantage/blob/main/LICENSE
   :alt: License

VANTAGE is a threat intelligence platform for SOC teams that need fast, explainable verdicts
for IPs, domains, and file hashes, plus an operational workspace to triage feeds, recon,
watchlists, hunting, and exposure — all in one place.

Released under **AGPLv3**. Transparent, auditable, and collaborative by design.

----

.. admonition:: No default credentials
   :class: warning

   VANTAGE ships with **no pre-created users**. After starting the stack, you must run the
   setup command to create the first admin account before the system accepts connections.
   See :doc:`install/first-run`.

----

.. toctree::
   :maxdepth: 2
   :caption: Installation

   install/requirements
   install/quickstart
   install/first-run
   install/upgrade

.. toctree::
   :maxdepth: 2
   :caption: Deploy & Operations

   deploy/secure-deploy
   deploy/environment-variables
   deploy/docker-compose
   deploy/reverse-proxy
   deploy/health-checks

.. toctree::
   :maxdepth: 2
   :caption: Architecture

   architecture/overview
   architecture/backend
   architecture/frontend
   architecture/database

.. toctree::
   :maxdepth: 2
   :caption: Configuration

   configuration/auth
   configuration/rbac
   configuration/mfa
   configuration/api-keys
   configuration/password-policy
   configuration/threat-feeds

.. toctree::
   :maxdepth: 2
   :caption: API Reference

   api/authentication
   api/analysis
   api/admin

.. toctree::
   :maxdepth: 1
   :caption: Contributing

   contributing/index
   contributing/development-environment
   contributing/security

----

.. rubric:: Quick links

* :doc:`install/quickstart` — up and running in 5 minutes
* :doc:`deploy/secure-deploy` — hardening checklist for production
* :doc:`deploy/environment-variables` — full ``.env`` reference

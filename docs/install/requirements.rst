Requirements
============

Software requirements
---------------------

.. list-table::
   :header-rows: 1
   :widths: 30 20 50

   * - Component
     - Minimum version
     - Notes
   * - Docker Engine
     - 24.0
     - `Install Docker <https://docs.docker.com/engine/install/>`_
   * - Docker Compose
     - 2.20 (plugin)
     - Ships with Docker Desktop; ``docker compose version``
   * - Git
     - 2.x
     - Required to clone the repository
   * - (optional) Python
     - 3.12
     - Only needed if running outside Docker

Hardware requirements
---------------------

.. list-table::
   :header-rows: 1
   :widths: 30 30 40

   * - Profile
     - Minimum
     - Recommended
   * - Development
     - 2 vCPU / 4 GB RAM
     - 4 vCPU / 8 GB RAM
   * - Production (single node)
     - 4 vCPU / 8 GB RAM / 40 GB SSD
     - 8 vCPU / 16 GB RAM / 100 GB SSD

Network requirements
--------------------

The backend queries external threat-intelligence APIs. Outbound HTTPS (port 443) must be
reachable from the container network to the following hosts:

* ``www.virustotal.com``
* ``api.abuseipdb.com``
* ``api.shodan.io``
* ``otx.alienvault.com``
* ``api.greynoise.io``
* ``urlscan.io``
* ``mb-api.abuse.ch``
* ``pulsedive.com``

.. note::

   If your host cannot reach these services directly, configure an HTTP proxy via the
   ``HTTP_PROXY`` / ``HTTPS_PROXY`` environment variables in ``.env``.

Supported operating systems
----------------------------

* Linux (recommended) — any distribution with Docker Engine 24+
* macOS — Docker Desktop 4.x or later
* Windows — Docker Desktop with WSL 2 backend

Environment Variables
=====================

All configuration is passed to VANTAGE via a ``.env`` file at the repository root.
Copy ``.env.example`` as a starting point:

.. code-block:: bash

   cp .env.example .env

Required variables
------------------

These variables must be set before the stack will start.

MongoDB
^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``MONGO_USER``
     - MongoDB root username
   * - ``MONGO_PASSWORD``
     - MongoDB root password (**use a strong, unique value**)

Application
^^^^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``SECRET_KEY``
     - 256-bit secret for JWT signing. Generate: ``openssl rand -hex 32``
   * - ``ENV``
     - Runtime environment: ``production`` or ``development``

Optional — threat intelligence APIs
-------------------------------------

At least one API key is required for analysis to return results.

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Service
   * - ``VIRUSTOTAL_API_KEY``
     - VirusTotal
   * - ``ABUSEIPDB_API_KEY``
     - AbuseIPDB
   * - ``SHODAN_API_KEY``
     - Shodan
   * - ``OTX_API_KEY``
     - AlienVault OTX
   * - ``GREYNOISE_API_KEY``
     - GreyNoise
   * - ``URLSCAN_API_KEY``
     - UrlScan.io
   * - ``PULSEDIVE_API_KEY``
     - Pulsedive

Optional — email (SMTP)
------------------------

Required for password-reset and notification features.

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``SMTP_HOST``
     - SMTP server hostname
   * - ``SMTP_PORT``
     - SMTP port (default: ``587``)
   * - ``SMTP_USER``
     - SMTP authentication username
   * - ``SMTP_PASSWORD``
     - SMTP authentication password
   * - ``SMTP_FROM``
     - Sender address for outgoing mail

Optional — network
-------------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``CORS_ORIGINS``
     - JSON array of allowed origins. Example: ``["https://vantage.example.com"]``
   * - ``HTTP_PROXY``
     - Outbound HTTP proxy for API calls (optional)
   * - ``HTTPS_PROXY``
     - Outbound HTTPS proxy for API calls (optional)

Development-only variables
---------------------------

.. warning::

   These variables are **blocked** when ``ENV=production``. The backend will refuse to start
   if they are set in a production environment.

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``DEV_SEED_USERS``
     - ``true`` to auto-create dev users on startup. Only valid when ``ENV=development``.
   * - ``DEV_ADMIN_PASSWORD``
     - Password for the dev admin account (required when ``DEV_SEED_USERS=true``)
   * - ``DEV_TECH_PASSWORD``
     - Password for the dev tech account (optional)

Mongo Express (dev profile only)
----------------------------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``ME_BASICAUTH_USER``
     - Basic-auth username for the Mongo Express UI
   * - ``ME_BASICAUTH_PASSWORD``
     - Basic-auth password for the Mongo Express UI

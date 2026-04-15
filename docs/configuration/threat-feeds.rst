Threat Intelligence Feeds
==========================

VANTAGE ingests threat intelligence from multiple sources and enriches analysis results
with editorial context from the security community.

Feed sources
------------

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Source
     - Type / Notes
   * - VirusTotal
     - API — requires key
   * - AbuseIPDB
     - API — requires key
   * - Shodan
     - API — requires key
   * - AlienVault OTX
     - API — requires key
   * - GreyNoise
     - API — requires key
   * - UrlScan.io
     - API — requires key
   * - Abuse.ch (MalwareBazaar / URLhaus)
     - API — free, key recommended
   * - Pulsedive
     - API — requires key
   * - BlacklistMaster
     - HTTP — no key required
   * - Fortinet Threat RSS
     - RSS — curated intelligence feed
   * - Custom RSS
     - Configurable via Admin → Threat Ingestion

Configuring feeds (UI)
-----------------------

Navigate to **Admin → Threat Ingestion**. Toggle sources on/off, configure API keys
(stored encrypted), and set ingestion schedules.

Feed ingestion schedule
------------------------

By default the background worker re-ingests feeds every 6 hours. The interval is
configurable via:

.. code-block:: text

   FEED_INGESTION_INTERVAL_HOURS=6   # default

MISP integration
----------------

VANTAGE supports read-only MISP feed ingestion:

.. code-block:: text

   MISP_URL=https://misp.example.com
   MISP_KEY=<your-api-key>
   MISP_VERIFY_SSL=true

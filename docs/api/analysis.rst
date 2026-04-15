Analysis API
============

Single target analysis
-----------------------

.. code-block:: http

   POST /api/analyze

Supported target types: IPv4, IPv6, domain, URL, MD5/SHA1/SHA256 file hash.

Request:

.. code-block:: json

   {
     "target": "1.2.3.4"
   }

Response:

.. code-block:: json

   {
     "id": "...",
     "target": "1.2.3.4",
     "target_type": "ip",
     "verdict": "MALICIOUS",
     "score": 87,
     "sources": {
       "virustotal": {"malicious": 12, "total": 70},
       "abuseipdb": {"abuse_confidence_score": 95},
       "greynoise": {"classification": "malicious"}
     },
     "report": "O endereço 1.2.3.4 apresenta alto risco...",
     "created_at": "2026-04-15T10:00:00Z"
   }

Verdicts
^^^^^^^^

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Verdict
     - Meaning
   * - ``MALICIOUS``
     - Multiple sources confirm malicious activity
   * - ``SUSPICIOUS``
     - Some indicators of compromise; warrants investigation
   * - ``CLEAN``
     - No significant indicators found across queried sources
   * - ``UNKNOWN``
     - Insufficient data from sources to render a verdict

Batch analysis
--------------

Submit multiple targets in a single request:

.. code-block:: http

   POST /api/batch

.. code-block:: json

   {
     "targets": ["1.2.3.4", "evil.example.com", "d41d8cd98f00b204e9800998ecf8427e"]
   }

Returns a ``job_id``. Poll for results:

.. code-block:: http

   GET /api/batch/{job_id}

Analysis history
----------------

.. code-block:: http

   GET /api/analyze?page=1&limit=25

Returns paginated analysis history for the authenticated user.

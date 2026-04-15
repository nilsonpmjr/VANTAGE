Architecture Overview
=====================

VANTAGE follows a three-tier architecture: a React single-page application (SPA), a
FastAPI backend, and a MongoDB document store — all orchestrated via Docker Compose.

High-level diagram
-------------------

.. code-block:: text

   ┌──────────────────┐     HTTPS      ┌─────────────────────┐
   │  React + Vite    │ ◄────────────► │  FastAPI (Python)   │
   │  (port 80/443)   │                │  (port 8000)        │
   └──────────────────┘                └──────────┬──────────┘
                                                  │
                                       ┌──────────▼──────────┐
                                       │  MongoDB 8          │
                                       │  (port 27017)       │
                                       └─────────────────────┘

Request flow
------------

1. The browser sends requests to the reverse proxy (port 443).
2. Static assets and the SPA shell are served by the Nginx container (port 80).
3. API calls (``/api/*``) are proxied to the FastAPI backend (port 8000).
4. The backend authenticates the request (JWT + HttpOnly cookie), enforces RBAC, and
   dispatches to the appropriate router.
5. Routers interact with MongoDB via the ``db`` module.
6. External threat-intelligence queries are executed in parallel by ``analyzer.py`` and
   cached per-request.

Background worker
------------------

A separate ``worker.py`` process runs inside the backend container and performs:

* Daily re-scan of watchlisted targets for verdict drift detection.
* Periodic threat feed ingestion (RSS, MISP, Fortinet).

The worker communicates with the database directly and does not go through the HTTP layer.

Data flow — analysis request
------------------------------

.. code-block:: text

   Browser
     │  POST /api/analyze  {target: "1.2.3.4"}
     ▼
   FastAPI router (routers/analyze.py)
     │  authenticate + authorize
     ▼
   analyzer.py
     │  parallel queries → VirusTotal, AbuseIPDB, Shodan, OTX, GreyNoise …
     ▼
   scoring.py
     │  aggregate verdicts → MALICIOUS / SUSPICIOUS / CLEAN / UNKNOWN
     ▼
   report_generator.py
     │  AI narrative (PT-BR / EN / ES)
     ▼
   MongoDB (persist result + audit entry)
     │
     └─► HTTP 200 {verdict, score, sources, report}

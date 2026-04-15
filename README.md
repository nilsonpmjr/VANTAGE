# VANTAGE

[![CI](https://github.com/nilsonpmjr/Vantage/actions/workflows/ci.yml/badge.svg)](https://github.com/nilsonpmjr/Vantage/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248.svg)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://docs.docker.com/compose/)
[![License](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)

VANTAGE is a threat intelligence and SOC operations platform built for analyst teams. It combines fast, multi-source verdicts for IPs, domains, and file hashes with a full operational workspace — feed triage, recon, watchlists, hunting, exposure monitoring, and shift handoff — in a single product.

The project is released under AGPLv3. The goal is to keep the platform transparent, auditable, and collaborative as it grows from an internal workflow accelerator into an independent cybersecurity product.

## Licensing & Distribution

- **Core license**: `AGPLv3`
- **Public core**: this repository and the official runtime shipped here
- **Commercial layer**: support, managed operation, premium extensions, and contract-specific deliverables outside the public core

This keeps the product open and auditable while preserving a clean open-core boundary for commercial offerings.

## Product Scope

### Analyst workspaces

| Module | What it does |
|---|---|
| **Analysis** | Single-target lookup (IP, domain, hash) querying all configured sources in parallel; AI-generated verdict summary in PT-BR, EN, or ES |
| **Batch Analysis** | Upload a list of targets; processes with streaming progress and downloadable report |
| **Feed** | Ingests RSS/XML threat feeds (NVD CVE, Fortinet FortiGuard, custom sources, MISP); editorial scoring; threat modeling readiness index |
| **Recon** | On-demand and scheduled deep recon scans; per-target history; streamed results |
| **Watchlist** | Persistent monitoring list with automatic re-scan and SMTP alert on verdict change |
| **Hunting** | Premium hunting provider lane (native, isolated container, or Kali sidecar) |
| **Exposure** | Premium attack surface and brand exposure monitoring provider lane |
| **Dashboard** | Stats and verdict trends by period (day / week / month / all); top targets; source health |
| **Shift Handoff** | Structured shift-transition forms; incident tracking per handoff; acknowledgment flow; attachment support; configurable artifact auto-capture from analyze and recon sessions |

### Administrative control surfaces

| Module | What it does |
|---|---|
| **Users & Roles** | Create, update, deactivate users; assign roles; extra-permission grants; CSV/JSON import and export |
| **Security Policies** | Lockout policy (threshold, window, duration); password policy (complexity, history, expiry); export and timeline |
| **Extensions** | Extension registry with install, enable, disable, update, and uninstall; runtime state; distribution tier and capability metadata |
| **Threat Ingestion** | Configure and manage threat sources (RSS, MISP, custom); per-source sync, pause, resume, metrics; orphaned-item cleanup |
| **SMTP Config** | Operational SMTP setup with test dispatch |
| **System Health** | Operational status, event history, service restart; MongoDB and worker health |
| **Audit Log** | Paginated, full-fidelity audit trail with CSV/JSON export |

### Platform-wide security

- **IAM & RBAC** — roles: `admin`, `manager`, `tech`; extra permission grants per user
- **MFA (TOTP)** — authenticator-app 2FA with AES-256 encrypted secrets and printable backup codes
- **JWT + HttpOnly cookies** — SameSite=Strict, refresh token rotation, 30-min inactivity auto-logout
- **Session Management** — active session list, per-session and bulk revocation
- **API Keys** — scoped keys with SHA-256 hashed storage, configurable TTL, revocation
- **Password Security** — Argon2id hashing; configurable complexity, history, expiry, lockout
- **Rate Limiting** — per-endpoint via SlowAPI
- **Encryption at Rest** — Fernet (AES-256) for TOTP secrets and third-party API keys

## Architecture

```
┌──────────────────┐     HTTPS      ┌─────────────────────┐
│  React + Vite    │ ◄────────────► │  FastAPI (Python)   │
│  (port 80/443)   │                │  (port 8000)        │
└──────────────────┘                └──────────┬──────────┘
                                               │
                                    ┌──────────▼──────────┐
                                    │  MongoDB 8          │
                                    │  (port 27017)       │
                                    └─────────────────────┘
```

**Backend modules**: `routers/` (auth, analyze, batch, feed, recon, watchlist, stats, shift_handoff, hunting, exposure, admin, mfa, sessions, api_keys, users) · `analyzer.py` · `scoring.py` · `worker.py` · `mailer.py` · `audit.py` · `extensions/`

**Frontend structure**: `components/page/` · `components/auth/` · `components/shift-handoff/` · `components/scan/` · `components/search/` · `components/modal/` · `context/` · `branding/`

## Who It Is For

- SOC analysts who need a daily workspace, not just a single lookup tool
- technical operators who need visibility into ingestion, policies, sessions, and runtime health
- maintainers who want an open core with a clear commercial boundary

## Getting Started

> **No default credentials.** VANTAGE ships with no pre-created users. Step 3 below is mandatory — skip it and the platform will refuse all authenticated requests.

```bash
# 1. Clone and configure
git clone https://github.com/nilsonpmjr/Vantage.git
cd Vantage
cp .env.example .env          # fill in JWT_SECRET, MONGO_PASSWORD, and API keys

# 2. Start the stack
docker compose up -d

# 3. Create the first admin account (required before first login)
docker compose exec backend python bin/console setup:create-admin

# 4. Open the platform — http://localhost
```

The CLI guides you through the setup interactively. After that the system is ready.

### Non-interactive mode (CI/CD)

```bash
docker compose exec -T backend python bin/console setup:create-admin \
  --name "Admin" --username admin \
  --email admin@example.com \
  --password "$(cat /run/secrets/admin_pass)" \
  --lang pt --no-interaction
```

### Development environments

Set `DEV_SEED_USERS=true` and `DEV_ADMIN_PASSWORD=<pass>` in `.env` to auto-create users on startup. This is blocked in production — the backend refuses to boot if `DEV_SEED_USERS=true` and `ENVIRONMENT=production`.

```bash
docker compose --profile dev up -d
# mongo-express at http://127.0.0.1:8081
```

For the full setup guide see the [documentation](https://vantage.readthedocs.io).

---

## Deployment Notes

### Frontend runtime

The default stack serves the canonical interface from [`web/`](./web). `web-legacy/` is archived and not used by the runtime.

To rehearse on an alternate port:

```bash
VANTAGE_FRONTEND_PORT=4177 docker compose \
  -f docker-compose.yml \
  -f docker-compose.operational-architect.yml \
  up -d --build
```

### Optional: hunting runtime lane

The main stack does not require Kali. Hunting providers run in three declared lanes: `native_local`, `isolated_container`, `kali_container`. The optional Kali sidecar is in [`docker-compose.hunting-kali.yml`](./docker-compose.hunting-kali.yml).

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.hunting-kali.yml \
  up -d backend hunting_kali_runtime
```

### Optional: host-specific egress workaround

Some Linux hosts need this when custom Docker bridges do not provide outbound connectivity.

```bash
docker compose --profile egress-workaround up -d backend-egress
```

### Health probes

- liveness: `GET /health/live`
- readiness: `GET /health/ready` — returns `503` until `setup:create-admin` has been run

### Pilot baseline

Single Linux host with Docker Engine + Compose (not Kubernetes):

- Ubuntu 24.04 LTS · 4 vCPU / 8 GB RAM / 120 GB SSD
- reverse proxy in front of the frontend (Cloudflare Tunnel, Tailscale, Nginx, or equivalent)
- daily backup of the `mongodb_data` volume

---

## Development Setup (without Docker)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Copy and fill in .env at repo root, then:
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend starts in uninitialized state. Initialize it with one of:

**Option A — interactive setup (mirrors production flow):**
```bash
cd backend
python bin/console setup:create-admin
```

**Option B — auto-seed for development (fastest):**

Add to `.env`:
```
DEV_SEED_USERS=true
DEV_ADMIN_PASSWORD=DevAdmin123!
```
Then restart the backend — users are created automatically on startup.

### Frontend

```bash
cd web
npm install
npm run dev
# Available at http://localhost:5173
```

### Run tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest tests/ -v
```

## Environment Variables

Copy `.env.example` to `.env` and configure the following:

### Required

| Variable | Description |
|---|---|
| `JWT_SECRET` | Random string ≥32 chars for signing JWT tokens |
| `MONGO_URI` | MongoDB connection string for local backend runs (e.g. `mongodb://user:pass@localhost:27017/`) |
| `MONGO_USER` | MongoDB root username (used by docker-compose) |
| `MONGO_PASSWORD` | MongoDB root password (used by docker-compose) |

When you use `docker compose`, the backend receives an internal `MONGO_URI` automatically and connects to the `mongodb` service over the private bridge network.

### Threat Intelligence API Keys

| Variable | Service | Free Tier |
|---|---|---|
| `VT_API_KEY` | VirusTotal | 4 req/min |
| `ABUSEIPDB_API_KEY` | AbuseIPDB | 1000 req/day |
| `SHODAN_API_KEY` | Shodan | Limited |
| `OTX_API_KEY` | AlienVault OTX | Unlimited |
| `GREYNOISE_API_KEY` | GreyNoise | Community |
| `URLSCAN_API_KEY` | UrlScan.io | 100 req/day |
| `IP2LOCATION_API_KEY` | IP2Location.io | 1000 req/day keyless, 50k/mo free with key |
| `PULSEDIVE_API_KEY` | Pulsedive | Free tier |
| `ABUSECH_API_KEY` | Abuse.ch | Free |

Missing keys are gracefully skipped, except `IP2LOCATION`, which can run in public keyless mode with a lower daily limit.

### Optional

| Variable | Default | Description |
|---|---|---|
| `ENVIRONMENT` | `development` | Set to `production` to enable HSTS and stricter validation |
| `CACHE_TTL_HOURS` | `24` | How long scan results are cached in MongoDB |
| `MFA_ENCRYPTION_KEY` | auto-derived (dev) | Fernet key for TOTP secrets; **required in production** |
| `FRONTEND_URL` | `http://localhost:5173` | Base URL for password-reset email links |
| `SMTP_HOST` | — | SMTP server for password-reset emails |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | `noreply@soc.local` | From address for outgoing emails |
| `LOG_LEVEL` | `INFO` | Python log level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |

## RBAC — Roles

| Role | Capabilities |
|---|---|
| `admin` | Full access; manage users, policies, extensions, audit logs; can require MFA |
| `manager` | Dashboard, analysis, stats, feed, watchlist, shift handoff; read-only user list |
| `tech` | Analysis, recon, watchlist, feed, shift handoff; no admin panels |

## CI/CD

GitHub Actions runs on every PR and push to `main`:

- **lint-python** — flake8
- **test-python** — pytest against MongoDB 8
- **lint-frontend** — ESLint
- **build-frontend** — Vite production build
- **SAST** — Bandit (weekly + on push)

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## License

[AGPLv3](LICENSE)

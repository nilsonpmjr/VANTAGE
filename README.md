# VANTAGE

[![CI](https://github.com/nilsonpmjr/Vantage/actions/workflows/ci.yml/badge.svg)](https://github.com/nilsonpmjr/Vantage/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248.svg)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://docs.docker.com/compose/)
[![License](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)

VANTAGE is a threat intelligence platform for SOC teams that need fast, explainable verdicts for IPs, domains, and file hashes, plus an operational workspace to triage feeds, recon, watchlists, hunting, and exposure in one place.

The project is released under AGPLv3 by design. The goal is to keep the platform transparent, auditable, and collaborative as it grows from an internal workflow accelerator into an independent cybersecurity product.

## Licensing & Distribution

- **Core license**: `AGPLv3`
- **Public core**: this repository and the official runtime shipped here
- **Commercial layer**: support, managed operation, premium extensions, and contract-specific deliverables outside the public core
- **Trademark/brand governance**: handled separately from the code license

This keeps the product open and auditable while preserving a clean open-core boundary for commercial offerings.

## Product Scope

### What ships in v1

- analyst workspaces for `Feed`, `Recon`, `Watchlist`, `Hunting`, `Exposure`, `Dashboard`, `Home`, and single/batch analysis
- administrative control surfaces for `Extensions`, `Threat Ingestion`, `System Health`, `Users & Roles`, and `Security Policies`
- auth, `RBAC`, `MFA`, sessions, audit log, API keys, and guided onboarding
- editorial intelligence ingestion with `RSS`, `MISP`, curated `Fortinet RSS`, and initial `CTI Modeling Readiness`

### What stays post-v1

- ML models trained in production
- enterprise distribution and managed operation layers
- premium extensions and contract-specific deliverables outside this repository

See the full package and roadmap:

- [`docs/VANTAGE/fases/12-consolidacao-produto-e-lancamento-v1/PACOTE-funcional-v1.md`](docs/VANTAGE/fases/12-consolidacao-produto-e-lancamento-v1/PACOTE-funcional-v1.md)
- [`docs/VANTAGE/ROADMAP-core-e-pos-v1.md`](docs/VANTAGE/ROADMAP-core-e-pos-v1.md)
- [`docs/VANTAGE/fases/25-empacotamento-piloto-interno/PRD-empacotamento-piloto-interno.md`](docs/VANTAGE/fases/25-empacotamento-piloto-interno/PRD-empacotamento-piloto-interno.md)
- [`docs/VANTAGE/fases/25-empacotamento-piloto-interno/RUNBOOK-rollout-piloto-interno.md`](docs/VANTAGE/fases/25-empacotamento-piloto-interno/RUNBOOK-rollout-piloto-interno.md)
- [`docs/VANTAGE/fases/25-empacotamento-piloto-interno/CHECKLIST-go-live-piloto-interno.md`](docs/VANTAGE/fases/25-empacotamento-piloto-interno/CHECKLIST-go-live-piloto-interno.md)

## Core Capabilities

- **Parallel Threat Intelligence** — Queries VirusTotal, AbuseIPDB, Shodan, AlienVault OTX, GreyNoise, UrlScan.io, Abuse.ch, Pulsedive, and BlacklistMaster simultaneously
- **AI Reports** — Contextual natural-language summaries in PT-BR, EN, and ES
- **IAM & RBAC** — Role-based access control (admin / manager / tech), JWT + HttpOnly cookies, refresh tokens
- **MFA (TOTP)** — Authenticator-app 2FA with AES-256 encrypted secrets and backup codes
- **Session Management** — Active session list, per-session revocation, 30-min inactivity auto-logout
- **API Keys** — Scoped API keys with SHA-256 hashed storage and configurable TTL
- **Audit Log** — Full audit trail of all user actions with CSV/JSON export
- **Background Worker** — Daily re-scan of known targets for verdict change detection
- **Password Policy** — Configurable complexity, history, expiry, and lockout rules
- **Dark Mode UI** — Glassmorphism design with responsive layout and guided tour

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

**Backend modules**: `routers/` (auth, users, analyze, stats, admin, mfa, sessions, api_keys) · `analyzer.py` · `scoring.py` · `worker.py` · `mailer.py` · `audit.py`

**Frontend structure**: `components/auth/` · `components/admin/` · `components/dashboard/` · `components/layout/` · `components/shared/` · `context/`

## Who It Is For

- SOC analysts who need a daily workspace, not just a single lookup tool
- technical operators who need visibility into ingestion, policies, sessions, and runtime health
- maintainers who want an open core with a clear path to downstream and commercial layers

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

## API Endpoints

The canonical API prefix is `/api`.
`/api/v1` remains temporarily available for backwards compatibility, but responses now include explicit deprecation headers and a `Sunset` date of `2026-09-30`.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login (form data: username, password) |
| `POST` | `/api/auth/logout` | Logout (clears cookies) |
| `POST` | `/api/auth/refresh` | Rotate access/refresh tokens |
| `GET` | `/api/auth/me` | Current user info |
| `GET` | `/api/auth/sessions` | List active sessions |
| `DELETE` | `/api/auth/sessions/{id}` | Revoke a session |
| `DELETE` | `/api/auth/sessions/others` | Revoke all other sessions |
| `POST` | `/api/auth/forgot-password` | Request password-reset email |
| `POST` | `/api/auth/reset-password` | Reset password with token |

### MFA

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/mfa/enroll` | Begin TOTP enrollment (returns QR URI) |
| `POST` | `/api/mfa/confirm` | Confirm enrollment with OTP code |
| `POST` | `/api/mfa/verify` | Verify OTP during login (pre-auth token) |
| `DELETE` | `/api/mfa/me` | Disable own MFA |
| `DELETE` | `/api/mfa/{username}` | Admin: revoke user MFA |

### Threat Analysis

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/analyze?target=&lang=` | Analyze an IP, domain, or hash |
| `GET` | `/api/status` | Service availability (which API keys are configured) |

### Users & API Keys

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users` | List users (admin) |
| `POST` | `/api/users` | Create user (admin) |
| `PUT` | `/api/users/{username}` | Update user |
| `DELETE` | `/api/users/{username}` | Delete user (admin) |
| `GET` | `/api/api-keys/me` | List own API keys |
| `POST` | `/api/api-keys` | Create API key |
| `DELETE` | `/api/api-keys/{id}` | Revoke API key |

### Admin & Stats

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/stats` | Dashboard statistics (`?period=day\|week\|month\|all`) |
| `GET` | `/api/admin/overview` | IAM overview metrics |
| `GET` | `/api/admin/audit-logs` | Paginated audit log |
| `GET` | `/api/admin/audit-logs/export` | Export audit log (CSV or JSON) |
| `PUT` | `/api/admin/password-policy` | Update password policy |
| `PUT` | `/api/admin/lockout-policy` | Update lockout policy |

## RBAC — Roles

| Role | Capabilities |
|---|---|
| `admin` | Full access; manage users, policies, audit logs; MFA required |
| `manager` | Dashboard + analysis + stats; read-only on user list; MFA required |
| `tech` | Analysis only; no admin panels |

## CI/CD

GitHub Actions runs on every PR and push to `main`:

- **lint-python** — flake8
- **test-python** — pytest against MongoDB 8
- **lint-frontend** — ESLint
- **test-frontend** — Vitest
- **build-frontend** — Vite production build

See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## License

[AGPLv3](LICENSE)

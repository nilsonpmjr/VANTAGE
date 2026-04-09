# Mockup Feature Gaps

## Current integration baseline

These surfaces are already wired to the real VANTAGE runtime:

- `Home` -> `/api/feed`
- `AnalysisResult` -> `/api/analyze`
- `Batch Analysis` -> `/api/analyze/batch*`
- `Feed` -> `/api/feed`
- `Dashboard` -> `/api/stats`
- `Recon` -> `/api/recon/*`
- `Watchlist` -> `/api/watchlist*`
- `Hunting` -> `/api/hunting/*`
- `Exposure` -> `/api/exposure/*`
- `Profile` -> `/api/users/me`, `/api/api-keys/*`, `/api/auth/sessions*`, `/api/users/me/*`
- `Notifications` -> `/api/feed`, `/api/stats`
- `Extensions Catalog` -> `/api/admin/extensions`
- `Threat Ingestion` -> `/api/admin/threat-sources*`, `/api/admin/operational-config/smtp*`
- `System Health` -> `/api/admin/operational-status`, `/api/admin/stats`, `/api/admin/audit-logs`
- `Users & Roles` -> `/api/users`, `/api/admin/stats`, `/api/admin/permissions`, `/api/admin/users/*`
- `Security Policies` -> `/api/admin/password-policy`, `/api/admin/lockout-policy`, `/api/admin/audit-logs`

## Still missing by mockup surface

### Global shell

Resolved in current frontend:

- `Initialize Scan` now opens a real global launcher with single-target navigation and multi-target handoff to the batch runtime.
- Help dropdown items now route to real help center pages (`/help/docs`, `/help/shortcuts`, `/help/api`, `/help/support`).
- Notification center state now persists `read`, `archive` and type-level routing preferences via the authenticated user preferences document.

### Extensions Catalog

- Per-extension performance stats
- Extension health and overhead metrics backed by real telemetry

Resolved in current frontend/runtime:

- install / adopt discovered extension descriptors into the runtime catalog
- enable / disable extension state
- refresh / update runtime catalog state
- remove extension from the runtime catalog
- manifest/state-derived health score and runtime overhead indicators

Current reason:
- catalog health and overhead are now derived from registry metadata plus operational state, but not yet from dedicated telemetry/performance probes

### Threat Ingestion

Resolved in current frontend/runtime:

- per-source advanced row actions
- source-level retry / sync-now actions
- source-level pause / resume actions
- runtime-derived approximate throughput in `GB/day`
- historical ingestion latency / duration series and recent sync events
- create, edit, delete and enable/disable for custom sources

### System Health

Resolved in current frontend/runtime:

- historical service telemetry series persisted from operational snapshots
- dedicated operational event stream filtered from runtime actions, separate from the generic governance/audit timeline
- in-page per-service drilldown with selection-aware metrics and details
- one-click restart controls surfaced for supported runtime services

Current reason:
- telemetry is now snapshot-derived and runtime-backed, but still not a full external metrics stack

### Users & Roles

Resolved in current frontend:

- guided invite/onboarding handoff with temporary credentials
- import review with export/copy of temporary credentials
- per-user session inspection
- bulk permission editing
- suspension reason capture with governance impact messaging
- role change preview with MFA, permission and session-revocation impact analysis

### Security Policies

- Compliance attestation beyond the current audit-derived metadata

Resolved in current frontend/runtime:

- native backend export for password + lockout policy state
- dedicated governance timeline only for password/lockout changes
- local denylist enforcement for common passwords
- local denylist enforcement for known breached passwords

Current reason:
- compliance status still derives from audit/runtime metadata instead of a dedicated attestation subsystem

### Notifications

Resolved in current frontend:

- `critical` notifications now route into the investigation workflow (`AnalysisResult`)
- `system` notifications now route into operational surfaces (`System Health`, `Threat Ingestion`)
- `intelligence` notifications now route into the feed workspace, with source references kept as secondary actions
- page persists `read`, `archive` and type-level routing preferences via the user preferences document

### Dashboard

- Some visual cards still derive from snapshot data rather than dedicated metrics endpoints
- No saved dashboard layouts / analyst personalization

### Analysis Result

- PDF export is now available again in the new frontend
- Narrative report language switching (`PT`, `EN`, `ES`) is now available from the analysis toolbar

Remaining:

- richer artifact actions beyond the existing per-row pivot action
- deeper drilldown / correlation transitions from evidence rows

### Recon

- Deeper job drilldown views beyond the current integrated workbench
- Rich correlation visualizations for attack surface evolution over time

### Watchlist

Resolved in current frontend/runtime:

- bulk watchlist actions
- notification routing preferences per item
- manual scan per watched indicator
- historical trend visualization per watched target

### Hunting

Resolved in current frontend/runtime:

- saved searches
- provider-level result comparison
- analyst case notes on search results

### Exposure

Resolved in current frontend/runtime:

- Incident workflow / triage actions
- Asset grouping and bulk scan orchestration
- Dedicated timeline/history per monitored asset

## Backend feature candidates opened by the new mockup

These are the best next implementation candidates if the mockup should become fully real:

- Dedicated extension performance telemetry probes beyond metadata/state-derived health indicators
- Formal compliance attestation workflow for governance controls
- Saved dashboard layouts and analyst personalization
- Richer evidence-row drilldowns and correlation pivots in `AnalysisResult`
- Recon evolution visualizations over time

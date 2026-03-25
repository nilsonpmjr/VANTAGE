import { useState } from "react";
import { Copy, Check, Lock, ShieldCheck, Zap } from "lucide-react";
import { cn } from "../../lib/utils";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Endpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  auth: "none" | "jwt" | "jwt+rbac" | "jwt+admin" | "jwt+extension";
  params?: string;
  body?: string;
  response?: string;
}

interface EndpointGroup {
  tag: string;
  description: string;
  endpoints: Endpoint[];
}

const METHOD_STYLE: Record<HttpMethod, string> = {
  GET: "badge-primary",
  POST: "bg-emerald-500/10 text-emerald-600",
  PUT: "badge-warning",
  PATCH: "badge-warning",
  DELETE: "badge-error",
};

const AUTH_LABELS: Record<string, { label: string; icon: typeof Lock }> = {
  none: { label: "Public", icon: Zap },
  jwt: { label: "JWT Required", icon: Lock },
  "jwt+rbac": { label: "JWT + Role", icon: ShieldCheck },
  "jwt+admin": { label: "Admin Only", icon: ShieldCheck },
  "jwt+extension": { label: "Extension Enabled", icon: ShieldCheck },
};

const groups: EndpointGroup[] = [
  {
    tag: "Authentication",
    description: "Login, token refresh, logout, and password recovery flows.",
    endpoints: [
      {
        method: "POST",
        path: "/api/auth/login",
        summary: "Authenticate with username and password. Returns access token and sets HttpOnly refresh cookie.",
        auth: "none",
        body: '{ "username": "string", "password": "string" }',
        response: '{ "access_token": "string", "token_type": "bearer" }',
      },
      {
        method: "POST",
        path: "/api/auth/refresh",
        summary: "Rotate access and refresh tokens using the HttpOnly cookie.",
        auth: "none",
        response: '{ "access_token": "string" }',
      },
      {
        method: "POST",
        path: "/api/auth/logout",
        summary: "Clear session cookies and invalidate the current refresh token.",
        auth: "jwt",
      },
      {
        method: "GET",
        path: "/api/auth/me",
        summary: "Return the authenticated user's profile information.",
        auth: "jwt",
        response: '{ "username": "string", "role": "string", "email": "string|null", ... }',
      },
      {
        method: "POST",
        path: "/api/auth/forgot-password",
        summary: "Send a password reset email to the user's registered address.",
        auth: "none",
        body: '{ "email": "string" }',
      },
      {
        method: "POST",
        path: "/api/auth/reset-password",
        summary: "Reset password using a valid reset token.",
        auth: "none",
        body: '{ "token": "string", "new_password": "string" }',
      },
    ],
  },
  {
    tag: "MFA",
    description: "TOTP enrollment, verification, and management.",
    endpoints: [
      {
        method: "POST",
        path: "/api/mfa/enroll",
        summary: "Start TOTP enrollment. Returns a QR code URI and 8 backup codes.",
        auth: "jwt",
        response: '{ "provisioning_uri": "string", "backup_codes": ["string"] }',
      },
      {
        method: "POST",
        path: "/api/mfa/confirm",
        summary: "Confirm TOTP enrollment with a valid 6-digit code.",
        auth: "jwt",
        body: '{ "code": "string" }',
      },
      {
        method: "POST",
        path: "/api/mfa/verify",
        summary: "Verify TOTP code during login (requires pre-auth token).",
        auth: "none",
        body: '{ "pre_auth_token": "string", "code": "string" }',
        response: '{ "access_token": "string" }',
      },
      {
        method: "DELETE",
        path: "/api/mfa/me",
        summary: "Disable MFA on your own account (not allowed for admin/manager roles).",
        auth: "jwt",
      },
      {
        method: "DELETE",
        path: "/api/mfa/{username}",
        summary: "Admin: revoke MFA for another user.",
        auth: "jwt+admin",
        params: "username (path)",
      },
    ],
  },
  {
    tag: "Users",
    description: "User management, profiles, and third-party API key configuration.",
    endpoints: [
      {
        method: "GET",
        path: "/api/users/",
        summary: "List all users (admin only).",
        auth: "jwt+admin",
      },
      {
        method: "POST",
        path: "/api/users/",
        summary: "Create a new user (admin only).",
        auth: "jwt+admin",
        body: '{ "username": "string", "password": "string", "role": "admin|manager|tech", "email": "string|null" }',
      },
      {
        method: "PUT",
        path: "/api/users/me",
        summary: "Update your own profile (display name, email, language).",
        auth: "jwt",
      },
      {
        method: "GET",
        path: "/api/users/me/audit-logs",
        summary: "View your personal audit log with pagination.",
        auth: "jwt",
        params: "page, limit (query)",
      },
      {
        method: "GET",
        path: "/api/users/me/third-party-keys",
        summary: "Retrieve configured intelligence API keys (masked).",
        auth: "jwt",
      },
      {
        method: "PATCH",
        path: "/api/users/me/third-party-keys",
        summary: "Update intelligence API keys for external services.",
        auth: "jwt",
        body: '{ "virustotal": "string", "shodan": "string", ... }',
      },
      {
        method: "DELETE",
        path: "/api/users/{username}",
        summary: "Delete a user account (admin only).",
        auth: "jwt+admin",
        params: "username (path)",
      },
    ],
  },
  {
    tag: "Sessions",
    description: "Active session management and revocation.",
    endpoints: [
      {
        method: "GET",
        path: "/api/auth/sessions/",
        summary: "List your active sessions with device and IP info.",
        auth: "jwt",
      },
      {
        method: "DELETE",
        path: "/api/auth/sessions/others",
        summary: "Revoke all sessions except the current one.",
        auth: "jwt",
      },
      {
        method: "DELETE",
        path: "/api/auth/sessions/{session_id}",
        summary: "Revoke a specific session by ID.",
        auth: "jwt",
        params: "session_id (path)",
      },
      {
        method: "GET",
        path: "/api/auth/sessions/admin/{username}",
        summary: "Admin: list a specific user's sessions.",
        auth: "jwt+admin",
        params: "username (path)",
      },
    ],
  },
  {
    tag: "API Keys",
    description: "Programmatic access keys with prefix iti_xxx.",
    endpoints: [
      {
        method: "POST",
        path: "/api/api-keys/",
        summary: "Create a new API key. The full key is returned only once.",
        auth: "jwt",
        body: '{ "name": "string", "expires_in_days": "number|null" }',
        response: '{ "key": "iti_xxx...", "key_id": "string" }',
      },
      {
        method: "GET",
        path: "/api/api-keys/me",
        summary: "List your API keys (prefix and metadata only).",
        auth: "jwt",
      },
      {
        method: "DELETE",
        path: "/api/api-keys/{key_id}",
        summary: "Revoke an API key.",
        auth: "jwt",
        params: "key_id (path)",
      },
      {
        method: "GET",
        path: "/api/api-keys/admin/{username}",
        summary: "Admin: list a user's API keys.",
        auth: "jwt+admin",
        params: "username (path)",
      },
    ],
  },
  {
    tag: "Analysis",
    description: "IOC analysis across configured intelligence sources.",
    endpoints: [
      {
        method: "GET",
        path: "/api/analyze/status",
        summary: "Check which intelligence services have valid API keys configured.",
        auth: "jwt",
        response: '{ "services": { "virustotal": true, "shodan": false, ... } }',
      },
      {
        method: "GET",
        path: "/api/analyze/analyze",
        summary: "Analyze an IP, domain, or hash across all configured sources.",
        auth: "jwt",
        params: "target, lang (query)",
        response: '{ "verdict": "string", "findings": [...], "scores": {...} }',
      },
    ],
  },
  {
    tag: "Batch",
    description: "Bulk indicator analysis with daily quota.",
    endpoints: [
      {
        method: "POST",
        path: "/api/batch/estimate",
        summary: "Estimate targets count before submitting a batch job.",
        auth: "jwt",
        body: '{ "targets": ["string"] }',
      },
      {
        method: "POST",
        path: "/api/batch/",
        summary: "Submit a batch analysis job (returns 202 Accepted).",
        auth: "jwt",
        body: '{ "targets": ["string"], "lang": "pt|en|es" }',
      },
      {
        method: "GET",
        path: "/api/batch/history",
        summary: "List your batch job history.",
        auth: "jwt",
      },
      {
        method: "GET",
        path: "/api/batch/quota/today",
        summary: "Check your remaining daily batch quota.",
        auth: "jwt",
      },
      {
        method: "GET",
        path: "/api/batch/{job_id}",
        summary: "Get status and results of a specific batch job.",
        auth: "jwt",
        params: "job_id (path)",
      },
      {
        method: "GET",
        path: "/api/batch/{job_id}/stream",
        summary: "SSE stream for real-time batch progress updates.",
        auth: "jwt",
        params: "job_id (path)",
      },
    ],
  },
  {
    tag: "Recon",
    description: "Reconnaissance engine with modular scanning.",
    endpoints: [
      {
        method: "GET",
        path: "/api/recon/modules",
        summary: "List available reconnaissance modules.",
        auth: "jwt",
      },
      {
        method: "POST",
        path: "/api/recon/scan",
        summary: "Start a recon scan (returns 202 Accepted).",
        auth: "jwt",
        body: '{ "target": "string", "modules": ["dns","whois","ssl","ports",...] }',
      },
      {
        method: "GET",
        path: "/api/recon/stream/{job_id}",
        summary: "SSE stream for real-time scan results.",
        auth: "jwt",
        params: "job_id (path)",
      },
      {
        method: "GET",
        path: "/api/recon/history/{target}",
        summary: "View recon history for a specific target.",
        auth: "jwt",
        params: "target (path)",
      },
      {
        method: "GET",
        path: "/api/recon/{job_id}",
        summary: "Get full details of a recon job.",
        auth: "jwt",
        params: "job_id (path)",
      },
      {
        method: "POST",
        path: "/api/recon/scheduled",
        summary: "Create a scheduled recurring scan.",
        auth: "jwt",
        body: '{ "target": "string", "modules": ["string"], "interval": "string" }',
      },
      {
        method: "GET",
        path: "/api/recon/scheduled/mine",
        summary: "List your scheduled scans.",
        auth: "jwt",
      },
      {
        method: "DELETE",
        path: "/api/recon/scheduled/{item_id}",
        summary: "Delete a scheduled scan.",
        auth: "jwt",
        params: "item_id (path)",
      },
    ],
  },
  {
    tag: "Feed",
    description: "Threat intelligence feed with filtering and pagination.",
    endpoints: [
      {
        method: "GET",
        path: "/api/feed/",
        summary: "List threat feed items with optional severity, source_type, and TLP filters.",
        auth: "jwt",
        params: "limit, offset, severity, source_type, tlp (query)",
        response: '{ "items": [...], "total": number }',
      },
    ],
  },
  {
    tag: "Watchlist",
    description: "Priority asset monitoring with notifications.",
    endpoints: [
      {
        method: "GET",
        path: "/api/watchlist/smtp-status",
        summary: "Check if SMTP is configured for watchlist notifications.",
        auth: "jwt",
      },
      {
        method: "GET",
        path: "/api/watchlist/",
        summary: "List all watchlist items.",
        auth: "jwt",
      },
      {
        method: "POST",
        path: "/api/watchlist/",
        summary: "Add an indicator to the watchlist.",
        auth: "jwt",
        body: '{ "target": "string", "type": "ip|domain|hash", "notes": "string" }',
      },
      {
        method: "PATCH",
        path: "/api/watchlist/{item_id}",
        summary: "Update a watchlist item.",
        auth: "jwt",
        params: "item_id (path)",
      },
      {
        method: "DELETE",
        path: "/api/watchlist/{item_id}",
        summary: "Remove an item from the watchlist.",
        auth: "jwt",
        params: "item_id (path)",
      },
    ],
  },
  {
    tag: "Hunting",
    description: "Identity and username hunting through installed extensions.",
    endpoints: [
      {
        method: "GET",
        path: "/api/hunting/providers",
        summary: "List active hunting sources supplied by installed extensions.",
        auth: "jwt+extension",
      },
      {
        method: "POST",
        path: "/api/hunting/search",
        summary: "Execute a hunting search across installed sources.",
        auth: "jwt+extension",
        body: '{ "query": "string", "scope": ["identity","social"] }',
      },
    ],
  },
  {
    tag: "Exposure",
    description: "External attack surface monitoring through installed extensions.",
    endpoints: [
      {
        method: "GET",
        path: "/api/exposure/providers",
        summary: "List active exposure monitoring sources.",
        auth: "jwt+extension",
      },
      {
        method: "GET",
        path: "/api/exposure/assets",
        summary: "List registered exposure assets.",
        auth: "jwt+extension",
      },
      {
        method: "POST",
        path: "/api/exposure/assets",
        summary: "Register a new asset for exposure monitoring.",
        auth: "jwt+extension",
        body: '{ "type": "domain|subdomain|brand_keyword", "value": "string" }',
      },
      {
        method: "POST",
        path: "/api/exposure/assets/{asset_id}/scan",
        summary: "Trigger an exposure scan on a registered asset.",
        auth: "jwt+extension",
        params: "asset_id (path)",
      },
    ],
  },
  {
    tag: "Admin",
    description: "Platform administration: policies, users, extensions, ingestion, audit.",
    endpoints: [
      {
        method: "GET",
        path: "/api/admin/lockout-policy",
        summary: "Read account lockout policy settings.",
        auth: "jwt+admin",
      },
      {
        method: "PUT",
        path: "/api/admin/lockout-policy",
        summary: "Update account lockout policy.",
        auth: "jwt+admin",
      },
      {
        method: "GET",
        path: "/api/admin/password-policy",
        summary: "Read password policy settings.",
        auth: "jwt+admin",
      },
      {
        method: "PUT",
        path: "/api/admin/password-policy",
        summary: "Update password policy.",
        auth: "jwt+admin",
      },
      {
        method: "GET",
        path: "/api/admin/stats",
        summary: "Admin dashboard statistics.",
        auth: "jwt+admin",
      },
      {
        method: "GET",
        path: "/api/admin/extensions",
        summary: "List all installed extensions/plugins.",
        auth: "jwt+admin",
      },
      {
        method: "GET",
        path: "/api/admin/extensions/features",
        summary: "List active feature modules provided by installed extensions.",
        auth: "jwt",
      },
      {
        method: "GET",
        path: "/api/admin/threat-sources",
        summary: "List configured threat feed sources.",
        auth: "jwt+admin",
      },
      {
        method: "POST",
        path: "/api/admin/threat-sources/custom",
        summary: "Add a custom RSS threat source.",
        auth: "jwt+admin",
        body: '{ "name": "string", "url": "string", "family": "string", "interval_minutes": number }',
      },
      {
        method: "GET",
        path: "/api/admin/audit-logs",
        summary: "Query platform-wide audit logs with filters.",
        auth: "jwt+admin",
        params: "user, action, result, date_from, date_to, page, limit (query)",
      },
      {
        method: "GET",
        path: "/api/admin/audit-logs/export",
        summary: "Export audit logs as CSV or JSON.",
        auth: "jwt+admin",
        params: "format (query: csv|json)",
      },
    ],
  },
];

function CurlBlock({ method, path }: { method: string; path: string }) {
  const [copied, setCopied] = useState(false);

  const curl = `curl -X ${method} \\
  '${window.location.origin}${path}' \\
  -H 'Authorization: Bearer <token>' \\
  -H 'Content-Type: application/json'`;

  const handleCopy = () => {
    navigator.clipboard.writeText(curl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative mt-3">
      <pre className="bg-inverse-surface text-on-primary text-[11px] font-mono p-4 rounded-sm overflow-x-auto leading-relaxed">
        {curl}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-sm bg-white/10 hover:bg-white/20 transition-colors"
        title="Copy curl command"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-white/60" />
        )}
      </button>
    </div>
  );
}

export default function ApiReferencePage() {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);

  const filtered = activeTag
    ? groups.filter((g) => g.tag === activeTag)
    : groups;

  const totalEndpoints = groups.reduce(
    (sum, g) => sum + g.endpoints.length,
    0,
  );

  return (
    <div className="mt-6 space-y-6">
      <div className="summary-strip">
        <div className="summary-pill">
          <Zap className="w-3.5 h-3.5 text-primary" />
          {totalEndpoints} endpoints
        </div>
        <div className="summary-pill-muted">{groups.length} groups</div>
        <div className="summary-pill-muted">Base URL: /api</div>
      </div>

      <div className="surface-section">
        <div className="surface-section-header">
          <h3 className="surface-section-title">Authentication</h3>
        </div>
        <div className="p-6 space-y-3 text-sm text-on-surface-variant">
          <p>
            Most endpoints require a valid JWT access token. Include it as a{" "}
            <code className="bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface font-mono text-xs">
              Bearer
            </code>{" "}
            token in the Authorization header or rely on the HttpOnly session
            cookie set after login.
          </p>
          <p>
            API keys (prefix{" "}
            <code className="bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface font-mono text-xs">
              iti_
            </code>
            ) are accepted as Bearer tokens for programmatic access.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setActiveTag(null)}
          className={cn(
            "nav-pill-item",
            !activeTag ? "nav-pill-item-active" : "nav-pill-item-inactive",
          )}
        >
          All
        </button>
        {groups.map((g) => (
          <button
            key={g.tag}
            onClick={() => setActiveTag(activeTag === g.tag ? null : g.tag)}
            className={cn(
              "nav-pill-item",
              activeTag === g.tag
                ? "nav-pill-item-active"
                : "nav-pill-item-inactive",
            )}
          >
            {g.tag}
          </button>
        ))}
      </div>

      {filtered.map((group) => (
        <div key={group.tag} className="surface-section">
          <div className="surface-section-header">
            <div>
              <h3 className="surface-section-title">{group.tag}</h3>
              <p className="text-xs text-on-surface-variant mt-1">
                {group.description}
              </p>
            </div>
            <span className="badge badge-neutral">
              {group.endpoints.length}
            </span>
          </div>
          <div className="divide-y divide-surface-container">
            {group.endpoints.map((ep) => {
              const key = `${ep.method}-${ep.path}`;
              const isExpanded = expandedEndpoint === key;
              const authMeta = AUTH_LABELS[ep.auth];

              return (
                <div key={key}>
                  <button
                    onClick={() =>
                      setExpandedEndpoint(isExpanded ? null : key)
                    }
                    className="w-full px-6 py-4 flex items-center gap-4 hover:bg-surface-container-low transition-colors text-left"
                  >
                    <span
                      className={cn(
                        "badge min-w-[4rem] text-center",
                        METHOD_STYLE[ep.method],
                      )}
                    >
                      {ep.method}
                    </span>
                    <code className="text-sm font-mono font-medium text-on-surface flex-1">
                      {ep.path}
                    </code>
                    <div className="flex items-center gap-2">
                      <authMeta.icon className="w-3.5 h-3.5 text-on-surface-variant" />
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider hidden sm:inline">
                        {authMeta.label}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-6 pb-5 space-y-3 bg-surface-container-low/50">
                      <p className="text-sm text-on-surface-variant">
                        {ep.summary}
                      </p>

                      {ep.params && (
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                            Parameters
                          </span>
                          <code className="block mt-1 text-xs font-mono text-on-surface bg-surface-container-high px-3 py-2 rounded-sm">
                            {ep.params}
                          </code>
                        </div>
                      )}

                      {ep.body && (
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                            Request Body
                          </span>
                          <pre className="mt-1 text-xs font-mono text-on-surface bg-surface-container-high px-3 py-2 rounded-sm overflow-x-auto">
                            {ep.body}
                          </pre>
                        </div>
                      )}

                      {ep.response && (
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                            Response (200)
                          </span>
                          <pre className="mt-1 text-xs font-mono text-on-surface bg-surface-container-high px-3 py-2 rounded-sm overflow-x-auto">
                            {ep.response}
                          </pre>
                        </div>
                      )}

                      <CurlBlock method={ep.method} path={ep.path} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

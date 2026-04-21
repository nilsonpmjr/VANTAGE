import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCw, Eye, PlayCircle, Plus, Trash2, Power, Loader2, DownloadCloud } from "lucide-react";
import API_URL from "../config";
import { PageHeader, PageToolbar, PageToolbarGroup } from "../components/page/PageChrome";
import ModalShell from "../components/modal/ModalShell";
import { useLanguage } from "../context/LanguageContext";

type AuthType = "header" | "query_param" | "bearer";

type Platform = {
  service_id: string;
  display_name: string;
  env_var: string;
  base_url: string;
  auth_type: AuthType;
  auth_key_name: string;
  rate_limit_calls: number;
  rate_limit_window_seconds: number;
  health_check_path: string;
  built_in: boolean;
  disabled: boolean;
  configured: boolean;
  masked_value: string;
  updated_at?: string | null;
  updated_by?: string | null;
};

type PlatformListResponse = { platforms: Platform[] };

type TestResult = {
  service_id: string;
  status_code: number | null;
  latency_ms: number | null;
  body_preview: string;
  error: string | null;
};

const BASE = `${API_URL}/api/admin/platform-credentials`;

function formatTimestamp(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(date);
}

function statusBadgeClass(p: Platform) {
  if (p.disabled) return "bg-neutral/10 text-on-surface-variant";
  if (p.configured) return "bg-emerald-500/10 text-emerald-700";
  return "bg-amber-500/10 text-amber-700";
}

type RotateState = { platform: Platform; value: string };
type RevealState = { platform: Platform; value: string | null; loading: boolean };

const emptyRegistration = {
  service_id: "",
  display_name: "",
  env_var: "",
  base_url: "",
  auth_type: "header" as AuthType,
  auth_key_name: "",
  rate_limit_calls: 10,
  rate_limit_window_seconds: 60,
  health_check_path: "/",
};

export default function ApiCredentials() {
  const { t, locale } = useLanguage();
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [rotate, setRotate] = useState<RotateState | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [register, setRegister] = useState<typeof emptyRegistration | null>(null);
  const [registerError, setRegisterError] = useState("");
  const [syncing, setSyncing] = useState(false);

  const loadPlatforms = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(BASE, { credentials: "include" });
      if (res.status === 403) {
        setError(t("settingsPages.apiCredentials.errorForbidden", "You do not have permission to manage credentials."));
        setPlatforms([]);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as PlatformListResponse;
      setPlatforms(data.platforms || []);
    } catch {
      setError(t("settingsPages.apiCredentials.errorGeneric", "Could not complete the action."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPlatforms();
  }, [loadPlatforms]);

  function flash(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 4000);
  }

  async function saveRotation() {
    if (!rotate) return;
    setBusyId(rotate.platform.service_id);
    setError("");
    try {
      const res = await fetch(`${BASE}/${rotate.platform.service_id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: rotate.value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      flash(
        rotate.value.trim()
          ? t("settingsPages.apiCredentials.noticeRotated", "Credential rotated.")
          : t("settingsPages.apiCredentials.noticeCleared", "Credential cleared."),
      );
      setRotate(null);
      await loadPlatforms();
    } catch {
      setError(t("settingsPages.apiCredentials.errorGeneric", "Could not complete the action."));
    } finally {
      setBusyId(null);
    }
  }

  async function openReveal(platform: Platform) {
    setReveal({ platform, value: null, loading: true });
    try {
      const res = await fetch(`${BASE}/${platform.service_id}/reveal`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (res.status === 429) {
        setError(t("settingsPages.apiCredentials.errorRateLimited", "Too many reveals. Try again later."));
        setReveal(null);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { value: string };
      setReveal({ platform, value: data.value, loading: false });
    } catch {
      setError(t("settingsPages.apiCredentials.errorGeneric", "Could not complete the action."));
      setReveal(null);
    }
  }

  async function runTest(platform: Platform) {
    setTesting(platform.service_id);
    setTestResult(null);
    try {
      const res = await fetch(`${BASE}/${platform.service_id}/test`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      setTestResult((await res.json()) as TestResult);
      await loadPlatforms();
    } catch {
      setError(t("settingsPages.apiCredentials.errorGeneric", "Could not complete the action."));
    } finally {
      setTesting(null);
    }
  }

  async function toggleDisabled(platform: Platform) {
    setBusyId(platform.service_id);
    setError("");
    try {
      const res = await fetch(`${BASE}/${platform.service_id}/disabled`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !platform.disabled }),
      });
      if (!res.ok) throw new Error(String(res.status));
      flash(
        platform.disabled
          ? t("settingsPages.apiCredentials.noticeEnabled", "Platform enabled.")
          : t("settingsPages.apiCredentials.noticeDisabled", "Platform disabled."),
      );
      await loadPlatforms();
    } catch {
      setError(t("settingsPages.apiCredentials.errorGeneric", "Could not complete the action."));
    } finally {
      setBusyId(null);
    }
  }

  async function deletePlatform(platform: Platform) {
    if (platform.built_in) {
      setError(t("settingsPages.apiCredentials.errorBuiltinDelete", "Built-in platforms cannot be deleted."));
      return;
    }
    if (!window.confirm(t("settingsPages.apiCredentials.deleteConfirm", "Delete this platform?"))) return;
    setBusyId(platform.service_id);
    setError("");
    try {
      const res = await fetch(`${BASE}/${platform.service_id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        if (payload.detail === "builtin_cannot_delete") {
          setError(t("settingsPages.apiCredentials.errorBuiltinDelete", "Built-in platforms cannot be deleted."));
          return;
        }
        throw new Error(String(res.status));
      }
      flash(t("settingsPages.apiCredentials.noticeDeleted", "Platform removed."));
      await loadPlatforms();
    } catch {
      setError(t("settingsPages.apiCredentials.errorGeneric", "Could not complete the action."));
    } finally {
      setBusyId(null);
    }
  }

  async function syncFromEnv() {
    setSyncing(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/sync-env`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(String(res.status));
      flash(t("settingsPages.apiCredentials.noticeSynced", "Credentials synced from .env."));
      await loadPlatforms();
    } catch {
      setError(t("settingsPages.apiCredentials.errorGeneric", "Could not complete the action."));
    } finally {
      setSyncing(false);
    }
  }

  async function submitRegister() {
    if (!register) return;
    setRegisterError("");
    try {
      const res = await fetch(BASE, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(register),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setRegisterError(String(payload.detail || res.status));
        return;
      }
      flash(t("settingsPages.apiCredentials.noticeRegistered", "Platform registered."));
      setRegister(null);
      await loadPlatforms();
    } catch {
      setRegisterError(t("settingsPages.apiCredentials.errorGeneric", "Could not complete the action."));
    }
  }

  const rows = useMemo(
    () =>
      [...platforms].sort((a, b) => {
        if (a.built_in !== b.built_in) return a.built_in ? -1 : 1;
        return a.display_name.localeCompare(b.display_name);
      }),
    [platforms],
  );

  return (
    <div className="page-frame space-y-8">
      <PageHeader
        title={t("settingsPages.apiCredentials.title", "Platform Credentials")}
        description={t(
          "settingsPages.apiCredentials.subtitle",
          "Manage global API keys shared across operators.",
        )}
      />

      <PageToolbar label={t("settingsPages.apiCredentials.title", "Platform Credentials")}>
        <PageToolbarGroup className="ml-auto">
          <button
            onClick={() => void syncFromEnv()}
            className="btn btn-outline"
            disabled={syncing}
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
            {t("settingsPages.apiCredentials.syncEnv", "Sync from .env")}
          </button>
          <button
            onClick={() => void loadPlatforms()}
            className="btn btn-outline"
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            {t("settingsPages.apiCredentials.refresh", "Refresh")}
          </button>
          <button
            onClick={() => setRegister({ ...emptyRegistration })}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" />
            {t("settingsPages.apiCredentials.addPlatform", "Add platform")}
          </button>
        </PageToolbarGroup>
      </PageToolbar>

      {(error || notice) && (
        <div className="space-y-3">
          {error && <div className="rounded-sm bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
          {notice && <div className="rounded-sm bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div>}
        </div>
      )}

      <section className="rounded-sm border border-outline-variant/10 bg-surface-container-lowest shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-high text-[11px] uppercase tracking-wider text-on-surface-variant">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">{t("settingsPages.apiCredentials.columnService", "Service")}</th>
                <th className="px-5 py-3 text-left font-semibold">{t("settingsPages.apiCredentials.columnStatus", "Status")}</th>
                <th className="px-5 py-3 text-left font-semibold">{t("settingsPages.apiCredentials.columnValue", "Value")}</th>
                <th className="px-5 py-3 text-left font-semibold">{t("settingsPages.apiCredentials.columnLastRotated", "Last rotated")}</th>
                <th className="px-5 py-3 text-right font-semibold">{t("settingsPages.apiCredentials.columnActions", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-on-surface-variant">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-on-surface-variant">
                    {t("settingsPages.apiCredentials.errorGeneric", "Could not complete the action.")}
                  </td>
                </tr>
              )}
              {rows.map((p) => (
                <tr
                  key={p.service_id}
                  className="border-t border-outline-variant/10 hover:bg-surface-container-low/50"
                >
                  <td className="px-5 py-4 align-top">
                    <div className="flex items-center gap-3">
                      <KeyRound className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-on-surface">{p.display_name}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-sm font-semibold uppercase tracking-wider ${
                              p.built_in
                                ? "bg-primary/10 text-primary"
                                : "bg-tertiary/10 text-tertiary"
                            }`}
                          >
                            {p.built_in
                              ? t("settingsPages.apiCredentials.badgeBuiltIn", "Built-in")
                              : t("settingsPages.apiCredentials.badgeCustom", "Custom")}
                          </span>
                        </div>
                        <div className="text-xs text-on-surface-variant mt-0.5 font-mono">{p.env_var}</div>
                        <div className="text-xs text-on-surface-variant truncate">{p.base_url}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-sm ${statusBadgeClass(p)}`}>
                      {p.disabled
                        ? t("settingsPages.apiCredentials.statusDisabled", "Disabled")
                        : p.configured
                          ? t("settingsPages.apiCredentials.statusConfigured", "Configured")
                          : t("settingsPages.apiCredentials.statusMissing", "Not configured")}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-top font-mono text-xs text-on-surface-variant">
                    {p.masked_value || "—"}
                  </td>
                  <td className="px-5 py-4 align-top text-xs text-on-surface-variant">
                    <div>{formatTimestamp(p.updated_at, locale)}</div>
                    {p.updated_by && <div className="text-on-surface-variant/70">{p.updated_by}</div>}
                  </td>
                  <td className="px-5 py-4 align-top">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setRotate({ platform: p, value: "" })}
                        disabled={busyId === p.service_id}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {t("settingsPages.apiCredentials.actionRotate", "Rotate")}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => void openReveal(p)}
                        disabled={!p.configured}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t("settingsPages.apiCredentials.actionReveal", "Reveal")}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => void runTest(p)}
                        disabled={testing === p.service_id}
                      >
                        {testing === p.service_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <PlayCircle className="h-3.5 w-3.5" />
                        )}
                        {t("settingsPages.apiCredentials.actionTest", "Test")}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => void toggleDisabled(p)}
                        disabled={busyId === p.service_id}
                      >
                        <Power className="h-3.5 w-3.5" />
                        {p.disabled
                          ? t("settingsPages.apiCredentials.actionEnable", "Enable")
                          : t("settingsPages.apiCredentials.actionDisable", "Disable")}
                      </button>
                      {!p.built_in && (
                        <button
                          className="btn btn-ghost btn-sm text-error"
                          onClick={() => void deletePlatform(p)}
                          disabled={busyId === p.service_id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("settingsPages.apiCredentials.actionDelete", "Delete")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {testResult && (
        <section className="rounded-sm border border-outline-variant/10 bg-surface-container-lowest p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-on-surface">
                {t("settingsPages.apiCredentials.testTitle", "Connectivity test")} — {testResult.service_id}
              </h3>
              <p className="mt-1 text-sm text-on-surface-variant">
                {testResult.error
                  ? t("settingsPages.apiCredentials.testStatusFail", "Failed: {error}").replace("{error}", testResult.error)
                  : t("settingsPages.apiCredentials.testStatusOk", "HTTP {status} in {ms} ms")
                      .replace("{status}", String(testResult.status_code ?? "?"))
                      .replace("{ms}", String(testResult.latency_ms ?? "?"))}
              </p>
              {testResult.body_preview && (
                <pre className="mt-3 max-h-40 overflow-y-auto rounded-sm bg-surface-container-high p-3 text-xs text-on-surface-variant">
                  {testResult.body_preview}
                </pre>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setTestResult(null)}>
              ✕
            </button>
          </div>
        </section>
      )}

      {rotate && (
        <ModalShell
          title={t("settingsPages.apiCredentials.rotateTitle", "Rotate credential")}
          description={`${rotate.platform.display_name} • ${rotate.platform.env_var}`}
          onClose={() => setRotate(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setRotate(null)}>
                {t("common.cancel", "Cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void saveRotation()}
                disabled={busyId === rotate.platform.service_id}
              >
                {t("settingsPages.apiCredentials.rotateSave", "Save")}
              </button>
            </>
          }
        >
          <p className="text-sm text-on-surface-variant mb-4">
            {t(
              "settingsPages.apiCredentials.rotateIntro",
              "The new key replaces the current value immediately.",
            )}
          </p>
          <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
            {t("settingsPages.apiCredentials.rotateLabel", "New key")}
          </label>
          <input
            type="password"
            autoFocus
            className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm font-mono text-on-surface focus:outline-none focus:border-primary"
            value={rotate.value}
            onChange={(e) => setRotate({ ...rotate, value: e.target.value })}
            placeholder="••••••••"
          />
          <p className="mt-3 text-xs text-on-surface-variant">
            {t(
              "settingsPages.apiCredentials.clearConfirm",
              "Leave empty to clear the stored value.",
            )}
          </p>
        </ModalShell>
      )}

      {reveal && (
        <ModalShell
          title={t("settingsPages.apiCredentials.revealTitle", "Reveal credential")}
          description={`${reveal.platform.display_name} • ${reveal.platform.env_var}`}
          onClose={() => setReveal(null)}
          footer={
            <button className="btn btn-primary" onClick={() => setReveal(null)}>
              {t("common.close", "Close")}
            </button>
          }
        >
          <p className="text-sm text-on-surface-variant mb-4">
            {t(
              "settingsPages.apiCredentials.revealWarning",
              "The value is shown in plaintext and the action is audited.",
            )}
          </p>
          {reveal.loading ? (
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" /> …
            </div>
          ) : (
            <pre className="rounded-sm bg-surface-container-high p-4 text-sm font-mono text-on-surface break-all whitespace-pre-wrap">
              {reveal.value}
            </pre>
          )}
        </ModalShell>
      )}

      {register && (
        <ModalShell
          title={t("settingsPages.apiCredentials.registerTitle", "Register platform")}
          description={t(
            "settingsPages.apiCredentials.registerIntro",
            "Define minimal metadata for a new API.",
          )}
          variant="editor"
          onClose={() => setRegister(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setRegister(null)}>
                {t("common.cancel", "Cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => void submitRegister()}>
                {t("settingsPages.apiCredentials.register", "Register")}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label={t("settingsPages.apiCredentials.fieldServiceId", "Service id")}
              helper={t("settingsPages.apiCredentials.fieldServiceIdHelper", "Lowercase slug.")}
              value={register.service_id}
              onChange={(v) => setRegister({ ...register, service_id: v })}
            />
            <TextField
              label={t("settingsPages.apiCredentials.fieldDisplayName", "Display name")}
              value={register.display_name}
              onChange={(v) => setRegister({ ...register, display_name: v })}
            />
            <TextField
              label={t("settingsPages.apiCredentials.fieldEnvVar", "Env var")}
              helper={t("settingsPages.apiCredentials.fieldEnvVarHelper", "e.g. CENSYS_API_KEY")}
              value={register.env_var}
              onChange={(v) => setRegister({ ...register, env_var: v.toUpperCase() })}
            />
            <TextField
              label={t("settingsPages.apiCredentials.fieldBaseUrl", "Base URL")}
              value={register.base_url}
              onChange={(v) => setRegister({ ...register, base_url: v })}
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
                {t("settingsPages.apiCredentials.fieldAuthType", "Auth type")}
              </label>
              <select
                className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                value={register.auth_type}
                onChange={(e) =>
                  setRegister({ ...register, auth_type: e.target.value as AuthType })
                }
              >
                <option value="header">{t("settingsPages.apiCredentials.authHeader", "Header")}</option>
                <option value="query_param">{t("settingsPages.apiCredentials.authQueryParam", "Query param")}</option>
                <option value="bearer">{t("settingsPages.apiCredentials.authBearer", "Bearer")}</option>
              </select>
            </div>
            <TextField
              label={t("settingsPages.apiCredentials.fieldAuthKeyName", "Header/param name")}
              value={register.auth_key_name}
              onChange={(v) => setRegister({ ...register, auth_key_name: v })}
            />
            <NumberField
              label={t("settingsPages.apiCredentials.fieldRateLimitCalls", "Rate limit calls")}
              value={register.rate_limit_calls}
              onChange={(v) => setRegister({ ...register, rate_limit_calls: v })}
            />
            <NumberField
              label={t("settingsPages.apiCredentials.fieldRateLimitWindow", "Window (s)")}
              value={register.rate_limit_window_seconds}
              onChange={(v) => setRegister({ ...register, rate_limit_window_seconds: v })}
            />
            <TextField
              label={t("settingsPages.apiCredentials.fieldHealthCheckPath", "Health-check path")}
              value={register.health_check_path}
              onChange={(v) => setRegister({ ...register, health_check_path: v })}
            />
          </div>
          {registerError && (
            <div className="mt-4 rounded-sm bg-error/10 px-3 py-2 text-sm text-error">{registerError}</div>
          )}
        </ModalShell>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
      />
      {helper && <p className="mt-1 text-xs text-on-surface-variant">{helper}</p>}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
        {label}
      </label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 1)}
        className="w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
      />
    </div>
  );
}

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Crosshair, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import API_URL from "../../config";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import useBrandTheme from "../../branding/useBrandTheme";
import {
  DEFAULT_WORKSPACE,
  LAST_WORKSPACE_STORAGE_KEY,
  MFA_WORKSPACE_STORAGE_KEY,
  OFFENSIVE_WORKSPACE,
  isWorkspaceId,
  workspaceForPath,
  workspaceHome,
  type WorkspaceId,
} from "../../lib/workspaces";

function formatLockedUntil(value: string | null | undefined, locale: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale);
}

function LoginPanel() {
  const { login } = useAuth();
  const { brand, logoPath } = useBrandTheme();
  const { t, locale } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const socButtonRef = useRef<HTMLButtonElement>(null);
  const offensiveButtonRef = useRef<HTMLButtonElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceId>(() => {
    const fromPath = workspaceForPath(location.pathname);
    if (fromPath) return fromPath;
    const pending = window.sessionStorage.getItem(MFA_WORKSPACE_STORAGE_KEY);
    if (isWorkspaceId(pending)) return pending;
    const stored = window.localStorage.getItem(LAST_WORKSPACE_STORAGE_KEY);
    return isWorkspaceId(stored) ? stored : DEFAULT_WORKSPACE;
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hideLogo, setHideLogo] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const result = await login(username, password, workspace);
      if (result.authenticated) {
        navigate(workspaceHome(result.workspace), { replace: true });
      }
    } catch (err) {
      const locked = err as Error & { code?: string; locked_until?: string | null };
      if (locked.code === "account_locked") {
        const time = formatLockedUntil(locked.locked_until, locale) || t("auth.errors.lockoutFallback");
        setError(t("auth.errors.accountLocked").replace("{time}", time));
      } else {
        setError(t("auth.errors.invalidCredentials"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectWorkspace = (nextWorkspace: WorkspaceId, moveFocus = false) => {
    setWorkspace(nextWorkspace);
    if (moveFocus) {
      const ref = nextWorkspace === OFFENSIVE_WORKSPACE ? offensiveButtonRef : socButtonRef;
      window.requestAnimationFrame(() => ref.current?.focus());
    }
  };

  const handleWorkspaceKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft" || event.key === "Home") {
      event.preventDefault();
      selectWorkspace(DEFAULT_WORKSPACE, true);
    } else if (event.key === "ArrowRight" || event.key === "End") {
      event.preventDefault();
      selectWorkspace(OFFENSIVE_WORKSPACE, true);
    }
  };

  const isOffensive = workspace === OFFENSIVE_WORKSPACE;

  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center px-6"
      data-workspace={isOffensive ? "redmode" : undefined}
    >
      <div className="w-full max-w-md bg-surface-container-lowest rounded-sm shadow-sm overflow-hidden">
        <div className="bg-surface-container-high px-6 py-4 border-b border-outline-variant/15">
          <div className="flex min-h-12 items-center">
            {!hideLogo ? (
              <img
                src={logoPath}
                alt={brand.name}
                className="h-9 w-auto max-w-[240px] object-contain"
                onError={() => setHideLogo(true)}
              />
            ) : (
              <div>
                <h1 className="text-sm font-black uppercase tracking-widest text-on-surface">{brand.name}</h1>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                  {brand.tagline}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-7 py-8 space-y-6">
          <div
            role="radiogroup"
            aria-label={t("auth.login.workspaceLabel")}
            className="grid grid-cols-2 gap-1 rounded-sm border border-outline-variant/30 bg-surface-container-low p-1"
          >
            <button
              ref={socButtonRef}
              type="button"
              role="radio"
              aria-checked={!isOffensive}
              tabIndex={!isOffensive ? 0 : -1}
              onClick={() => selectWorkspace(DEFAULT_WORKSPACE)}
              onKeyDown={handleWorkspaceKeyDown}
              className={`flex min-h-16 items-center gap-3 rounded-sm px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low ${
                !isOffensive
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <ShieldCheck className="h-5 w-5 shrink-0" />
              <span>
                <span className="block text-xs font-black uppercase tracking-[0.16em]">SOC</span>
                <span className="mt-0.5 block text-[9px] font-semibold leading-tight opacity-80">
                  Security Operations Center
                </span>
              </span>
            </button>
            <button
              ref={offensiveButtonRef}
              type="button"
              role="radio"
              aria-checked={isOffensive}
              tabIndex={isOffensive ? 0 : -1}
              onClick={() => selectWorkspace(OFFENSIVE_WORKSPACE)}
              onKeyDown={handleWorkspaceKeyDown}
              className={`flex min-h-16 items-center gap-3 rounded-sm px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low ${
                isOffensive
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <Crosshair className="h-5 w-5 shrink-0" />
              <span>
                <span className="block text-xs font-black uppercase tracking-[0.16em]">Red Team</span>
                <span className="mt-0.5 block text-[9px] font-semibold leading-tight opacity-80">
                  Offensive Mode
                </span>
              </span>
            </button>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight text-on-surface">
              {t(isOffensive ? "auth.login.offensiveTitle" : "auth.login.title")}
            </h2>
            <p className="text-sm text-on-surface-variant">
              {t(isOffensive ? "auth.login.offensiveSubtitle" : "auth.login.subtitle")}
            </p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-sm bg-error/8 text-error text-sm border border-error/20">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                {t("auth.login.username")}
              </span>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full h-12 px-4 bg-surface-container-low border-b-2 border-outline-variant/40 outline-none focus:border-primary text-on-surface"
                placeholder="admin"
                required
              />
            </label>

            <label className="block space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                {t("auth.login.password")}
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full h-12 px-4 bg-surface-container-low border-b-2 border-outline-variant/40 outline-none focus:border-primary text-on-surface"
                placeholder="••••••••"
                required
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 bg-gradient-to-r from-primary to-primary-dim text-on-primary text-sm font-black uppercase tracking-[0.2em] rounded-sm shadow-sm disabled:opacity-60"
            >
              {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function MfaPanel() {
  const { completeMfaLogin, cancelMfa, pendingWorkspace } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (otp.trim().length < 6) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/mfa/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otp.trim() }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "invalid_otp");
      }

      const data = await response.json();
      const effectiveWorkspace = isWorkspaceId(data.workspace) ? data.workspace : DEFAULT_WORKSPACE;
      completeMfaLogin(data.user, effectiveWorkspace, data.workspace_notice);
      navigate(workspaceHome(effectiveWorkspace), { replace: true });
    } catch {
      setError(t("auth.errors.invalidOtp"));
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center px-6"
      data-workspace={pendingWorkspace === OFFENSIVE_WORKSPACE ? "redmode" : undefined}
    >
      <div className="w-full max-w-md bg-surface-container-lowest rounded-sm shadow-sm overflow-hidden">
        <div className="bg-surface-container-high px-6 py-4 border-b border-outline-variant/15 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-on-surface">{t("auth.mfa.title")}</h2>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
              {t("auth.mfa.subtitle")}
            </p>
          </div>
        </div>

        <div className="px-7 py-8 space-y-5">
          <div className="inline-flex items-center gap-2 rounded-sm border border-primary/20 bg-primary/8 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
            {pendingWorkspace === OFFENSIVE_WORKSPACE ? <Crosshair className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {pendingWorkspace === OFFENSIVE_WORKSPACE ? "Red Team / Offensive Mode" : "Security Operations Center"}
          </div>
          <p className="text-sm text-on-surface-variant">{t("auth.mfa.instructions")}</p>

          {error && (
            <div className="px-4 py-3 rounded-sm bg-error/8 text-error text-sm border border-error/20">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                {t("auth.mfa.otp")}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full h-12 px-4 bg-surface-container-low border-b-2 border-outline-variant/40 outline-none focus:border-primary text-on-surface tracking-[0.4em] text-center text-lg"
                placeholder="000000"
                required
              />
            </label>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={cancelMfa}
                className="flex-1 h-11 bg-surface-container-low text-on-surface text-xs font-black uppercase tracking-[0.18em] rounded-sm"
              >
                {t("auth.mfa.back")}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-11 bg-gradient-to-r from-primary to-primary-dim text-on-primary text-xs font-black uppercase tracking-[0.18em] rounded-sm shadow-sm disabled:opacity-60"
              >
                {loading ? t("auth.mfa.confirming") : t("auth.mfa.confirm")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginGate() {
  const { mfaPending } = useAuth();
  return mfaPending ? <MfaPanel /> : <LoginPanel />;
}

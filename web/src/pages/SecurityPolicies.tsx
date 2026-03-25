import { useEffect, useMemo, useState } from "react";
import { Key, Lock, AlertTriangle, History } from "lucide-react";
import API_URL from "../config";

type PasswordPolicy = {
  min_length: number;
  require_uppercase: boolean;
  require_numbers: boolean;
  require_symbols: boolean;
  history_count: number;
  expiry_days: number;
  expiry_warning_days: number;
  mask_pii: boolean;
  prevent_common_passwords: boolean;
  prevent_breached_passwords: boolean;
};

type LockoutPolicy = {
  max_attempts: number;
  lockout_minutes: number;
};

type AuditItem = {
  timestamp: string;
  user: string;
  action: string;
  target?: string;
  result?: string;
  ip?: string;
  detail?: string;
};

type AuditPayload = {
  items: AuditItem[];
  total: number;
  page: number;
  pages: number;
};

function formatTimestamp(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function SecurityPolicies() {
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy | null>(null);
  const [lockoutPolicy, setLockoutPolicy] = useState<LockoutPolicy | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadPolicies() {
    setLoading(true);
    setError("");
    try {
      const [passwordRes, lockoutRes, auditRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/password-policy`, { credentials: "include" }),
        fetch(`${API_URL}/api/admin/lockout-policy`, { credentials: "include" }),
        fetch(`${API_URL}/api/admin/security-policies/timeline?page=1&page_size=20`, { credentials: "include" }),
      ]);

      if (!passwordRes.ok || !lockoutRes.ok || !auditRes.ok) {
        throw new Error("policy_load_failed");
      }

      const [passwordData, lockoutData, auditData] = await Promise.all([
        passwordRes.json(),
        lockoutRes.json(),
        auditRes.json(),
      ]);

      setPasswordPolicy(passwordData as PasswordPolicy);
      setLockoutPolicy(lockoutData as LockoutPolicy);
      setAuditTrail(
        (auditData as AuditPayload).items || [],
      );
    } catch {
      setError("Não foi possível carregar as políticas de segurança.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPolicies();
  }, []);

  const lastPolicyEvent = useMemo(() => auditTrail[0] || null, [auditTrail]);

  async function savePolicies() {
    if (!passwordPolicy || !lockoutPolicy) return;
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const [passwordRes, lockoutRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/password-policy`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            min_length: Number(passwordPolicy.min_length),
            require_uppercase: Boolean(passwordPolicy.require_uppercase),
            require_numbers: Boolean(passwordPolicy.require_numbers),
            require_symbols: Boolean(passwordPolicy.require_symbols),
            history_count: Number(passwordPolicy.history_count),
            expiry_days: Number(passwordPolicy.expiry_days),
            expiry_warning_days: Number(passwordPolicy.expiry_warning_days),
            mask_pii: Boolean(passwordPolicy.mask_pii),
            prevent_common_passwords: Boolean(passwordPolicy.prevent_common_passwords),
            prevent_breached_passwords: Boolean(passwordPolicy.prevent_breached_passwords),
          }),
        }),
        fetch(`${API_URL}/api/admin/lockout-policy`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            max_attempts: Number(lockoutPolicy.max_attempts),
            lockout_minutes: Number(lockoutPolicy.lockout_minutes),
          }),
        }),
      ]);

      if (!passwordRes.ok || !lockoutRes.ok) {
        throw new Error("policy_save_failed");
      }

      setNotice("Políticas salvas com sucesso.");
      await loadPolicies();
    } catch {
      setError("Falha ao persistir as políticas de segurança.");
    } finally {
      setSaving(false);
    }
  }

  function exportPolicies() {
    window.open(`${API_URL}/api/admin/security-policies/export?format=json`, "_blank", "noopener");
  }

  if (!passwordPolicy || !lockoutPolicy) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-4">
        {error && <div className="rounded-sm bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
        <div className="rounded-sm bg-surface-container-lowest px-6 py-8 text-sm text-on-surface-variant shadow-sm">
          {loading ? "Carregando políticas..." : "As políticas não estão disponíveis no momento."}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-eyebrow">Administration</div>
          <h1 className="page-heading">Security Policies</h1>
          <p className="page-subheading">
            Defina padrões globais de senha, mascaramento de PII e mecanismos
            preventivos de lockout sem perder rastreabilidade administrativa.
          </p>
        </div>
      </div>

      <div className="page-toolbar">
        <div className="page-toolbar-copy">Policy actions</div>
        <div className="page-toolbar-actions">
          <button
            onClick={exportPolicies}
            className="btn btn-outline"
          >
            Export JSON
          </button>
          <button
            onClick={() => void savePolicies()}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? "Saving..." : "Save Policies"}
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className="space-y-3">
          {error && <div className="rounded-sm bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
          {notice && <div className="rounded-sm bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <section className="lg:col-span-7 bg-surface-container-lowest shadow-sm rounded-sm overflow-hidden border border-outline-variant/10">
          <div className="bg-surface-container-high px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Key className="w-4 h-4 text-primary" />
              <h2 className="text-xs uppercase font-bold tracking-widest text-on-surface-variant">
                Password Enforcement Policy
              </h2>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-700 rounded-sm">
              ACTIVE ENFORCEMENT
            </span>
          </div>
          <div className="p-8 space-y-8">
            <div className="grid grid-cols-2 gap-x-12 gap-y-8">
              <NumberField
                label="Minimum Password Length"
                suffix="Characters"
                value={passwordPolicy.min_length}
                onChange={(value) => setPasswordPolicy((current) => current ? { ...current, min_length: value } : current)}
              />
              <NumberField
                label="Password History (Reuse)"
                suffix="Versions"
                value={passwordPolicy.history_count}
                onChange={(value) => setPasswordPolicy((current) => current ? { ...current, history_count: value } : current)}
              />
              <NumberField
                label="Password Expiration"
                suffix="Days"
                value={passwordPolicy.expiry_days}
                onChange={(value) => setPasswordPolicy((current) => current ? { ...current, expiry_days: value } : current)}
              />
              <NumberField
                label="Expiry Warning"
                suffix="Days"
                value={passwordPolicy.expiry_warning_days}
                onChange={(value) => setPasswordPolicy((current) => current ? { ...current, expiry_warning_days: value } : current)}
              />
            </div>

            <div className="pt-6 border-t border-surface-container-high space-y-6">
              <h3 className="text-[10px] uppercase font-bold tracking-[0.2em] text-on-surface-variant mb-4 opacity-50">
                Complexity Requirements
              </h3>
              <div className="space-y-4">
                <ToggleRow
                  title="Require Uppercase Characters (A-Z)"
                  description="Standard cryptographic entropy requirement"
                  enabled={passwordPolicy.require_uppercase}
                  onToggle={() =>
                    setPasswordPolicy((current) =>
                      current ? { ...current, require_uppercase: !current.require_uppercase } : current,
                    )
                  }
                />
                <ToggleRow
                  title="Require Numeric Values (0-9)"
                  description="Mandate at least one numeric digit"
                  enabled={passwordPolicy.require_numbers}
                  onToggle={() =>
                    setPasswordPolicy((current) =>
                      current ? { ...current, require_numbers: !current.require_numbers } : current,
                    )
                  }
                />
                <ToggleRow
                  title="Require Special Characters (!@#)"
                  description="Symbols required for high-security environments"
                  enabled={passwordPolicy.require_symbols}
                  onToggle={() =>
                    setPasswordPolicy((current) =>
                      current ? { ...current, require_symbols: !current.require_symbols } : current,
                    )
                  }
                />
                <ToggleRow
                  title="Mask PII in Audit Logs"
                  description="Hide email targets and sensitive fragments in admin exports"
                  enabled={passwordPolicy.mask_pii}
                  onToggle={() =>
                    setPasswordPolicy((current) =>
                      current ? { ...current, mask_pii: !current.mask_pii } : current,
                    )
                  }
                />
                <ToggleRow
                  title="Prevent Common Dictionary Words"
                  description="Block a bundled denylist of predictable passwords"
                  enabled={passwordPolicy.prevent_common_passwords}
                  onToggle={() =>
                    setPasswordPolicy((current) =>
                      current
                        ? {
                            ...current,
                            prevent_common_passwords: !current.prevent_common_passwords,
                          }
                        : current,
                    )
                  }
                />
                <ToggleRow
                  title="Block Known Breached Passwords"
                  description="Use the local breached-password denylist before rollout"
                  enabled={passwordPolicy.prevent_breached_passwords}
                  onToggle={() =>
                    setPasswordPolicy((current) =>
                      current
                        ? {
                            ...current,
                            prevent_breached_passwords: !current.prevent_breached_passwords,
                          }
                        : current,
                    )
                  }
                />
              </div>
            </div>
          </div>
        </section>

        <div className="lg:col-span-5 space-y-8">
          <section className="bg-surface-container-lowest shadow-sm rounded-sm overflow-hidden border border-outline-variant/10">
            <div className="bg-surface-container-high px-6 py-4 flex items-center gap-3">
              <Lock className="w-4 h-4 text-error" />
              <h2 className="text-xs uppercase font-bold tracking-widest text-on-surface-variant">
                Account Lockout Protocol
              </h2>
            </div>
            <div className="p-8 space-y-8">
              <div className="space-y-6">
                <NumberField
                  label="Max Login Attempts"
                  suffix="Retries"
                  value={lockoutPolicy.max_attempts}
                  helper="Threshold for brute-force mitigation."
                  onChange={(value) => setLockoutPolicy((current) => current ? { ...current, max_attempts: value } : current)}
                />
                <NumberField
                  label="Lockout Duration"
                  suffix="Minutes"
                  value={lockoutPolicy.lockout_minutes}
                  helper="Duration before automatic credential retry is permitted."
                  onChange={(value) => setLockoutPolicy((current) => current ? { ...current, lockout_minutes: value } : current)}
                />
              </div>
              <div className="bg-error/10 p-4 border-l-2 border-error">
                <div className="flex gap-3">
                  <AlertTriangle className="w-4 h-4 text-error shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-error tracking-tight">
                      System Notice
                    </p>
                    <p className="text-[11px] text-error mt-1">
                      Políticas de lockout mais duras podem aumentar tickets de suporte.
                      Coordene a mudança com a operação antes do rollout.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-inverse-surface rounded-sm p-6 text-white overflow-hidden relative">
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-4 h-4 text-primary" />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Audit Provenance
                </h3>
              </div>
              <div className="space-y-3">
                <AuditRow label="Last Modified" value={formatTimestamp(lastPolicyEvent?.timestamp)} />
                <AuditRow label="Authorizing Entity" value={lastPolicyEvent?.user || "ARCHITECT_GLOBAL_ROOT"} />
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-400">Compliance Status</span>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-tighter">
                      NIST Compliant
                    </span>
                  </div>
                </div>
                <AuditRow label="Last Action" value={lastPolicyEvent?.action || "policy_runtime_active"} />
              </div>
              <div className="rounded-sm bg-white/5 p-3 text-xs leading-relaxed text-slate-300">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Dedicated Policy Timeline
                </div>
                <div className="space-y-2">
                  {auditTrail.slice(0, 4).map((item) => (
                    <div key={`${item.timestamp}-${item.action}`} className="border-b border-white/10 pb-2 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {item.action.replaceAll("_", " ")}
                        </span>
                        <span className="text-[10px] text-slate-400">{formatTimestamp(item.timestamp)}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-white">{item.user || "system"}</div>
                      {item.detail ? (
                        <div className="mt-1 text-[11px] text-slate-300">{item.detail}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-4">
                <div className="h-32 w-full rounded-sm overflow-hidden opacity-40 bg-surface-container-highest">
                  <div className="h-full w-full bg-gradient-to-r from-primary/20 via-white/5 to-primary/10"></div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  suffix,
  value,
  helper,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  helper?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">
        {label}
      </label>
      <div className="flex items-center gap-4">
        <input
          className="w-full bg-surface-container-highest border-0 border-b-2 border-outline focus:border-primary focus:ring-0 text-sm font-semibold p-2"
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value || 0))}
        />
        <span className="text-xs text-on-surface-variant font-medium whitespace-nowrap">
          {suffix}
        </span>
      </div>
      {helper && <p className="text-[10px] text-on-surface-variant/70 italic">{helper}</p>}
    </div>
  );
}

function ToggleRow({
  title,
  description,
  enabled,
  disabled,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className="w-full flex items-center justify-between group cursor-pointer text-left disabled:cursor-not-allowed"
    >
      <div className="flex flex-col">
        <span className={`text-sm font-bold ${disabled ? "text-on-surface opacity-40" : "text-on-surface"}`}>
          {title}
        </span>
        <span className="text-[10px] text-on-surface-variant uppercase">{description}</span>
      </div>
      <div
        className={`w-10 h-5 relative rounded-full transition-colors ${enabled ? "bg-primary" : "bg-surface-container-highest border border-outline-variant"
          }`}
      >
        <div
          className={`absolute top-1 w-3 h-3 rounded-full ${enabled ? "right-1 bg-white" : "left-1 bg-outline"
            }`}
        ></div>
      </div>
    </button>
  );
}

function AuditRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center border-b border-white/10 pb-2">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span className="text-xs font-mono font-bold">{value}</span>
    </div>
  );
}

function FooterMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">
        {label}
      </span>
      <span className="text-xs font-bold text-on-surface">{value}</span>
    </div>
  );
}

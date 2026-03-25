import { useMemo, useState, type FormEvent } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import API_URL from "../../config";
import { useAuth } from "../../context/AuthContext";

function formatLockedUntil(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR");
}

function LoginPanel() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const helper = useMemo(
    () => "Use admin / vantage123 or tech / tech123 after seeding the clone database.",
    [],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await login(username, password);
    } catch (err) {
      const locked = err as Error & { code?: string; locked_until?: string | null };
      if (locked.code === "account_locked") {
        setError(`Conta temporariamente bloqueada até ${formatLockedUntil(locked.locked_until) || "novo aviso"}.`);
      } else {
        setError("Acesso negado. Credenciais inválidas.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-sm shadow-sm overflow-hidden">
        <div className="bg-surface-container-high px-6 py-4 border-b border-outline-variant/15">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-widest text-on-surface">VANTAGE</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                Operational Architect
              </p>
            </div>
          </div>
        </div>

        <div className="px-7 py-8 space-y-6">
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Secure Access</p>
            <h2 className="text-2xl font-black tracking-tight text-on-surface">Centro de Operações de Segurança</h2>
            <p className="text-sm text-on-surface-variant">
              Inicialize uma sessão autenticada para usar o motor real de inteligência e análise do VANTAGE.
            </p>
          </div>

          {error ? (
            <div className="px-4 py-3 rounded-sm bg-error/8 text-error text-sm border border-error/20">
              {error}
            </div>
          ) : (
            <div className="px-4 py-3 rounded-sm bg-surface-container-low text-on-surface-variant text-xs leading-relaxed border border-outline-variant/15">
              {helper}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">Usuário</span>
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
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">Senha</span>
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
              {submitting ? "Autenticando" : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function MfaPanel() {
  const { completeMfaLogin, cancelMfa } = useAuth();
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
      completeMfaLogin(data.user);
    } catch {
      setError("Código MFA inválido. Revise o OTP e tente novamente.");
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-sm shadow-sm overflow-hidden">
        <div className="bg-surface-container-high px-6 py-4 border-b border-outline-variant/15 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-on-surface">MFA Verification</h2>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
              Second factor required
            </p>
          </div>
        </div>

        <div className="px-7 py-8 space-y-5">
          <p className="text-sm text-on-surface-variant">
            A autenticação primária foi aceita. Informe o código TOTP para concluir a sessão.
          </p>

          {error && (
            <div className="px-4 py-3 rounded-sm bg-error/8 text-error text-sm border border-error/20">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">OTP</span>
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
                Voltar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 h-11 bg-gradient-to-r from-primary to-primary-dim text-on-primary text-xs font-black uppercase tracking-[0.18em] rounded-sm shadow-sm disabled:opacity-60"
              >
                {loading ? "Validando" : "Confirmar"}
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

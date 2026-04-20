import { useState, type FormEvent } from "react";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import ModalShell from "../modal/ModalShell";
import { useLanguage } from "../../context/LanguageContext";
import { disableMyMfa, MfaApiError } from "../../lib/mfaApi";

interface Props {
  open: boolean;
  onClose: () => void;
  onDisabled: () => void;
}

export default function DisableMfaModal({ open, onClose, onDisabled }: Props) {
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const keyword = t("profile.security.mfa.disableConfirmKeyword");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (input.trim().toUpperCase() !== keyword.toUpperCase()) return;
    setLoading(true);
    setError("");
    try {
      await disableMyMfa();
      onDisabled();
      onClose();
    } catch (err) {
      const code = err instanceof MfaApiError ? err.code : "";
      setError(
        code === "mfa_mandatory_for_role"
          ? t("profile.security.mfa.errors.mandatoryRole")
          : t("profile.security.mfa.errors.disableFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  const disabled = input.trim().toUpperCase() !== keyword.toUpperCase();

  return (
    <ModalShell
      title={t("profile.security.mfa.disableConfirmTitle")}
      icon={
        <span className="inline-flex items-center gap-2">
          <ShieldAlert className="h-3 w-3" />
          {t("profile.security.mfa.title")}
        </span>
      }
      onClose={onClose}
      variant="dialog"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex items-start gap-3 rounded-sm border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-xs text-on-surface">
            {t("profile.security.mfa.disableConfirmBody")}{" "}
            <code className="rounded-sm bg-surface-container-highest px-1.5 py-0.5 font-mono text-[11px] font-black tracking-widest text-on-surface">
              {keyword}
            </code>
            .
          </p>
        </div>

        <input
          type="text"
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("profile.security.mfa.disableConfirmPlaceholder")}
          className="w-full rounded-sm border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 font-mono text-sm text-on-surface outline-none focus:border-error"
        />

        {error ? (
          <p role="alert" className="flex items-center gap-2 text-xs font-bold text-error">
            <AlertTriangle className="h-3.5 w-3.5" />
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={loading}
          >
            {t("profile.buttons.cancel")}
          </button>
          <button
            type="submit"
            className="btn btn-primary !bg-error hover:!bg-error/90"
            disabled={disabled || loading}
          >
            {loading
              ? t("profile.security.mfa.disabling")
              : t("profile.security.mfa.disableCta")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

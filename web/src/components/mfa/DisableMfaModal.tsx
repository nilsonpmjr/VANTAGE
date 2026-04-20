import { useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleConfirm = async () => {
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
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-sm border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-xs text-on-surface">
            {t("profile.security.mfa.disableConfirmBody")}
          </p>
        </div>

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
            type="button"
            className="btn btn-primary !bg-error hover:!bg-error/90"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading
              ? t("profile.security.mfa.disabling")
              : t("profile.security.mfa.disableCta")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { saveAs } from "file-saver";
import { ShieldCheck, Copy, Download, Check, KeyRound, AlertTriangle } from "lucide-react";
import ModalShell from "../modal/ModalShell";
import { useLanguage } from "../../context/LanguageContext";
import { enrollMfa, confirmMfa, MfaApiError, type EnrollResponse } from "../../lib/mfaApi";

type Step = "enroll" | "backup";

interface Props {
  open: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}

export default function EnrollMfaModal({ open, onClose, onEnrolled }: Props) {
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>("enroll");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [enrollment, setEnrollment] = useState<EnrollResponse | null>(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStep("enroll");
    setOtp("");
    setError("");
    setAcknowledged(false);
    setCopied(false);
    setInitializing(true);

    enrollMfa()
      .then((data) => {
        if (!cancelled) setEnrollment(data);
      })
      .catch(() => {
        if (!cancelled) setError(t("profile.security.mfa.errors.enrollFailed"));
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, t]);

  if (!open) return null;

  const handleConfirm = async (event: FormEvent) => {
    event.preventDefault();
    if (otp.trim().length < 6) return;
    setLoading(true);
    setError("");
    try {
      await confirmMfa(otp);
      setStep("backup");
    } catch (err) {
      const code = err instanceof MfaApiError ? err.code : "";
      setError(
        code === "invalid_otp"
          ? t("profile.security.mfa.errors.invalidOtp")
          : t("profile.security.mfa.errors.enrollFailed"),
      );
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const copyCodes = async () => {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.backup_codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked — download remains available */
    }
  };

  const downloadCodes = () => {
    if (!enrollment) return;
    const blob = new Blob(
      [enrollment.backup_codes.join("\n") + "\n"],
      { type: "text/plain;charset=utf-8" },
    );
    saveAs(blob, "mfa-recovery-codes.txt");
  };

  const finish = () => {
    onEnrolled();
    onClose();
  };

  const renderEnroll = () => (
    <form onSubmit={handleConfirm} className="space-y-6">
      <p className="text-sm text-on-surface-variant">
        {t("profile.security.mfa.enrollIntro")}
      </p>

      <div className="grid gap-5 md:grid-cols-[auto,1fr] md:items-start">
        <div className="flex flex-col items-center gap-3 rounded-sm border border-outline-variant/30 bg-white p-4 md:w-auto">
          {initializing || !enrollment ? (
            <div className="h-[176px] w-[176px] animate-pulse rounded-sm bg-surface-container-high" />
          ) : (
            <QRCodeSVG
              value={enrollment.qr_uri}
              size={176}
              level="M"
              includeMargin={false}
            />
          )}
          <span className="text-[9px] font-black uppercase tracking-widest text-outline">
            {t("profile.security.mfa.scanQrLabel")}
          </span>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-outline">
              {t("profile.security.mfa.secretPreviewLabel")}
            </label>
            <div className="mt-1 rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2 font-mono text-sm text-on-surface">
              {enrollment?.secret_preview || "————"}
            </div>
            <p className="mt-1 text-[10px] text-on-surface-variant">
              {t("profile.security.mfa.secretManualHint")}
            </p>
          </div>

          <div>
            <label
              htmlFor="mfa-otp-input"
              className="text-[10px] font-black uppercase tracking-widest text-outline"
            >
              {t("profile.security.mfa.otpLabel")}
            </label>
            <input
              id="mfa-otp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder={t("profile.security.mfa.otpPlaceholder")}
              className="mt-1 w-full rounded-sm border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 font-mono text-lg tracking-[0.3em] text-on-surface outline-none focus:border-primary"
              disabled={initializing || !enrollment}
              autoFocus
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="flex items-center gap-2 text-xs font-bold text-error"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
          {t("profile.buttons.cancel")}
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || initializing || otp.trim().length < 6 || !enrollment}
        >
          {loading
            ? t("profile.security.mfa.confirming")
            : t("profile.security.mfa.confirmCta")}
        </button>
      </div>
    </form>
  );

  const renderBackup = () => (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-sm border border-warning/30 bg-warning/10 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p className="text-xs text-on-surface">
          {t("profile.security.mfa.backupCodesWarning")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-sm border border-outline-variant/20 bg-surface-container-low p-4 sm:grid-cols-4">
        {enrollment?.backup_codes.map((code) => (
          <code
            key={code}
            className="rounded-sm bg-surface-container-lowest px-2 py-2 text-center font-mono text-xs font-bold tracking-wider text-on-surface"
          >
            {code}
          </code>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={copyCodes}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              {t("profile.security.mfa.copied")}
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              {t("profile.security.mfa.copyAll")}
            </>
          )}
        </button>
        <button type="button" className="btn btn-secondary" onClick={downloadCodes}>
          <Download className="h-3.5 w-3.5" />
          {t("profile.security.mfa.downloadTxt")}
        </button>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-sm text-on-surface">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-primary"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <span>{t("profile.security.mfa.iSavedCheckbox")}</span>
      </label>

      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-primary"
          onClick={finish}
          disabled={!acknowledged}
        >
          {t("profile.security.mfa.doneCta")}
        </button>
      </div>
    </div>
  );

  return (
    <ModalShell
      title={
        step === "enroll"
          ? t("profile.security.mfa.enrollTitle")
          : t("profile.security.mfa.backupCodesTitle")
      }
      icon={
        <span className="inline-flex items-center gap-2">
          {step === "enroll" ? (
            <ShieldCheck className="h-3 w-3" />
          ) : (
            <KeyRound className="h-3 w-3" />
          )}
          {t("profile.security.mfa.title")}
        </span>
      }
      onClose={step === "backup" ? finish : onClose}
      closeOnOverlayClick={step === "enroll"}
      closeOnEscape={step === "enroll"}
      variant="dialog"
    >
      {step === "enroll" ? renderEnroll() : renderBackup()}
    </ModalShell>
  );
}

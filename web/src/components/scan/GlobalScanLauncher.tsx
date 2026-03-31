import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, Search, Upload, X } from "lucide-react";
import {
  BATCH_MAX_ITEMS,
  isBatchInput,
  parseFileTargets,
  parseTargets,
} from "../../lib/scanTargets";
import { useLanguage } from "../../context/LanguageContext";

type GlobalScanLauncherProps = {
  open: boolean;
  onClose: () => void;
};

export default function GlobalScanLauncher({
  open,
  onClose,
}: GlobalScanLauncherProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [warning, setWarning] = useState<string | null>(null);

  const batchMode = useMemo(() => isBatchInput(query), [query]);
  const targets = useMemo(() => parseTargets(query), [query]);
  const targetCount = targets.length;

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setWarning(null);
    }
  }, [open]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (!open) return;
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const imported = await parseFileTargets(file);
      if (!imported.length) {
        setWarning(t("scan.warnings.noValidTargets"));
        return;
      }

      const limited = imported.slice(0, BATCH_MAX_ITEMS);
      if (imported.length > BATCH_MAX_ITEMS) {
        setWarning(
          t("scan.warnings.importedWithSkipped")
            .replace("{max}", String(BATCH_MAX_ITEMS))
            .replace("{skipped}", String(imported.length - BATCH_MAX_ITEMS)),
        );
      } else {
        setWarning(null);
      }

      setQuery(limited.join(", "));
    } catch {
      setWarning(t("scan.warnings.parseError"));
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cleaned = query.trim();
    if (!cleaned) return;

    if (batchMode && targetCount > 1) {
      const limitedTargets = targets.slice(0, BATCH_MAX_ITEMS);
      sessionStorage.setItem(
        "vantage:last-batch-targets",
        JSON.stringify(limitedTargets),
      );
      navigate("/batch", { state: { targets: limitedTargets } });
    } else {
      localStorage.setItem("lastSearch", cleaned);
      navigate(`/analyze/${encodeURIComponent(cleaned)}`);
    }

    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-inverse-surface/55 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-sm border border-outline-variant/20 bg-surface-container-lowest shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-outline-variant/10 bg-surface-container-high px-6 py-5">
          <div className="space-y-2">
            <div className="page-eyebrow">
              {batchMode ? t("scan.mode.batch") : t("scan.mode.quick")}
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-on-surface">
              {batchMode ? t("scan.actions.startBatch") : t("scan.actions.startQuick")}
            </h2>
            <p className="max-w-xl text-sm text-on-surface-variant">
              {t("scan.description.single")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost !px-2"
            aria-label={t("scan.actions.close")}
            title={t("scan.actions.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-5 flex items-center">
              {batchMode ? (
                <Layers className="h-5 w-5 text-primary" />
              ) : (
                <Search className="h-5 w-5 text-primary" />
              )}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setWarning(null);
              }}
              placeholder={t("scan.input.placeholder")}
              className="h-18 w-full rounded-sm bg-surface-container-low pl-14 pr-36 text-base font-medium text-on-surface outline-none ring-1 ring-outline-variant/20 transition focus:ring-2 focus:ring-primary/20"
            />
            <div className="absolute inset-y-0 right-3 flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost !px-2"
                onClick={() => fileInputRef.current?.click()}
                title={t("scan.actions.importFile")}
              >
                <Upload className="h-4 w-4" />
              </button>
              <button type="submit" className="btn btn-primary">
                {batchMode ? t("scan.actions.runBatch") : t("scan.actions.execute")}
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv"
            onChange={handleFileImport}
            className="hidden"
          />

          <div className="summary-strip">
            <div className="summary-pill">
              {batchMode
                ? t("scan.status.targetsDetected").replace("{n}", String(targetCount))
                : t("scan.status.singleMode")}
            </div>
            <div className="summary-pill-muted">
              {t("scan.status.uploadHint")}
            </div>
          </div>

          {warning && (
            <div className="rounded-sm bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
              {warning}
            </div>
          )}

          {batchMode && (
            <div className="rounded-sm border border-outline-variant/15 bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">
              {t("scan.description.batch")}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

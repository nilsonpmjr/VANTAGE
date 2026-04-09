import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  Download,
  Eye,
  Layers,
  LoaderCircle,
  Mail,
  ShieldAlert,
} from "lucide-react";
import API_URL from "../config";
import { PageHeader, PageMetricPill, PageToolbar, PageToolbarGroup } from "../components/page/PageChrome";
import { RowActionsMenu, RowPrimaryAction, type RowActionItem } from "../components/RowActions";
import { useLanguage } from "../context/LanguageContext";

type BatchEstimate = {
  total: number;
  cache_hits: number;
  external_calls: number;
  estimated_seconds: number;
  services_impacted: string[];
  validation_errors?: Array<{ target: string; error: string }>;
};

type BatchResult = {
  target: string;
  target_type: string;
  status: string;
  verdict: string;
  risk_score: number;
  from_cache?: boolean;
  done?: number;
  total?: number;
};

type BatchJob = {
  _id: string;
  status: string;
  progress?: { done: number; total: number };
  results?: BatchResult[];
};

function verdictClass(verdict?: string) {
  switch ((verdict || "").toUpperCase()) {
    case "HIGH RISK":
      return "badge-error";
    case "SUSPICIOUS":
      return "badge-warning";
    case "SAFE":
      return "badge-success";
    default:
      return "badge-neutral";
  }
}

function exportBatchResults(results: BatchResult[], type: "csv" | "json") {
  if (type === "json") {
    const blob = new Blob([JSON.stringify(results, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `vantage-batch-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  const header = "target,type,verdict,risk_score,from_cache,status";
  const rows = results.map((row) =>
    [
      row.target,
      row.target_type,
      row.verdict,
      row.risk_score,
      row.from_cache ? "true" : "false",
      row.status,
    ].join(","),
  );
  const blob = new Blob([[header, ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vantage-batch-${Date.now()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function BatchAnalysis() {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const targets = useMemo(() => {
    const fromState = (location.state as { targets?: string[] } | null)?.targets;
    if (fromState?.length) return fromState;

    try {
      const fromSession = sessionStorage.getItem("vantage:last-batch-targets");
      if (!fromSession) return [];
      const parsed = JSON.parse(fromSession);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [location.state]);

  const [estimate, setEstimate] = useState<BatchEstimate | null>(null);
  const [phase, setPhase] = useState<"idle" | "estimating" | "ready" | "running" | "done" | "error">(
    targets.length ? "estimating" : "idle",
  );
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: targets.length });
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!targets.length) return;
    let cancelled = false;
    setPhase("estimating");
    setError(null);

    fetch(`${API_URL}/api/analyze/batch/estimate`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets, lang: "pt", notify_email: false }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || "Failed to estimate batch job");
        }
        return response.json();
      })
      .then((payload: BatchEstimate) => {
        if (cancelled) return;
        setEstimate(payload);
        setProgress({ done: 0, total: payload.total || targets.length });
        setPhase("ready");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [targets]);

  useEffect(() => {
    return () => {
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, []);

  async function startBatch() {
    setError(null);
    setPhase("running");
    setResults([]);

    try {
      const response = await fetch(`${API_URL}/api/analyze/batch`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets, lang: "pt", notify_email: notifyEmail }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Failed to submit batch job");
      }

      const payload = await response.json();
      const createdJobId = payload.job_id as string;
      setJobId(createdJobId);
      setProgress({ done: 0, total: payload.total || targets.length });

      const stream = new EventSource(
        `${API_URL}/api/analyze/batch/${createdJobId}/stream`,
        { withCredentials: true },
      );
      streamRef.current = stream;

      stream.onmessage = async (event) => {
        const data = JSON.parse(event.data) as BatchResult & { type: string; job_id?: string };

        if (data.type === "progress") {
          setResults((current) => {
            const existing = current.filter((item) => item.target !== data.target);
            return [...existing, data];
          });
          setProgress({ done: data.done || 0, total: data.total || targets.length });
          return;
        }

        if (data.type === "done") {
          stream.close();
          streamRef.current = null;

          try {
            const snapshot = await fetch(
              `${API_URL}/api/analyze/batch/${createdJobId}`,
              { credentials: "include" },
            );
            if (snapshot.ok) {
              const job = (await snapshot.json()) as BatchJob;
              setResults((job.results || []) as BatchResult[]);
              setProgress({
                done: job.progress?.done || job.results?.length || 0,
                total: job.progress?.total || targets.length,
              });
            }
          } catch {
            // The stream remains authoritative even if snapshot recovery fails.
          }

          setPhase("done");
          return;
        }

        if (data.type === "error") {
          stream.close();
          streamRef.current = null;
          setError((data as { message?: string }).message || "Batch stream failed");
          setPhase("error");
        }
      };

      stream.onerror = () => {
        stream.close();
        streamRef.current = null;
        setError("The live stream was interrupted. Reload the batch to recover.");
        setPhase("error");
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit batch job";
      setError(message);
      setPhase("error");
    }
  }

  async function copyTarget(target: string) {
    try {
      await navigator.clipboard.writeText(target);
    } catch {
      setError(`Unable to copy target: ${target}`);
    }
  }

  function buildBatchResultActions(result: BatchResult): RowActionItem[] {
    return [
      {
        key: "open-report",
        label: "Open individual report",
        icon: <Eye className="h-3.5 w-3.5" />,
        onSelect: () => navigate(`/analyze/${encodeURIComponent(result.target)}`),
      },
      {
        key: "copy-target",
        label: "Copy target",
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => void copyTarget(result.target),
      },
    ];
  }

  const riskCount = useMemo(
    () =>
      results.filter((result) =>
        ["HIGH RISK", "SUSPICIOUS"].includes((result.verdict || "").toUpperCase()),
      ).length,
    [results],
  );

  if (!targets.length) {
    return (
      <div className="page-frame">
        <div className="surface-section px-6 py-8">
          <div className="page-eyebrow">{t("batch.eyebrow", "Batch Operations")}</div>
          <h1 className="page-heading">{t("batch.emptyTitle", "No Batch Targets Loaded")}</h1>
          <p className="page-subheading">
            {t("batch.emptySubtitle", "Start a batch run from the global launcher in the sidebar or return to Home.")}
          </p>
          <div className="mt-6 flex gap-3">
            <button className="btn btn-primary" onClick={() => navigate("/")}>
              {t("batch.goHome", "Go to Home")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-frame space-y-6">
      <PageHeader
        eyebrow={t("batch.eyebrow", "Batch Operations")}
        title={t("batch.title", "Batch Analysis Workbench")}
        description={t("batch.subtitle", "The global launcher now routes multi-target scans into the native VANTAGE backend batch engine with pre-flight estimate, live progress, and exportable results.")}
        metrics={
          <>
            <PageMetricPill label={`${targets.length} ${t("batch.queuedTargets", "queued targets")}`} dotClassName="bg-primary" tone="primary" />
            <PageMetricPill label={`${progress.done}/${progress.total} ${t("batch.completed", "completed")}`} dotClassName="bg-secondary" />
          </>
        }
      />

      <PageToolbar
        label={
          phase === "ready"
            ? t("batch.readyToLaunch", "Ready to launch")
            : phase === "running"
              ? t("batch.liveExecution", "Live execution")
              : phase === "done"
                ? t("batch.executionCompleted", "Execution completed")
                : t("batch.controls", "Batch controls")
        }
      >
        <PageToolbarGroup className="ml-auto">
          {phase === "ready" && (
            <>
              <label className="inline-flex items-center gap-2 rounded-sm bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface">
                <input
                  type="checkbox"
                  checked={notifyEmail}
                  onChange={(event) => setNotifyEmail(event.target.checked)}
                />
                <Mail className="h-3.5 w-3.5 text-primary" />
                {t("batch.emailOnCompletion", "Email on completion")}
              </label>
              <button className="btn btn-primary" onClick={startBatch}>
                {t("batch.runBatch", "Run batch")}
              </button>
            </>
          )}
          {phase === "done" && (
            <>
              <button
                className="btn btn-outline"
                onClick={() => exportBatchResults(results, "csv")}
              >
                <Download className="h-4 w-4" />
                {t("batch.exportCsv", "Export CSV")}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => exportBatchResults(results, "json")}
              >
                <Download className="h-4 w-4" />
                {t("batch.exportJson", "Export JSON")}
              </button>
            </>
          )}
        </PageToolbarGroup>
      </PageToolbar>

      {error && (
        <div className="rounded-sm bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="page-with-side-rail">
        <div className="page-main-pane space-y-6">
          {phase === "estimating" && (
            <div className="surface-section px-6 py-8 text-sm text-on-surface-variant">
              <div className="flex items-center gap-2">
                <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                {t("batch.estimating", "Estimating cache hits, external calls, and quota impact...")}
              </div>
            </div>
          )}

          {estimate && (
            <section className="surface-section overflow-hidden">
              <header className="surface-section-header">
                <div>
                  <h2 className="surface-section-title uppercase">
                    {t("batch.executionResults", "Execution Results")}
                  </h2>
                  <p className="mt-1 text-[10px] font-medium text-on-surface-variant">
                    Live output from `/api/analyze/batch`
                  </p>
                </div>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-surface-container text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      <th className="px-6 py-3">Target</th>
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3">Verdict</th>
                      <th className="px-6 py-3">Risk Score</th>
                      <th className="px-6 py-3">Cache</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-low">
                    {results.length > 0 ? (
                      results.map((result) => (
                        <tr
                          key={`${result.target}-${result.target_type}`}
                          className="h-10 transition-colors duration-150 hover:bg-surface-container-low"
                        >
                          <td className="px-6 py-3 text-[11px] font-bold text-on-surface">
                            {result.target}
                          </td>
                          <td className="px-6 py-3 text-[11px] font-semibold uppercase text-on-surface-variant">
                            {result.target_type}
                          </td>
                          <td className="px-6 py-3">
                            <span className={`badge ${verdictClass(result.verdict)}`}>
                              {result.verdict || "UNKNOWN"}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-[11px] font-semibold text-on-surface">
                            {result.risk_score}
                          </td>
                          <td className="px-6 py-3 text-[11px] font-medium text-on-surface-variant">
                            {result.from_cache ? "Cached" : "Live"}
                          </td>
                          <td className="px-6 py-3 text-[11px] font-medium text-on-surface-variant">
                            {result.status}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <RowPrimaryAction
                                label="Open"
                                icon={<Eye className="h-3.5 w-3.5" />}
                                onClick={() => navigate(`/analyze/${encodeURIComponent(result.target)}`)}
                              />
                              <RowActionsMenu items={buildBatchResultActions(result)} />
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-6 py-10 text-sm text-on-surface-variant"
                        >
                          {phase === "ready"
                            ? t("batch.approveRun", "Approve the batch run to start filling this table.")
                            : t("batch.streamHere", "Results will stream here as each target completes.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <div className="page-side-rail-right">
          {estimate && (
            <section className="surface-section overflow-hidden">
              <header className="surface-section-header">
                <h2 className="surface-section-title uppercase">{t("batch.preflight", "Pre-flight")}</h2>
              </header>
              <div className="space-y-4 p-4">
                <div className="summary-pill">
                  <Database className="h-3.5 w-3.5 text-primary" />
                  {estimate.cache_hits} cached targets
                </div>
                <div className="summary-pill-muted">
                  {estimate.external_calls} external calls · ~{estimate.estimated_seconds}s
                </div>
                {estimate.services_impacted.length > 0 && (
                  <div className="rounded-sm bg-surface-container-low px-3 py-3 text-sm text-on-surface-variant">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Services impacted
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {estimate.services_impacted.map((service) => (
                        <span key={service} className="badge badge-neutral">
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="surface-section overflow-hidden">
            <header className="surface-section-header">
              <h2 className="surface-section-title uppercase">{t("batch.summary", "Batch Summary")}</h2>
            </header>
            <div className="space-y-4 p-4">
              <div className="summary-pill">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                {results.length} rows received
              </div>
              <div className="summary-pill-muted">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                {riskCount} flagged targets
              </div>
              {phase === "running" && (
                <div className="rounded-sm bg-surface-container-low px-3 py-3 text-sm text-on-surface-variant">
                  The table updates as each provider run finishes. You can leave
                  this screen open while the SSE stream stays active.
                </div>
              )}
              {phase === "error" && (
                <div className="rounded-sm bg-error/10 px-3 py-3 text-sm text-error">
                  The live batch stream stopped before completion.
                </div>
              )}
              {phase === "done" && (
                <div className="rounded-sm bg-emerald-500/10 px-3 py-3 text-sm text-emerald-700">
                  Batch job {jobId ? `#${jobId.slice(0, 8)}` : ""} completed.
                </div>
              )}
            </div>
          </section>

          {estimate?.validation_errors?.length ? (
            <section className="surface-section overflow-hidden">
              <header className="surface-section-header">
                <h2 className="surface-section-title uppercase">{t("batch.validationErrors", "Validation Errors")}</h2>
              </header>
              <div className="space-y-3 p-4">
                {estimate.validation_errors.map((item) => (
                  <div
                    key={`${item.target}-${item.error}`}
                    className="rounded-sm bg-error/10 px-3 py-3 text-sm text-error"
                  >
                    <div className="mb-1 flex items-center gap-2 font-semibold">
                      <AlertTriangle className="h-4 w-4" />
                      {item.target}
                    </div>
                    <div>{item.error}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

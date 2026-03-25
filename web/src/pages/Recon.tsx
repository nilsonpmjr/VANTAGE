import { useEffect, useMemo, useRef, useState } from "react";
import { Radar, Target, Map, Activity, Zap, ShieldAlert, Server, Globe, Clock3, RefreshCw, Eye, History, Radio } from "lucide-react";
import API_URL from "../config";
import { RowActionsMenu, RowPrimaryAction, type RowActionItem } from "../components/RowActions";

interface ReconModule {
  name: string;
  display_name: string;
  target_types: string[];
  timeout_seconds: number;
}

interface ReconJobListItem {
  job_id: string;
  target: string;
  status: string;
  analyst?: string;
  created_at: string;
  completed_at?: string | null;
  modules?: string[];
}

interface ReconModuleResult {
  status: string;
  data?: Record<string, unknown>;
  duration_ms?: number;
  from_cache?: boolean;
}

interface ReconJobDetails extends ReconJobListItem {
  target_type?: string;
  results?: Record<string, ReconModuleResult>;
  attack_surface?: {
    exposed_services?: Array<{ port: number; protocol: string; service?: string; product?: string; version?: string }>;
    subdomains?: string[];
    infrastructure?: Record<string, unknown>;
  };
  risk_indicators?: Array<{ severity: string; category: string; message: string }>;
}

interface ScheduledScanItem {
  id: string;
  target: string;
  modules: string[];
  run_at: string;
  created_at: string;
}

interface DashboardStats {
  recentReconJobs: ReconJobListItem[];
  reconTotal: number;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function statusClasses(status?: string) {
  if (status === "done" || status === "COMPLETED") return "text-primary";
  if (status === "running" || status === "IN PROGRESS" || status === "pending") return "text-warning";
  return "text-error";
}

export default function Recon() {
  const [modules, setModules] = useState<ReconModule[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [recentJobs, setRecentJobs] = useState<ReconJobListItem[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledScanItem[]>([]);
  const [activeJob, setActiveJob] = useState<ReconJobDetails | null>(null);
  const [history, setHistory] = useState<ReconJobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    void loadReconRuntime();
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  async function loadReconRuntime() {
    setLoading(true);
    setError("");
    try {
      const [modulesRes, statsRes, scheduledRes] = await Promise.all([
        fetch(`${API_URL}/api/recon/modules`, { credentials: "include" }),
        fetch(`${API_URL}/api/stats?period=week&limit=10`, { credentials: "include" }),
        fetch(`${API_URL}/api/recon/scheduled/mine`, { credentials: "include" }),
      ]);

      if (!modulesRes.ok || !statsRes.ok || !scheduledRes.ok) {
        throw new Error("recon_runtime_failed");
      }

      const modulesData = (await modulesRes.json()) as { modules: ReconModule[] };
      const statsData = (await statsRes.json()) as DashboardStats;
      const scheduledData = (await scheduledRes.json()) as { items: ScheduledScanItem[] };

      setModules(modulesData.modules || []);
      setSelectedModules((modulesData.modules || []).map((item) => item.name));
      setRecentJobs(statsData.recentReconJobs || []);
      setScheduled(scheduledData.items || []);
    } catch {
      setError("Não foi possível carregar o runtime do Recon Engine.");
    } finally {
      setLoading(false);
    }
  }

  async function loadJob(jobId: string, shouldPoll = false) {
    try {
      const response = await fetch(`${API_URL}/api/recon/${jobId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("recon_job_load_failed");
      }
      const job = (await response.json()) as ReconJobDetails;
      setActiveJob(job);

      if (job.target) {
        await loadHistory(job.target);
      }

      if (shouldPoll && (job.status === "pending" || job.status === "running")) {
        if (pollRef.current) {
          window.clearInterval(pollRef.current);
        }
        pollRef.current = window.setInterval(() => {
          void loadJob(jobId, true);
        }, 2500);
      } else if (pollRef.current && (job.status === "done" || job.status === "error")) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
        await loadReconRuntime();
      }
    } catch {
      setError("Falha ao carregar o relatório de recon selecionado.");
    }
  }

  async function loadHistory(jobTarget: string) {
    try {
      const response = await fetch(`${API_URL}/api/recon/history/${encodeURIComponent(jobTarget)}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("recon_history_failed");
      }
      const data = (await response.json()) as { jobs: ReconJobListItem[] };
      setHistory(data.jobs || []);
    } catch {
      // History is supplementary; the main scan flow should keep running.
    }
  }

  async function submitScan() {
    setBusy("scan");
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/api/recon/scan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          modules: selectedModules,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "recon_scan_failed");
      }

      const data = (await response.json()) as { job_id: string; modules: string[] };
      setNotice(`Recon scan submitted with ${data.modules.length} module(s).`);
      await loadJob(data.job_id, true);
      await loadReconRuntime();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(typeof detail === "string" && detail ? detail : "Não foi possível iniciar o scan de recon.");
    } finally {
      setBusy("");
    }
  }

  async function scheduleScan() {
    if (!scheduleAt) return;
    setBusy("schedule");
    setError("");
    setNotice("");

    try {
      const runAt = new Date(scheduleAt).toISOString();
      const response = await fetch(`${API_URL}/api/recon/scheduled`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          modules: selectedModules,
          run_at: runAt,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "recon_schedule_failed");
      }

      setNotice("Recon scan agendado.");
      setScheduleAt("");
      await loadReconRuntime();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(typeof detail === "string" && detail ? detail : "Não foi possível agendar o recon scan.");
    } finally {
      setBusy("");
    }
  }

  async function cancelScheduled(id: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/recon/scheduled/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("recon_cancel_failed");
      }
      setNotice("Agendamento removido.");
      await loadReconRuntime();
    } catch {
      setError("Não foi possível cancelar o agendamento.");
    } finally {
      setBusy("");
    }
  }

  const activeScans = useMemo(
    () => recentJobs.filter((job) => job.status === "pending" || job.status === "running").length,
    [recentJobs],
  );

  return (
    <div className="page-frame space-y-8">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-eyebrow">Analyst</div>
          <h1 className="page-heading">Reconnaissance Engine</h1>
          <p className="page-subheading">
            Execute scanning ativo, orquestração agendada, histórico e correlação de
            superfície em uma única bancada analítica.
          </p>
        </div>
        <div className="summary-strip">
          <div className="summary-pill">
            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            <span>{activeScans} / 10 Active Scans</span>
          </div>
        </div>
      </div>

      <div className="page-toolbar">
        <div className="page-toolbar-copy">Recon actions</div>
        <div className="page-toolbar-actions">
          <button
            onClick={loadReconRuntime}
            className="btn btn-outline"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className="space-y-3">
          {error && <div className="rounded-sm bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
          {notice && <div className="rounded-sm bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="surface-section p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Target Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                  Target IP / Domain
                </label>
                <input
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  type="text"
                  placeholder="e.g., example.com or 8.8.8.8"
                  className="w-full bg-surface-container-low border-b-2 border-outline focus:border-primary border-t-0 border-x-0 px-0 py-2 text-sm font-medium transition-all focus:ring-0 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">
                  Module Selection
                </label>
                <div className="space-y-2">
                  {loading ? (
                    <div className="text-sm text-on-surface-variant">Loading modules</div>
                  ) : (
                    modules.map((module) => {
                      const active = selectedModules.includes(module.name);
                      return (
                        <button
                          key={module.name}
                          onClick={() =>
                            setSelectedModules((current) =>
                              active
                                ? current.filter((item) => item !== module.name)
                                : [...current, module.name],
                            )
                          }
                          className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-xs font-semibold ${
                            active
                              ? "bg-primary text-white"
                              : "bg-surface-container-high text-on-surface"
                          }`}
                        >
                          <span>{module.display_name}</span>
                          <span className="text-[10px] uppercase tracking-[0.14em]">
                            {module.timeout_seconds}s
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                  Schedule for Later
                </label>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(event) => setScheduleAt(event.target.value)}
                  className="w-full bg-surface-container-low border-b-2 border-outline focus:border-primary border-t-0 border-x-0 px-0 py-2 text-sm font-medium transition-all focus:ring-0 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={submitScan}
                  disabled={!target.trim() || selectedModules.length === 0 || busy === "scan"}
                  className="w-full py-3 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-sm shadow-sm hover:bg-primary-dim transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy === "scan" ? "Running" : "Initialize Recon"}
                </button>
                <button
                  onClick={scheduleScan}
                  disabled={!target.trim() || selectedModules.length === 0 || !scheduleAt || busy === "schedule"}
                  className="w-full py-3 bg-surface-container-high text-on-surface text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-surface-container-highest transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy === "schedule" ? "Scheduling" : "Schedule"}
                </button>
              </div>
            </div>
          </div>

          <div className="surface-section p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface mb-4 flex items-center gap-2">
              <Clock3 className="w-4 h-4 text-primary" />
              Pending Schedules
            </h3>
            <div className="space-y-3">
              {scheduled.length === 0 ? (
                <div className="rounded-sm bg-surface-container-low px-4 py-4 text-xs text-on-surface-variant">
                  Nenhum agendamento pendente.
                </div>
              ) : (
                scheduled.map((item) => (
                  <div key={item.id} className="rounded-sm bg-surface-container-low p-4">
                    <div className="text-sm font-bold text-on-surface">{item.target}</div>
                    <div className="mt-1 text-[11px] text-on-surface-variant">
                      {formatTimestamp(item.run_at)}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-[11px] text-on-surface-variant">
                        {item.modules.join(", ")}
                      </div>
                      <button
                        onClick={() => cancelScheduled(item.id)}
                        disabled={busy === item.id}
                        className="rounded-sm bg-error/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-error hover:bg-error/20"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="surface-section flex min-h-[320px] flex-col">
            <div className="bg-surface-container-high px-6 py-3 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
                <Map className="w-4 h-4 text-primary" />
                Correlated Attack Surface
              </h3>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-surface-container-lowest text-[10px] font-bold rounded">
                  {activeJob?.status || "IDLE"}
                </span>
              </div>
            </div>
            <div className="flex-1 p-6">
              {!activeJob ? (
                <div className="h-full flex items-center justify-center text-sm text-on-surface-variant">
                  Execute ou selecione um recon job para visualizar a superfície correlacionada.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="rounded-sm bg-surface-container-low p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                      Exposed Services
                    </div>
                    <div className="mt-4 space-y-3">
                      {(activeJob.attack_surface?.exposed_services || []).length === 0 ? (
                        <div className="text-xs text-on-surface-variant">No exposed services correlated yet.</div>
                      ) : (
                        (activeJob.attack_surface?.exposed_services || []).map((service, index) => (
                          <div key={`${service.port}-${index}`} className="rounded-sm bg-surface-container-lowest px-4 py-3">
                            <div className="text-sm font-bold text-on-surface">
                              {service.port}/{service.protocol} · {service.service || "service"}
                            </div>
                            <div className="mt-1 text-[11px] text-on-surface-variant">
                              {service.product || "No product"} {service.version || ""}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="rounded-sm bg-surface-container-low p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                      Risk Indicators
                    </div>
                    <div className="mt-4 space-y-3">
                      {(activeJob.risk_indicators || []).length === 0 ? (
                        <div className="text-xs text-on-surface-variant">No explicit risk indicators extracted yet.</div>
                      ) : (
                        (activeJob.risk_indicators || []).map((risk, index) => (
                          <div key={`${risk.category}-${index}`} className="rounded-sm bg-surface-container-lowest px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-bold text-on-surface">{risk.category}</div>
                              <span className={`rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                                risk.severity === "critical" || risk.severity === "high"
                                  ? "bg-error/10 text-error"
                                  : risk.severity === "medium"
                                    ? "bg-warning/10 text-warning"
                                    : "bg-primary/10 text-primary"
                              }`}>
                                {risk.severity}
                              </span>
                            </div>
                            <div className="mt-2 text-xs text-on-surface-variant">{risk.message}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="surface-section">
            <div className="surface-section-header">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" />
                Recent Scan Results
              </h3>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low text-[10px] font-black text-on-surface-variant uppercase tracking-wider">
                  <th className="px-6 py-3">Target</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Modules</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {recentJobs.map((job) => (
                  <tr key={job.job_id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-6 py-3 text-xs font-mono text-on-surface font-medium">{job.target}</td>
                    <td className={`px-6 py-3 text-[10px] font-bold uppercase tracking-widest ${statusClasses(job.status)}`}>
                      {job.status}
                    </td>
                    <td className="px-6 py-3 text-xs text-on-surface">{(job.modules || []).join(", ")}</td>
                    <td className="px-6 py-3 text-xs text-on-surface">{formatTimestamp(job.created_at)}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <RowPrimaryAction
                          label="View"
                          icon={<Eye className="h-3.5 w-3.5" />}
                          onClick={() =>
                            void loadJob(job.job_id, job.status === "pending" || job.status === "running")
                          }
                        />
                        <RowActionsMenu
                          items={buildReconJobActions({
                            job,
                            onView: () =>
                              void loadJob(job.job_id, job.status === "pending" || job.status === "running"),
                            onLoadHistory: () => void loadHistory(job.target),
                            onPoll: () => void loadJob(job.job_id, true),
                          })}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface-section p-6">
              <h4 className="text-[10px] font-bold text-outline uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" />
                Selected Job Modules
              </h4>
              <div className="space-y-3">
                {!activeJob?.results ? (
                  <div className="text-xs text-on-surface-variant">No module results loaded yet.</div>
                ) : (
                  (Object.entries(activeJob.results) as Array<[string, ReconModuleResult]>).map(([moduleName, entry]) => (
                    <div key={moduleName} className="rounded-sm bg-surface-container-low px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-on-surface">{moduleName}</div>
                        <span className={`rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                          entry.status === "done"
                            ? "bg-primary/10 text-primary"
                            : "bg-error/10 text-error"
                        }`}>
                          {entry.status}
                        </span>
                      </div>
                      <div className="mt-2 text-[11px] text-on-surface-variant">
                        {entry.from_cache ? "from cache" : `${entry.duration_ms || 0} ms`}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="surface-section p-6">
              <h4 className="text-[10px] font-bold text-outline uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Target History
              </h4>
              <div className="space-y-3">
                {history.length === 0 ? (
                  <div className="text-xs text-on-surface-variant">No history loaded for the current target.</div>
                ) : (
                  history.map((job) => (
                    <div key={job.job_id} className="rounded-sm bg-surface-container-low px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-on-surface">{job.target}</div>
                        <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${statusClasses(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                      <div className="mt-2 text-[11px] text-on-surface-variant">
                        {formatTimestamp(job.created_at)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildReconJobActions({
  job,
  onView,
  onLoadHistory,
  onPoll,
}: {
  job: ReconJobListItem;
  onView: () => void;
  onLoadHistory: () => void;
  onPoll: () => void;
}): RowActionItem[] {
  const live = job.status === "pending" || job.status === "running";

  return [
    {
      key: "view",
      label: live ? "Open live report" : "Open cached report",
      icon: <Eye className="h-3.5 w-3.5" />,
      onSelect: onView,
    },
    {
      key: "history",
      label: "Load target history",
      icon: <History className="h-3.5 w-3.5" />,
      onSelect: onLoadHistory,
    },
    {
      key: "poll",
      label: live ? "Follow live execution" : "Refresh snapshot",
      icon: <Radio className="h-3.5 w-3.5" />,
      onSelect: onPoll,
      dividerBefore: true,
    },
  ];
}

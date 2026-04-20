import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Radar, Target, Map, Activity, Zap, ShieldAlert, Server, Globe, Clock3, RefreshCw, Eye, History, Radio } from "lucide-react";
import API_URL from "../config";
import { PageHeader, PageMetricPill, PageToolbar, PageToolbarGroup } from "../components/page/PageChrome";
import { RowActionsMenu, RowPrimaryAction, type RowActionItem } from "../components/RowActions";
import { useLanguage } from "../context/LanguageContext";

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

interface WebModuleData {
  status_code?: number;
  final_url?: string;
  redirect_chain?: string[];
  title?: string;
  server?: string;
  x_powered_by?: string;
  content_type?: string;
  technologies?: string[];
  security_headers?: Record<string, boolean>;
}

interface CertificateData {
  subject_cn?: string;
  issuer_cn?: string;
  not_after?: string;
  days_until_expiry?: number;
  is_expired?: boolean;
  is_self_signed?: boolean;
  protocol?: string;
  sans?: string[];
}

interface PassiveData {
  emails?: string[];
  ips?: string[];
}

interface PassiveModuleData extends PassiveData {
  subdomains?: string[];
}

interface PortsModuleData {
  ports?: Array<{ port?: number; protocol?: string; service?: string }>;
}

interface SubdomainsModuleData {
  subdomains?: string[];
}

interface InfrastructureData {
  a_records?: string[];
  aaaa_records?: string[];
  mx_records?: string[];
  ns_records?: string[];
  txt_records?: string[];
  registrar?: string;
  registrant_country?: string;
  creation_date?: string;
  expiration_date?: string;
  name_servers?: string[];
  org?: string;
  technologies?: string[];
  server?: string;
  final_url?: string;
  title?: string;
}

interface ReconJobDetails extends ReconJobListItem {
  target_type?: string;
  results?: Record<string, ReconModuleResult>;
  attack_surface?: {
    exposed_services?: Array<{ port: number; protocol: string; service?: string; product?: string; version?: string }>;
    subdomains?: string[];
    infrastructure?: InfrastructureData;
    certificates?: CertificateData;
    passive?: PassiveData;
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

const RISK_SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function formatTimestamp(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function statusClasses(status?: string) {
  if (status === "done" || status === "COMPLETED") return "text-primary";
  if (status === "running" || status === "IN PROGRESS" || status === "pending") return "text-warning";
  return "text-error";
}

function getReconModuleData<T>(results: ReconJobDetails["results"], moduleName: string): T | null {
  const entry = results?.[moduleName];
  if (!entry || entry.status === "error") return null;

  const data = entry.data as Record<string, unknown> | undefined;
  if (!data || data.error || data.skipped) return null;

  return data as T;
}

function sortRiskIndicators(risks: Array<{ severity: string; category: string; message: string }>) {
  return [...risks].sort((left, right) => {
    const severityDiff = (RISK_SEVERITY_ORDER[left.severity] ?? 99) - (RISK_SEVERITY_ORDER[right.severity] ?? 99);
    if (severityDiff !== 0) return severityDiff;

    const categoryDiff = left.category.localeCompare(right.category);
    if (categoryDiff !== 0) return categoryDiff;

    return left.message.localeCompare(right.message);
  });
}

function extractRiskIndicators(results: ReconJobDetails["results"]) {
  if (!results) return [];

  const risks: Array<{ severity: string; category: string; message: string }> = [];
  const ssl = getReconModuleData<CertificateData>(results, "ssl");
  const web = getReconModuleData<WebModuleData>(results, "web");
  const ports = getReconModuleData<PortsModuleData>(results, "ports");
  const passive = getReconModuleData<PassiveModuleData>(results, "passive");
  const subdomains = getReconModuleData<SubdomainsModuleData>(results, "subdomains");

  if (ssl) {
    if (ssl.is_expired) {
      risks.push({ severity: "critical", category: "ssl", message: "SSL certificate is expired" });
    } else if (ssl.days_until_expiry !== undefined && ssl.days_until_expiry < 30) {
      risks.push({
        severity: "high",
        category: "ssl",
        message: `SSL certificate expires in ${ssl.days_until_expiry} days`,
      });
    }

    if (ssl.is_self_signed) {
      risks.push({ severity: "medium", category: "ssl", message: "SSL certificate is self-signed" });
    }

    if (ssl.protocol && ["TLSv1", "TLSv1.0", "TLSv1.1", "SSLv3"].includes(ssl.protocol)) {
      risks.push({
        severity: "high",
        category: "ssl",
        message: `Deprecated TLS protocol in use: ${ssl.protocol}`,
      });
    }
  }

  if (web) {
    const securityHeaders = web.security_headers || {};
    const missingHeaders = Object.entries(securityHeaders)
      .filter(([, present]) => !present)
      .map(([header]) => header);

    if (missingHeaders.includes("Strict-Transport-Security")) {
      risks.push({ severity: "medium", category: "web", message: "Missing HSTS header" });
    }

    if (missingHeaders.includes("Content-Security-Policy")) {
      risks.push({ severity: "medium", category: "web", message: "Missing Content-Security-Policy header" });
    }

    if (missingHeaders.includes("X-Frame-Options")) {
      risks.push({ severity: "low", category: "web", message: "Missing X-Frame-Options header" });
    }

    if (web.x_powered_by) {
      risks.push({
        severity: "low",
        category: "web",
        message: `Server technology exposed: ${web.x_powered_by}`,
      });
    }
  }

  if (ports?.ports?.length) {
    const standardPorts = new Set([21, 22, 23, 25, 53, 80, 110, 143, 443, 587, 993, 995, 3306, 5432, 6379, 8080, 8443]);

    for (const portInfo of ports.ports) {
      if (portInfo.port && !standardPorts.has(portInfo.port)) {
        risks.push({
          severity: "low",
          category: "ports",
          message: `Non-standard port open: ${portInfo.port}/${portInfo.protocol || "tcp"} (${portInfo.service || ""})`,
        });
      }
    }
  }

  if (passive?.emails?.length) {
    risks.push({
      severity: "info",
      category: "passive",
      message: `${passive.emails.length} email address(es) found — potential phishing targets`,
    });
  }

  const subdomainCount = (subdomains?.subdomains?.length || 0) + (passive?.subdomains?.length || 0);
  if (subdomainCount > 20) {
    risks.push({
      severity: "info",
      category: "subdomains",
      message: `Large attack surface: ${subdomainCount} subdomains discovered`,
    });
  }

  return sortRiskIndicators(risks);
}

export default function Recon() {
  const { t, locale } = useLanguage();
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

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    void loadReconRuntime();
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const deepLinkJob = searchParams.get("job");
    if (deepLinkJob) {
      void loadJob(deepLinkJob, true);
      // Clear the query param after consuming it so refreshes do not re-trigger.
      const next = new URLSearchParams(searchParams);
      next.delete("job");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const infrastructure = activeJob?.attack_surface?.infrastructure;
  const certificates = activeJob?.attack_surface?.certificates;
  const passive = activeJob?.attack_surface?.passive;
  const subdomains = activeJob?.attack_surface?.subdomains || [];
  const web = (activeJob?.results?.web?.data || null) as WebModuleData | null;
  const riskIndicators = useMemo(
    () => (
      activeJob?.risk_indicators?.length
        ? sortRiskIndicators(activeJob.risk_indicators)
        : extractRiskIndicators(activeJob?.results)
    ),
    [activeJob?.risk_indicators, activeJob?.results],
  );
  const presentHeaders = Object.entries(web?.security_headers || {}).filter(([, present]) => present);
  const missingHeaders = Object.entries(web?.security_headers || {}).filter(([, present]) => !present);

  return (
    <div className="page-frame space-y-8">
      <PageHeader
        title={t("recon.title", "Reconnaissance Engine")}
        description={t("recon.subtitle", "Execute scanning ativo, orquestração agendada, histórico e correlação de superfície em uma única bancada analítica.")}
        metrics={
          <>
            <PageMetricPill
              label={`${activeScans} / 10 ${t("recon.activeScans", "Active Scans")}`}
              dotClassName="bg-primary"
              tone="primary"
            />
            <PageMetricPill
              label={`${recentJobs.length} ${t("recon.recentJobs", "Recent Jobs")}`}
              dotClassName="bg-secondary"
            />
          </>
        }
      />

      <PageToolbar label={t("recon.actions", "Recon actions")}>
        <PageToolbarGroup className="ml-auto">
          <button
            onClick={loadReconRuntime}
            className="btn btn-outline"
          >
            <RefreshCw className="w-4 h-4" />
            {t("recon.refresh", "Refresh")}
          </button>
        </PageToolbarGroup>
      </PageToolbar>

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
              {t("recon.targetConfiguration", "Target Configuration")}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                  {t("recon.targetLabel", "Target IP / Domain")}
                </label>
                <input
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  type="text"
                  placeholder={t("recon.targetPlaceholder", "e.g., example.com or 8.8.8.8")}
                  className="w-full bg-surface-container-low border-b-2 border-outline focus:border-primary border-t-0 border-x-0 px-0 py-2 text-sm font-medium transition-all focus:ring-0 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-2">
                  {t("recon.moduleSelection", "Module Selection")}
                </label>
                <div className="space-y-2">
                  {loading ? (
                    <div className="text-sm text-on-surface-variant">{t("recon.loadingModules", "Loading modules")}</div>
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
                  {t("recon.scheduleLater", "Schedule for Later")}
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
                  {busy === "scan" ? t("recon.running", "Running") : t("recon.initializeRecon", "Initialize Recon")}
                </button>
                <button
                  onClick={scheduleScan}
                  disabled={!target.trim() || selectedModules.length === 0 || !scheduleAt || busy === "schedule"}
                  className="w-full py-3 bg-surface-container-high text-on-surface text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-surface-container-highest transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy === "schedule" ? t("recon.scheduling", "Scheduling") : t("recon.schedule", "Schedule")}
                </button>
              </div>
            </div>
          </div>

          <div className="surface-section p-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface mb-4 flex items-center gap-2">
              <Clock3 className="w-4 h-4 text-primary" />
              {t("recon.pendingSchedules", "Pending Schedules")}
            </h3>
            <div className="space-y-3">
              {scheduled.length === 0 ? (
                <div className="rounded-sm bg-surface-container-low px-4 py-4 text-xs text-on-surface-variant">
                  {t("recon.noPendingSchedules", "Nenhum agendamento pendente.")}
                </div>
              ) : (
                scheduled.map((item) => (
                  <div key={item.id} className="rounded-sm bg-surface-container-low p-4">
                    <div className="text-sm font-bold text-on-surface">{item.target}</div>
                    <div className="mt-1 text-[11px] text-on-surface-variant">
                      {formatTimestamp(item.run_at, locale)}
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
                        {t("recon.cancel", "Cancel")}
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
                {t("recon.correlatedAttackSurface", "Correlated Attack Surface")}
              </h3>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-surface-container-lowest text-[10px] font-bold rounded">
                  {activeJob?.status || t("recon.idle", "IDLE")}
                </span>
              </div>
            </div>
            <div className="flex-1 p-6">
              {!activeJob ? (
                <div className="h-full flex items-center justify-center text-sm text-on-surface-variant">
                  {t("recon.selectJobEmpty", "Execute ou selecione um recon job para visualizar a superfície correlacionada.")}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                  <div className="rounded-sm bg-surface-container-low p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                      {t("recon.exposedServices", "Exposed Services")}
                    </div>
                    <div className="mt-4 space-y-3">
                      {(activeJob.attack_surface?.exposed_services || []).length === 0 ? (
                        <div className="text-xs text-on-surface-variant">{t("recon.noExposedServices", "No exposed services correlated yet.")}</div>
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
                      {t("recon.riskIndicators", "Risk Indicators")}
                    </div>
                    <div className="mt-4 space-y-3">
                      {riskIndicators.length === 0 ? (
                        <div className="text-xs text-on-surface-variant">{t("recon.noRiskIndicators", "No explicit risk indicators extracted yet.")}</div>
                      ) : (
                        riskIndicators.map((risk, index) => (
                          <div key={`${risk.category}-${index}`} className="rounded-sm bg-surface-container-lowest px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-bold text-on-surface">{risk.category}</div>
                              <span className={`inline-flex items-center whitespace-nowrap rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
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
                  <div className="rounded-sm bg-surface-container-low p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                      {t("recon.webResults", "Web Results")}
                    </div>
                    {!web ? (
                      <div className="mt-4 text-xs text-on-surface-variant">
                        {t("recon.noWebResults", "No web results correlated yet.")}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <ReconKvRow label={t("recon.httpStatus", "HTTP Status")} value={web.status_code} />
                        <ReconKvRow label={t("recon.finalUrl", "Final URL")} value={web.final_url} mono />
                        <ReconKvRow label={t("recon.titleLabel", "Title")} value={web.title} />
                        <ReconKvRow label={t("recon.serverLabel", "Server")} value={web.server} mono />
                        <ReconKvRow label={t("recon.poweredBy", "X-Powered-By")} value={web.x_powered_by} mono />
                        {(web.technologies || []).length > 0 && (
                          <div>
                            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                              {t("recon.technologies", "Technologies")}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(web.technologies || []).map((technology) => (
                                <span
                                  key={technology}
                                  className="rounded-sm bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary"
                                >
                                  {technology}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {(presentHeaders.length > 0 || missingHeaders.length > 0) && (
                          <div>
                            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                              {t("recon.securityHeaders", "Security Headers")}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {presentHeaders.map(([header]) => (
                                <span
                                  key={header}
                                  className="rounded-sm bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary"
                                >
                                  {header}
                                </span>
                              ))}
                              {missingHeaders.map(([header]) => (
                                <span
                                  key={header}
                                  className="rounded-sm bg-error/10 px-2 py-1 text-[10px] font-bold text-error"
                                >
                                  {t("recon.missingHeader", "Missing")} {header}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="rounded-sm bg-surface-container-low p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                      {t("recon.infrastructure", "Infrastructure")}
                    </div>
                    {!infrastructure ? (
                      <div className="mt-4 text-xs text-on-surface-variant">
                        {t("recon.noInfrastructure", "No infrastructure details correlated yet.")}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <ReconKvRow label="A" value={infrastructure.a_records} mono />
                        <ReconKvRow label="AAAA" value={infrastructure.aaaa_records} mono />
                        <ReconKvRow label="NS" value={infrastructure.ns_records} />
                        <ReconKvRow label="MX" value={infrastructure.mx_records} />
                        <ReconKvRow label={t("recon.registrar", "Registrar")} value={infrastructure.registrar} />
                        <ReconKvRow label={t("recon.country", "Country")} value={infrastructure.registrant_country} />
                        <ReconKvRow label={t("recon.created", "Created")} value={infrastructure.creation_date} />
                        <ReconKvRow label={t("recon.expiresAt", "Expires")} value={infrastructure.expiration_date} />
                      </div>
                    )}
                  </div>
                  <div className="rounded-sm bg-surface-container-low p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                      {t("recon.certificates", "Certificates")}
                    </div>
                    {!certificates ? (
                      <div className="mt-4 text-xs text-on-surface-variant">
                        {t("recon.noCertificates", "No certificate details correlated yet.")}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <ReconKvRow label={t("recon.subjectCn", "Subject CN")} value={certificates.subject_cn} />
                        <ReconKvRow label={t("recon.issuerCn", "Issuer CN")} value={certificates.issuer_cn} />
                        <ReconKvRow label={t("recon.validUntil", "Valid until")} value={certificates.not_after} />
                        <ReconKvRow label={t("recon.daysRemaining", "Days remaining")} value={certificates.days_until_expiry} />
                        <ReconKvRow label={t("recon.tlsProtocol", "Protocol")} value={certificates.protocol} />
                        <ReconKvRow label={t("recon.subjectAltNames", "SANs")} value={certificates.sans} />
                      </div>
                    )}
                  </div>
                  <div className="rounded-sm bg-surface-container-low p-5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                      {t("recon.subdomains", "Subdomains")}
                    </div>
                    {subdomains.length === 0 ? (
                      <div className="mt-4 text-xs text-on-surface-variant">
                        {t("recon.noSubdomains", "No subdomains correlated yet.")}
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {subdomains.slice(0, 24).map((subdomain) => (
                          <span
                            key={subdomain}
                            className="rounded-sm bg-surface-container-lowest px-2 py-1 text-[11px] font-medium text-on-surface"
                          >
                            {subdomain}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-sm bg-surface-container-low p-5 xl:col-span-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                      {t("recon.passiveIntel", "Passive Intelligence")}
                    </div>
                    {!(passive?.emails?.length || passive?.ips?.length) ? (
                      <div className="mt-4 text-xs text-on-surface-variant">
                        {t("recon.noPassiveIntel", "No passive intelligence correlated yet.")}
                      </div>
                    ) : (
                      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <ReconListBlock
                          label={t("recon.emailsFound", "Emails")}
                          values={passive?.emails || []}
                        />
                        <ReconListBlock
                          label={t("recon.passiveIps", "IPs")}
                          values={passive?.ips || []}
                          mono
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="surface-section">
            <div className="surface-section-header">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" />
                {t("recon.recentResults", "Recent Scan Results")}
              </h3>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low text-[10px] font-black text-on-surface-variant uppercase tracking-wider">
                  <th className="px-6 py-3">{t("recon.target", "Target")}</th>
                  <th className="px-6 py-3">{t("recon.status", "Status")}</th>
                  <th className="px-6 py-3">{t("recon.modules", "Modules")}</th>
                  <th className="px-6 py-3">{t("recon.created", "Created")}</th>
                  <th className="px-6 py-3 text-right">{t("recon.actionsColumn", "Actions")}</th>
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
                    <td className="px-6 py-3 text-xs text-on-surface">{formatTimestamp(job.created_at, locale)}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <RowPrimaryAction
                          label={t("recon.view", "View")}
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
                {t("recon.selectedJobModules", "Selected Job Modules")}
              </h4>
              <div className="space-y-3">
                {!activeJob?.results ? (
                  <div className="text-xs text-on-surface-variant">{t("recon.noModuleResults", "No module results loaded yet.")}</div>
                ) : (
                  (Object.entries(activeJob.results) as Array<[string, ReconModuleResult]>).map(([moduleName, entry]) => (
                    <div key={moduleName} className="rounded-sm bg-surface-container-low px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-on-surface">{moduleName}</div>
                        <span className={`inline-flex items-center whitespace-nowrap rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${
                          entry.status === "done"
                            ? "bg-primary/10 text-primary"
                            : "bg-error/10 text-error"
                        }`}>
                          {entry.status}
                        </span>
                      </div>
                      <div className="mt-2 text-[11px] text-on-surface-variant">
                        {entry.from_cache ? t("recon.fromCache", "from cache") : `${entry.duration_ms || 0} ms`}
                      </div>
                      {moduleName === "web" ? (
                        <ReconWebModuleSummary
                          entry={entry}
                          t={t}
                        />
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="surface-section p-6">
              <h4 className="text-[10px] font-bold text-outline uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                {t("recon.targetHistory", "Target History")}
              </h4>
              <div className="space-y-3">
                {history.length === 0 ? (
                  <div className="text-xs text-on-surface-variant">{t("recon.noTargetHistory", "No history loaded for the current target.")}</div>
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
                        {formatTimestamp(job.created_at, locale)}
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

function ReconKvRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number | string[] | null | undefined;
  mono?: boolean;
}) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Array.isArray(value) ? value.join(", ") : String(value);
  if (!normalized) return null;
  return (
    <div className="flex gap-3 text-xs">
      <span className="min-w-[92px] shrink-0 text-on-surface-variant">{label}</span>
      <span className={`break-all text-on-surface ${mono ? "font-mono" : ""}`}>{normalized}</span>
    </div>
  );
}

function ReconListBlock({
  label,
  values,
  mono = false,
}: {
  label: string;
  values: string[];
  mono?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {values.slice(0, 20).map((value) => (
          <span
            key={value}
            className={`rounded-sm bg-surface-container-lowest px-2 py-1 text-[11px] font-medium text-on-surface ${mono ? "font-mono" : ""}`}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReconWebModuleSummary({
  entry,
  t,
}: {
  entry: ReconModuleResult;
  t: (key: string, fallback?: string) => string;
}) {
  const data = (entry.data || null) as WebModuleData | null;
  if (!data) return null;
  const presentHeaders = Object.entries(data.security_headers || {}).filter(([, present]) => present);
  const missingHeaders = Object.entries(data.security_headers || {}).filter(([, present]) => !present);

  return (
    <div className="mt-3 space-y-3 border-t border-surface-container pt-3">
      <ReconKvRow label={t("recon.httpStatus", "HTTP Status")} value={data.status_code} />
      <ReconKvRow label={t("recon.finalUrl", "Final URL")} value={data.final_url} mono />
      <ReconKvRow label={t("recon.titleLabel", "Title")} value={data.title} />
      <ReconKvRow label={t("recon.serverLabel", "Server")} value={data.server} mono />
      <ReconKvRow label={t("recon.poweredBy", "X-Powered-By")} value={data.x_powered_by} mono />
      {(data.technologies || []).length > 0 && (
        <ReconListBlock label={t("recon.technologies", "Technologies")} values={data.technologies || []} />
      )}
      {(presentHeaders.length > 0 || missingHeaders.length > 0) && (
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
            {t("recon.securityHeaders", "Security Headers")}
          </div>
          <div className="flex flex-wrap gap-2">
            {presentHeaders.map(([header]) => (
              <span
                key={header}
                className="rounded-sm bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary"
              >
                {header}
              </span>
            ))}
            {missingHeaders.map(([header]) => (
              <span
                key={header}
                className="rounded-sm bg-error/10 px-2 py-1 text-[10px] font-bold text-error"
              >
                {t("recon.missingHeader", "Missing")} {header}
              </span>
            ))}
          </div>
        </div>
      )}
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

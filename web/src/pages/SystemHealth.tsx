import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  Database,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Server,
  Mail,
  CalendarClock,
  Eye,
  Copy,
} from "lucide-react";
import API_URL from "../config";
import { PageHeader, PageMetricPill, PageToolbar, PageToolbarGroup } from "../components/page/PageChrome";
import { RowActionsMenu, RowPrimaryAction, type RowActionItem } from "../components/RowActions";
import { useLanguage } from "../context/LanguageContext";
import MfaCoverageCard from "../components/mfa/MfaCoverageCard";

type OperationalService = {
  status: "healthy" | "degraded" | "error";
  error?: string | null;
  last_checked?: string | null;
  details?: Record<string, unknown>;
  consumption?: Record<string, unknown>;
};

type OperationalStatusPayload = {
  checked_at: string;
  summary: Record<string, number>;
  services: Record<string, OperationalService>;
};

type AdminStats = {
  total_users: number;
  active_users: number;
  suspended_users: number;
  locked_accounts: number;
  users_with_mfa: number;
  active_sessions: number;
  failed_logins_24h: number;
  active_api_keys: number;
};

type OperationalHistoryItem = {
  recorded_at: string;
  summary: Record<string, number>;
  services: Record<string, OperationalService>;
};

type OperationalEvent = {
  timestamp: string;
  user: string;
  action: string;
  target?: string;
  result?: string;
  detail?: string;
  service: string;
  category: string;
};

type OperationalEventPayload = {
  items: OperationalEvent[];
};

function serviceIcon(name: string) {
  switch (name) {
    case "backend":
      return BrainCircuit;
    case "mongodb":
      return Database;
    case "mailer":
      return Mail;
    case "scheduler":
      return CalendarClock;
    default:
      return Server;
  }
}

function serviceTitle(name: string) {
  switch (name) {
    case "backend":
      return "Backend API";
    case "mongodb":
      return "Database Cluster";
    case "mailer":
      return "SMTP Gateway";
    case "scheduler":
      return "Scheduler";
    case "worker":
      return "Worker Runtime";
    default:
      return name;
  }
}

function statusPill(status: string) {
  if (status === "healthy") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "degraded") {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-error/10 text-error";
}

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export default function SystemHealth() {
  const { t } = useLanguage();
  const [payload, setPayload] = useState<OperationalStatusPayload | null>(null);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [history, setHistory] = useState<OperationalHistoryItem[]>([]);
  const [selectedService, setSelectedService] = useState("backend");
  const [loading, setLoading] = useState(true);
  const [busyService, setBusyService] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const restartableServices = useMemo(
    () => [
      { key: "scheduler", label: "Scheduler", helper: "Daily safe target scan" },
      { key: "worker", label: "Watchlist Worker", helper: "Rescan worker cycle" },
      { key: "recon", label: "Recon Scheduler", helper: "Scheduled recon jobs" },
      { key: "threat_ingestion", label: "Threat Ingestion", helper: "Feed sync worker" },
    ],
    [],
  );
  const restartableServiceKeys = useMemo(
    () => new Set(restartableServices.map((service) => service.key)),
    [restartableServices],
  );

  async function loadRuntime() {
    setLoading(true);
    setError("");
    try {
      const [statusRes, statsRes, historyRes, eventsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/operational-status`, { credentials: "include" }),
        fetch(`${API_URL}/api/admin/stats`, { credentials: "include" }),
        fetch(`${API_URL}/api/admin/operational-status/history?limit=24`, { credentials: "include" }),
        fetch(`${API_URL}/api/admin/operational-events?page=1&page_size=8`, { credentials: "include" }),
      ]);

      if (!statusRes.ok || !statsRes.ok || !historyRes.ok || !eventsRes.ok) {
        throw new Error("system_health_load_failed");
      }

      const [statusData, statsData, historyData, eventData] = await Promise.all([
        statusRes.json(),
        statsRes.json(),
        historyRes.json(),
        eventsRes.json(),
      ]);

      setPayload(statusData as OperationalStatusPayload);
      setAdminStats(statsData as AdminStats);
      setHistory((historyData as { items?: OperationalHistoryItem[] }).items || []);
      setEvents((eventData as OperationalEventPayload).items || []);
    } catch {
      setError("Não foi possível carregar o snapshot operacional da instância.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRuntime();
  }, []);

  useEffect(() => {
    if (!payload?.services) return;
    if (payload.services[selectedService]) return;
    const firstService = Object.keys(payload.services)[0];
    if (firstService) {
      setSelectedService(firstService);
    }
  }, [payload, selectedService]);

  async function restartRuntimeService(serviceName: string) {
    setBusyService(serviceName);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/services/${serviceName}/restart`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "service_restart_failed");
      }
      setNotice(payload.message || `Service '${serviceName}' restarted.`);
      await loadRuntime();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Falha ao reiniciar o serviço ${serviceName}.`,
      );
    } finally {
      setBusyService("");
    }
  }

  const serviceEntries = useMemo(
    () => Object.entries(payload?.services || {}),
    [payload],
  );

  const selectedServiceSnapshot = payload?.services[selectedService] || null;

  const selectedSeries = useMemo(() => {
    const raw = history
      .map((entry) => {
        const service = entry.services?.[selectedService];
        const numericEntries = Object.entries(service?.consumption || {}).filter(
          (metric): metric is [string, number] => isFiniteNumber(metric[1]),
        );
        if (!numericEntries.length) return null;
        return {
          recordedAt: entry.recorded_at,
          metricLabel: numericEntries[0][0].replace(/_/g, " "),
          value: Number(numericEntries[0][1]),
        };
      })
      .filter((entry): entry is { recordedAt: string; metricLabel: string; value: number } => Boolean(entry));
    const source = raw.length
      ? raw
      : [{ recordedAt: payload?.checked_at || new Date().toISOString(), metricLabel: "snapshot load", value: 42 }];
    const max = Math.max(...source.map((entry) => entry.value), 1);
    return source.map((entry) => ({
      ...entry,
      height: Math.max(12, Math.round((entry.value / max) * 100)),
    }));
  }, [history, payload?.checked_at, selectedService]);

  const uptimeRatio = useMemo(() => {
    const summary = payload?.summary;
    if (!summary) return 0;
    const values = Object.values(summary as Record<string, number>) as number[];
    const total = values.reduce((acc, value) => acc + Number(value || 0), 0);
    return total > 0 ? Math.round(((Number(summary.healthy || 0) / total) * 1000)) / 10 : 0;
  }, [payload]);

  const selectedServiceMetrics = useMemo(
    () =>
      Object.entries(selectedServiceSnapshot?.consumption || {}).filter(
        (metric): metric is [string, number] => isFiniteNumber(metric[1]),
      ),
    [selectedServiceSnapshot],
  );

  const selectedServiceDetails = useMemo(
    () => Object.entries(selectedServiceSnapshot?.details || {}),
    [selectedServiceSnapshot],
  );

  const eventCountByCategory = useMemo(() => {
    return events.reduce<Record<string, number>>((acc, event) => {
      acc[event.category] = (acc[event.category] || 0) + 1;
      return acc;
    }, {});
  }, [events]);

  return (
    <div className="page-frame">
      <PageHeader
        title={t("settingsPages.systemHealthTitle", "Operational Status")}
        description={t("settingsPages.systemHealthSubtitle", "Monitore saúde dos serviços, consumo operacional e eventos recentes da infraestrutura sem depender de trilhas de navegação artificiais.")}
        metrics={
          <>
            <PageMetricPill label={`Global Uptime: ${uptimeRatio.toFixed(1)}%`} dotClassName="bg-emerald-500" tone="success" />
            <PageMetricPill label={`Active Alerts: ${Number(payload?.summary?.degraded || 0) + Number(payload?.summary?.error || 0)}`} dotClassName="bg-amber-500" tone="warning" />
          </>
        }
      />

      <PageToolbar label={t("settingsPages.systemHealthActions", "Service actions")}>
        <PageToolbarGroup className="ml-auto">
          <button
            onClick={() => void loadRuntime()}
            className="btn btn-outline"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {t("admin.refresh", "Refresh")}
          </button>
          <button
            onClick={() => void restartRuntimeService("threat_ingestion")}
            className="btn btn-primary"
            disabled={busyService === "threat_ingestion"}
          >
            <RotateCcw className={`w-4 h-4 ${busyService === "threat_ingestion" ? "animate-spin" : ""}`} />
            {busyService === "threat_ingestion" ? t("settingsPages.restarting", "Restarting...") : t("settingsPages.restartIngestion", "Restart Ingestion")}
          </button>
        </PageToolbarGroup>
      </PageToolbar>

      {(error || notice) && (
        <div className="space-y-3">
          {error && <div className="rounded-sm bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
          {notice && <div className="rounded-sm bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div>}
        </div>
      )}

      <div className="page-with-side-rail">
        <div className="page-main-pane space-y-6">
        <section className="surface-section overflow-hidden">
          <div className="surface-section-header">
            <div>
              <h3 className="surface-section-title">Operational Status</h3>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                Core services, runtime health, and selection-aware drilldown
              </p>
            </div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
              {serviceEntries.length} service(s)
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant/10 text-[11px] text-on-surface-variant font-bold uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-3">Service</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Last Check</th>
                  <th className="px-6 py-3">Primary Signal</th>
                  <th className="px-6 py-3">Context</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {serviceEntries.length > 0 ? (
                  serviceEntries.map(([name, service]) => {
                    const Icon = serviceIcon(name);
                    const firstMetric = Object.entries(service.consumption || {}).find(([, value]) => typeof value === "number");
                    const secondMetric = Object.entries(service.details || {}).find(([, value]) => typeof value === "boolean" || typeof value === "string");
                    const canRestart = restartableServiceKeys.has(name);
                    return (
                      <tr
                        key={name}
                        className={`transition-colors ${
                          selectedService === name
                            ? "bg-primary/5"
                            : "hover:bg-surface-container-low"
                        }`}
                      >
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={() => setSelectedService(name)}
                            className="flex items-start gap-3 text-left"
                          >
                            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-sm bg-surface-container">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-on-surface">{serviceTitle(name)}</div>
                              <div className="text-[11px] uppercase tracking-widest text-on-surface-variant">{name}</div>
                            </div>
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-[10px] font-bold ${statusPill(service.status)}`}>
                            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${service.status === "healthy" ? "bg-emerald-500" : service.status === "degraded" ? "bg-amber-500" : "bg-error"}`}></span>
                            {service.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-on-surface-variant">
                          {formatTimestamp(service.last_checked)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-bold text-on-surface">
                            {firstMetric ? String(firstMetric[1]) : service.error || "—"}
                          </div>
                          <div className="text-[11px] uppercase tracking-widest text-on-surface-variant">
                            {firstMetric ? firstMetric[0].replace(/_/g, " ") : "error state"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="max-w-[240px] text-sm text-on-surface-variant">
                            {secondMetric ? `${secondMetric[0].replace(/_/g, " ")}: ${String(secondMetric[1])}` : "Snapshot available in drilldown"}
                          </div>
                          {service.error && <div className="mt-1 text-[11px] font-medium text-error">{service.error}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <RowPrimaryAction
                              label={selectedService === name ? "Selected" : "Inspect"}
                              icon={<Eye className="h-3.5 w-3.5" />}
                              onClick={() => setSelectedService(name)}
                            />
                            <RowActionsMenu
                              items={[
                                {
                                  key: "inspect",
                                  label: "Inspect service",
                                  icon: <Eye className="h-3.5 w-3.5" />,
                                  onSelect: () => setSelectedService(name),
                                },
                                {
                                  key: "copy",
                                  label: "Copy health summary",
                                  icon: <Copy className="h-3.5 w-3.5" />,
                                  onSelect: async () => {
                                    const summary = `${serviceTitle(name)} | ${service.status} | ${formatTimestamp(service.last_checked)}`;
                                    try {
                                      await navigator.clipboard.writeText(summary);
                                      setNotice("Resumo do serviço copiado.");
                                    } catch {
                                      setNotice(summary);
                                    }
                                  },
                                  dividerBefore: true,
                                },
                                {
                                  key: "restart",
                                  label: "Restart service",
                                  icon: <RotateCcw className="h-3.5 w-3.5" />,
                                  onSelect: () => void restartRuntimeService(name),
                                  disabled: !canRestart || busyService === name,
                                },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-sm text-on-surface-variant">
                      {loading ? "Carregando serviços..." : "Nenhum serviço operacional foi retornado."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="rounded-sm border border-outline-variant/15 bg-surface-container-lowest p-8 shadow-sm">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-on-surface">
                Resource Consumption Timeline
              </h3>
              <p className="text-xs text-on-surface-variant mt-1">
              Série derivada do snapshot atual de consumo dos serviços ativos
            </p>
          </div>
          <div className="flex gap-2">
            <span className="px-3 py-1 bg-surface-container-highest rounded text-[10px] font-bold text-on-surface-variant">
              {payload?.checked_at ? `CHECKED ${formatTimestamp(payload.checked_at)}` : "LIVE SNAPSHOT"}
            </span>
            <span className="px-3 py-1 bg-primary/10 rounded text-[10px] font-bold text-primary">
                {serviceTitle(selectedService).toUpperCase()}
            </span>
          </div>
        </div>
          <div className="h-48 w-full flex items-end justify-between gap-1.5">
            {selectedSeries.map((entry, index) => (
              <div
                key={`${entry.recordedAt}-${index}`}
                className={`${entry.height > 80 ? "bg-amber-500/60 hover:bg-amber-500/80" : "bg-primary/30 hover:bg-primary/40"} flex-1 rounded-t-sm transition-all`}
                style={{ height: `${entry.height}%` }}
                title={`${formatTimestamp(entry.recordedAt)} • ${entry.metricLabel}: ${entry.value}`}
              ></div>
            ))}
          </div>
          <div className="mt-4 flex justify-between items-center text-[11px] font-mono text-on-surface-variant opacity-60">
            <span>{selectedSeries[0] ? formatTimestamp(selectedSeries[0].recordedAt) : "T - 240 MINS"}</span>
            <div className="flex gap-12">
              <div className="flex items-center">
                <span className="w-2 h-2 bg-primary rounded-full mr-2"></span> NOMINAL
              </div>
              <div className="flex items-center">
                <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span> CONGESTION
              </div>
            </div>
            <span>{selectedSeries.at(-1) ? formatTimestamp(selectedSeries.at(-1)?.recordedAt) : "CURRENT STATUS"}</span>
          </div>
        </div>

        <div className="surface-section">
          <div className="surface-section-header">
            <h3 className="surface-section-title">Recent Infrastructure Events</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Operational stream
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant/10 text-[11px] text-on-surface-variant font-bold uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-3">TIMESTAMP</th>
                  <th className="px-6 py-3">SERVICE</th>
                  <th className="px-6 py-3">EVENT TYPE</th>
                  <th className="px-6 py-3">STATUS</th>
                  <th className="px-6 py-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {events.length > 0 ? (
                  events.map((event) => (
                    <tr key={`${event.timestamp}-${event.action}`} className="hover:bg-surface-container-low transition-colors group">
                      <td className="px-6 py-4 font-mono text-[11px] text-on-surface-variant">
                        {formatTimestamp(event.timestamp)}
                      </td>
                      <td className="px-6 py-4 font-bold text-xs">
                        {serviceTitle(event.service)}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {event.action.replace(/_/g, " ")}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[9px] font-bold ${event.result === "success" ? "bg-emerald-500/10 text-emerald-700" : event.result === "failure" ? "bg-error/10 text-error" : "bg-blue-500/10 text-blue-700"}`}>
                          {(event.result || "info").toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <RowPrimaryAction
                            label="Review"
                            icon={<Eye className="h-3.5 w-3.5" />}
                            onClick={() => {
                              setSelectedService(event.service === "runtime" ? "backend" : event.service);
                              setNotice(
                                `${serviceTitle(event.service)} / ${event.action.replace(/_/g, " ")} / ${formatTimestamp(event.timestamp)}`,
                              );
                            }}
                          />
                          <RowActionsMenu
                            items={buildSystemEventActions({
                              onReview: () =>
                                setNotice(
                                  `${serviceTitle(event.service)} / ${event.action.replace(/_/g, " ")} / ${formatTimestamp(event.timestamp)}`,
                                ),
                              onCopy: async () => {
                                const summary = `${formatTimestamp(event.timestamp)} | ${event.service} | ${event.action} | ${event.result || "info"}`;
                                try {
                                  await navigator.clipboard.writeText(summary);
                                  setNotice("Resumo do evento copiado.");
                                } catch {
                                  setNotice(summary);
                                }
                              },
                            })}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-sm text-on-surface-variant">
                      Sem eventos operacionais recentes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Healthy Services" value={String(payload?.summary.healthy || 0)} helper="Current snapshot" />
          <MetricCard label="Active Sessions" value={String(adminStats?.active_sessions || 0)} helper="Refresh tokens alive" />
          <MetricCard label="Locked Accounts" value={String(adminStats?.locked_accounts || 0)} helper="IAM security pressure" />
          <MetricCard label="API Keys" value={String(adminStats?.active_api_keys || 0)} helper="Active operator tokens" accent />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <MfaCoverageCard
            totalUsers={adminStats?.total_users ?? 0}
            usersWithMfa={adminStats?.users_with_mfa ?? 0}
            label={t("profile.security.mfa.coverageLabel")}
            helpText={t("profile.security.mfa.coverageHelp")}
          />
        </div>
        </div>

        <div className="page-side-rail-right space-y-6">
          <div className="surface-section">
            <div className="surface-section-header">
              <h3 className="surface-section-title">Service Drilldown</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <div className="text-sm font-bold text-on-surface">{serviceTitle(selectedService)}</div>
                <div className="text-[11px] uppercase tracking-widest text-on-surface-variant mt-1">
                  {selectedService}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-[10px] font-bold ${statusPill(selectedServiceSnapshot?.status || "error")}`}>
                  {(selectedServiceSnapshot?.status || "error").toUpperCase()}
                </span>
                <span className="text-[11px] text-on-surface-variant">
                  {formatTimestamp(selectedServiceSnapshot?.last_checked)}
                </span>
              </div>
              {selectedServiceSnapshot?.error && (
                <div className="rounded-sm bg-error/10 px-3 py-2 text-[11px] text-error">
                  {selectedServiceSnapshot.error}
                </div>
              )}
              <div className="space-y-3">
                {selectedServiceMetrics.length > 0 ? (
                  selectedServiceMetrics.map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-on-surface-variant uppercase tracking-widest text-[10px]">
                        {label.replace(/_/g, " ")}
                      </span>
                      <span className="font-bold text-on-surface">{String(value)}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-on-surface-variant">Nenhuma métrica numérica disponível para este serviço.</div>
                )}
              </div>
              {selectedServiceDetails.length > 0 && (
                <div className="space-y-3 border-t border-outline-variant/10 pt-4">
                  {selectedServiceDetails.slice(0, 4).map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-on-surface-variant uppercase tracking-widest text-[10px]">
                        {label.replace(/_/g, " ")}
                      </span>
                      <span className="font-medium text-on-surface text-right">{String(value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="surface-section">
            <div className="surface-section-header">
              <h3 className="surface-section-title">Operational Mix</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 px-6 py-5">
              <MetricCard label="Platform" value={String(eventCountByCategory.runtime || 0)} helper="Restarts and health actions" />
              <MetricCard label="Ingestion" value={String(eventCountByCategory.ingestion || 0)} helper="Feed controls and syncs" />
              <MetricCard label="Mailer" value={String(eventCountByCategory.mailer || 0)} helper="SMTP tests" />
              <MetricCard label="Extensions" value={String(eventCountByCategory.extensions || 0)} helper="Lifecycle transitions" />
            </div>
          </div>

          <div className="surface-section">
            <div className="surface-section-header">
              <h3 className="surface-section-title">Service Controls</h3>
            </div>
            <div className="divide-y divide-outline-variant/10">
              {restartableServices.map((service) => (
                <div key={service.key} className="flex items-center justify-between px-6 py-4">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-on-surface">{service.label}</div>
                    <div className="text-[11px] text-on-surface-variant">{service.helper}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void restartRuntimeService(service.key)}
                    disabled={busyService === service.key}
                    className="btn btn-outline"
                  >
                    <RotateCcw className={`h-4 w-4 ${busyService === service.key ? "animate-spin" : ""}`} />
                    {busyService === service.key ? "Running..." : "Restart"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildSystemEventActions({
  onReview,
  onCopy,
}: {
  onReview: () => void;
  onCopy: () => void | Promise<void>;
}): RowActionItem[] {
  return [
    {
      key: "review",
      label: "Review event context",
      icon: <Eye className="h-3.5 w-3.5" />,
      onSelect: onReview,
    },
    {
      key: "copy",
      label: "Copy event summary",
      icon: <Copy className="h-3.5 w-3.5" />,
      onSelect: () => void onCopy(),
      dividerBefore: true,
    },
  ];
}

function MetricCard({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: string;
  helper: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface-container-lowest p-6 rounded-sm border border-outline-variant/15 flex flex-col justify-between shadow-sm">
      <p className="text-[11px] text-on-surface-variant uppercase tracking-widest font-bold">{label}</p>
      <p className={`text-2xl font-black ${accent ? "text-primary" : "text-on-surface"}`}>{value}</p>
      <div className="flex items-center gap-1 text-[10px] font-bold text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-sm w-fit mt-2">
        <ShieldCheck className="w-3 h-3" />
        <span>{helper}</span>
      </div>
    </div>
  );
}

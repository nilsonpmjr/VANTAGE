import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Radar,
  AlertTriangle,
  Plug,
  TrendingUp,
  ShieldCheck,
  Crosshair,
  Copy,
  Eye,
  History,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import API_URL from "../config";
import { PageHeader, PageMetricPill, PageToolbar, PageToolbarGroup } from "../components/page/PageChrome";
import { useLanguage } from "../context/LanguageContext";
import { RowActionsMenu, RowPrimaryAction, type RowActionItem } from "../components/RowActions";

interface StatsPayload {
  totalScans: number;
  verdictDistribution: Array<{ name: string; value: number }>;
  topTargets: Array<{ target: string; type: string; count: number; verdict: string }>;
  threatTrends: Array<{ date: string; total: number; malicious: number }>;
  topThreatTypes: Array<{ name: string; value: number }>;
  recentScans: RecentScanItem[];
  criticalIncidents: Array<{ target: string; verdict: string; type: string; timestamp: string }>;
  workerHealth?: { status?: string; last_run?: string; altered_targets?: number };
  reconTotal: number;
  recentReconJobs: Array<{
    job_id: string;
    target: string;
    status: string;
    analyst: string;
    created_at: string;
    completed_at?: string | null;
    modules?: string[];
  }>;
}

interface RecentScanItem {
  target: string;
  type?: string;
  verdict?: string;
  timestamp?: string;
  analyst?: string;
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

function verdictBadge(status?: string) {
  if (status === "HIGH RISK" || status === "CRITICAL") {
    return "badge-error";
  }
  if (status === "SUSPICIOUS") {
    return "badge-warning";
  }
  return "badge-primary";
}

function trendColorClass(item: string) {
  if (item.includes("CRITICAL") || item.includes("critical")) return "text-error";
  if (item.includes("%")) return "text-primary";
  return "text-on-surface-variant";
}

export default function Dashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [period, setPeriod] = useState("month");
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [historyScans, setHistoryScans] = useState<RecentScanItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const activeView = searchParams.get("view") === "history" ? "history" : "overview";
  const HISTORY_PAGE_SIZE = 20;
  const criticalIncidentCount = stats?.criticalIncidents?.length || 0;
  const workerStatusLabel = stats?.workerHealth?.status || "unknown";

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`${API_URL}/api/stats?period=${period}&limit=8`, {
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("stats_load_failed");
        }
        const payload = (await response.json()) as StatsPayload;
        if (!cancelled) {
          setStats(payload);
        }
      } catch {
        if (!cancelled) {
          setError("Não foi possível carregar a visão geral operacional.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, [period]);

  useEffect(() => {
    setHistoryPage(1);
  }, [period, activeView]);

  useEffect(() => {
    if (activeView !== "history") return;

    let cancelled = false;

    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const skip = (historyPage - 1) * HISTORY_PAGE_SIZE;
        const response = await fetch(
          `${API_URL}/api/stats?period=${period}&limit=${HISTORY_PAGE_SIZE}&skip=${skip}`,
          { credentials: "include" },
        );
        if (!response.ok) {
          throw new Error("history_load_failed");
        }
        const payload = (await response.json()) as StatsPayload;
        if (!cancelled) {
          setHistoryScans(payload.recentScans || []);
        }
      } catch {
        if (!cancelled) {
          setError("Não foi possível carregar o histórico geral de pesquisas.");
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [activeView, historyPage, period]);

  const totalCritical = stats?.criticalIncidents?.length || 0;

  const activeModules = useMemo(() => {
    const modules = new Set<string>();
    for (const job of stats?.recentReconJobs || []) {
      for (const module of job.modules || []) {
        modules.add(module);
      }
    }
    return modules.size;
  }, [stats]);

  const maxThreatTypeValue = useMemo(
    () => Math.max(...(stats?.topThreatTypes || [{ value: 1 }]).map((row) => row.value), 1),
    [stats],
  );
  const totalHistoryPages = Math.max(1, Math.ceil((stats?.totalScans || 0) / HISTORY_PAGE_SIZE));

  async function copyArtifact(target: string) {
    try {
      await navigator.clipboard.writeText(target);
    } catch {
      setError(`Unable to copy artifact: ${target}`);
    }
  }

  function buildArtifactActions(target: string): RowActionItem[] {
    return [
      {
        key: "open-report",
        label: "Open analysis report",
        icon: <Eye className="h-3.5 w-3.5" />,
        onSelect: () => navigate(`/analyze/${encodeURIComponent(target)}`),
      },
      {
        key: "copy-artifact",
        label: "Copy artifact",
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => void copyArtifact(target),
      },
    ];
  }

  function openAnalysis(target: string) {
    localStorage.setItem("lastSearch", target);
    navigate(`/analyze/${encodeURIComponent(target)}`);
  }


  const metricCards = [
    {
      title: "Total Scans",
      value: stats ? new Intl.NumberFormat("pt-BR").format(stats.totalScans) : "—",
      trend: `${stats?.recentScans?.length || 0} ITEMS IN CURRENT VIEW`,
      icon: Radar,
      color: "card-accent-primary",
      surfaceClass: "bg-primary/10",
      iconClass: "text-primary",
    },
    {
      title: "Threats Detected",
      value: new Intl.NumberFormat("pt-BR").format(totalCritical),
      trend:
        totalCritical > 0
          ? "CRITICAL ACTION REQUIRED"
          : "NO CRITICAL INCIDENTS IN CURRENT WINDOW",
      icon: AlertTriangle,
      color: "card-accent-error",
      surfaceClass: "bg-error/10",
      iconClass: "text-error",
    },
    {
      title: "Active Modules",
      value: `${activeModules} / 24`,
      trend: `RECON ENGINE OPERATIONAL STATUS: ${Math.min(
        100,
        Math.round((activeModules / 24) * 100),
      )}%`,
      icon: Plug,
      color: "card-accent-secondary",
      surfaceClass: "bg-surface-container-low",
      iconClass: "text-secondary",
    },
  ];

  return (
    <div className="page-frame space-y-8">
      <PageHeader
        eyebrow={t("dashboard.eyebrow", "Observability")}
        title={t("dashboard.title", "Operational Overview")}
        description={t("dashboard.subtitle", "Telemetria de risco, incidentes recentes e throughput da plataforma em uma única superfície de observabilidade.")}
        metrics={
          <>
            <PageMetricPill
              label={`${stats?.totalScans || 0} ${t("dashboard.totalSearches", "total searches")}`}
              dotClassName="bg-primary"
              tone="primary"
            />
            <PageMetricPill
              label={`${criticalIncidentCount} ${criticalIncidentCount === 1 ? "critical incident" : "critical incidents"}`}
              dotClassName={criticalIncidentCount > 0 ? "bg-error" : "bg-emerald-500"}
              tone={criticalIncidentCount > 0 ? "danger" : "success"}
            />
            <PageMetricPill
              label={`Worker ${String(workerStatusLabel).toUpperCase()}`}
              dotClassName={workerStatusLabel === "healthy" ? "bg-emerald-500" : workerStatusLabel === "degraded" ? "bg-amber-500" : "bg-secondary"}
            />
          </>
        }
      />

      <PageToolbar label={t("dashboard.timeWindow", "Time window")}>
        <PageToolbarGroup compact>
          {["day", "week", "month"].map((item) => (
            <button
              key={item}
              onClick={() => setPeriod(item)}
              className={`btn ${period === item ? "btn-primary" : "btn-ghost"}`}
            >
              {item.toUpperCase()}
            </button>
          ))}
        </PageToolbarGroup>
        <PageToolbarGroup>
          <div className="nav-pills">
            <button
              className={`nav-pill-item px-6 ${activeView === "overview" ? "nav-pill-item-active" : "nav-pill-item-inactive"}`}
              onClick={() => setSearchParams({}, { replace: true })}
            >
              {t("dashboard.overview", "Overview")}
            </button>
            <button
              className={`nav-pill-item px-6 ${activeView === "history" ? "nav-pill-item-active" : "nav-pill-item-inactive"}`}
              onClick={() => setSearchParams({ view: "history" }, { replace: true })}
            >
              {t("dashboard.fullHistory", "Full History")}
            </button>
          </div>
        </PageToolbarGroup>
      </PageToolbar>

      {error && (
        <div className="rounded bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
      )}

      {loading ? (
        <div className="card p-8 text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
          {t("dashboard.loading", "Loading dashboard telemetry")}
        </div>
      ) : activeView === "history" ? (
        <section className="surface-section overflow-hidden">
          <div className="surface-section-header">
            <div>
              <h2 className="surface-section-title uppercase">{t("dashboard.searchHistory", "Search History")}</h2>
              <p className="mt-1 text-[10px] font-medium text-on-surface-variant">
                Página {historyPage} de {totalHistoryPages} no período selecionado
              </p>
            </div>
            <div className="summary-strip">
              <div className="summary-pill">
                <History className="h-4 w-4 text-primary" />
                {stats?.totalScans || 0} {t("dashboard.totalSearches", "total searches")}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low text-[10px] font-black text-on-surface-variant uppercase tracking-wider">
                  <th className="px-6 py-3">{t("dashboard.analyst", "Analyst")}</th>
                  <th className="px-6 py-3">{t("dashboard.dateTime", "Date / Time")}</th>
                  <th className="px-6 py-3">{t("dashboard.artifact", "Artifact")}</th>
                  <th className="px-6 py-3">{t("dashboard.type", "Type")}</th>
                  <th className="px-6 py-3">{t("dashboard.verdict", "Verdict")}</th>
                  <th className="px-6 py-3 text-right">{t("dashboard.actions", "Actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {historyLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-sm text-on-surface-variant">
                      {t("dashboard.loadingHistory", "Loading search history")}
                    </td>
                  </tr>
                ) : historyScans.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-sm text-on-surface-variant">
                      {t("dashboard.noHistory", "Nenhuma pesquisa encontrada para esta janela.")}
                    </td>
                  </tr>
                ) : (
                  historyScans.map((scan, index) => (
                    <tr key={`${scan.target}-${scan.timestamp || index}`} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-6 py-3 text-xs text-on-surface">
                        {scan.analyst || "system"}
                      </td>
                      <td className="px-6 py-3 text-xs text-on-surface-variant">
                        {formatTimestamp(scan.timestamp)}
                      </td>
                      <td className="px-6 py-3">
                        <button
                          type="button"
                          onClick={() => openAnalysis(scan.target)}
                          className="text-left text-xs font-mono font-medium text-primary hover:underline"
                          title={scan.target}
                        >
                          {scan.target}
                        </button>
                      </td>
                      <td className="px-6 py-3 text-[11px] text-on-surface-variant font-bold uppercase">
                        {scan.type || "artifact"}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${verdictBadge(scan.verdict)}`}>
                          {scan.verdict || "UNKNOWN"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <RowPrimaryAction
                            label={t("dashboard.inspect", "Inspect")}
                            icon={<Eye className="h-3.5 w-3.5" />}
                            onClick={() => openAnalysis(scan.target)}
                          />
                          <RowActionsMenu items={buildArtifactActions(scan.target)} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-auto bg-surface-container px-6 py-3 border-t border-outline-variant/30 flex justify-between items-center">
            <span className="text-[0.6875rem] font-medium text-on-surface-variant uppercase tracking-widest">
              {t("dashboard.showingSearches", "Showing")} {historyScans.length} {t("dashboard.of", "of")} {stats?.totalScans || 0} {t("dashboard.searches", "searches")}
            </span>
            <div className="flex items-center gap-4">
              <button
                className="text-on-surface-variant hover:text-primary transition-colors disabled:opacity-30"
                disabled={historyPage === 1}
                onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-[0.75rem] font-bold text-on-surface">
                {t("dashboard.page", "Page")} {historyPage} {t("dashboard.of", "of")} {totalHistoryPages}
              </span>
              <button
                className="text-on-surface-variant hover:text-primary transition-colors disabled:opacity-30"
                disabled={historyPage >= totalHistoryPages}
                onClick={() => setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {metricCards.map((item) => (
              <div key={item.title}>
                <MetricCard
                  title={item.title}
                  value={item.value}
                  trend={item.trend}
                  icon={item.icon}
                  color={item.color}
                  surfaceClass={item.surfaceClass}
                  iconClass={item.iconClass}
                  trendColor={trendColorClass(item.trend)}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 card flex flex-col">
              <div className="card-header">
                <h3 className="card-title">Case Verdict Distribution</h3>
              </div>
              <div className="flex-1 p-8 flex items-center justify-center gap-8">
                <DonutChart
                  data={stats?.verdictDistribution || []}
                  total={stats?.totalScans || 0}
                />
                <div className="space-y-4">
                  {(stats?.verdictDistribution || []).map((item) => (
                    <div key={item.name}>
                      <LegendItem
                        color={
                          item.name === "HIGH RISK" || item.name === "CRITICAL"
                            ? "bg-error"
                            : item.name === "SUSPICIOUS"
                              ? "bg-secondary"
                              : "bg-primary"
                        }
                        label={item.name}
                        value={`${item.value}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 card flex flex-col">
              <div className="card-header flex justify-between items-center">
                <h3 className="card-title">7-Day Threat Trend Analysis</h3>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary"></div>
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase">
                      Attempts
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-error"></div>
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase">
                      Breaches
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex-1 p-6 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats?.threatTrends || []}
                    margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorAttempts" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="var(--color-primary)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-primary)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient id="colorBreaches" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="var(--color-error)"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-error)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fontSize: 10,
                        fontWeight: "bold",
                        fill: "var(--color-on-surface-variant)",
                      }}
                      dy={10}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-surface-container-lowest)",
                        border: "1px solid var(--color-outline-variant)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorAttempts)"
                    />
                    <Area
                      type="monotone"
                      dataKey="malicious"
                      stroke="var(--color-error)"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorBreaches)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card flex flex-col">
              <div className="card-header">
                <h3 className="card-title">Top Threat Typologies</h3>
              </div>
              <div className="p-6 space-y-6">
                {(stats?.topThreatTypes || []).slice(0, 4).map((item) => (
                  <div key={item.name}>
                    <ProgressBar
                      label={item.name}
                      value={`${item.value} Events`}
                      percent={`${Math.round((item.value / maxThreatTypeValue) * 100)}%`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="card flex flex-col">
              <div className="card-header">
                <h3 className="card-title">Top 5 Dangerous Artifacts</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-container-low text-[10px] font-black text-on-surface-variant uppercase tracking-wider">
                      <th className="px-6 py-3">Artifact ID</th>
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3">Search Count</th>
                      <th className="px-6 py-3">Risk Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {(stats?.topTargets || []).slice(0, 5).map((item) => (
                      <tr
                        key={`${item.target}-${item.type}`}
                        className="hover:bg-surface-container-low transition-colors"
                      >
                        <td className="px-6 py-3">
                          <button
                            type="button"
                            onClick={() => openAnalysis(item.target)}
                            className="text-left text-xs font-mono font-medium text-primary hover:underline"
                            title={item.target}
                          >
                            {item.target}
                          </button>
                        </td>
                        <td className="px-6 py-3 text-[11px] text-on-surface-variant font-bold uppercase">
                          {item.type}
                        </td>
                        <td className="px-6 py-3 text-xs text-on-surface">{item.count}</td>
                        <td className="px-6 py-3">
                          <span className={`badge ${verdictBadge(item.verdict)}`}>
                            {item.verdict}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <RowPrimaryAction
                              label="Inspect"
                              icon={<Eye className="h-3.5 w-3.5" />}
                              onClick={() => openAnalysis(item.target)}
                            />
                            <RowActionsMenu items={buildArtifactActions(item.target)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <InsightCard
              icon={AlertTriangle}
              badge="Urgent Review"
              badgeClass="badge badge-error"
              title="Threat Concentration"
              description={`${totalCritical} critical incidents are active in the selected window.`}
              meta={
                stats?.workerHealth?.status
                  ? `Worker Status: ${stats.workerHealth.status}`
                  : "Worker status unavailable"
              }
              action={t("dashboard.inspectIncidents", "Inspect incidents")}
              onAction={() => navigate("/notifications?tab=critical")}
            />
            <InsightCard
              icon={ShieldCheck}
              badge="Intelligence"
              badgeClass="badge badge-primary"
              title="Watchlist Exposure"
              description={`${stats?.topTargets?.length || 0} recurrent targets dominate analyst demand.`}
              meta={`Recent scans loaded: ${stats?.recentScans?.length || 0}`}
              action={t("dashboard.reviewTargets", "Review targets")}
              onAction={() => navigate("/watchlist")}
            />
            <InsightCard
              icon={Crosshair}
              badge="Recon"
              badgeClass="badge badge-neutral"
              title="Recon Throughput"
              description={`${stats?.reconTotal || 0} recon jobs were registered in the selected period.`}
              meta={`Active module spread: ${activeModules}`}
              action={t("dashboard.openRecon", "Open recon")}
              onAction={() => navigate("/recon")}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  trend,
  icon: Icon,
  color,
  surfaceClass,
  iconClass,
  trendColor,
}: {
  title: string;
  value: string;
  trend: string;
  icon: typeof Radar;
  color: string;
  surfaceClass: string;
  iconClass: string;
  trendColor: string;
}) {
  return (
    <div className={`card p-5 card-accent-left ${color} ${surfaceClass} flex flex-col justify-between h-32`}>
      <div className="flex justify-between items-start">
        <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
          {title}
        </span>
        <Icon className={`w-5 h-5 ${iconClass}`} />
      </div>
      <div>
        <div className="text-3xl font-black text-on-surface tracking-tight">{value}</div>
        <div className={`text-[10px] flex items-center gap-1 mt-1 font-semibold ${trendColor}`}>
          <TrendingUp className="w-3 h-3" />
          {trend}
        </div>
      </div>
    </div>
  );
}

function LegendItem({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-3 h-3 ${color}`}></div>
      <div>
        <p className="text-xs font-bold leading-none">{label}</p>
        <p className="text-[10px] text-on-surface-variant mt-1">{value}</p>
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] font-bold uppercase">
        <span className="text-on-surface">{label}</span>
        <span className="text-on-surface-variant">{value}</span>
      </div>
      <div className="w-full h-2 bg-surface-container">
        <div className="h-full bg-primary" style={{ width: percent }}></div>
      </div>
    </div>
  );
}

const DONUT_R = 35;
const DONUT_CX = 50;
const DONUT_CY = 50;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;
const DONUT_STROKE = 14;
const DONUT_COLOR_MAP: Record<string, string> = {
  SAFE: "var(--color-primary)",
  SUSPICIOUS: "var(--color-secondary)",
  "HIGH RISK": "var(--color-error)",
  CRITICAL: "var(--color-error)",
};

function DonutChart({
  data,
  total,
}: {
  data: Array<{ name: string; value: number }>;
  total: number;
}) {
  const actualTotal = Math.max(total, 1);
  let cumulativeAngle = -90;

  const segments = data.map((item) => {
    const fraction = item.value / actualTotal;
    const arc = fraction * DONUT_CIRC;
    const rotate = cumulativeAngle;
    cumulativeAngle += fraction * 360;
    return { name: item.name, arc, gap: DONUT_CIRC - arc, rotate };
  });

  return (
    <div className="relative w-48 h-48 flex items-center justify-center shrink-0">
      <svg
        width="192"
        height="192"
        viewBox="0 0 100 100"
        className="absolute inset-0"
        aria-hidden="true"
      >
        {/* Track ring */}
        <circle
          cx={DONUT_CX}
          cy={DONUT_CY}
          r={DONUT_R}
          fill="none"
          stroke="var(--color-surface-container)"
          strokeWidth={DONUT_STROKE}
        />
        {/* Segments */}
        {segments.map((seg) => (
          <circle
            key={seg.name}
            cx={DONUT_CX}
            cy={DONUT_CY}
            r={DONUT_R}
            fill="none"
            stroke={DONUT_COLOR_MAP[seg.name] ?? "var(--color-secondary)"}
            strokeWidth={DONUT_STROKE}
            strokeDasharray={`${seg.arc} ${seg.gap}`}
            strokeLinecap="butt"
            transform={`rotate(${seg.rotate} ${DONUT_CX} ${DONUT_CY})`}
          />
        ))}
      </svg>
      <div className="relative z-10 text-center">
        <span className="block text-2xl font-black text-on-surface">
          {new Intl.NumberFormat("pt-BR").format(total)}
        </span>
        <span className="text-[10px] text-on-surface-variant font-bold uppercase">
          Evaluated
        </span>
      </div>
    </div>
  );
}

function InsightCard({
  icon: Icon,
  badge,
  badgeClass,
  title,
  description,
  meta,
  action,
  onAction,
}: {
  icon: typeof Radar;
  badge: string;
  badgeClass: string;
  title: string;
  description: string;
  meta: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="card p-5 card-accent-left card-accent-primary">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-primary-container/20 rounded-sm">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <span className={badgeClass}>{badge}</span>
      </div>
      <h4 className="text-[0.875rem] font-extrabold text-on-surface uppercase tracking-tight mb-2">
        {title}
      </h4>
      <p className="text-[0.75rem] text-on-surface-variant leading-relaxed">{description}</p>
      <div className="mt-4 pt-4 border-t border-outline-variant/10 flex justify-between items-center">
        <span className="text-[0.625rem] font-mono text-on-surface-variant">{meta}</span>
        <button type="button" onClick={onAction} className="text-primary text-[0.75rem] font-bold hover:underline">
          {action}
        </button>
      </div>
    </div>
  );
}

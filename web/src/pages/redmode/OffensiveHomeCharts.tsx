import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, CircleOff, FileWarning } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import type { OffensiveHomeSummary } from "./api";

type HomeCharts = OffensiveHomeSummary["charts"];

const PHASE_KEYS: Record<string, string> = {
  "pre-engagement": "preEngagement",
  reconnaissance: "reconnaissance",
  "threat-modeling": "threatModeling",
  "vulnerability-analysis": "vulnerabilityAnalysis",
  exploitation: "exploitation",
  "post-exploitation": "postExploitation",
  reporting: "reporting",
};

const PHASE_FALLBACKS: Record<string, string> = {
  "pre-engagement": "Pre-engagement",
  reconnaissance: "Reconnaissance",
  "threat-modeling": "Threat modeling",
  "vulnerability-analysis": "Vulnerability analysis",
  exploitation: "Exploitation",
  "post-exploitation": "Post-exploitation",
  reporting: "Reporting",
};

const SEVERITY_COLORS: Record<string, string> = {
  informational: "#94a3b8",
  low: "#38bdf8",
  medium: "#fbbf24",
  high: "#fb923c",
  critical: "var(--color-error)",
};

const SEVERITY_FALLBACKS: Record<string, string> = {
  informational: "Informational",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
      <CircleOff className="h-8 w-8 text-outline" />
      <p className="mt-3 max-w-sm text-sm text-on-surface-variant">{message}</p>
    </div>
  );
}

export default function OffensiveHomeCharts({ charts }: { charts: HomeCharts }) {
  const { t, locale } = useLanguage();
  const phaseData = charts.ptes_pipeline.map((item) => ({
    ...item,
    label: t(
      `offensive.home.phases.${PHASE_KEYS[item.phase] || item.phase}`,
      PHASE_FALLBACKS[item.phase] || item.phase,
    ),
  }));
  const severityData = charts.finding_severity.map((item) => ({
    ...item,
    label: t(`offensive.home.severities.${item.severity}`, SEVERITY_FALLBACKS[item.severity] || item.severity),
    color: SEVERITY_COLORS[item.severity] || "var(--color-secondary)",
  }));
  const engagementTotal = phaseData.reduce((total, item) => total + item.count, 0);
  const findingTotal = severityData.reduce((total, item) => total + item.count, 0);
  const scopeTotal = charts.scope_readiness.with_active_scope + charts.scope_readiness.without_active_scope;
  const activityTotals = charts.activity_30d.reduce(
    (totals, item) => ({
      evidence: totals.evidence + item.evidence,
      findings: totals.findings + item.findings,
      scope: totals.scope + item.scope_publications,
      total: totals.total + item.total,
    }),
    { evidence: 0, findings: 0, scope: 0, total: 0 },
  );
  const formatActivityDate = (value: string) => new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00Z`));
  const withScopeWidth = scopeTotal
    ? `${(charts.scope_readiness.with_active_scope / scopeTotal) * 100}%`
    : "0%";
  const withoutScopeWidth = scopeTotal
    ? `${(charts.scope_readiness.without_active_scope / scopeTotal) * 100}%`
    : "0%";

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-12" aria-label={t("offensive.home.chartsLabel", "Operational charts")}>
      <article className="card overflow-hidden lg:col-span-7">
        <header className="card-header block">
          <h2 className="card-title">{t("offensive.home.pipelineTitle", "PTES pipeline")}</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            {t("offensive.home.pipelineDescription", "Accessible engagements by current phase, without inferred completion.")}
          </p>
        </header>
        {engagementTotal === 0 ? (
          <EmptyChart message={t("offensive.home.noPipelineData", "No accessible engagement is available for the pipeline.")} />
        ) : (
          <div className="h-[22rem] px-3 py-5 sm:px-5" aria-label={t("offensive.home.pipelineChartLabel", "Engagements per PTES phase")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={phaseData} layout="vertical" margin={{ top: 0, right: 28, left: 8, bottom: 0 }}>
                <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--color-on-surface-variant)", fontSize: 11 }} />
                <YAxis dataKey="label" type="category" width={130} axisLine={false} tickLine={false} tick={{ fill: "var(--color-on-surface-variant)", fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: "var(--color-surface-container-low)" }}
                  contentStyle={{
                    background: "var(--color-surface-container-lowest)",
                    border: "1px solid var(--color-outline-variant)",
                    color: "var(--color-on-surface)",
                  }}
                />
                <Bar
                  dataKey="count"
                  name={t("offensive.home.engagements", "Engagements")}
                  fill="var(--color-primary)"
                  radius={[0, 3, 3, 0]}
                  label={{ position: "right", fill: "var(--color-on-surface)", fontSize: 11 }}
                />
              </BarChart>
            </ResponsiveContainer>
            <ul className="sr-only">
              {phaseData.map((item) => <li key={item.phase}>{item.label}: {item.count}</li>)}
            </ul>
          </div>
        )}
        <p className="border-t border-outline-variant/20 px-6 py-3 text-xs text-on-surface-variant">
          {engagementTotal} {engagementTotal === 1
            ? t("offensive.home.pipelineSummaryOne", "accessible engagement represented across the PTES phases.")
            : t("offensive.home.pipelineSummaryMany", "accessible engagements represented across the PTES phases.")}
        </p>
      </article>

      <article className="card overflow-hidden lg:col-span-5">
        <header className="card-header block">
          <h2 className="card-title">{t("offensive.home.findingsTitle", "Finding posture")}</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            {t("offensive.home.findingsDescription", "Severity of each finding's current revision.")}
          </p>
        </header>
        {findingTotal === 0 ? (
          <EmptyChart message={t("offensive.home.noFindingData", "No current finding is available for this distribution.")} />
        ) : (
          <div className="grid min-h-56 grid-cols-1 items-center gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="h-52" aria-label={t("offensive.home.findingChartLabel", "Current findings by severity")}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={severityData.filter((item) => item.count > 0)}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={55}
                    outerRadius={82}
                    paddingAngle={2}
                    stroke="var(--color-surface-container-lowest)"
                    strokeWidth={2}
                  >
                    {severityData.filter((item) => item.count > 0).map((item) => (
                      <Cell key={item.severity} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-surface-container-lowest)",
                      border: "1px solid var(--color-outline-variant)",
                      color: "var(--color-on-surface)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2.5">
              {severityData.map((item) => (
                <li key={item.severity} className="flex items-center justify-between gap-4 text-xs">
                  <span className="flex items-center gap-2 text-on-surface-variant">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.label}
                  </span>
                  <strong className="font-mono text-on-surface">{item.count}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="border-t border-outline-variant/20 px-6 py-3 text-xs text-on-surface-variant">
          {findingTotal} {findingTotal === 1
            ? t("offensive.home.findingsSummaryOne", "current finding revision represented.")
            : t("offensive.home.findingsSummaryMany", "current finding revisions represented.")}
        </p>
      </article>

      <article className="card overflow-hidden lg:col-span-7">
        <header className="card-header block">
          <h2 className="card-title">{t("offensive.home.activityTitle", "30-day operational activity")}</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            {t("offensive.home.activityDescription", "Daily UTC buckets displayed in your browser's time zone.")}
          </p>
        </header>
        {activityTotals.total === 0 ? (
          <EmptyChart message={t("offensive.home.noActivityData", "No evidence, finding, or scope publication was recorded in this period.")} />
        ) : (
          <div className="p-5">
            <div className="flex flex-wrap gap-x-5 gap-y-2 pb-4 text-xs text-on-surface-variant">
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-primary" />{t("offensive.home.activityEvidence", "Evidence")} · {activityTotals.evidence}</span>
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />{t("offensive.home.activityFindings", "Findings")} · {activityTotals.findings}</span>
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />{t("offensive.home.activityScopes", "Scope publications")} · {activityTotals.scope}</span>
            </div>
            <div className="h-64" aria-label={t("offensive.home.activityChartLabel", "Daily operational activity over 30 days")}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.activity_30d} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="offensiveEvidence" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="offensiveFindings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="offensiveScopes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                    tickFormatter={formatActivityDate}
                    tick={{ fill: "var(--color-on-surface-variant)", fontSize: 10 }}
                  />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--color-on-surface-variant)", fontSize: 10 }} />
                  <Tooltip
                    labelFormatter={(value) => formatActivityDate(String(value))}
                    contentStyle={{
                      background: "var(--color-surface-container-lowest)",
                      border: "1px solid var(--color-outline-variant)",
                      color: "var(--color-on-surface)",
                    }}
                  />
                  <Area type="monotone" dataKey="evidence" name={t("offensive.home.activityEvidence", "Evidence")} stroke="var(--color-primary)" fill="url(#offensiveEvidence)" strokeWidth={2} />
                  <Area type="monotone" dataKey="findings" name={t("offensive.home.activityFindings", "Findings")} stroke="#f59e0b" fill="url(#offensiveFindings)" strokeWidth={2} />
                  <Area type="monotone" dataKey="scope_publications" name={t("offensive.home.activityScopes", "Scope publications")} stroke="#10b981" fill="url(#offensiveScopes)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
              <ul className="sr-only">
                {charts.activity_30d.map((item) => (
                  <li key={item.date}>
                    {formatActivityDate(item.date)}: {item.evidence} {t("offensive.home.activityEvidence", "Evidence")}, {item.findings} {t("offensive.home.activityFindings", "Findings")}, {item.scope_publications} {t("offensive.home.activityScopes", "Scope publications")}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <p className="border-t border-outline-variant/20 px-6 py-3 text-xs text-on-surface-variant">
          {activityTotals.total} {activityTotals.total === 1
            ? t("offensive.home.activitySummaryOne", "operational event in the last 30 days.")
            : t("offensive.home.activitySummaryMany", "operational events in the last 30 days.")}
        </p>
      </article>

      <article className="card overflow-hidden lg:col-span-5 lg:col-start-8">
        <header className="card-header block">
          <h2 className="card-title">{t("offensive.home.scopeReadinessTitle", "Scope readiness")}</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            {t("offensive.home.scopeReadinessDescription", "Active engagements with and without an active scope.")}
          </p>
        </header>
        {scopeTotal === 0 ? (
          <EmptyChart message={t("offensive.home.noScopeData", "No active engagement is available for scope readiness.")} />
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-sm bg-surface-container-low p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <p className="mt-3 text-2xl font-black text-on-surface">{charts.scope_readiness.with_active_scope}</p>
                <p className="mt-1 text-xs text-on-surface-variant">{t("offensive.home.withActiveScope", "With active scope")}</p>
              </div>
              <div className="rounded-sm bg-surface-container-low p-4">
                <FileWarning className="h-5 w-5 text-amber-500" />
                <p className="mt-3 text-2xl font-black text-on-surface">{charts.scope_readiness.without_active_scope}</p>
                <p className="mt-1 text-xs text-on-surface-variant">{t("offensive.home.withoutActiveScope", "Without active scope")}</p>
              </div>
            </div>
            <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-surface-container" aria-hidden="true">
              <span className="bg-emerald-500" style={{ width: withScopeWidth }} />
              <span className="bg-amber-500" style={{ width: withoutScopeWidth }} />
            </div>
          </div>
        )}
      </article>
    </section>
  );
}

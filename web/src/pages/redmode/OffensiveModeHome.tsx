import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  Crosshair,
  FileWarning,
  Plus,
  ShieldAlert,
} from "lucide-react";
import { PageHeader } from "../../components/page/PageChrome";
import { useLanguage } from "../../context/LanguageContext";
import { getOffensiveHome, type OffensiveHomeSummary } from "./api";
import OffensiveHomeCharts from "./OffensiveHomeCharts";
import OffensiveHomeDetails from "./OffensiveHomeDetails";

function MetricCard({ icon, label, value, detail }: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="card p-5" aria-label={`${label}: ${value}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-on-surface-variant">
            {label}
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight text-on-surface">{value}</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary/10 text-primary">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-on-surface-variant">{detail}</p>
    </article>
  );
}

export default function OffensiveModeHome() {
  const { t, locale } = useLanguage();
  const [summary, setSummary] = useState<OffensiveHomeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSummary(await getOffensiveHome());
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "";
      setError(detail === "permission_required:redmode:access" ? "access" : "load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "—"
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };

  return (
    <div className="page-frame max-w-7xl">
      <PageHeader
        eyebrow={<><Crosshair className="h-4 w-4" /> RED TEAM / OFFENSIVE MODE</>}
        title={t("offensive.home.title", "Offensive Mode")}
        description={t(
          "offensive.home.description",
          "Prioritize authorized engagements, scope readiness, findings, and recent operational activity.",
        )}
        actions={(
          <Link to="/redmode/engagements?create=1" className="btn btn-primary">
            <Plus className="h-4 w-4" />
            {t("offensive.home.createEngagement", "Create engagement")}
          </Link>
        )}
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label={t("offensive.home.loading", "Loading Offensive Mode Home")}>
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="card h-36 animate-pulse bg-surface-container-low" />
          ))}
        </div>
      ) : error ? (
        <section className="card p-8 text-center" role="alert">
          <ShieldAlert className="mx-auto h-8 w-8 text-error" />
          <h2 className="mt-4 text-lg font-bold text-on-surface">
            {error === "access"
              ? t("offensive.home.accessDeniedTitle", "Offensive Mode access is unavailable")
              : t("offensive.home.errorTitle", "The operational summary could not be loaded")}
          </h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            {error === "access"
              ? t("offensive.home.accessDeniedBody", "Return to the SOC or ask an administrator to review your access.")
              : t("offensive.home.errorBody", "Check the connection and try loading the Home again.")}
          </p>
          {error !== "access" && (
            <button type="button" className="btn btn-outline mt-5" onClick={() => void loadSummary()}>
              {t("offensive.home.retry", "Try again")}
            </button>
          )}
        </section>
      ) : summary ? (
        <>
          {summary.resume ? (
            <section className="card overflow-hidden">
              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="p-6 lg:p-8">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                    {t("offensive.home.continueEyebrow", "Continue engagement")}
                  </p>
                  <h2 className="mt-3 text-2xl font-black tracking-tight text-on-surface">
                    {summary.resume.display_name}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-on-surface-variant">{summary.resume.slug}</p>
                  <dl className="mt-6 grid gap-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-outline">{t("offensive.home.phase", "Phase")}</dt>
                      <dd className="mt-1 text-sm font-semibold text-on-surface">{summary.resume.phase}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-outline">{t("offensive.home.responsible", "Responsible")}</dt>
                      <dd className="mt-1 text-sm font-semibold text-on-surface">{summary.resume.responsible}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-outline">{t("offensive.home.lastActivity", "Last activity")}</dt>
                      <dd className="mt-1 text-sm font-semibold text-on-surface">{formatDate(summary.resume.last_activity_at)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="flex flex-col justify-between border-t border-outline-variant/20 bg-surface-container-low p-6 lg:border-l lg:border-t-0">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-outline">{t("offensive.home.activeScope", "Active scope")}</p>
                    <p className="mt-2 text-sm font-bold text-on-surface">
                      {summary.resume.active_scope
                        ? `${t("offensive.home.version", "Version")} ${summary.resume.active_scope.id.slice(0, 8)}`
                        : t("offensive.home.noActiveScope", "No active scope")}
                    </p>
                    {summary.resume.active_scope && (
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {formatDate(summary.resume.active_scope.created_at)} · {summary.resume.active_scope.author}
                      </p>
                    )}
                  </div>
                  <Link
                    to={`/redmode/engagements/${encodeURIComponent(summary.resume.slug)}`}
                    className="btn btn-primary mt-6 w-full"
                  >
                    {t("offensive.home.continueCta", "Open engagement")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </section>
          ) : (
            <section className="card p-8 text-center">
              <BriefcaseBusiness className="mx-auto h-9 w-9 text-primary" />
              <h2 className="mt-4 text-xl font-bold text-on-surface">
                {t("offensive.home.emptyTitle", "No accessible engagements yet")}
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-on-surface-variant">
                {t("offensive.home.emptyBody", "Open the Engagements area to find available work or create the first engagement for your team.")}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link to="/redmode/engagements" className="btn btn-outline">
                  {t("offensive.home.openEngagements", "Open Engagements")}
                </Link>
                <Link to="/redmode/engagements?create=1" className="btn btn-primary">
                  {t("offensive.home.createFirst", "Create first engagement")}
                </Link>
              </div>
            </section>
          )}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={<BriefcaseBusiness className="h-5 w-5" />}
              label={t("offensive.home.metrics.activeEngagements", "Active engagements")}
              value={summary.metrics.active_engagements}
              detail={t("offensive.home.metrics.activeEngagementsDetail", "Member engagements currently marked active.")}
            />
            <MetricCard
              icon={<FileWarning className="h-5 w-5" />}
              label={t("offensive.home.metrics.scopeAttention", "Scopes needing attention")}
              value={summary.metrics.scopes_needing_attention}
              detail={t("offensive.home.metrics.scopeAttentionDetail", "Active engagements without a published scope.")}
            />
            <MetricCard
              icon={<ShieldAlert className="h-5 w-5" />}
              label={t("offensive.home.metrics.severeFindings", "Critical or high findings")}
              value={summary.metrics.high_critical_findings}
              detail={t("offensive.home.metrics.severeFindingsDetail", "Current finding revisions classified critical or high.")}
            />
            <MetricCard
              icon={<Activity className="h-5 w-5" />}
              label={t("offensive.home.metrics.activity7d", "Activity in 7 days")}
              value={summary.metrics.activity_7d}
              detail={t("offensive.home.metrics.activity7dDetail", "Scope, evidence, and finding events in accessible engagements.")}
            />
          </section>

          <OffensiveHomeCharts charts={summary.charts} />
          <OffensiveHomeDetails attention={summary.attention} recentSources={summary.recent_sources} />
        </>
      ) : null}
    </div>
  );
}

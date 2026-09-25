import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, FileArchive, FolderOpen } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import type { OffensiveHomeSummary } from "./api";

type AttentionItem = OffensiveHomeSummary["attention"][number];
type RecentSource = OffensiveHomeSummary["recent_sources"][number];

function EmptyPanel({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center">
      <span className="text-outline">{icon}</span>
      <p className="mt-3 max-w-sm text-sm text-on-surface-variant">{message}</p>
    </div>
  );
}

export default function OffensiveHomeDetails({
  attention,
  recentSources,
}: {
  attention: OffensiveHomeSummary["attention"];
  recentSources: OffensiveHomeSummary["recent_sources"];
}) {
  const { t, locale } = useLanguage();
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes.toLocaleString(locale)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} KB`;
    return `${(bytes / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
  };

  const reasonLabel = (reason: AttentionItem["reasons"][number]) => {
    if (reason.kind === "missing_scope") {
      return t("offensive.home.attentionMissingScope", "No active scope");
    }
    if (reason.kind === "critical_findings") {
      return `${reason.count} ${reason.count === 1
        ? t("offensive.home.attentionCriticalOne", "critical finding")
        : t("offensive.home.attentionCriticalMany", "critical findings")}`;
    }
    return `${reason.count} ${reason.count === 1
      ? t("offensive.home.attentionHighOne", "high finding")
      : t("offensive.home.attentionHighMany", "high findings")}`;
  };

  const reasonClass = (kind: AttentionItem["reasons"][number]["kind"]) => (
    kind === "critical_findings"
      ? "badge-error"
      : kind === "missing_scope"
        ? "badge-warning"
        : "badge-primary"
  );

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-12" aria-label={t("offensive.home.operationalDetailsLabel", "Operational follow-up")}>
      <article className="card overflow-hidden lg:col-span-7">
        <header className="card-header block">
          <h2 className="card-title">{t("offensive.home.attentionTitle", "Engagements needing attention")}</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            {t("offensive.home.attentionDescription", "Explicit reasons ordered by critical findings, missing scope, high findings, and recent activity.")}
          </p>
        </header>
        {attention.length === 0 ? (
          <EmptyPanel
            icon={<AlertTriangle className="h-8 w-8" />}
            message={t("offensive.home.noAttention", "No accessible engagement currently matches the attention criteria.")}
          />
        ) : (
          <ul className="divide-y divide-outline-variant/20">
            {attention.map((item) => (
              <li key={item.slug}>
                <Link
                  to={`/redmode/engagements/${encodeURIComponent(item.slug)}`}
                  className="group grid gap-4 px-6 py-5 transition-colors hover:bg-surface-container-low sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-on-surface">{item.display_name}</h3>
                      {item.reasons.map((reason) => (
                        <span key={reason.kind} className={`badge ${reasonClass(reason.kind)}`}>
                          {reasonLabel(reason)}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-on-surface-variant">
                      {item.phase} · {t("offensive.home.responsible", "Responsible")}: {item.responsible} · {formatDate(item.last_activity_at)}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-outline transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-outline-variant/20 px-6 py-3 text-xs text-on-surface-variant">
          {attention.length} {attention.length === 1
            ? t("offensive.home.attentionSummaryOne", "engagement in the attention queue.")
            : t("offensive.home.attentionSummaryMany", "engagements in the attention queue.")}
        </p>
      </article>

      <article className="card overflow-hidden lg:col-span-5">
        <header className="card-header block">
          <h2 className="card-title">{t("offensive.home.recentSourcesTitle", "Recent scope sources")}</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            {t("offensive.home.recentSourcesDescription", "Files from accessible scope versions, without loading their content.")}
          </p>
        </header>
        {recentSources.length === 0 ? (
          <EmptyPanel
            icon={<FolderOpen className="h-8 w-8" />}
            message={t("offensive.home.noRecentSources", "No scope file has been published in an accessible engagement.")}
          />
        ) : (
          <ul className="divide-y divide-outline-variant/20">
            {recentSources.map((source: RecentSource) => (
              <li key={`${source.version_id}:${source.file_id}`}>
                <Link
                  to={`/redmode/engagements/${encodeURIComponent(source.project_slug)}?scope=${encodeURIComponent(source.version_id)}#scope`}
                  className="group flex items-start gap-3 px-5 py-4 transition-colors hover:bg-surface-container-low"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
                    <FileArchive className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-on-surface">{source.filename}</strong>
                    <span className="mt-1 block truncate text-xs text-on-surface-variant">{source.project_display_name}</span>
                    <span className="mt-2 block text-[11px] text-outline">
                      {source.content_type} · {formatSize(source.size)} · {source.author} · {formatDate(source.published_at)}
                    </span>
                  </span>
                  <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-outline transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-outline-variant/20 px-6 py-3 text-xs text-on-surface-variant">
          {recentSources.length} {recentSources.length === 1
            ? t("offensive.home.sourcesSummaryOne", "recent scope file.")
            : t("offensive.home.sourcesSummaryMany", "recent scope files.")}
        </p>
      </article>
    </section>
  );
}

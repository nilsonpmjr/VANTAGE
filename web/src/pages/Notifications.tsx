import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Newspaper,
  Search,
  ShieldAlert,
} from "lucide-react";
import API_URL from "../config";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { PageHeader, PageMetricPill, PageToolbar, PageToolbarGroup } from "../components/page/PageChrome";
import { RowActionsMenu, RowPrimaryAction, type RowActionItem } from "../components/RowActions";
import { resolveAccessiblePath } from "../lib/access";

type NotificationTab = "all" | "critical" | "system" | "intelligence";
type NotificationKind = Exclude<NotificationTab, "all">;

interface FeedItem {
  _id: string;
  title: string;
  summary?: string;
  severity?: string;
  source_type?: string;
  published_at?: string;
  url?: string;
  data?: {
    link?: string;
  };
}

interface CriticalIncident {
  target: string;
  verdict: string;
  type: string;
  timestamp: string;
}

interface UnifiedNotification {
  id: string;
  kind: NotificationKind;
  source: string;
  title: string;
  summary: string;
  timestamp: string;
  url?: string;
  workflowPath: string;
  workflowLabel: string;
  externalLabel?: string;
}

interface NotificationCenterState {
  read_ids: string[];
  archived_ids: string[];
  preferences: Record<NotificationKind, boolean>;
}

function normalizeNotificationCenter(value?: {
  read_ids?: string[];
  archived_ids?: string[];
  preferences?: Partial<Record<NotificationKind, boolean>>;
} | null): NotificationCenterState {
  const preferences = value?.preferences || {};
  return {
    read_ids: Array.isArray(value?.read_ids) ? [...new Set(value?.read_ids.filter(Boolean))] : [],
    archived_ids: Array.isArray(value?.archived_ids)
      ? [...new Set(value?.archived_ids.filter(Boolean))]
      : [],
    preferences: {
      critical: preferences.critical !== false,
      system: preferences.system !== false,
      intelligence: preferences.intelligence !== false,
    },
  };
}

function formatTimestamp(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function sourceLabel(source: string, t: (key: string, fallback?: string) => string) {
  if (source === "critical") return t("notifications.kindCritical", "Critical");
  if (source === "intelligence") return t("notifications.kindIntelligence", "Intelligence");
  if (source === "system") return t("notifications.kindSystem", "System");
  return source;
}

function rowTint(kind: UnifiedNotification["kind"]) {
  if (kind === "critical") return "hover:bg-error-container/5";
  if (kind === "intelligence") return "hover:bg-primary-container/10";
  return "hover:bg-surface-container-low";
}

function iconClass(kind: UnifiedNotification["kind"]) {
  if (kind === "critical") return "text-error";
  if (kind === "intelligence") return "text-primary";
  return "text-secondary";
}

function notificationIcon(kind: UnifiedNotification["kind"]) {
  if (kind === "critical") return <AlertTriangle className={`h-4 w-4 ${iconClass(kind)}`} />;
  if (kind === "intelligence") return <Newspaper className={`h-4 w-4 ${iconClass(kind)}`} />;
  return <Activity className={`h-4 w-4 ${iconClass(kind)}`} />;
}

function badgeClass(kind: UnifiedNotification["kind"]) {
  if (kind === "critical") return "badge badge-error";
  if (kind === "intelligence") return "badge badge-primary";
  return "badge badge-neutral";
}

function workflowIcon(kind: NotificationKind) {
  if (kind === "critical") return <ShieldAlert className="h-3.5 w-3.5" />;
  if (kind === "intelligence") return <Newspaper className="h-3.5 w-3.5" />;
  return <Activity className="h-3.5 w-3.5" />;
}

export default function Notifications() {
  const { locale, t } = useLanguage();
  const navigate = useNavigate();
  const { user, updateUserContext } = useAuth();
  const [activeTab, setActiveTab] = useState<NotificationTab>("all");
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [criticalIncidents, setCriticalIncidents] = useState<CriticalIncident[]>([]);
  const [notificationCenter, setNotificationCenter] = useState<NotificationCenterState>(() =>
    normalizeNotificationCenter(user?.notification_center),
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pageSize = 10;

  useEffect(() => {
    setNotificationCenter(normalizeNotificationCenter(user?.notification_center));
  }, [user?.notification_center]);

  async function persistNotificationCenter(
    nextState: NotificationCenterState,
    successMessage?: string,
  ) {
    const previous = notificationCenter;
    setNotificationCenter(nextState);
    setSaving(true);
    setError("");
    if (successMessage) {
      setNotice(successMessage);
    }

    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_center: nextState }),
      });

      if (!response.ok) {
        throw new Error("notification_center_update_failed");
      }

      if (user) {
        updateUserContext({ ...user, notification_center: nextState });
      }
    } catch {
      setNotificationCenter(previous);
      setNotice("");
      setError(t("notifications.persistFailed", "Could not persist the notification center state."));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      setLoading(true);
      setError("");
      try {
        const [feedRes, statsRes] = await Promise.all([
          fetch(`${API_URL}/api/feed?limit=20&offset=0`, { credentials: "include" }),
          fetch(`${API_URL}/api/stats?period=week&limit=10`, { credentials: "include" }),
        ]);

        if (!feedRes.ok || !statsRes.ok) {
          throw new Error("notifications_load_failed");
        }

        const feedPayload = (await feedRes.json()) as { items?: FeedItem[] };
        const statsPayload = (await statsRes.json()) as { criticalIncidents?: CriticalIncident[] };

        if (!cancelled) {
          setFeedItems(feedPayload.items || []);
          setCriticalIncidents(statsPayload.criticalIncidents || []);
        }
      } catch {
        if (!cancelled) {
          setError(t("notifications.loadFailed", "Could not load the notifications center."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadNotifications();
    return () => {
      cancelled = true;
    };
  }, []);

  const notifications = useMemo(() => {
    const threatIngestionPath = resolveAccessiblePath(user, "/settings/threat-ingestion", "/dashboard");
    const systemHealthPath = resolveAccessiblePath(user, "/settings/system-health", "/dashboard");

    const critical = criticalIncidents.map<UnifiedNotification>((item, index) => ({
      id: `critical-${item.target}-${index}`,
      kind: "critical",
      source: item.type,
      title: `${item.target} ${t("notifications.criticalFlaggedAs", "flagged as")} ${item.verdict}`,
      summary: t("notifications.criticalSummary", "Critical incident surfaced by the analysis engine."),
      timestamp: item.timestamp,
      workflowPath: `/analyze/${encodeURIComponent(item.target)}`,
      workflowLabel: t("notifications.investigateTarget", "Investigate target"),
    }));

    const intelligence = feedItems.map<UnifiedNotification>((item) => ({
      id: item._id,
      kind:
        item.severity === "critical" || item.severity === "high"
          ? "critical"
          : "intelligence",
      source: item.source_type || "feed",
      title: item.title,
      summary: item.summary || t("feed.noSummary", "No summary available."),
      timestamp: item.published_at || "",
      url: item.url || item.data?.link,
      workflowPath: `/feed?severity=${encodeURIComponent(
        item.severity || "all",
      )}&source_type=${encodeURIComponent(item.source_type || "all")}`,
      workflowLabel: t("notifications.openInFeed", "Open in feed"),
      externalLabel: item.url || item.data?.link ? t("notifications.openSourceReference", "Open source reference") : undefined,
    }));

    const system: UnifiedNotification[] = [
      {
        id: "system-feed-health",
        kind: "system",
        source: "control-plane",
        title: t("notifications.systemFeedHealthTitle", "Threat ingestion runtime active"),
        summary: `${feedItems.length} ${t("notifications.systemFeedHealthSummary", "recent intelligence item(s) are available for review.")}`,
        timestamp: new Date().toISOString(),
        workflowPath: threatIngestionPath,
        workflowLabel: threatIngestionPath === "/dashboard"
          ? t("notifications.openDashboard", "Open dashboard")
          : t("notifications.openIngestionControls", "Open ingestion controls"),
      },
      {
        id: "system-critical-volume",
        kind: "system",
        source: "stats",
        title: t("notifications.systemCriticalVolumeTitle", "Weekly critical incident snapshot"),
        summary: `${criticalIncidents.length} ${t("notifications.systemCriticalVolumeSummary", "critical incident(s) surfaced in the current week window.")}`,
        timestamp: new Date().toISOString(),
        workflowPath: systemHealthPath,
        workflowLabel: systemHealthPath === "/dashboard"
          ? t("notifications.openDashboard", "Open dashboard")
          : t("notifications.openSystemHealth", "Open system health"),
      },
    ];

    return [...critical, ...intelligence, ...system]
      .filter((item) => notificationCenter.preferences[item.kind])
      .filter((item) => !notificationCenter.read_ids.includes(item.id))
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
  }, [criticalIncidents, feedItems, notificationCenter, user]);

  const filteredNotifications = useMemo(() => {
    const active = notifications.filter((item) => !notificationCenter.archived_ids.includes(item.id));
    if (activeTab === "all") return active;
    return active.filter((item) => item.kind === activeTab);
  }, [activeTab, notificationCenter.archived_ids, notifications]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, notificationCenter]);

  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / pageSize));
  const paginatedNotifications = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredNotifications.slice(start, start + pageSize);
  }, [currentPage, filteredNotifications]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const tabCounts = useMemo(
    () => ({
      all: notifications.filter((item) => !notificationCenter.archived_ids.includes(item.id)).length,
      critical: notifications.filter(
        (item) => item.kind === "critical" && !notificationCenter.archived_ids.includes(item.id),
      ).length,
      system: notifications.filter(
        (item) => item.kind === "system" && !notificationCenter.archived_ids.includes(item.id),
      ).length,
      intelligence: notifications.filter(
        (item) =>
          item.kind === "intelligence" && !notificationCenter.archived_ids.includes(item.id),
      ).length,
    }),
    [notificationCenter.archived_ids, notifications],
  );

  const archivedCount = notificationCenter.archived_ids.length;
  const readCount = notificationCenter.read_ids.length;

  function markAllAsRead() {
    const nextState = {
      ...notificationCenter,
      read_ids: [
        ...new Set([...notificationCenter.read_ids, ...notifications.map((item) => item.id)]),
      ],
    };
    void persistNotificationCenter(nextState, t("notifications.noticeMarkedAllRead", "All visible notifications marked as read."));
  }

  function restoreArchive() {
    if (archivedCount === 0) return;
    const nextState = {
      ...notificationCenter,
      archived_ids: [] as string[],
    };
    void persistNotificationCenter(nextState, t("notifications.noticeRestoredArchive", "Archived notifications restored to the active queue."));
  }

  function togglePreference(kind: NotificationKind) {
    const nextState = {
      ...notificationCenter,
      preferences: {
        ...notificationCenter.preferences,
        [kind]: !notificationCenter.preferences[kind],
      },
    };
    void persistNotificationCenter(nextState, t("notifications.noticeRoutingUpdated", "Notification routing preferences updated."));
  }

  return (
    <div className="page-frame flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <PageHeader
          eyebrow={t("notifications.eyebrow", "Observability")}
          title={t("notifications.title", "Notifications Center")}
          description={t("notifications.subtitle", "Concentre eventos críticos, inteligência recente e sinais sistêmicos sem misturar contexto operacional com navegação fictícia.")}
          metrics={
            <>
              <PageMetricPill label={`${notifications.length} notifications`} dotClassName="bg-primary" tone="primary" />
              <PageMetricPill label={`${archivedCount} archived`} dotClassName="bg-secondary" />
            </>
          }
        />
        <PageToolbar label={t("notifications.globalActions", "Global actions")}>
          <PageToolbarGroup className="ml-auto">
            <button
              className="btn btn-outline"
              onClick={markAllAsRead}
              disabled={saving || notifications.length === 0}
            >
              <CheckCheck className="h-[1.125rem] w-[1.125rem]" />
              {t("notifications.markAllRead", "Mark all as read")}
            </button>
            <button
              className="btn btn-primary"
              onClick={restoreArchive}
              disabled={saving || archivedCount === 0}
            >
              <ArchiveRestore className="h-[1.125rem] w-[1.125rem]" />
              {t("notifications.restoreArchive", "Restore archive")}
            </button>
          </PageToolbarGroup>
        </PageToolbar>
        <div className="nav-pills">
          <button
            className={`nav-pill-item px-6 ${
              activeTab === "all" ? "nav-pill-item-active" : "nav-pill-item-inactive"
            }`}
            onClick={() => setActiveTab("all")}
          >
            {t("notifications.allActivity", "All Activity")} ({tabCounts.all})
          </button>
          <button
            className={`nav-pill-item px-6 ${
              activeTab === "critical" ? "nav-pill-item-active" : "nav-pill-item-inactive"
            }`}
            onClick={() => setActiveTab("critical")}
          >
            {t("notifications.criticalAlerts", "Critical Alerts")} ({tabCounts.critical})
          </button>
          <button
            className={`nav-pill-item px-6 ${
              activeTab === "system" ? "nav-pill-item-active" : "nav-pill-item-inactive"
            }`}
            onClick={() => setActiveTab("system")}
          >
            {t("notifications.systemEvents", "System Events")} ({tabCounts.system})
          </button>
          <button
            className={`nav-pill-item px-6 ${
              activeTab === "intelligence" ? "nav-pill-item-active" : "nav-pill-item-inactive"
            }`}
            onClick={() => setActiveTab("intelligence")}
          >
            {t("notifications.intelligenceFeed", "Intelligence Feed")} ({tabCounts.intelligence})
          </button>
        </div>
      </section>

      {error && <div className="rounded bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
      {notice && <div className="rounded bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div>}

      <section className="page-with-side-rail">
        <div className="page-main-pane">
          <section className="surface-section p-0">
            <div className="grid grid-cols-[48px_140px_120px_1fr_180px] bg-surface-container-high border-b border-outline-variant/30 py-2.5 px-4 items-center">
              <div className="flex justify-center">
                <AlertTriangle className="h-4 w-4 text-on-surface-variant" />
              </div>
              <div className="text-[0.6875rem] font-black uppercase tracking-widest text-on-surface-variant">
                {t("notifications.timestamp", "Timestamp (UTC)")}
              </div>
              <div className="text-[0.6875rem] font-black uppercase tracking-widest text-on-surface-variant">
                {t("notifications.source", "Source")}
              </div>
              <div className="text-[0.6875rem] font-black uppercase tracking-widest text-on-surface-variant">
                {t("notifications.operationalContext", "Operational Context")}
              </div>
              <div className="text-right text-[0.6875rem] font-black uppercase tracking-widest text-on-surface-variant">
                {t("notifications.actions", "Actions")}
              </div>
            </div>

            <div className="divide-y divide-outline-variant/10 overflow-y-auto">
              {loading ? (
                <div className="px-6 py-10 text-sm text-on-surface-variant">
                  {t("notifications.loading", "Loading intelligence feed")}
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="px-6 py-12 text-sm text-on-surface-variant">
                  {t("notifications.empty", "Nenhum item restante neste filtro.")}
                </div>
              ) : (
                paginatedNotifications.map((item) => (
                  <div
                    key={item.id}
                    className={`group grid grid-cols-[48px_140px_120px_1fr_180px] ${rowTint(
                      item.kind,
                    )} py-3 px-4 items-center transition-colors`}
                  >
                    <div className="flex justify-center">
                      {notificationIcon(item.kind)}
                    </div>
                    <div className="text-[0.75rem] font-mono text-on-surface-variant tabular-nums">
                      {formatTimestamp(item.timestamp, locale)}
                    </div>
                    <div>
                      <span className={badgeClass(item.kind)}>{sourceLabel(item.kind, t)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[0.875rem] font-bold text-on-surface tracking-tight">
                        {item.title}
                      </span>
                      <span className="text-[0.75rem] text-on-surface-variant opacity-70">
                        {item.summary}
                      </span>
                    </div>
                    <div className="flex justify-end gap-2">
                      <RowPrimaryAction
                        label={item.workflowLabel}
                        icon={workflowIcon(item.kind)}
                        onClick={() => navigate(item.workflowPath)}
                      />
                      <RowActionsMenu
                        items={buildNotificationActions({
                          item,
                          saving,
                          externalFallbackLabel: t("notifications.openSourceReference", "Open source reference"),
                          markReadLabel: t("notifications.markAsRead", "Mark as read"),
                          archiveLabel: t("notifications.archiveNotification", "Archive notification"),
                          onOpenWorkflow: () => navigate(item.workflowPath),
                          onOpenExternal: () => {
                            if (item.url) {
                              window.open(item.url, "_blank", "noopener,noreferrer");
                            }
                          },
                          onArchive: () =>
                            persistNotificationCenter(
                              {
                                ...notificationCenter,
                                archived_ids: [
                                  ...new Set([...notificationCenter.archived_ids, item.id]),
                                ],
                              },
                              t("notifications.archiveNotification", "Archive notification"),
                            ),
                          onMarkRead: () =>
                            persistNotificationCenter(
                              {
                                ...notificationCenter,
                                read_ids: [...new Set([...notificationCenter.read_ids, item.id])],
                              },
                              t("notifications.markAsRead", "Mark as read"),
                            ),
                        })}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-auto bg-surface-container px-6 py-2 border-t border-outline-variant/30 flex justify-between items-center">
              <div className="flex items-center gap-6">
                <span className="text-[0.6875rem] font-medium text-on-surface-variant uppercase tracking-widest">
                  {t("notifications.showing", "Showing")}{" "}
                  {filteredNotifications.length === 0
                    ? "0"
                    : `${(currentPage - 1) * pageSize + 1}-${Math.min(
                        currentPage * pageSize,
                        filteredNotifications.length,
                      )}`}{" "}
                  {t("notifications.of", "of")} {filteredNotifications.length} {t("notifications.items", "items")}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-[0.6875rem] font-bold text-emerald-700 uppercase tracking-tighter">
                    {t("notifications.realTime", "Real-time Feed Active")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  className="text-on-surface-variant hover:text-primary transition-colors disabled:opacity-30"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[0.75rem] font-bold text-on-surface">
                  {t("notifications.page", "Page")} {totalPages === 0 ? 0 : currentPage} {t("notifications.of", "of")} {totalPages}
                </span>
                <button
                  className="text-on-surface-variant hover:text-primary transition-colors disabled:opacity-30"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="page-side-rail-right">
          <div className="card p-5 card-accent-left card-accent-error">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-error-container/20 rounded-sm">
                <ShieldAlert className="h-4 w-4 text-error" />
              </div>
              <span className="badge badge-error">{t("notifications.urgentReview", "Urgent Review")}</span>
            </div>
            <h4 className="text-[0.875rem] font-extrabold text-on-surface uppercase tracking-tight mb-2">
              {t("notifications.sideTrendTitle", "Trend Alert: Lateral Movement")}
            </h4>
            <p className="text-[0.75rem] text-on-surface-variant leading-relaxed">
              {criticalIncidents.length} {t("notifications.sideTrendBody", "critical incident(s) are still visible in the current alert stream.")}
            </p>
            <div className="mt-4 pt-4 border-t border-outline-variant/10 flex justify-between items-center">
              <span className="text-[0.625rem] font-mono text-on-surface-variant">
                {t("notifications.derivedFromStats", "Derived from /api/stats")}
              </span>
              <button
                className="text-primary text-[0.75rem] font-bold hover:underline"
                onClick={() => navigate("/settings/system-health")}
              >
                {t("notifications.openSystemHealth", "Open system health")}
              </button>
            </div>
          </div>

          <div className="card p-5 card-accent-left card-accent-primary">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-primary-container/20 rounded-sm">
                <Newspaper className="h-4 w-4 text-primary" />
              </div>
              <span className="badge badge-primary">{t("notifications.intelligenceLabel", "Intelligence")}</span>
            </div>
            <h4 className="text-[0.875rem] font-extrabold text-on-surface uppercase tracking-tight mb-2">
              {t("notifications.sideIntelTitle", "Darknet Asset Discovery")}
            </h4>
            <p className="text-[0.75rem] text-on-surface-variant leading-relaxed">
              {feedItems.length} {t("notifications.sideIntelBody", "recent intelligence item(s) are available through the feed endpoint.")}
            </p>
            <div className="mt-4 pt-4 border-t border-outline-variant/10 flex justify-between items-center">
              <span className="text-[0.625rem] font-mono text-on-surface-variant">
                {t("notifications.derivedFromFeed", "Derived from /api/feed")}
              </span>
              <button
                className="text-primary text-[0.75rem] font-bold hover:underline"
                onClick={() => navigate("/feed?severity=high&source_type=all")}
              >
                {t("notifications.openFeed", "Open feed")}
              </button>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-surface-container-high rounded-sm">
                <Bell className="h-4 w-4 text-on-surface-variant" />
              </div>
              <span className="badge badge-neutral">{saving ? t("notifications.syncing", "Syncing") : t("notifications.persisted", "Persisted")}</span>
            </div>
            <h4 className="text-[0.875rem] font-extrabold text-on-surface uppercase tracking-tight mb-2">
              {t("notifications.routingTitle", "Notification Routing Preferences")}
            </h4>
            <p className="text-[0.75rem] text-on-surface-variant leading-relaxed">
              {t("notifications.routingBody", "Use the persisted preferences below to mute categories that should not surface in the operator queue by default.")}
            </p>
            <div className="mt-4 space-y-3">
              {([
                ["critical", t("notifications.routingCriticalTitle", "Critical incident routing")],
                ["system", t("notifications.routingSystemTitle", "System notices")],
                ["intelligence", t("notifications.routingIntelTitle", "Intelligence feed items")],
              ] as Array<[NotificationKind, string]>).map(([kind, label]) => (
                <div
                  key={kind}
                  className="flex items-center justify-between gap-3 rounded-sm border border-outline-variant/15 bg-surface-container-low px-3 py-2"
                >
                  <div className="flex flex-col">
                    <span className="text-[0.75rem] font-semibold text-on-surface">{label}</span>
                    <span className="text-[0.6875rem] text-on-surface-variant">
                      {kind === "critical"
                        ? t("notifications.routingCriticalBody", "Escalations and high-risk findings")
                        : kind === "system"
                          ? t("notifications.routingSystemBody", "Control-plane updates")
                          : t("notifications.routingIntelBody", "Feed-derived signals and intel stories")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void togglePreference(kind);
                    }}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      notificationCenter.preferences[kind] ? "bg-primary" : "bg-outline-variant/50"
                    }`}
                    aria-pressed={notificationCenter.preferences[kind]}
                    role="switch"
                    aria-checked={notificationCenter.preferences[kind]}
                    disabled={saving}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        notificationCenter.preferences[kind] ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-outline-variant/10 grid grid-cols-2 gap-3 text-[0.6875rem] uppercase tracking-widest text-on-surface-variant">
              <div>
                <div className="font-bold text-on-surface">{readCount}</div>
                {t("notifications.read", "Marked as read")}
              </div>
              <div>
                <div className="font-bold text-on-surface">{archivedCount}</div>
                {t("notifications.archived", "Archived items")}
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function buildNotificationActions({
  item,
  saving,
  externalFallbackLabel,
  markReadLabel,
  archiveLabel,
  onOpenWorkflow,
  onOpenExternal,
  onArchive,
  onMarkRead,
}: {
  item: UnifiedNotification;
  saving: boolean;
  externalFallbackLabel: string;
  markReadLabel: string;
  archiveLabel: string;
  onOpenWorkflow: () => void;
  onOpenExternal: () => void;
  onArchive: () => void;
  onMarkRead: () => void;
}): RowActionItem[] {
  return [
    {
      key: "workflow",
      label: item.workflowLabel,
      icon: workflowIcon(item.kind),
      onSelect: onOpenWorkflow,
    },
    ...(item.url
      ? [
          {
            key: "external",
            label: item.externalLabel || externalFallbackLabel,
            icon: <ExternalLink className="h-3.5 w-3.5" />,
            onSelect: onOpenExternal,
          } satisfies RowActionItem,
        ]
      : []),
    {
      key: "mark-read",
      label: markReadLabel,
      icon: <Eye className="h-3.5 w-3.5" />,
      onSelect: onMarkRead,
      disabled: saving,
    },
    {
      key: "archive",
      label: archiveLabel,
      icon: <Archive className="h-3.5 w-3.5" />,
      onSelect: onArchive,
      disabled: saving,
      dividerBefore: true,
    },
  ];
}

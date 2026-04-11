import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bell, BellOff, Eye, Mail, Plus, RefreshCw, ScanSearch, ShieldAlert, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import API_URL from "../config";
import { PageHeader, PageMetricPill, PageToolbar, PageToolbarGroup } from "../components/page/PageChrome";
import { RowActionsMenu, RowPrimaryAction, type RowActionItem } from "../components/RowActions";
import { useLanguage } from "../context/LanguageContext";

interface WatchlistItem {
  id: string;
  target: string;
  target_type: string;
  notify_on_change: boolean;
  notification_route: "email" | "in_app" | "both";
  last_verdict?: string | null;
  last_scan_at?: string | null;
  created_at?: string | null;
}

interface WatchlistHistoryItem {
  watchlist_item_id: string;
  target: string;
  target_type: string;
  verdict: string;
  previous_verdict?: string | null;
  changed: boolean;
  scanned_at: string;
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

function verdictClasses(verdict?: string | null) {
  if (verdict === "HIGH RISK" || verdict === "CRITICAL") {
    return "bg-error/10 text-error";
  }
  if (verdict === "SUSPICIOUS") {
    return "bg-warning/10 text-warning";
  }
  if (verdict) {
    return "bg-primary/10 text-primary";
  }
  return "bg-surface-container-high text-on-surface-variant";
}

function routeLabel(
  route: WatchlistItem["notification_route"],
  t: (key: string, fallback?: string) => string,
) {
  switch (route) {
    case "both":
      return t("watchlist.routeValueBoth", "Email + In-App");
    case "in_app":
      return t("watchlist.routeValueInApp", "In-App");
    default:
      return t("watchlist.routeValueEmail", "Email");
  }
}

function routeTone(route: WatchlistItem["notification_route"]) {
  if (route === "both") return "bg-primary/10 text-primary";
  if (route === "in_app") return "bg-surface-container-high text-on-surface";
  return "bg-surface-container-highest text-on-surface-variant";
}

function IndicatorDetailModal({
  item,
  history,
  trend,
  loadingHistory,
  locale,
  t,
  onClose,
}: {
  item: WatchlistItem;
  history: WatchlistHistoryItem[];
  trend: Array<WatchlistHistoryItem & { height: number }>;
  loadingHistory: boolean;
  locale: string;
  t: (key: string, fallback?: string) => string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(event) => {
        if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t("watchlist.selectedIndicatorTitle", "Selected Indicator")}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md mx-4 surface-section shadow-2xl"
      >
        <div className="surface-section-header">
          <div className="text-xs font-bold uppercase tracking-widest text-on-surface">
            {t("watchlist.selectedIndicatorTitle", "Selected Indicator")}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto -mr-1 flex h-7 w-7 items-center justify-center rounded-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
            aria-label={t("watchlist.closeModal", "Close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <div className="text-sm font-bold text-on-surface">{item.target}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-on-surface-variant">
              {item.target_type} · {t("watchlist.lastScanLabel", "last scan")} {formatTimestamp(item.last_scan_at, locale)}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center whitespace-nowrap rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${verdictClasses(item.last_verdict)}`}>
              {item.last_verdict || t("watchlist.awaitingFirstScan", "Awaiting first scan")}
            </span>
            <span className={`inline-flex items-center whitespace-nowrap rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${routeTone(item.notification_route)}`}>
              {routeLabel(item.notification_route, t)}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-on-surface-variant">{t("watchlist.notificationState", "Notification state")}</span>
            <span className="font-medium text-on-surface">
              {item.notify_on_change ? t("watchlist.enabled", "Enabled") : t("watchlist.muted", "Muted")}
            </span>
          </div>

          <div>
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
              {t("watchlist.historicalTrend", "Historical trend")}
            </div>
            {loadingHistory ? (
              <div className="text-sm text-on-surface-variant">{t("watchlist.loadingTrend", "Loading trend...")}</div>
            ) : trend.length === 0 ? (
              <div className="text-sm text-on-surface-variant">{t("watchlist.noHistoryYet", "No history available yet.")}</div>
            ) : (
              <>
                <div className="flex h-28 items-end gap-2">
                  {trend.map((entry, index) => (
                    <div
                      key={`${entry.scanned_at}-${index}`}
                      className={`flex-1 rounded-t-sm h-[var(--bar-h)] ${
                        entry.verdict === "HIGH RISK" || entry.verdict === "CRITICAL"
                          ? "bg-error/70"
                          : entry.verdict === "SUSPICIOUS"
                            ? "bg-warning/70"
                            : "bg-primary/40"
                      }`}
                      style={{ "--bar-h": `${entry.height}%` } as React.CSSProperties}
                      title={`${formatTimestamp(entry.scanned_at, locale)} • ${entry.verdict}`}
                    />
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {history.slice(0, 4).map((entry) => (
                    <div key={`${entry.scanned_at}-${entry.verdict}`} className="flex items-start justify-between gap-3 text-xs">
                      <span className="text-on-surface-variant">{formatTimestamp(entry.scanned_at, locale)}</span>
                      <span className="font-medium text-on-surface text-right">
                        {entry.changed && entry.previous_verdict
                          ? `${entry.previous_verdict} -> ${entry.verdict}`
                          : entry.verdict}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Watchlist() {
  const { locale, t } = useLanguage();
  const navigate = useNavigate();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [target, setTarget] = useState("");
  const [notifyOnChange, setNotifyOnChange] = useState(true);
  const [notificationRoute, setNotificationRoute] = useState<WatchlistItem["notification_route"]>("email");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedHistory, setSelectedHistory] = useState<WatchlistHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    void loadWatchlist();
  }, []);

  useEffect(() => {
    if (!selectedItemId) {
      setSelectedHistory([]);
      return;
    }
    void loadHistory(selectedItemId);
  }, [selectedItemId]);

  useEffect(() => {
    function handleTableShortcuts(event: KeyboardEvent) {
      const targetElement = event.target as HTMLElement | null;
      const tag = targetElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || targetElement?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!items.length) return;
      const currentSelectedItem =
        items.find((item) => item.id === selectedItemId) || null;

      const currentIndex = Math.max(
        0,
        items.findIndex((item) => item.id === selectedItemId),
      );

      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        const nextIndex = Math.min(items.length - 1, currentIndex + 1);
        setSelectedItemId(items[nextIndex].id);
        return;
      }

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        const nextIndex = Math.max(0, currentIndex - 1);
        setSelectedItemId(items[nextIndex].id);
        return;
      }

      if (event.key === "Enter" && currentSelectedItem) {
        event.preventDefault();
        navigate(`/analyze/${encodeURIComponent(currentSelectedItem.target)}`);
      }
    }

    document.addEventListener("keydown", handleTableShortcuts);
    return () => document.removeEventListener("keydown", handleTableShortcuts);
  }, [items, navigate, selectedItemId]);

  async function loadWatchlist() {
    setLoading(true);
    setError("");

    try {
      const [watchlistRes, smtpRes] = await Promise.all([
        fetch(`${API_URL}/api/watchlist`, { credentials: "include" }),
        fetch(`${API_URL}/api/watchlist/smtp-status`, { credentials: "include" }),
      ]);

      if (!watchlistRes.ok || !smtpRes.ok) {
        throw new Error("watchlist_load_failed");
      }

      const watchlistData = (await watchlistRes.json()) as { items: WatchlistItem[] };
      const smtpData = (await smtpRes.json()) as { smtp_configured: boolean };
      const nextItems = watchlistData.items || [];

      setItems(nextItems);
      setSmtpConfigured(Boolean(smtpData.smtp_configured));
      setSelectedIds((current) => current.filter((id) => nextItems.some((item) => item.id === id)));
      setSelectedItemId((current) => {
        if (current && nextItems.some((item) => item.id === current)) {
          return current;
        }
        return nextItems[0]?.id || "";
      });
    } catch {
      setError(t("watchlist.loadFailed", "Could not load the operator watchlist."));
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory(itemId: string) {
    setLoadingHistory(true);
    try {
      const response = await fetch(`${API_URL}/api/watchlist/${itemId}/history?limit=12`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("watchlist_history_failed");
      }
      const data = (await response.json()) as { items: WatchlistHistoryItem[] };
      setSelectedHistory(data.items || []);
    } catch {
      setSelectedHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function addWatchlistItem() {
    setBusyId("create");
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/api/watchlist/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          notify_on_change: notifyOnChange,
          notification_route: notificationRoute,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "watchlist_create_failed");
      }

      setTarget("");
      setNotifyOnChange(true);
      setNotificationRoute("email");
      setNotice(t("watchlist.noticeAdded", "Indicator added to the watchlist."));
      await loadWatchlist();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(
        detail === "Target already in watchlist."
          ? t("watchlist.errorAlreadyTracked", "This target is already being monitored.")
          : detail.includes("limit")
            ? detail
            : t("watchlist.errorAddFailed", "Could not add the target to the watchlist."),
      );
    } finally {
      setBusyId("");
    }
  }

  async function patchWatchlistItem(itemId: string, body: Record<string, unknown>, successMessage: string) {
    setBusyId(itemId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/watchlist/${itemId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "watchlist_patch_failed");
      }
      setNotice(successMessage);
      await loadWatchlist();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(detail || t("watchlist.errorUpdateFailed", "Failed to update the indicator."));
    } finally {
      setBusyId("");
    }
  }

  async function runBulkAction(action: "enable_notifications" | "disable_notifications" | "delete" | "set_route", route?: WatchlistItem["notification_route"]) {
    if (!selectedIds.length) return;
    setBusyId("bulk");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/watchlist/bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_ids: selectedIds,
          action,
          notification_route: route,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "watchlist_bulk_failed");
      }
      const data = (await response.json()) as { updated: number };
      setNotice(`${data.updated || 0} ${t("watchlist.noticeUpdatedCount", "indicator(s) updated.")}`);
      if (action === "delete") {
        setSelectedIds([]);
      }
      await loadWatchlist();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(detail || t("watchlist.errorBulkFailed", "Could not execute the bulk action."));
    } finally {
      setBusyId("");
    }
  }

  async function removeItem(id: string) {
    setBusyId(id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/api/watchlist/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("watchlist_delete_failed");
      }

      setNotice(t("watchlist.noticeRemoved", "Indicator removed from the watchlist."));
      await loadWatchlist();
    } catch {
      setError(t("watchlist.errorRemoveFailed", "Could not remove the indicator."));
    } finally {
      setBusyId("");
    }
  }

  async function scanItem(itemId: string) {
    setBusyId(itemId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/watchlist/${itemId}/scan`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "watchlist_scan_failed");
      }
      const data = (await response.json()) as { changed: boolean; verdict: string };
      setNotice(
        data.changed
          ? `${t("watchlist.noticeNewVerdict", "New verdict detected")}: ${data.verdict}.`
          : `${t("watchlist.noticeScanComplete", "Manual scan completed")}: ${data.verdict}.`,
      );
      await loadWatchlist();
      await loadHistory(itemId);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(detail || t("watchlist.errorScanFailed", "Failed to execute the manual scan."));
    } finally {
      setBusyId("");
    }
  }

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) || null,
    [items, selectedItemId],
  );

  const highRiskHits = useMemo(
    () =>
      items.filter((item) => item.last_verdict === "HIGH RISK" || item.last_verdict === "CRITICAL")
        .length,
    [items],
  );

  const notificationReadyCount = useMemo(
    () => items.filter((item) => item.notify_on_change).length,
    [items],
  );

  const routeMix = useMemo(
    () => ({
      email: items.filter((item) => item.notification_route === "email").length,
      inApp: items.filter((item) => item.notification_route === "in_app").length,
      both: items.filter((item) => item.notification_route === "both").length,
    }),
    [items],
  );

  const selectedTrend = useMemo(() => {
    const source = selectedHistory.length
      ? [...selectedHistory].reverse()
      : selectedItem?.last_verdict
        ? [{
            verdict: selectedItem.last_verdict,
            changed: false,
            scanned_at: selectedItem.last_scan_at || new Date().toISOString(),
          }]
        : [];
    const level = (verdict?: string | null) => {
      if (verdict === "HIGH RISK" || verdict === "CRITICAL") return 96;
      if (verdict === "SUSPICIOUS") return 70;
      if (verdict) return 38;
      return 18;
    };
    return source.map((entry) => ({
      ...entry,
      height: level(entry.verdict),
    }));
  }, [selectedHistory, selectedItem]);

  function toggleSelection(itemId: string) {
    setSelectedIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    );
  }

  function toggleSelectAll() {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(items.map((item) => item.id));
  }

  return (
    <div className="page-frame space-y-8">
      {selectedItem && (
        <IndicatorDetailModal
          item={selectedItem}
          history={selectedHistory}
          trend={selectedTrend}
          loadingHistory={loadingHistory}
          locale={locale}
          t={t}
          onClose={() => setSelectedItemId("")}
        />
      )}

      <PageHeader
        eyebrow={t("watchlist.eyebrow", "Analyst")}
        title={t("watchlist.title", "Watchlist Monitoring")}
        description={t("watchlist.subtitle", "Monitore IPs, domínios e hashes conhecidos com mudança de veredito, roteamento de alerta e histórico contínuo da plataforma.")}
        metrics={
          <>
            <PageMetricPill
              label={`${items.length} ${t("watchlist.monitoredAssets", "Monitored Assets")}`}
              dotClassName="bg-primary"
              tone="primary"
            />
            <PageMetricPill
              label={selectedIds.length > 0 ? `${selectedIds.length} ${t("watchlist.selectedCount", "item(s) selected")}` : "No selection"}
              dotClassName={selectedIds.length > 0 ? "bg-amber-500" : "bg-outline"}
              tone={selectedIds.length > 0 ? "warning" : "muted"}
            />
            <PageMetricPill
              label={smtpConfigured ? t("watchlist.smtpReady", "SMTP READY") : t("watchlist.smtpOffline", "SMTP OFFLINE")}
              dotClassName={smtpConfigured ? "bg-emerald-500" : "bg-error"}
              tone={smtpConfigured ? "success" : "danger"}
            />
          </>
        }
      />

      <PageToolbar
        label={selectedIds.length > 0 ? `${selectedIds.length} ${t("watchlist.selectedCount", "item(s) selected")}` : t("watchlist.actions", "Watchlist actions")}
      >
        <PageToolbarGroup className="ml-auto">
          <button onClick={loadWatchlist} className="btn btn-outline">
            <RefreshCw className="h-4 w-4" />
            {t("watchlist.refresh", "Refresh")}
          </button>
          <button
            onClick={() => void runBulkAction("enable_notifications")}
            className="btn btn-outline"
            disabled={!selectedIds.length || busyId === "bulk"}
          >
            <Bell className="h-4 w-4" />
            {t("watchlist.enableAlerts", "Enable alerts")}
          </button>
          <button
            onClick={() => void runBulkAction("disable_notifications")}
            className="btn btn-outline"
            disabled={!selectedIds.length || busyId === "bulk"}
          >
            <BellOff className="h-4 w-4" />
            {t("watchlist.muteSelected", "Mute selected")}
          </button>
          <button
            onClick={() => void runBulkAction("set_route", "both")}
            className="btn btn-outline"
            disabled={!selectedIds.length || busyId === "bulk"}
          >
            {t("watchlist.routeBoth", "Route both")}
          </button>
          <button
            onClick={() => void runBulkAction("delete")}
            className="btn btn-outline"
            disabled={!selectedIds.length || busyId === "bulk"}
          >
            <Trash2 className="h-4 w-4" />
            {t("watchlist.removeSelected", "Remove selected")}
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
        <div className="page-main-pane grid grid-cols-12 gap-6">
          <MetricBlock label={t("watchlist.monitoredAssets", "Monitored Assets")} value={String(items.length)} accent="border-primary" />
          <MetricBlock label={t("watchlist.highRiskHits", "High Risk Hits")} value={String(highRiskHits)} accent="border-error" />
          <MetricBlock label={t("watchlist.alertReady", "Alert-Ready")} value={String(notificationReadyCount)} accent="border-primary-dim" />
          <div className="col-span-12 lg:col-span-3 bg-surface-container-low p-6 flex flex-col justify-between border-b-2 border-outline">
            <div>
              <span className="text-[10px] font-bold text-outline uppercase tracking-[0.15em]">{t("watchlist.routeMix", "Route Mix")}</span>
              <div className="mt-3 space-y-2 text-sm text-on-surface">
                <div>{t("watchlist.routeMixEmail", "Email")}: {routeMix.email}</div>
                <div>{t("watchlist.routeMixInApp", "In-App")}: {routeMix.inApp}</div>
                <div>{t("watchlist.routeMixBoth", "Both")}: {routeMix.both}</div>
              </div>
            </div>
          </div>

          <div className="col-span-12 surface-section">
            <div className="surface-section-header">
              <div className="flex gap-8 items-center">
                <button className="text-xs font-bold text-on-primary-container border-b-2 border-primary-dim pb-1 tracking-wider uppercase">
                  {t("watchlist.activeEntries", "Active Entries")} ({items.length})
                </button>
              </div>
              <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                <Activity className="h-4 w-4" />
                {t("watchlist.monitoringLinked", "Monitoring linked")}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-container-low border-b border-outline-variant/10">
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={items.length > 0 && selectedIds.length === items.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-6 py-3 text-[10px] font-bold text-outline uppercase tracking-widest">{t("watchlist.type", "Type")}</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-outline uppercase tracking-widest">{t("watchlist.indicatorValue", "Indicator Value")}</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-outline uppercase tracking-widest">{t("watchlist.lastScan", "Last Scan")}</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-outline uppercase tracking-widest">{t("watchlist.route", "Route")}</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-outline uppercase tracking-widest">{t("watchlist.riskLevel", "Risk Level")}</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold text-outline uppercase tracking-widest">{t("watchlist.actionsColumn", "Actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-sm text-on-surface-variant">
                        {t("watchlist.loadingIndicators", "Loading watchlist indicators")}
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td className="px-6 py-20 text-center" colSpan={7}>
                        <div className="flex flex-col items-center max-w-sm mx-auto">
                          <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center mb-4">
                            <ShieldAlert className="h-6 w-6 text-outline" />
                          </div>
                          <h3 className="text-sm font-bold text-on-surface mb-2 uppercase tracking-widest">
                            {t("watchlist.emptyTitle", "Awaiting Further Intelligence")}
                          </h3>
                          <p className="text-xs text-on-surface-variant leading-relaxed">
                            {t("watchlist.emptyBody", "Nenhum indicador está sendo monitorado ainda. Adicione IPs, domínios ou hashes para iniciar cobertura contínua.")}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          selectedItemId === item.id ? "bg-surface-container-low/50" : "hover:bg-surface-container-low/50"
                        }`}
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelection(item.id)}
                          />
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-on-surface">{item.target_type || t("watchlist.artifact", "artifact")}</td>
                        <td
                          className="px-6 py-4 cursor-pointer"
                          onClick={() => setSelectedItemId(item.id)}
                        >
                          <code className="text-xs font-mono bg-surface-container-low px-2 py-1 rounded text-on-primary-container">
                            {item.target}
                          </code>
                        </td>
                        <td className="px-6 py-4 text-xs text-on-surface-variant">
                          {formatTimestamp(item.last_scan_at, locale)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center whitespace-nowrap rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${routeTone(item.notification_route)}`}>
                            {routeLabel(item.notification_route, t)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center whitespace-nowrap rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${verdictClasses(item.last_verdict)}`}>
                            {item.last_verdict || t("watchlist.awaitingFirstScan", "Awaiting first scan")}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <RowPrimaryAction
                              label={t("watchlist.scan", "Scan")}
                              icon={<ScanSearch className="h-3.5 w-3.5" />}
                              onClick={() => void scanItem(item.id)}
                              disabled={busyId === item.id}
                            />
                            <RowActionsMenu
                              items={buildWatchlistActions({
                                item,
                                onInspect: () => {
                                  setSelectedItemId(item.id);
                                  setNotice(
                                    `${item.target} - ${t("watchlist.lastVerdictLabel", "last verdict")}: ${item.last_verdict || t("watchlist.awaitingFirstScan", "Awaiting first scan")} / ${t("watchlist.lastScanLabel", "last scan")}: ${formatTimestamp(item.last_scan_at, locale)}`,
                                  );
                                },
                                onToggle: () =>
                                  void patchWatchlistItem(
                                    item.id,
                                    { notify_on_change: !item.notify_on_change },
                                    t("watchlist.noticeNotificationUpdated", "Notification preference updated."),
                                  ),
                                onRoute: (route) =>
                                  void patchWatchlistItem(
                                    item.id,
                                    { notification_route: route },
                                    t("watchlist.noticeRouteUpdated", "Notification route updated."),
                                  ),
                                onRemove: () => void removeItem(item.id),
                                busyId,
                                t,
                              })}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="page-side-rail-right space-y-6">
          <div className="surface-section">
            <div className="surface-section-header">
              <div className="text-xs font-bold uppercase tracking-widest text-on-surface">
                {t("watchlist.notificationRoutingTitle", "Notification Routing")}
              </div>
            </div>
            <div className="p-6 space-y-4">
              <span className="inline-flex rounded-sm bg-surface-container-highest px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                {smtpConfigured ? t("watchlist.smtpReady", "SMTP READY") : t("watchlist.smtpOffline", "SMTP OFFLINE")}
              </span>
              <div className="flex items-start gap-3 text-sm text-on-surface">
                <Mail className={`mt-0.5 h-4 w-4 ${smtpConfigured ? "text-primary" : "text-error"}`} />
                <span>
                  {smtpConfigured
                    ? t("watchlist.smtpReadyBody", "Verdict changes can trigger email. In-app and hybrid routes can already be configured per item.")
                    : t("watchlist.smtpOfflineBody", "This instance does not yet have operational SMTP configured.")}
                </span>
              </div>
            </div>
          </div>

          <div className="surface-section">
            <div className="surface-section-header">
              <div className="text-xs font-bold uppercase tracking-widest text-on-surface">
                {t("watchlist.fastTrackEntryTitle", "Fast-Track Entry")}
              </div>
            </div>
            <div className="p-6 space-y-5">
              <label className="block space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                  {t("watchlist.indicatorValue", "Indicator Value")}
                </div>
                <input
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder={t("watchlist.indicatorPlaceholder", "IP, domain or hash")}
                  className="w-full border-0 border-b-2 border-outline bg-surface-container-high px-0 py-3 text-sm text-on-surface outline-none focus:border-primary"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setNotifyOnChange((current) => !current)}
                  className={`inline-flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] ${
                    notifyOnChange ? "bg-primary text-white" : "bg-surface-container-high text-on-surface"
                  }`}
                >
                  {notifyOnChange ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                  {t("watchlist.alerts", "Alerts")}
                </button>
                <select
                  value={notificationRoute}
                  onChange={(event) => setNotificationRoute(event.target.value as WatchlistItem["notification_route"])}
                  className="w-full border-0 border-b-2 border-outline bg-surface-container-high px-0 py-2 text-sm text-on-surface outline-none focus:border-primary"
                >
                  <option value="email">{t("watchlist.routeOptionEmail", "email")}</option>
                  <option value="in_app">{t("watchlist.routeOptionInApp", "in_app")}</option>
                  <option value="both">{t("watchlist.routeOptionBoth", "both")}</option>
                </select>
              </div>
              <button
                onClick={addWatchlistItem}
                disabled={!target.trim() || busyId === "create"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {busyId === "create" ? t("watchlist.adding", "Adding") : t("watchlist.initializeEntry", "Initialize Entry")}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function buildWatchlistActions({
  item,
  onInspect,
  onToggle,
  onRoute,
  onRemove,
  busyId,
  t,
}: {
  item: WatchlistItem;
  onInspect: () => void;
  onToggle: () => void;
  onRoute: (route: WatchlistItem["notification_route"]) => void;
  onRemove: () => void;
  busyId: string;
  t: (key: string, fallback?: string) => string;
}): RowActionItem[] {
  return [
    {
      key: "details",
      label: t("watchlist.actionReviewContext", "Review indicator context"),
      icon: <Eye className="h-3.5 w-3.5" />,
      onSelect: onInspect,
    },
    {
      key: "toggle",
      label: item.notify_on_change
        ? t("watchlist.actionDisableNotifications", "Disable notifications")
        : t("watchlist.actionEnableNotifications", "Enable notifications"),
      icon: item.notify_on_change ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />,
      onSelect: onToggle,
      disabled: busyId === item.id,
    },
    {
      key: "route_email",
      label: t("watchlist.actionRouteEmail", "Route to email"),
      onSelect: () => onRoute("email"),
      disabled: busyId === item.id,
    },
    {
      key: "route_in_app",
      label: t("watchlist.actionRouteInApp", "Route to in-app"),
      onSelect: () => onRoute("in_app"),
      disabled: busyId === item.id,
    },
    {
      key: "route_both",
      label: t("watchlist.actionRouteBoth", "Route to email + in-app"),
      onSelect: () => onRoute("both"),
      disabled: busyId === item.id,
    },
    {
      key: "remove",
      label: t("watchlist.actionRemoveIndicator", "Remove indicator"),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onSelect: onRemove,
      tone: "danger",
      dividerBefore: true,
      disabled: busyId === item.id,
    },
  ];
}

function MetricBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className={`col-span-12 lg:col-span-3 bg-surface-container-low p-6 flex flex-col justify-between border-b-2 ${accent}`}>
      <div>
        <span className="text-[10px] font-bold text-outline uppercase tracking-[0.15em]">{label}</span>
        <div className="text-3xl font-extrabold mt-2 text-on-surface">{value}</div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Activity, Bell, BellOff, Eye, Mail, Plus, RefreshCw, ScanSearch, ShieldAlert, Trash2 } from "lucide-react";
import API_URL from "../config";
import { RowActionsMenu, RowPrimaryAction, type RowActionItem } from "../components/RowActions";

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

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
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

function routeLabel(route: WatchlistItem["notification_route"]) {
  switch (route) {
    case "both":
      return "Email + In-App";
    case "in_app":
      return "In-App";
    default:
      return "Email";
  }
}

function routeTone(route: WatchlistItem["notification_route"]) {
  if (route === "both") return "bg-primary/10 text-primary";
  if (route === "in_app") return "bg-surface-container-high text-on-surface";
  return "bg-surface-container-highest text-on-surface-variant";
}

export default function Watchlist() {
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
      setError("Não foi possível carregar a watchlist do operador.");
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
      setNotice("Indicador adicionado à watchlist.");
      await loadWatchlist();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(
        detail === "Target already in watchlist."
          ? "Esse alvo já está monitorado."
          : detail.includes("limit")
            ? detail
            : "Não foi possível adicionar o alvo à watchlist.",
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
      setError(detail || "Falha ao atualizar o indicador.");
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
      setNotice(`${data.updated || 0} indicador(es) atualizados.`);
      if (action === "delete") {
        setSelectedIds([]);
      }
      await loadWatchlist();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(detail || "Não foi possível executar a ação em massa.");
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

      setNotice("Indicador removido da watchlist.");
      await loadWatchlist();
    } catch {
      setError("Não foi possível remover o indicador.");
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
          ? `Novo veredito detectado: ${data.verdict}.`
          : `Scan manual concluído: ${data.verdict}.`,
      );
      await loadWatchlist();
      await loadHistory(itemId);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      setError(detail || "Falha ao executar o scan manual.");
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
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-eyebrow">Analyst</div>
          <h1 className="page-heading">Watchlist Monitoring</h1>
          <p className="page-subheading">
            Monitore IPs, domínios e hashes conhecidos com mudança de veredito,
            roteamento de alerta e histórico contínuo da plataforma.
          </p>
        </div>
      </div>

      <div className="page-toolbar">
        <div className="page-toolbar-copy">
          {selectedIds.length > 0 ? `${selectedIds.length} item(s) selected` : "Watchlist actions"}
        </div>
        <div className="page-toolbar-actions">
          <button onClick={loadWatchlist} className="btn btn-outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => void runBulkAction("enable_notifications")}
            className="btn btn-outline"
            disabled={!selectedIds.length || busyId === "bulk"}
          >
            <Bell className="h-4 w-4" />
            Enable alerts
          </button>
          <button
            onClick={() => void runBulkAction("disable_notifications")}
            className="btn btn-outline"
            disabled={!selectedIds.length || busyId === "bulk"}
          >
            <BellOff className="h-4 w-4" />
            Mute selected
          </button>
          <button
            onClick={() => void runBulkAction("set_route", "both")}
            className="btn btn-outline"
            disabled={!selectedIds.length || busyId === "bulk"}
          >
            Route both
          </button>
          <button
            onClick={() => void runBulkAction("delete")}
            className="btn btn-outline"
            disabled={!selectedIds.length || busyId === "bulk"}
          >
            <Trash2 className="h-4 w-4" />
            Remove selected
          </button>
        </div>
      </div>

      {(error || notice) && (
        <div className="space-y-3">
          {error && <div className="rounded-sm bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
          {notice && <div className="rounded-sm bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div>}
        </div>
      )}

      <div className="page-with-side-rail">
        <div className="page-main-pane grid grid-cols-12 gap-6">
          <MetricBlock label="Monitored Assets" value={String(items.length)} accent="border-primary" />
          <MetricBlock label="High Risk Hits" value={String(highRiskHits)} accent="border-error" />
          <MetricBlock label="Alert-Ready" value={String(notificationReadyCount)} accent="border-primary-dim" />
          <div className="col-span-12 lg:col-span-3 bg-surface-container-low p-6 flex flex-col justify-between border-b-2 border-outline">
            <div>
              <span className="text-[10px] font-bold text-outline uppercase tracking-[0.15em]">Route Mix</span>
              <div className="mt-3 space-y-2 text-sm text-on-surface">
                <div>Email: {routeMix.email}</div>
                <div>In-App: {routeMix.inApp}</div>
                <div>Both: {routeMix.both}</div>
              </div>
            </div>
          </div>

          <div className="col-span-12 surface-section">
            <div className="surface-section-header">
              <div className="flex gap-8 items-center">
                <button className="text-xs font-bold text-on-primary-container border-b-2 border-primary-dim pb-1 tracking-wider uppercase">
                  Active Entries ({items.length})
                </button>
              </div>
              <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                <Activity className="h-4 w-4" />
                Monitoring linked
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
                    <th className="px-6 py-3 text-[10px] font-bold text-outline uppercase tracking-widest">Type</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-outline uppercase tracking-widest">Indicator Value</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-outline uppercase tracking-widest">Last Scan</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-outline uppercase tracking-widest">Route</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-outline uppercase tracking-widest">Risk Level</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold text-outline uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-sm text-on-surface-variant">
                        Loading watchlist indicators
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
                            Awaiting Further Intelligence
                          </h3>
                          <p className="text-xs text-on-surface-variant leading-relaxed">
                            Nenhum indicador está sendo monitorado ainda. Adicione IPs, domínios ou hashes para iniciar cobertura contínua.
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
                        <td className="px-6 py-4 text-xs font-semibold text-on-surface">{item.target_type || "artifact"}</td>
                        <td
                          className="px-6 py-4 cursor-pointer"
                          onClick={() => setSelectedItemId(item.id)}
                        >
                          <code className="text-xs font-mono bg-surface-container-low px-2 py-1 rounded text-on-primary-container">
                            {item.target}
                          </code>
                        </td>
                        <td className="px-6 py-4 text-xs text-on-surface-variant">
                          {formatTimestamp(item.last_scan_at)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${routeTone(item.notification_route)}`}>
                            {routeLabel(item.notification_route)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${verdictClasses(item.last_verdict)}`}>
                            {item.last_verdict || "Awaiting first scan"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <RowPrimaryAction
                              label="Scan"
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
                                    `${item.target} - last verdict: ${item.last_verdict || "Awaiting first scan"} / last scan: ${formatTimestamp(item.last_scan_at)}`,
                                  );
                                },
                                onToggle: () =>
                                  void patchWatchlistItem(
                                    item.id,
                                    { notify_on_change: !item.notify_on_change },
                                    "Preferência de notificação atualizada.",
                                  ),
                                onRoute: (route) =>
                                  void patchWatchlistItem(
                                    item.id,
                                    { notification_route: route },
                                    "Canal de notificação atualizado.",
                                  ),
                                onRemove: () => void removeItem(item.id),
                                busyId,
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
                Notification Routing
              </div>
            </div>
            <div className="p-6 space-y-4">
              <span className="inline-flex rounded-sm bg-surface-container-highest px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                {smtpConfigured ? "SMTP READY" : "SMTP OFFLINE"}
              </span>
              <div className="flex items-start gap-3 text-sm text-on-surface">
                <Mail className={`mt-0.5 h-4 w-4 ${smtpConfigured ? "text-primary" : "text-error"}`} />
                <span>
                  {smtpConfigured
                    ? "Mudanças de veredito podem disparar email. Rotas in-app e híbridas já podem ser configuradas por item."
                    : "A instância ainda não possui SMTP operacional configurado."}
                </span>
              </div>
            </div>
          </div>

          <div className="surface-section">
            <div className="surface-section-header">
              <div className="text-xs font-bold uppercase tracking-widest text-on-surface">
                Fast-Track Entry
              </div>
            </div>
            <div className="p-6 space-y-5">
              <label className="block space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                  Indicator Value
                </div>
                <input
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder="IP, domain or hash"
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
                  Alerts
                </button>
                <select
                  value={notificationRoute}
                  onChange={(event) => setNotificationRoute(event.target.value as WatchlistItem["notification_route"])}
                  className="w-full border-0 border-b-2 border-outline bg-surface-container-high px-0 py-2 text-sm text-on-surface outline-none focus:border-primary"
                >
                  <option value="email">email</option>
                  <option value="in_app">in_app</option>
                  <option value="both">both</option>
                </select>
              </div>
              <button
                onClick={addWatchlistItem}
                disabled={!target.trim() || busyId === "create"}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {busyId === "create" ? "Adding" : "Initialize Entry"}
              </button>
            </div>
          </div>

          <div className="surface-section">
            <div className="surface-section-header">
              <div className="text-xs font-bold uppercase tracking-widest text-on-surface">
                Selected Indicator
              </div>
            </div>
            <div className="p-6 space-y-5">
              {selectedItem ? (
                <>
                  <div>
                    <div className="text-sm font-bold text-on-surface">{selectedItem.target}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-on-surface-variant">
                      {selectedItem.target_type} · last scan {formatTimestamp(selectedItem.last_scan_at)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${verdictClasses(selectedItem.last_verdict)}`}>
                      {selectedItem.last_verdict || "Awaiting first scan"}
                    </span>
                    <span className={`rounded-sm px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${routeTone(selectedItem.notification_route)}`}>
                      {routeLabel(selectedItem.notification_route)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Notification state</span>
                    <span className="font-medium text-on-surface">
                      {selectedItem.notify_on_change ? "Enabled" : "Muted"}
                    </span>
                  </div>
                  <div>
                    <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                      Historical trend
                    </div>
                    {loadingHistory ? (
                      <div className="text-sm text-on-surface-variant">Loading trend...</div>
                    ) : selectedTrend.length === 0 ? (
                      <div className="text-sm text-on-surface-variant">Nenhum histórico disponível ainda.</div>
                    ) : (
                      <>
                        <div className="flex h-28 items-end gap-2">
                          {selectedTrend.map((entry, index) => (
                            <div
                              key={`${entry.scanned_at}-${index}`}
                              className={`flex-1 rounded-t-sm ${
                                entry.verdict === "HIGH RISK" || entry.verdict === "CRITICAL"
                                  ? "bg-error/70"
                                  : entry.verdict === "SUSPICIOUS"
                                    ? "bg-warning/70"
                                    : "bg-primary/40"
                              }`}
                              style={{ height: `${entry.height}%` }}
                              title={`${formatTimestamp(entry.scanned_at)} • ${entry.verdict}`}
                            />
                          ))}
                        </div>
                        <div className="mt-4 space-y-2">
                          {selectedHistory.slice(0, 4).map((entry) => (
                            <div key={`${entry.scanned_at}-${entry.verdict}`} className="flex items-start justify-between gap-3 text-xs">
                              <span className="text-on-surface-variant">{formatTimestamp(entry.scanned_at)}</span>
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
                </>
              ) : (
                <div className="text-sm text-on-surface-variant">
                  Selecione um indicador para inspecionar rota, tendência e histórico.
                </div>
              )}
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
}: {
  item: WatchlistItem;
  onInspect: () => void;
  onToggle: () => void;
  onRoute: (route: WatchlistItem["notification_route"]) => void;
  onRemove: () => void;
  busyId: string;
}): RowActionItem[] {
  return [
    {
      key: "details",
      label: "Review indicator context",
      icon: <Eye className="h-3.5 w-3.5" />,
      onSelect: onInspect,
    },
    {
      key: "toggle",
      label: item.notify_on_change ? "Disable notifications" : "Enable notifications",
      icon: item.notify_on_change ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />,
      onSelect: onToggle,
      disabled: busyId === item.id,
    },
    {
      key: "route_email",
      label: "Route to email",
      onSelect: () => onRoute("email"),
      disabled: busyId === item.id,
    },
    {
      key: "route_in_app",
      label: "Route to in-app",
      onSelect: () => onRoute("in_app"),
      disabled: busyId === item.id,
    },
    {
      key: "route_both",
      label: "Route to email + in-app",
      onSelect: () => onRoute("both"),
      disabled: busyId === item.id,
    },
    {
      key: "remove",
      label: "Remove indicator",
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

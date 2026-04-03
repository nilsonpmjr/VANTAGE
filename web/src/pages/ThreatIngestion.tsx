import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Plus,
  Database,
  Mail,
  Info,
  RefreshCw,
  Trash2,
  Radar,
  Eye,
  Pencil,
  Power,
  X,
  Eraser,
} from "lucide-react";
import API_URL from "../config";
import { RowActionsMenu, RowPrimaryAction, type RowActionItem } from "../components/RowActions";
import { useLanguage } from "../context/LanguageContext";

type ThreatSource = {
  source_id: string;
  source_type: string;
  family: string;
  display_name: string;
  description?: string;
  enabled: boolean;
  config: Record<string, unknown>;
  sync_status?: {
    status: string;
    last_run_at?: string | null;
    last_error?: string | null;
    items_ingested?: number;
    duration_ms?: number | null;
  };
};

type ThreatSourcesPayload = {
  sources: ThreatSource[];
};

type SmtpConfig = {
  host: { value: string; configured: boolean };
  port: { value: number; configured: boolean };
  username: { value: string; configured: boolean };
  password: { configured: boolean };
  from: { value: string; configured: boolean };
  tls: { value: boolean; configured: boolean };
};

type MispSourceConfig = {
  source_id: string;
  enabled: boolean;
  display_name: string;
  config: {
    base_url?: string;
    api_key_configured?: boolean;
    verify_tls?: boolean;
    poll_interval_minutes?: number;
  };
  sync_status?: ThreatSource["sync_status"];
};

type ThreatSourceMetrics = {
  source_id: string;
  window_hours: number;
  throughput_gb_per_day: number;
  approx_payload_bytes: number;
  duration_series: Array<{
    timestamp?: string | null;
    duration_ms?: number | null;
    status?: string;
    items_ingested?: number;
  }>;
  recent_events: Array<{
    status: string;
    items_ingested?: number;
    duration_ms?: number | null;
    last_error?: string | null;
    last_run_at?: string | null;
    recorded_at?: string | null;
  }>;
};

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function statusMeta(source: ThreatSource) {
  if (!source.enabled) {
    return {
      dot: "bg-outline",
      label: "Disabled",
      chip: "bg-surface-container-highest text-on-surface-variant",
    };
  }
  const status = String(source.sync_status?.status || "").toLowerCase();
  if (status.includes("error") || status.includes("failed")) {
    return {
      dot: "bg-error",
      label: "Error",
      chip: "bg-error/10 text-error",
    };
  }
  if (status.includes("running") || status.includes("sync") || status.includes("pending")) {
    return {
      dot: "bg-primary/80 animate-pulse",
      label: "Syncing",
      chip: "bg-primary/10 text-primary",
    };
  }
  return {
    dot: "bg-emerald-500",
    label: "Active",
    chip: "bg-emerald-500/10 text-emerald-700",
  };
}

function protocolLabel(source: ThreatSource) {
  if (source.source_id === "misp_events") return "MISP/API";
  if (getFeedUrl(source)?.startsWith("https://")) return "HTTPS/RSS";
  if (getFeedUrl(source)?.startsWith("http://")) return "HTTP/RSS";
  return source.source_type.replace(/_/g, "/").toUpperCase();
}

function getFeedUrl(source: ThreatSource) {
  return typeof source.config?.feed_url === "string" ? source.config.feed_url : "";
}

function notifyFeedRuntimeUpdated() {
  window.dispatchEvent(new Event("vantage:feed-runtime-updated"));
}

export default function ThreatIngestion() {
  const { t } = useLanguage();
  const [sources, setSources] = useState<ThreatSource[]>([]);
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig | null>(null);
  const [mispConfig, setMispConfig] = useState<MispSourceConfig | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [showCustomSourceForm, setShowCustomSourceForm] = useState(false);
  const [editingCustomSourceId, setEditingCustomSourceId] = useState<string | null>(null);
  const [editingBuiltinSourceId, setEditingBuiltinSourceId] = useState<string | null>(null);
  const [selectedSourceMetrics, setSelectedSourceMetrics] = useState<ThreatSourceMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [smtpDraft, setSmtpDraft] = useState({
    host: "",
    port: "587",
    username: "",
    password: "",
    from_email: "",
    tls: true,
  });
  const [mispDraft, setMispDraft] = useState({
    enabled: false,
    display_name: "MISP Events",
    base_url: "",
    api_key: "",
    verify_tls: true,
    poll_interval_minutes: "30",
  });
  const [customSourceDraft, setCustomSourceDraft] = useState({
    title: "",
    feed_url: "",
    family: "custom",
    poll_interval_minutes: "60",
    default_tlp: "white",
    severity_floor: "",
  });

  async function loadRuntime() {
    setLoading(true);
    setError("");
    try {
      const [sourcesRes, smtpRes, mispRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/threat-sources`, { credentials: "include" }),
        fetch(`${API_URL}/api/admin/operational-config/smtp`, { credentials: "include" }),
        fetch(`${API_URL}/api/admin/threat-sources/misp`, { credentials: "include" }),
      ]);

      if (!sourcesRes.ok || !smtpRes.ok || !mispRes.ok) {
        throw new Error("threat_ingestion_load_failed");
      }

      const [sourcesData, smtpData, mispData] = await Promise.all([
        sourcesRes.json(),
        smtpRes.json(),
        mispRes.json(),
      ]);

      const sourceItems = (sourcesData as ThreatSourcesPayload).sources || [];
      const smtp = smtpData as SmtpConfig;
      const misp = mispData as MispSourceConfig;

      setSources(sourceItems);
      setSmtpConfig(smtp);
      setMispConfig(misp);
      setSelectedSourceId((current) => current || sourceItems[0]?.source_id || "");
      setSmtpDraft({
        host: smtp.host?.value || "",
        port: String(smtp.port?.value || 587),
        username: smtp.username?.value || "",
        password: "",
        from_email: smtp.from?.value || "",
        tls: Boolean(smtp.tls?.value),
      });
      setMispDraft({
        enabled: Boolean(misp.enabled),
        display_name: misp.display_name || "MISP Events",
        base_url: misp.config?.base_url || "",
        api_key: "",
        verify_tls: Boolean(misp.config?.verify_tls ?? true),
        poll_interval_minutes: String(misp.config?.poll_interval_minutes || 30),
      });
    } catch {
      setError("Não foi possível carregar as fontes de ingestão e o gateway SMTP.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRuntime();
  }, []);

  useEffect(() => {
    if (!selectedSourceId) {
      setSelectedSourceMetrics(null);
      return;
    }

    let active = true;
    async function loadSourceMetrics() {
      setMetricsLoading(true);
      try {
        const response = await fetch(
          `${API_URL}/api/admin/threat-sources/${encodeURIComponent(selectedSourceId)}/metrics`,
          { credentials: "include" },
        );
        if (!response.ok) throw new Error("source_metrics_load_failed");
        const payload = (await response.json()) as ThreatSourceMetrics;
        if (active) {
          setSelectedSourceMetrics(payload);
        }
      } catch {
        if (active) {
          setSelectedSourceMetrics(null);
        }
      } finally {
        if (active) {
          setMetricsLoading(false);
        }
      }
    }

    void loadSourceMetrics();
    return () => {
      active = false;
    };
  }, [selectedSourceId, sources]);

  const selectedSource = sources.find((item) => item.source_id === selectedSourceId) || sources[0] || null;
  const activeCount = useMemo(() => sources.filter((item) => item.enabled).length, [sources]);
  const syncingCount = useMemo(
    () =>
      sources.filter((item) => {
        const status = String(item.sync_status?.status || "").toLowerCase();
        return status.includes("sync") || status.includes("running") || status.includes("pending");
      }).length,
    [sources],
  );
  const latencyBars = useMemo(() => {
    const values =
      selectedSourceMetrics?.duration_series
        ?.slice(-8)
        .map((item) => Math.min(100, Math.max(12, Math.round((item.duration_ms || 0) / 40))))
        || [];
    return values.length ? values.slice(0, 8) : [40, 55, 45, 70, 30, 50, 85, 40];
  }, [selectedSourceMetrics]);
  const fortinetSources = useMemo(
    () => sources.filter((item) => item.family === "fortinet"),
    [sources],
  );
  const fortinetActiveCount = useMemo(
    () => fortinetSources.filter((item) => item.enabled).length,
    [fortinetSources],
  );
  const selectedSourceUrl = selectedSource ? getFeedUrl(selectedSource) : "";
  const fortinetEnabledUrls = useMemo(
    () => fortinetSources.filter((item) => item.enabled).map((item) => getFeedUrl(item)).filter(Boolean),
    [fortinetSources],
  );

  async function saveSmtpConfig() {
    setBusy("smtp");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/operational-config/smtp`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: smtpDraft.host,
          port: Number(smtpDraft.port),
          username: smtpDraft.username,
          password: smtpDraft.password || undefined,
          from_email: smtpDraft.from_email,
          tls: smtpDraft.tls,
        }),
      });
      if (!response.ok) throw new Error("smtp_save_failed");
      setNotice("Gateway SMTP atualizado.");
      await loadRuntime();
    } catch {
      setError("Falha ao salvar o gateway SMTP.");
    } finally {
      setBusy("");
    }
  }

  async function testSmtpConfig() {
    setBusy("smtp-test");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/operational-config/smtp/test`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("smtp_test_failed");
      setNotice("Teste SMTP disparado com sucesso.");
    } catch {
      setError("Falha ao executar o teste SMTP.");
    } finally {
      setBusy("");
    }
  }

  async function saveMispConfig() {
    setBusy("misp");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/threat-sources/misp`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: mispDraft.enabled,
          display_name: mispDraft.display_name,
          base_url: mispDraft.base_url,
          api_key: mispDraft.api_key || undefined,
          verify_tls: mispDraft.verify_tls,
          poll_interval_minutes: Number(mispDraft.poll_interval_minutes),
        }),
      });
      if (!response.ok) throw new Error("misp_save_failed");
      setNotice("Bridge MISP atualizada.");
      setMispDraft((current) => ({ ...current, api_key: "" }));
      await loadRuntime();
    } catch {
      setError("Falha ao salvar a configuração MISP.");
    } finally {
      setBusy("");
    }
  }

  async function testMispConnection() {
    setBusy("misp-test");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/threat-sources/misp/test`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("misp_test_failed");
      setNotice("Conectividade MISP validada com sucesso.");
      await loadRuntime();
    } catch {
      setError("Falha no teste de conectividade MISP.");
    } finally {
      setBusy("");
    }
  }

  async function createCustomSource() {
    setBusy("custom");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/threat-sources/custom`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: customSourceDraft.title,
          feed_url: customSourceDraft.feed_url,
          family: customSourceDraft.family,
          poll_interval_minutes: Number(customSourceDraft.poll_interval_minutes),
          default_tlp: customSourceDraft.default_tlp,
        }),
      });
      if (!response.ok) throw new Error("custom_source_create_failed");
      setNotice("Fonte manual criada.");
      setCustomSourceDraft({
        title: "",
        feed_url: "",
        family: "custom",
        poll_interval_minutes: "60",
        default_tlp: "white",
        severity_floor: "",
      });
      setShowCustomSourceForm(false);
      await loadRuntime();
      notifyFeedRuntimeUpdated();
    } catch {
      setError("Falha ao criar a fonte manual.");
    } finally {
      setBusy("");
    }
  }

  function resetCustomSourceDraft() {
    setCustomSourceDraft({
      title: "",
      feed_url: "",
      family: "custom",
      poll_interval_minutes: "60",
      default_tlp: "white",
      severity_floor: "",
    });
    setEditingCustomSourceId(null);
    setEditingBuiltinSourceId(null);
  }

  function openCreateCustomSourceForm() {
    resetCustomSourceDraft();
    setShowCustomSourceForm(true);
  }

  function openEditCustomSourceForm(source: ThreatSource) {
    setEditingBuiltinSourceId(null);
    setEditingCustomSourceId(source.source_id);
    setCustomSourceDraft({
      title: source.display_name || "",
      feed_url: String(source.config?.feed_url || ""),
      family: source.family || "custom",
      poll_interval_minutes: String(source.config?.poll_interval_minutes || 60),
      default_tlp: String(source.config?.default_tlp || "white"),
      severity_floor: "",
    });
    setSelectedSourceId(source.source_id);
    setShowCustomSourceForm(true);
  }

  function openEditBuiltinSourceForm(source: ThreatSource) {
    setEditingCustomSourceId(null);
    setEditingBuiltinSourceId(source.source_id);
    setCustomSourceDraft({
      title: source.display_name || "",
      feed_url: String(source.config?.feed_url || ""),
      family: source.family || "custom",
      poll_interval_minutes: String(source.config?.poll_interval_minutes || 60),
      default_tlp: "white",
      severity_floor: String(source.config?.severity_floor || ""),
    });
    setSelectedSourceId(source.source_id);
    setShowCustomSourceForm(true);
  }

  async function updateExistingCustomSource(sourceId: string) {
    setBusy(sourceId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/threat-sources/custom/${sourceId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: customSourceDraft.title,
          feed_url: customSourceDraft.feed_url,
          family: customSourceDraft.family,
          poll_interval_minutes: Number(customSourceDraft.poll_interval_minutes),
          default_tlp: customSourceDraft.default_tlp,
        }),
      });
      if (!response.ok) throw new Error("custom_source_update_failed");
      setNotice("Fonte manual atualizada.");
      resetCustomSourceDraft();
      setShowCustomSourceForm(false);
      await loadRuntime();
      notifyFeedRuntimeUpdated();
    } catch {
      setError("Falha ao atualizar a fonte manual.");
    } finally {
      setBusy("");
    }
  }

  async function updateExistingBuiltinSource(sourceId: string) {
    setBusy(sourceId);
    setError("");
    setNotice("");
    try {
      const payload: Record<string, unknown> = {
        display_name: customSourceDraft.title,
        feed_url: customSourceDraft.feed_url,
        poll_interval_minutes: Number(customSourceDraft.poll_interval_minutes),
      };
      if (sourceId === "cve_recent") {
        payload.severity_floor = customSourceDraft.severity_floor || "";
      }

      const response = await fetch(`${API_URL}/api/admin/threat-sources/${sourceId}/config`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("builtin_source_update_failed");
      setNotice("Threat source updated.");
      resetCustomSourceDraft();
      setShowCustomSourceForm(false);
      await loadRuntime();
      notifyFeedRuntimeUpdated();
    } catch {
      setError("Falha ao atualizar a fonte nativa.");
    } finally {
      setBusy("");
    }
  }

  async function deleteCustomSource(sourceId: string) {
    setBusy(sourceId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/threat-sources/custom/${sourceId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("custom_source_delete_failed");
      setNotice("Fonte manual removida.");
      await loadRuntime();
      notifyFeedRuntimeUpdated();
    } catch {
      setError("Falha ao remover a fonte manual.");
    } finally {
      setBusy("");
    }
  }

  async function toggleCustomSourceEnabled(source: ThreatSource) {
    setBusy(source.source_id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/threat-sources/custom/${source.source_id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !source.enabled }),
      });
      if (!response.ok) throw new Error("custom_source_toggle_failed");
      setNotice(source.enabled ? "Fonte desativada." : "Fonte ativada.");
      await loadRuntime();
      notifyFeedRuntimeUpdated();
    } catch {
      setError("Falha ao alternar o estado da fonte manual.");
    } finally {
      setBusy("");
    }
  }

  async function purgeOrphanedItems() {
    setBusy("purge");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/threat-sources/orphaned-items`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("purge_failed");
      const data = (await response.json()) as { deleted: number };
      setNotice(`${data.deleted} itens órfãos removidos do feed.`);
      notifyFeedRuntimeUpdated();
    } catch {
      setError("Não foi possível purgar os itens órfãos.");
    } finally {
      setBusy("");
    }
  }

  async function syncSourceNow(source: ThreatSource) {
    setBusy(`sync-${source.source_id}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/threat-sources/${encodeURIComponent(source.source_id)}/sync`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("threat_source_sync_failed");
      const payload = (await response.json()) as { status?: string; items_ingested?: number };
      setNotice(
        `Sincronização executada para ${source.display_name}: ${payload.status || "unknown"} (${payload.items_ingested ?? 0} item(ns)).`,
      );
      await loadRuntime();
      notifyFeedRuntimeUpdated();
    } catch {
      setError("Falha ao executar a sincronização imediata da fonte.");
    } finally {
      setBusy("");
    }
  }

  async function setSourceEnabled(source: ThreatSource, enabled: boolean) {
    setBusy(`toggle-${source.source_id}`);
    setError("");
    setNotice("");
    try {
      const action = enabled ? "resume" : "pause";
      const response = await fetch(
        `${API_URL}/api/admin/threat-sources/${encodeURIComponent(source.source_id)}/${action}`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("threat_source_operational_toggle_failed");
      setNotice(enabled ? "Fonte retomada para o próximo ciclo." : "Fonte pausada operacionalmente.");
      await loadRuntime();
      notifyFeedRuntimeUpdated();
    } catch {
      setError("Falha ao alterar o estado operacional da fonte.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page-frame">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-eyebrow">{t("admin.eyebrow", "Administration")}</div>
          <h1 className="page-heading">{t("settingsPages.threatIngestionTitle", "Threat Ingestion & SMTP")}</h1>
          <p className="page-subheading">
            {t("settingsPages.threatIngestionSubtitle", "Administre conectores, cadência de sincronização e o gateway SMTP em uma única área de gestão.")}
          </p>
        </div>
      </div>

      <div className="page-toolbar">
        <div className="page-toolbar-copy">{t("settingsPages.threatIngestionActions", "Global actions")}</div>
        <div className="page-toolbar-actions">
          <button
            onClick={() => void loadRuntime()}
            className="btn btn-outline"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              {t("admin.refresh", "Refresh")}
            </span>
          </button>
          <button
            onClick={() => void purgeOrphanedItems()}
            disabled={busy === "purge"}
            className="btn btn-outline text-error border-error/40 hover:bg-error/10"
            title="Remove feed items from deleted sources"
          >
            <Eraser className={`w-4 h-4 ${busy === "purge" ? "animate-pulse" : ""}`} />
            {t("settingsPages.purgeOrphaned", "Purge Orphaned")}
          </button>
          <button
            onClick={() =>
              showCustomSourceForm ? setShowCustomSourceForm(false) : openCreateCustomSourceForm()
            }
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" />
            {showCustomSourceForm ? t("settingsPages.closeForm", "Close Form") : t("settingsPages.newSource", "New Source")}
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
        <div className="page-main-pane space-y-8">
          <section className="surface-section">
            <div className="surface-section-header">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-primary" />
                <h2 className="surface-section-title">Threat Sources</h2>
              </div>
              <span className="summary-pill-muted">{activeCount} Active Sources</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/10">
                    <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                      Source
                    </th>
                    <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-widest text-center">
                      Protocol
                    </th>
                    <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                      Status
                    </th>
                    <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-widest text-right">
                      Volume (Items)
                    </th>
                    <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-widest text-right">
                      Last Sync
                    </th>
                    <th className="px-6 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-sm text-on-surface-variant">
                        Carregando fontes operacionais...
                      </td>
                    </tr>
                  ) : sources.length > 0 ? (
                    sources.map((source) => {
                      const meta = statusMeta(source);
                      const sourceIdentifier =
                        getFeedUrl(source) ||
                        source.display_name ||
                        source.source_id;
                      const isSelected = selectedSourceId === source.source_id;
                      return (
                        <tr
                          key={source.source_id}
                          className={`group transition-colors ${
                            isSelected ? "bg-primary/5" : "hover:bg-surface-container-low"
                          }`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-on-surface">
                                {source.display_name}
                              </span>
                              <span className="text-[11px] text-on-surface-variant font-mono">
                                {sourceIdentifier}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-[11px] font-bold bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded">
                              {protocolLabel(source)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${meta.dot}`}></span>
                              <span className="text-xs font-semibold text-on-surface">{meta.label}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-sm font-mono text-on-surface font-semibold">
                              {source.sync_status?.items_ingested ?? "—"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-[11px] text-on-surface-variant">
                              {formatTimestamp(source.sync_status?.last_run_at)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              <RowPrimaryAction
                                label="Inspect"
                                icon={<Eye className="h-3.5 w-3.5" />}
                                onClick={() => setSelectedSourceId(source.source_id)}
                              />
                              <RowActionsMenu
                                items={buildThreatSourceActions({
                                  source,
                                  onInspect: () => setSelectedSourceId(source.source_id),
                                  onSync: () => void syncSourceNow(source),
                                  onEdit: () =>
                                    source.source_id.startsWith("custom_")
                                      ? openEditCustomSourceForm(source)
                                      : openEditBuiltinSourceForm(source),
                                  onToggle: () =>
                                    source.source_id.startsWith("custom_")
                                      ? void toggleCustomSourceEnabled(source)
                                      : void setSourceEnabled(source, !source.enabled),
                                  onDelete: () => void deleteCustomSource(source.source_id),
                                  notify: setNotice,
                                })}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-sm text-on-surface-variant">
                        Nenhuma fonte de ingestão configurada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

        <section className="bg-surface-container-lowest border border-outline-variant/15 rounded shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-surface-container-high border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-sm tracking-tight text-on-surface">
                SMTP Protocol Gateway
              </h2>
            </div>
          </div>
          <form
            className="p-8 space-y-8"
            onSubmit={(event) => {
              event.preventDefault();
              void saveSmtpConfig();
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <FormField label="SMTP Server Address">
                <input
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                  value={smtpDraft.host}
                  onChange={(event) => setSmtpDraft((current) => ({ ...current, host: event.target.value }))}
                />
              </FormField>
              <FormField label="Port Cluster">
                <input
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                  value={smtpDraft.port}
                  onChange={(event) => setSmtpDraft((current) => ({ ...current, port: event.target.value }))}
                />
              </FormField>
              <FormField label="Authentication Identity">
                <input
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                  value={smtpDraft.username}
                  onChange={(event) => setSmtpDraft((current) => ({ ...current, username: event.target.value }))}
                  placeholder="smtp-user"
                />
              </FormField>
              <FormField label="Sender Alias">
                <input
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                  value={smtpDraft.from_email}
                  onChange={(event) => setSmtpDraft((current) => ({ ...current, from_email: event.target.value }))}
                  placeholder="alerts@vantage.security"
                />
              </FormField>
              <FormField label="Secret">
                <input
                  type="password"
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                  value={smtpDraft.password}
                  onChange={(event) => setSmtpDraft((current) => ({ ...current, password: event.target.value }))}
                  placeholder={smtpConfig?.password.configured ? "Stored secret present" : "optional"}
                />
              </FormField>
              <FormField label="Transport Security">
                <select
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all appearance-none"
                  value={smtpDraft.tls ? "tls" : "plain"}
                  onChange={(event) => setSmtpDraft((current) => ({ ...current, tls: event.target.value === "tls" }))}
                >
                  <option value="tls">TLS / STARTTLS</option>
                  <option value="plain">Plain</option>
                </select>
              </FormField>
            </div>
            <div className="pt-4 flex items-center justify-between border-t border-outline-variant/10">
              <div className="flex items-center gap-2 text-[11px] text-on-surface-variant italic">
                <Info className="w-4 h-4" />
                Settings applied globally to all security reporting nodes.
              </div>
              <div className="flex items-center gap-4">
                <button
                  className="px-6 py-2.5 border-2 border-primary text-primary text-xs font-bold rounded uppercase tracking-widest hover:bg-primary/5 transition-all"
                  type="button"
                  onClick={() => void testSmtpConfig()}
                >
                  {busy === "smtp-test" ? "Testing..." : "Test Connection"}
                </button>
                <button
                  className="px-6 py-2.5 bg-primary text-white text-xs font-bold rounded uppercase tracking-widest shadow-lg hover:shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60"
                  type="submit"
                  disabled={busy === "smtp"}
                >
                  {busy === "smtp" ? "Saving..." : "Save Protocol"}
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="surface-section overflow-hidden">
          <div className="surface-section-header">
            <div className="flex items-center gap-3">
              <Database className="w-4 h-4 text-primary" />
              <h3 className="surface-section-title">MISP Bridge</h3>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <FormField label="Display Name">
              <input
                className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                value={mispDraft.display_name}
                onChange={(event) => setMispDraft((current) => ({ ...current, display_name: event.target.value }))}
              />
            </FormField>
            <FormField label="Base URL">
              <input
                className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                value={mispDraft.base_url}
                onChange={(event) => setMispDraft((current) => ({ ...current, base_url: event.target.value }))}
                placeholder="https://misp..."
              />
            </FormField>
            <FormField label="API Key">
              <input
                type="password"
                className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                value={mispDraft.api_key}
                onChange={(event) => setMispDraft((current) => ({ ...current, api_key: event.target.value }))}
                placeholder={mispConfig?.config.api_key_configured ? "Stored API key present" : "optional"}
              />
            </FormField>
            <FormField label="Poll Interval (minutes)">
              <input
                className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                value={mispDraft.poll_interval_minutes}
                onChange={(event) => setMispDraft((current) => ({ ...current, poll_interval_minutes: event.target.value }))}
              />
            </FormField>
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-on-surface">Enabled</span>
              <button
                type="button"
                onClick={() => setMispDraft((current) => ({ ...current, enabled: !current.enabled }))}
                className={`w-10 h-5 relative rounded-full ${mispDraft.enabled ? "bg-primary" : "bg-surface-container-highest border border-outline-variant"}`}
              >
                <div className={`absolute top-1 w-3 h-3 rounded-full ${mispDraft.enabled ? "right-1 bg-white" : "left-1 bg-outline"}`}></div>
              </button>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-on-surface">Verify TLS</span>
              <button
                type="button"
                onClick={() => setMispDraft((current) => ({ ...current, verify_tls: !current.verify_tls }))}
                className={`w-10 h-5 relative rounded-full ${mispDraft.verify_tls ? "bg-primary" : "bg-surface-container-highest border border-outline-variant"}`}
              >
                <div className={`absolute top-1 w-3 h-3 rounded-full ${mispDraft.verify_tls ? "right-1 bg-white" : "left-1 bg-outline"}`}></div>
              </button>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => void testMispConnection()}
                className="flex-1 px-4 py-2 border-2 border-primary text-primary text-xs font-bold rounded uppercase tracking-widest hover:bg-primary/5 transition-all"
              >
                {busy === "misp-test" ? "Testing..." : "Test Bridge"}
              </button>
              <button
                onClick={() => void saveMispConfig()}
                className="flex-1 px-4 py-2 bg-primary text-white text-xs font-bold rounded uppercase tracking-widest shadow-lg hover:shadow-primary/20 transition-all disabled:opacity-60"
                disabled={busy === "misp"}
              >
                {busy === "misp" ? "Saving..." : "Save Bridge"}
              </button>
            </div>
          </div>
        </section>
        </div>

        <aside className="page-side-rail-right">
          {selectedSource && (
            <div className="bg-surface-container-lowest border border-outline-variant/15 rounded shadow-sm p-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Selected Source
                </p>
                <h3 className="text-sm font-bold text-on-surface mt-1">
                  {selectedSource.display_name}
                </h3>
                <p className="text-[11px] text-on-surface-variant font-mono mt-1">
                  {selectedSource.source_id}
                </p>
              </div>
              <p className="text-sm text-on-surface-variant">
                {selectedSource.description || "Sem descrição detalhada para esta fonte."}
              </p>
              <SourceMeta label="Last Sync" value={formatTimestamp(selectedSource.sync_status?.last_run_at)} />
              <SourceMeta label="Status" value={statusMeta(selectedSource).label} />
              <SourceMeta label="Family" value={selectedSource.family || "—"} />
              <SourceMeta label="Ingested" value={String(selectedSource.sync_status?.items_ingested ?? "—")} />
              <SourceMeta
                label="Sync Duration"
                value={
                  selectedSource.sync_status?.duration_ms
                    ? `${selectedSource.sync_status.duration_ms} ms`
                    : "—"
                }
              />
              {selectedSourceUrl ? (
                <SourceUrlMeta label="Feed URL" value={selectedSourceUrl} />
              ) : null}
              {selectedSource.sync_status?.last_error && (
                <div className="rounded-sm bg-error/10 px-3 py-2 text-xs text-error">
                  {selectedSource.sync_status.last_error}
                </div>
              )}
              <div className="rounded-sm bg-surface-container-low p-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Recent Source Events
                </div>
                {metricsLoading ? (
                  <div className="text-xs text-on-surface-variant">Loading source activity...</div>
                ) : selectedSourceMetrics?.recent_events?.length ? (
                  selectedSourceMetrics.recent_events.slice(0, 3).map((item, index) => (
                    <div key={`${item.last_run_at || item.recorded_at || "event"}-${index}`} className="border-b border-outline-variant/10 pb-2 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                          {item.status}
                        </span>
                        <span className="text-[10px] text-on-surface-variant">
                          {formatTimestamp(item.last_run_at || item.recorded_at)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-on-surface">
                        {item.items_ingested ?? 0} item(ns)
                        {item.duration_ms ? ` • ${item.duration_ms} ms` : ""}
                      </div>
                      {item.last_error ? (
                        <div className="mt-1 text-[11px] text-error">{item.last_error}</div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-on-surface-variant">
                    No source-level telemetry has been recorded yet.
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => void syncSourceNow(selectedSource)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest rounded-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  {busy === `sync-${selectedSource.source_id}` ? "Syncing..." : "Retry / Sync Now"}
                </button>
                <button
                  onClick={() =>
                    selectedSource.source_id.startsWith("custom_")
                      ? void toggleCustomSourceEnabled(selectedSource)
                      : void setSourceEnabled(selectedSource, !selectedSource.enabled)
                  }
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-surface-container-low text-on-surface text-xs font-bold uppercase tracking-widest rounded-sm"
                >
                  <Power className="w-4 h-4" />
                  {selectedSource.enabled ? "Pause Source" : "Resume Source"}
                </button>
              </div>
              {selectedSource.source_id.startsWith("custom_") && (
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => openEditCustomSourceForm(selectedSource)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest rounded-sm"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit Source
                  </button>
                  <button
                    onClick={() => void deleteCustomSource(selectedSource.source_id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-error/10 text-error text-xs font-bold uppercase tracking-widest rounded-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    {busy === selectedSource.source_id ? "Removing..." : "Delete Source"}
                  </button>
                </div>
              )}
              {!selectedSource.source_id.startsWith("custom_") && selectedSource.source_type === "rss" && (
                <button
                  onClick={() => openEditBuiltinSourceForm(selectedSource)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest rounded-sm"
                >
                  <Pencil className="w-4 h-4" />
                  Edit Source
                </button>
              )}
            </div>
          )}

          {fortinetSources.length > 0 && (
            <div className="bg-surface-container-lowest border border-outline-variant/15 rounded shadow-sm p-6 space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  FortiGuard RSS Bundle
                </p>
                <h3 className="text-sm font-bold text-on-surface mt-1">
                  Curated Fortinet intake
                </h3>
              </div>
              <p className="text-sm text-on-surface-variant">
                Keep the Fortinet outbreak and threat signal channels organized as one operational family inside the ingestion runtime.
              </p>
              <SourceMeta label="Channels" value={String(fortinetSources.length)} />
              <SourceMeta label="Active" value={String(fortinetActiveCount)} />
              <SourceMeta
                label="Sources"
                value={fortinetSources.map((item) => item.display_name).join(" • ")}
              />
              {fortinetEnabledUrls.length > 0 ? (
                <SourceUrlList label="Enabled Feed URLs" values={fortinetEnabledUrls} />
              ) : null}
            </div>
          )}

          <div className="bg-inverse-surface p-6 rounded shadow-xl text-white">
            <h3 className="font-bold text-xs uppercase tracking-[0.2em] opacity-60 mb-4">
              Service Integrity
            </h3>
            <div className="flex items-end justify-between mb-2">
              <span className="text-3xl font-black">
                {sources.length > 0 ? `${Math.round((activeCount / sources.length) * 100)}%` : "0%"}
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold uppercase">
                {activeCount > 0 ? "Optimal" : "Degraded"}
              </span>
            </div>
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${sources.length > 0 ? Math.max(8, Math.round((activeCount / sources.length) * 100)) : 0}%` }}
              ></div>
            </div>
            <p className="mt-4 text-xs text-gray-400 leading-relaxed">
              {syncingCount} source(s) are synchronizing. SMTP changes trigger a
              validation cycle across the reporting flow.
            </p>
          </div>

          <div className="bg-surface-container-high p-6 rounded border border-outline-variant/20">
            <h3 className="font-bold text-xs uppercase tracking-[0.2em] text-on-surface-variant mb-4">
              Source Activity
            </h3>
            <div className="relative h-24 flex items-end gap-1">
              {latencyBars.map((height, index) => (
                <div
                  key={`${height}-${index}`}
                  className={`flex-1 rounded-t-sm ${height > 75 ? "bg-primary/60" : "bg-primary/20"}`}
                  style={{ height: `${height}%` }}
                ></div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-bold text-on-surface-variant">
              <span>SYNC DURATION</span>
              <span>{selectedSourceMetrics?.window_hours || 24}H WINDOW</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-sm bg-surface-container-lowest px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Approx Throughput
                </div>
                <div className="mt-1 font-mono font-bold text-on-surface">
                  {selectedSourceMetrics ? `${selectedSourceMetrics.throughput_gb_per_day.toFixed(4)} GB/day` : "—"}
                </div>
              </div>
              <div className="rounded-sm bg-surface-container-lowest px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Last Duration
                </div>
                <div className="mt-1 font-mono font-bold text-on-surface">
                  {selectedSource?.sync_status?.duration_ms ? `${selectedSource.sync_status.duration_ms} ms` : "—"}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {showCustomSourceForm && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/35 p-4 sm:p-6">
          <div className="modal-surface mx-auto w-full max-w-4xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-outline-variant/10 bg-surface-container-high px-6 py-4">
              <div className="flex items-center gap-3">
                <Radar className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-on-surface">
                    {editingBuiltinSourceId
                      ? "Edit Threat Source"
                      : editingCustomSourceId
                        ? "Edit Manual Source"
                        : "Provision Manual Source"}
                  </h2>
                  <p className="mt-1 text-[11px] uppercase tracking-widest text-on-surface-variant">
                    {editingBuiltinSourceId
                      ? "Feed endpoint, cadence and operational trust posture"
                      : "Feed identity, cadence and trust posture"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCustomSourceForm(false);
                  resetCustomSourceDraft();
                }}
                className="text-on-surface-variant hover:text-on-surface"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
              <FormField label="Display Title">
                <input
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                  value={customSourceDraft.title}
                  onChange={(event) => setCustomSourceDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Partner CTI Feed"
                />
              </FormField>
              {!editingBuiltinSourceId ? (
                <FormField label="Family">
                  <input
                    className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                    value={customSourceDraft.family}
                    onChange={(event) => setCustomSourceDraft((current) => ({ ...current, family: event.target.value }))}
                  />
                </FormField>
              ) : (
                <FormField label="Family">
                  <input
                    className="w-full bg-surface-container-highest border-b-2 border-outline px-4 py-2.5 text-sm font-medium text-on-surface-variant outline-none"
                    value={customSourceDraft.family}
                    readOnly
                  />
                </FormField>
              )}
              <FormField label="Feed URL">
                <input
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                  value={customSourceDraft.feed_url}
                  onChange={(event) => setCustomSourceDraft((current) => ({ ...current, feed_url: event.target.value }))}
                  placeholder="https://..."
                />
              </FormField>
              <FormField label="Poll Interval">
                <input
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                  value={customSourceDraft.poll_interval_minutes}
                  onChange={(event) => setCustomSourceDraft((current) => ({ ...current, poll_interval_minutes: event.target.value }))}
                />
              </FormField>
              {editingBuiltinSourceId === "cve_recent" ? (
                <FormField label="Severity Floor">
                  <select
                    className="w-full appearance-none bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                    value={customSourceDraft.severity_floor}
                    onChange={(event) => setCustomSourceDraft((current) => ({ ...current, severity_floor: event.target.value }))}
                  >
                    <option value="">No floor</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="info">Info</option>
                  </select>
                </FormField>
              ) : !editingBuiltinSourceId ? (
                <FormField label="Default TLP">
                  <select
                    className="w-full appearance-none bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                    value={customSourceDraft.default_tlp}
                    onChange={(event) => setCustomSourceDraft((current) => ({ ...current, default_tlp: event.target.value }))}
                  >
                    <option value="white">White</option>
                    <option value="green">Green</option>
                    <option value="amber">Amber</option>
                    <option value="red">Red</option>
                  </select>
                </FormField>
              ) : (
                <div className="rounded-sm border border-outline-variant/15 bg-surface-container-low p-4 text-sm text-on-surface-variant">
                  Core sources keep their vendor/channel identity. This modal is only for endpoint and cadence updates.
                </div>
              )}
              <div className="rounded-sm border border-outline-variant/15 bg-surface-container-low p-4 text-sm text-on-surface-variant">
                {editingBuiltinSourceId
                  ? "Built-in sources follow the same operational lane as the rest of the runtime, but keep their source identity fixed."
                  : "Manual sources follow the same operational lane as native feeds. Save the source here and keep the selected-row context in the right rail for sync telemetry and quick actions."}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button
                type="button"
                onClick={() => {
                  setShowCustomSourceForm(false);
                  resetCustomSourceDraft();
                }}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  void (
                    editingBuiltinSourceId
                      ? updateExistingBuiltinSource(editingBuiltinSourceId)
                      : editingCustomSourceId
                      ? updateExistingCustomSource(editingCustomSourceId)
                      : createCustomSource()
                  )
                }
                disabled={
                  busy === "custom" ||
                  Boolean(editingCustomSourceId && busy === editingCustomSourceId) ||
                  Boolean(editingBuiltinSourceId && busy === editingBuiltinSourceId)
                }
                className="btn btn-primary"
              >
                {busy === "custom" ||
                Boolean(editingCustomSourceId && busy === editingCustomSourceId) ||
                Boolean(editingBuiltinSourceId && busy === editingBuiltinSourceId)
                  ? "Saving..."
                  : editingBuiltinSourceId
                    ? "Update Source"
                    : editingCustomSourceId
                    ? "Update Source"
                    : "Create Source"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildThreatSourceActions({
  source,
  onInspect,
  onSync,
  onEdit,
  onToggle,
  onDelete,
  notify,
}: {
  source: ThreatSource;
  onInspect: () => void;
  onSync: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  notify: (value: string) => void;
}): RowActionItem[] {
  return [
    {
      key: "sync-now",
      label: "Retry / sync now",
      icon: <RefreshCw className="h-3.5 w-3.5" />,
      onSelect: onSync,
    },
    {
      key: "inspect",
      label: "Focus source details",
      icon: <Eye className="h-3.5 w-3.5" />,
      onSelect: onInspect,
    },
    ...(source.sync_status?.last_error
      ? [
          {
            key: "last-error",
            label: "Review last sync error",
            icon: <Info className="h-3.5 w-3.5" />,
            onSelect: () => notify(source.sync_status?.last_error || "No error details available."),
          } satisfies RowActionItem,
        ]
      : []),
    ...(source.source_type === "rss"
      ? [
          {
            key: "edit",
            label: "Edit source configuration",
            icon: <Pencil className="h-3.5 w-3.5" />,
            onSelect: onEdit,
          } satisfies RowActionItem,
        ]
      : []),
    ...(source.source_id.startsWith("custom_")
      ? [
          {
            key: "toggle",
            label: source.enabled ? "Pause source" : "Resume source",
            icon: <Power className="h-3.5 w-3.5" />,
            onSelect: onToggle,
          } satisfies RowActionItem,
          {
            key: "delete",
            label: "Delete custom source",
            icon: <Trash2 className="h-3.5 w-3.5" />,
            onSelect: onDelete,
            tone: "danger",
            dividerBefore: true,
          } satisfies RowActionItem,
        ]
      : [
          {
            key: "toggle",
            label: source.enabled ? "Pause source" : "Resume source",
            icon: <Power className="h-3.5 w-3.5" />,
            onSelect: onToggle,
          } satisfies RowActionItem,
        ]),
  ];
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] text-on-surface-variant uppercase tracking-widest font-bold">
        {label}
      </label>
      {children}
    </div>
  );
}

function SourceMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-on-surface-variant">{label}</span>
      <span className="font-mono font-bold text-on-surface">{value}</span>
    </div>
  );
}

function SourceUrlMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2 text-xs">
      <span className="block text-on-surface-variant">{label}</span>
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="block break-all rounded-sm bg-surface-container-low px-3 py-2 font-mono text-[11px] font-bold text-primary hover:underline"
      >
        {value}
      </a>
    </div>
  );
}

function SourceUrlList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="space-y-2 text-xs">
      <span className="block text-on-surface-variant">{label}</span>
      <div className="space-y-2">
        {values.map((value) => (
          <a
            key={value}
            href={value}
            target="_blank"
            rel="noreferrer"
            className="block break-all rounded-sm bg-surface-container-low px-3 py-2 font-mono text-[11px] font-bold text-primary hover:underline"
          >
            {value}
          </a>
        ))}
      </div>
    </div>
  );
}

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Server,
  Settings,
  Shield,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format, formatDistanceToNow, isAfter } from "date-fns";
import { ptBR, enUS, es as esLocale } from "date-fns/locale";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import API_URL from "../config";
import ModalShell from "../components/modal/ModalShell";
import { PageHeader, PageMetricPill, PageToolbar, PageToolbarGroup } from "../components/page/PageChrome";
import {
  HandoffRichTextContent,
  HandoffRichTextEditor,
  handoffBodyHasMeaningfulContent,
} from "../components/shift-handoff/HandoffRichText";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface IncidentEntry {
  incident_id?: string;
  title: string;
  status: string;
  severity: string;
  action_needed: string;
}

interface ToolStatusEntry {
  name: string;
  status: string;
}

interface AttachmentEntry {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  data_uri: string;
  uploaded_by: string;
  uploaded_at: string;
}

interface EditHistoryEntry {
  edited_by: string;
  edited_at: string;
  previous_body: string;
}

interface HandoffDoc {
  id: string;
  shift_date: string;
  team_members: string[];
  body: string;
  visibility_days: number;
  expires_at: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  incidents: IncidentEntry[];
  tools_status: ToolStatusEntry[];
  observations: string;
  shift_focus: string;
  acknowledged_by: string;
  acknowledged_at: string | null;
  attachments: AttachmentEntry[];
  edit_history: EditHistoryEntry[];
}

interface ActiveIncidentItem {
  id: string;
  handoff_id: string;
  handoff_shift_date: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  resolved_at?: string | null;
  resolved_by?: string;
  team_members: string[];
  title: string;
  severity: string;
  status: string;
  action_needed: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BUILTIN_DEFAULT_TOOLS = ["SOAR", "SIEM", "Grafana (Dashboard)", "VPN", "EDR", "Firewall"];
const TOOL_STATUSES = ["operational", "degraded", "down", "maintenance"] as const;
const INCIDENT_SEVERITIES = ["critical", "high", "medium", "low"] as const;
const INCIDENT_STATUSES = ["active", "monitoring", "escalated", "resolved"] as const;
const VISIBILITY_OPTIONS = [4, 7, 14, 30] as const;
const FILTER_OPTIONS = [0, 4, 7, 14, 30] as const; // 0 = all active
const HANDOFF_BODY_MAX_LENGTH = 500000;

const SETTINGS_KEY = "vantage_handoff_settings";

interface HandoffSettings {
  tools: string[];
  defaultVisibility: number;
}

function loadSettings(): HandoffSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { tools: BUILTIN_DEFAULT_TOOLS, defaultVisibility: 4 };
}

function saveSettings(s: HandoffSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function getDateFnsLocale(locale: string) {
  if (locale.startsWith("es")) return esLocale;
  if (locale.startsWith("en")) return enUS;
  return ptBR;
}

function getCurrentShift() {
  const now = new Date();
  const h = now.getHours();
  const isDay = h >= 7 && h < 19;
  const shiftDate = new Date(now);
  if (!isDay && h >= 19) shiftDate.setDate(shiftDate.getDate() + 1);
  return {
    period: isDay ? "day" : "night",
    date: shiftDate.toISOString().split("T")[0],
    label: isDay ? "07:00 – 19:00" : "19:00 – 07:00",
  };
}

function toolStatusLabel(status: string, t: (k: string, f?: string) => string): string {
  switch (status) {
    case "operational": return t("shift_handoff.toolOk", "Operational");
    case "degraded": return t("shift_handoff.toolDeg", "Degraded");
    case "down": return t("shift_handoff.toolDown", "Down");
    case "maintenance": return t("shift_handoff.toolMaint", "Maintenance");
    default: return status;
  }
}

function toolStatusColor(status: string) {
  switch (status) {
    case "operational": return "text-emerald-400";
    case "degraded": return "text-amber-400";
    case "down": return "text-red-400";
    case "maintenance": return "text-secondary";
    default: return "text-on-surface-variant";
  }
}

function toolDotColor(status: string) {
  switch (status) {
    case "operational": return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse";
    case "degraded": return "bg-amber-400";
    case "down": return "bg-red-400";
    case "maintenance": return "bg-secondary";
    default: return "bg-on-surface-variant";
  }
}

function severityDot(severity: string) {
  switch (severity) {
    case "critical": return "bg-error shadow-[0_0_8px_rgba(248,113,113,0.5)]";
    case "high": return "bg-orange-500";
    case "medium": return "bg-amber-400";
    default: return "bg-primary";
  }
}

function incidentBadge(status: string) {
  switch (status) {
    case "active": return "badge-error";
    case "escalated": return "badge-error";
    case "monitoring": return "badge-warning";
    case "resolved": return "badge-success";
    default: return "badge-neutral";
  }
}

function incidentStatusLabel(status: string, t: (k: string, f?: string) => string) {
  switch (status) {
    case "active": return t("shift_handoff.statusActive", "Active");
    case "monitoring": return t("shift_handoff.statusMonitoring", "Monitoring");
    case "escalated": return t("shift_handoff.statusEscalated", "Escalated");
    case "resolved": return t("shift_handoff.statusResolved", "Resolved");
    default: return status;
  }
}

function severityLabel(sev: string, t: (k: string, f?: string) => string) {
  switch (sev) {
    case "critical": return t("shift_handoff.sevCritical", "Critical");
    case "high": return t("shift_handoff.sevHigh", "High");
    case "medium": return t("shift_handoff.sevMedium", "Medium");
    case "low": return t("shift_handoff.sevLow", "Low");
    default: return sev;
  }
}

type ContinuityWindowSummary = {
  windowDays: 4 | 7 | 14 | 30;
  handoffs: Array<{
    id: string;
    shiftDate: string;
    createdBy: string;
    teamMembers: string[];
    shiftFocus: string;
    notePreview: string;
    activeIncidentCount: number;
  }>;
};

function extractPlainTextFromBody(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function buildContinuitySummary(currentHandoff: HandoffDoc | null, handoffs: HandoffDoc[]): ContinuityWindowSummary[] {
  const now = new Date();
  const windows = [4, 7, 14, 30] as const;

  return windows.map((windowDays) => {
    const relevant = handoffs
      .filter(
        (handoff) =>
          handoff.id !== currentHandoff?.id &&
          handoff.visibility_days === windowDays &&
          new Date(handoff.expires_at) > now,
      )
      .map((handoff) => ({
        id: handoff.id,
        shiftDate: handoff.shift_date,
        createdBy: handoff.created_by,
        teamMembers: handoff.team_members,
        shiftFocus: handoff.shift_focus,
        notePreview: extractPlainTextFromBody(handoff.body).slice(0, 180),
        activeIncidentCount:
          handoff.incidents?.filter((incident) => incident.status !== "resolved").length ?? 0,
      }));

    return {
      windowDays,
      handoffs: relevant,
    };
  });
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ShiftHandoff() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const dateFnsLocale = getDateFnsLocale(locale);

  const [handoffs, setHandoffs] = useState<HandoffDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingHandoff, setEditingHandoff] = useState<HandoffDoc | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [daysFilter, setDaysFilter] = useState<number>(0); // 0 = all active
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<HandoffSettings>(loadSettings);

  const currentShift = useMemo(() => getCurrentShift(), []);
  const canDelete = user?.role === "admin" || user?.role === "manager";

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchHandoffs = useCallback(async (options?: { focusNewest?: boolean }) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (daysFilter > 0) params.set("days", String(daysFilter));
      const qs = params.toString();
      const res = await fetch(`${API_URL}/api/shift-handoffs${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const data: HandoffDoc[] = await res.json();
      setHandoffs(data);
      setExpandedId((current) => {
        if (options?.focusNewest) return data[0]?.id ?? null;
        if (!current) return data[0]?.id ?? null;
        return data.some((item) => item.id === current) ? current : data[0]?.id ?? null;
      });
    } catch {
      setError(t("shift_handoff.loadFailed", "Could not load shift handoffs."));
    } finally {
      setLoading(false);
    }
  }, [t, daysFilter]);

  useEffect(() => { void fetchHandoffs(); }, [daysFilter]);

  useEffect(() => {
    if ((location.state as { openSettings?: boolean } | null)?.openSettings) {
      setShowSettings(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  // Clear notices
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function acknowledgeHandoff(id: string) {
    try {
      const res = await fetch(`${API_URL}/api/shift-handoffs/${id}/acknowledge`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      setNotice(t("shift_handoff.acknowledged", "Handoff acknowledged."));
      void fetchHandoffs();
    } catch {
      setError(t("shift_handoff.ackFailed", "Could not acknowledge handoff."));
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`${API_URL}/api/shift-handoffs/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      setNotice(t("shift_handoff.deleted", "Handoff deleted."));
      setConfirmDeleteId(null);
      void fetchHandoffs();
    } catch {
      setError(t("shift_handoff.deleteFailed", "Could not delete handoff."));
    }
  }

  async function uploadSingleFile(handoffId: string, file: File) {
    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/api/shift-handoffs/${handoffId}/attachments`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error();
      setNotice(t("shift_handoff.imageUploaded", "Image uploaded."));
      void fetchHandoffs();
    } catch {
      setError(t("shift_handoff.uploadFailed", "Could not upload image."));
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function deleteAttachment(handoffId: string, attachmentId: string) {
    try {
      const res = await fetch(
        `${API_URL}/api/shift-handoffs/${handoffId}/attachments/${attachmentId}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error();
      void fetchHandoffs();
    } catch {
      setError(t("shift_handoff.deleteFailed", "Could not delete attachment."));
    }
  }

  function canEdit(item: HandoffDoc) {
    return user?.role === "admin" || user?.role === "manager" || user?.username === item.created_by;
  }

  function openEdit(handoff: HandoffDoc) {
    setEditingHandoff(handoff);
    setIsFormOpen(true);
  }

  function openCreate() {
    setEditingHandoff(null);
    setIsFormOpen(true);
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const activeIncidents = handoffs.reduce(
      (sum, h) => sum + (h.incidents?.filter((i) => i.status === "active" || i.status === "escalated").length ?? 0),
      0,
    );
    const authors = new Set(handoffs.map((h) => h.created_by));
    return { total: handoffs.length, activeIncidents, uniqueAuthors: authors.size };
  }, [handoffs]);

  // Latest tools status from most recent handoff, falling back to user settings
  const latestToolsStatus = useMemo(() => {
    const latestSnapshot = handoffs[0]?.tools_status || [];
    const statusByTool = new Map(
      latestSnapshot.map((tool) => [tool.name.trim().toLowerCase(), tool.status]),
    );

    return settings.tools.map((name) => ({
      name,
      status: statusByTool.get(name.trim().toLowerCase()) || "operational",
    }));
  }, [handoffs, settings.tools]);
  const operationalToolsCount = useMemo(
    () => latestToolsStatus.filter((tool) => tool.status === "operational").length,
    [latestToolsStatus],
  );
  const currentVisibilityLabel = useMemo(() => {
    if (daysFilter === 0) return t("shift_handoff.filterAll", "All");
    return t(`shift_handoff.filter${daysFilter}d` as `shift_handoff.filter4d`, `${daysFilter}d`);
  }, [daysFilter, t]);
  const continuitySummaryByHandoff = useMemo(
    () =>
      Object.fromEntries(
        handoffs.map((handoff) => [handoff.id, buildContinuitySummary(handoff, handoffs)]),
      ) as Record<string, ContinuityWindowSummary[]>,
    [handoffs],
  );

  // Collect only unresolved incidents from previous shifts still within visibility
  function getUnresolvedFromPrevious(handoff: HandoffDoc) {
    const results: { shiftDate: string; team: string[]; incident: IncidentEntry }[] = [];
    for (const h of handoffs) {
      if (h.id === handoff.id) continue;
      if (h.shift_date >= handoff.shift_date) continue;
      if (!isAfter(new Date(h.expires_at), new Date(handoff.created_at))) continue;
      for (const inc of h.incidents ?? []) {
        if (inc.status !== "resolved") {
          results.push({ shiftDate: h.shift_date, team: h.team_members, incident: inc });
        }
      }
    }
    return results;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="page-frame">
      <PageHeader
        eyebrow={
          <>
            {t("shift_handoff.eyebrow", "Operations")}
          </>
        }
        title={t("shift_handoff.title", "SOC Shift Handoff")}
        description={t("shift_handoff.subtitle", "Register and review shift handoffs for your SOC rotation teams.")}
        metrics={
          <>
            <PageMetricPill
              label={`${stats.total} ${t("shift_handoff.statActive", "active")}`}
              dotClassName="bg-primary"
              tone="primary"
            />
            <PageMetricPill
              label={`${stats.activeIncidents} ${t("shift_handoff.sectionIncidents", "incidents")}`}
              dotClassName={stats.activeIncidents > 0 ? "bg-amber-500" : "bg-emerald-500"}
              tone={stats.activeIncidents > 0 ? "warning" : "success"}
            />
            <PageMetricPill
              label={`${operationalToolsCount}/${latestToolsStatus.length} ${t("shift_handoff.sectionTools", "tools")}`}
              dotClassName={operationalToolsCount === latestToolsStatus.length ? "bg-emerald-500" : "bg-secondary"}
            />
          </>
        }
      />

      <PageToolbar label={t("shift_handoff.visibilityFilter", "Visibility filter")}>
        <PageToolbarGroup compact>
          {FILTER_OPTIONS.map((d) => {
            const label = d === 0
              ? t("shift_handoff.filterAll", "All")
              : t(`shift_handoff.filter${d}d` as `shift_handoff.filter4d`, `${d}d`);
            const isActive = daysFilter === d;

            return (
              <button
                key={d}
                type="button"
                onClick={() => setDaysFilter(d)}
                className={cn(
                  "shift-handoff-visibility-filter-button",
                  isActive
                    ? "shift-handoff-visibility-filter-button-active"
                    : "shift-handoff-visibility-filter-button-inactive",
                )}
              >
                {label}
              </button>
            );
          })}
        </PageToolbarGroup>
        <PageToolbarGroup>
          <button type="button" onClick={() => navigate("/shift-handoff/incidents")} className="btn btn-outline">
            <AlertTriangle className="w-4 h-4" />
            {t("shift_handoff.activeIncidentBoard", "Active Incidents")}
          </button>
          <button type="button" onClick={() => navigate("/shift-handoff/history")} className="btn btn-outline">
            <History className="w-4 h-4" />
            {t("shift_handoff.history", "History")}
          </button>
          <button type="button" onClick={() => setShowSettings(true)} className="btn btn-outline">
            <Settings className="w-4 h-4" />
            {t("shift_handoff.settings", "Settings")}
          </button>
          <button type="button" onClick={openCreate} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            {t("shift_handoff.newHandoff", "New Handoff")}
          </button>
        </PageToolbarGroup>
      </PageToolbar>

      {/* Notices */}
      {notice && (
        <div className="rounded-sm bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 text-xs font-bold text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5" /> {notice}
        </div>
      )}
      {error && (
        <div className="rounded-sm bg-error/10 border border-error/20 px-4 py-2.5 text-xs font-bold text-error flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
          <button type="button" aria-label="Dismiss" onClick={() => setError("")} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Main Grid: Timeline + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Timeline */}
        <div className="lg:col-span-8 space-y-6">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-sm">{t("shift_handoff.loading", "Loading handoffs...")}</span>
            </div>
          )}

          {/* Empty */}
          {!loading && handoffs.length === 0 && (
            <div className="card p-12 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-7 w-7 text-primary/50" />
              </div>
              <p className="text-sm font-bold text-on-surface">{t("shift_handoff.emptyTitle", "No active handoffs")}</p>
              <p className="text-xs text-on-surface-variant text-center max-w-sm">{t("shift_handoff.emptyBody", "Create one to get started.")}</p>
              <button type="button" onClick={openCreate} className="btn btn-primary mt-2">
                <Plus className="h-4 w-4" /> {t("shift_handoff.createCurrentShift", "Create handoff for this shift")}
              </button>
            </div>
          )}

          {/* Handoff Cards */}
          <div className="space-y-4">
            <AnimatePresence>
              {handoffs.map((handoff) => {
                const isExpanded = expandedId === handoff.id;
                const unresolvedPrev = getUnresolvedFromPrevious(handoff);
                const continuitySummary = continuitySummaryByHandoff[handoff.id] || [];
                const shiftPeriod = (() => {
                  const created = new Date(handoff.created_at);
                  const h = created.getHours();
                  return h >= 7 && h < 19 ? "day" : "night";
                })();

                return (
                  <motion.div
                    key={handoff.id}
                    id={`handoff-card-${handoff.id}`}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={cn(
                      "card transition-colors duration-300",
                      isExpanded ? "border-primary/30 shadow-md" : "hover:border-outline-variant/40",
                    )}
                  >
                    {/* Card Header (clickable) */}
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : handoff.id)}
                      className="w-full p-5 flex items-center gap-5 cursor-pointer select-none text-left"
                    >
                      <div
                        className={cn(
                          "w-12 h-12 rounded-sm flex items-center justify-center shrink-0 border",
                          shiftPeriod === "day"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
                        )}
                      >
                        {shiftPeriod === "day" ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <h3 className="text-lg font-bold text-on-surface truncate">
                            {format(new Date(handoff.shift_date + "T12:00:00"), "dd 'de' MMMM, yyyy", { locale: dateFnsLocale })}
                          </h3>
                          <span className="badge badge-neutral">
                            {shiftPeriod === "day" ? t("shift_handoff.periodDay", "Day") : t("shift_handoff.periodNight", "Night")}
                          </span>
                          {handoff.acknowledged_by && (
                            <span className="badge badge-success flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> {t("shift_handoff.ackBy", "ack")}
                            </span>
                          )}
                          {handoff.incidents?.some((i) => i.status === "active" || i.status === "escalated") && (
                            <span className="badge badge-error flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {handoff.incidents.filter((i) => i.status === "active" || i.status === "escalated").length}{" "}
                              {t("shift_handoff.openIncidents", "open incidents")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-on-surface-variant">
                          <span className="flex items-center gap-1.5 font-medium truncate">
                            <Users className="w-4 h-4 shrink-0" />
                            {handoff.team_members.slice(0, 3).join(", ")}
                            {handoff.team_members.length > 3 && <span className="text-[10px]">+{handoff.team_members.length - 3}</span>}
                          </span>
                          <span className="flex items-center gap-1.5 font-medium whitespace-nowrap">
                            <Clock className="w-4 h-4 shrink-0" />
                            {t("shift_handoff.expiresAt", "Expires")}{" "}
                            {formatDistanceToNow(new Date(handoff.expires_at), { locale: dateFnsLocale, addSuffix: true })}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-on-surface-variant">
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    </button>

                    {/* Expanded Content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-t border-outline-variant/10"
                        >
                          <div className="p-6 space-y-8 bg-surface-container-low/50">
                            {/* Shift Focus */}
                            {handoff.shift_focus && (
                              <div className="rounded-sm bg-primary/5 border border-primary/15 px-4 py-3 flex items-start gap-3">
                                <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                <div>
                                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-primary mb-1">
                                    {t("shift_handoff.shiftFocusLabel", "Shift Focus")}
                                  </div>
                                  <p className="text-sm text-on-surface">{handoff.shift_focus}</p>
                                </div>
                              </div>
                            )}

                            {/* Summary / Body */}
                            <div>
                              <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                                <MessageSquare className="w-3.5 h-3.5" />
                                {t("shift_handoff.sectionNotes", "Handoff Notes")}
                              </h4>
                              <HandoffRichTextContent
                                body={handoff.body}
                                className="bg-surface-container-high/20 rounded-sm border border-outline-variant/10 p-4"
                              />
                            </div>

                            <div>
                              <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                                <History className="w-3.5 h-3.5" />
                                {t("shift_handoff.continuitySummary", "Continuity Summary")}
                              </h4>
                              <div className="grid gap-3 lg:grid-cols-2">
                                {continuitySummary.map((windowSummary) => (
                                  <div
                                    key={windowSummary.windowDays}
                                    className="rounded-sm border border-outline-variant/15 bg-surface-container-low p-4 space-y-2"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant">
                                        {windowSummary.windowDays}d
                                      </span>
                                      <span className="badge badge-neutral">
                                        {windowSummary.handoffs.length} {t("shift_handoff.historyCount", "handoffs")}
                                      </span>
                                    </div>
                                    {windowSummary.handoffs.length > 0 ? (
                                      <div className="space-y-2">
                                        {windowSummary.handoffs.map((continuityHandoff) => (
                                          <button
                                            key={continuityHandoff.id}
                                            type="button"
                                            onClick={() => {
                                              setExpandedId(continuityHandoff.id);
                                              document
                                                .getElementById(`handoff-card-${continuityHandoff.id}`)
                                                ?.scrollIntoView({ behavior: "smooth", block: "center" });
                                            }}
                                            className="w-full rounded-sm border border-outline-variant/10 bg-surface-container-high/40 p-3 text-left transition-colors hover:border-primary/30 hover:bg-surface-container-high"
                                          >
                                            <div className="flex items-center justify-between gap-3">
                                              <span className="text-xs font-bold text-on-surface">
                                                {format(new Date(continuityHandoff.shiftDate + "T12:00:00"), "dd/MM/yyyy", { locale: dateFnsLocale })}
                                              </span>
                                              <span className="badge badge-neutral">
                                                {continuityHandoff.activeIncidentCount} {t("shift_handoff.openIncidents", "Open Incidents")}
                                              </span>
                                            </div>
                                            <div className="mt-1 text-[11px] text-on-surface-variant">
                                              {t("shift_handoff.by", "by")} {continuityHandoff.createdBy} · {continuityHandoff.teamMembers.join(", ")}
                                            </div>
                                            {continuityHandoff.shiftFocus ? (
                                              <div className="mt-2 text-xs font-bold text-primary">
                                                {continuityHandoff.shiftFocus}
                                              </div>
                                            ) : null}
                                            <div className="mt-2 text-sm text-on-surface leading-relaxed">
                                              {continuityHandoff.notePreview || t("shift_handoff.noContinuityNote", "No summarized notes available.")}
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-sm text-on-surface-variant">
                                        {t("shift_handoff.noContinuityData", "No persistent handoffs in this window.")}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Additional Info / Observations */}
                            {handoff.observations && (
                              <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                                  <FileText className="w-3.5 h-3.5" />
                                  {t("shift_handoff.fieldObservations", "Additional Observations")}
                                </h4>
                                <p className="text-sm text-on-surface-variant leading-relaxed">{handoff.observations}</p>
                              </div>
                            )}

                            {/* Incidents */}
                            {handoff.incidents && handoff.incidents.length > 0 && (
                              <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  {t("shift_handoff.sectionIncidents", "Active Incidents")}
                                </h4>
                                <div className="grid gap-3">
                                  {handoff.incidents.map((inc, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-surface-container border border-outline-variant/20 p-3 rounded-sm">
                                      <div className="flex items-center gap-3">
                                        <span className={cn("w-2 h-2 rounded-full shrink-0", severityDot(inc.severity))} />
                                        <span className="font-bold text-on-surface text-sm">{inc.title}</span>
                                        {inc.action_needed && (
                                          <span className="text-xs text-on-surface-variant">— {inc.action_needed}</span>
                                        )}
                                      </div>
                                      <span className={cn("badge", incidentBadge(inc.status))}>
                                        {incidentStatusLabel(inc.status, t)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Tools Status */}
                            {handoff.tools_status && handoff.tools_status.length > 0 && (
                              <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                                  <Server className="w-3.5 h-3.5" />
                                  {t("shift_handoff.sectionTools", "Monitoring Tools Status")}
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {handoff.tools_status.map((tool, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-surface-container border border-outline-variant/20 px-3 py-1.5 rounded-sm">
                                      <span className="text-xs font-bold text-on-surface">{tool.name}:</span>
                                      <span className={cn("text-[10px] font-black uppercase tracking-widest", toolStatusColor(tool.status))}>
                                        {toolStatusLabel(tool.status, t)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Attachments */}
                            {handoff.attachments && handoff.attachments.length > 0 && (
                              <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                                  <Paperclip className="w-3.5 h-3.5" />
                                  {t("shift_handoff.sectionAttachments", "Image Attachments")} ({handoff.attachments.length})
                                </h4>
                                <div className="flex flex-wrap gap-3">
                                  {handoff.attachments.map((att) => (
                                    <div key={att.id} className="relative group">
                                      <button
                                        type="button"
                                        onClick={() => setLightboxSrc(att.data_uri)}
                                        className="block w-28 h-28 rounded-sm overflow-hidden border border-outline-variant/20 hover:ring-2 hover:ring-primary/30 transition-all"
                                      >
                                        <img src={att.data_uri} alt={att.filename} className="w-full h-full object-cover" />
                                      </button>
                                      {canEdit(handoff) && (
                                        <button
                                          type="button"
                                          aria-label={t("shift_handoff.removeAttachment", "Remove attachment")}
                                          onClick={() => void deleteAttachment(handoff.id, att.id)}
                                          className="absolute top-1 right-1 w-5 h-5 bg-error/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {canEdit(handoff) && handoff.attachments.length < 5 && (
                                  <label className="btn btn-outline text-xs cursor-pointer inline-flex mt-3">
                                    {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                                    {t("shift_handoff.addImage", "Add image")}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      disabled={uploadingAttachment}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) void uploadSingleFile(handoff.id, f);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                            )}

                            {/* Inline attach when no attachments yet */}
                            {(!handoff.attachments || handoff.attachments.length === 0) && canEdit(handoff) && (
                              <label className="btn btn-outline text-xs cursor-pointer inline-flex">
                                {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                                {t("shift_handoff.attachImage", "Attach image")}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={uploadingAttachment}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void uploadSingleFile(handoff.id, f);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            )}

                            {/* Unresolved Incidents from Previous Shifts */}
                            {unresolvedPrev.length > 0 && (
                              <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                                  <History className="w-3.5 h-3.5" />
                                  {t("shift_handoff.unresolvedFromPrev", "Unresolved Incidents from Previous Shifts")}
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {unresolvedPrev.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center gap-2 bg-surface-container border border-outline-variant/20 px-3 py-1.5 rounded-sm"
                                    >
                                      <span className={cn("w-2 h-2 rounded-full shrink-0", severityDot(item.incident.severity))} />
                                      <span className="text-xs font-bold text-on-surface">{item.incident.title}</span>
                                      <span className={cn("badge text-[9px]", incidentBadge(item.incident.status))}>
                                        {incidentStatusLabel(item.incident.status, t)}
                                      </span>
                                      <span className="text-[10px] text-on-surface-variant">
                                        {t("shift_handoff.fromShift", "from shift on")} {format(new Date(item.shiftDate + "T12:00:00"), "dd/MM", { locale: dateFnsLocale })}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Footer */}
                            <div className="flex flex-wrap items-center justify-between pt-6 border-t border-outline-variant/10 text-xs text-on-surface-variant gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-sm bg-surface-container-high flex items-center justify-center text-on-surface font-bold border border-outline-variant/20">
                                  {handoff.created_by.charAt(0).toUpperCase()}
                                </div>
                                <span>
                                  {t("shift_handoff.by", "by")} <strong className="text-on-surface font-bold">{handoff.created_by}</strong>
                                </span>
                                <span className="text-on-surface-variant/60">·</span>
                                <span className="font-medium">
                                  {t("shift_handoff.visibilityLabel", "Visibility")} {handoff.visibility_days}{t("shift_handoff.daysShort", "d")}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {!handoff.acknowledged_by && user && handoff.created_by !== user.username && (
                                  <button type="button" onClick={() => void acknowledgeHandoff(handoff.id)} className="btn btn-primary py-1.5 px-3 text-[10px]">
                                    <UserCheck className="w-3.5 h-3.5" /> {t("shift_handoff.acknowledge", "Acknowledge")}
                                  </button>
                                )}
                                {canEdit(handoff) && (
                                  <button type="button" onClick={() => openEdit(handoff)} className="btn btn-outline py-1.5 px-3 text-[10px]">
                                    <Edit3 className="w-3.5 h-3.5" /> {t("shift_handoff.edit", "Edit")}
                                  </button>
                                )}
                                {canDelete && (
                                  confirmDeleteId === handoff.id ? (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-error font-medium">{t("shift_handoff.confirmDelete", "Delete?")}</span>
                                      <button type="button" onClick={() => void handleDelete(handoff.id)} className="btn btn-error py-1.5 px-3 text-[10px]">
                                        {t("shift_handoff.confirmYes", "Yes")}
                                      </button>
                                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="btn btn-outline py-1.5 px-3 text-[10px]">
                                        {t("shift_handoff.cancel", "Cancel")}
                                      </button>
                                    </div>
                                  ) : (
                                    <button type="button" onClick={() => setConfirmDeleteId(handoff.id)} className="btn btn-outline py-1.5 px-3 text-[10px] text-error hover:bg-error/10 border-error/20">
                                      <Trash2 className="w-3.5 h-3.5" /> {t("shift_handoff.delete", "Delete")}
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          {/* Current Shift Card */}
          <div className="card card-accent-left card-accent-primary relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Shield className="w-24 h-24" />
            </div>
            <div className="card-body">
              <h3 className="card-title mb-2">{t("shift_handoff.currentShift", "Current Shift")}</h3>
              <div className="text-3xl font-bold text-on-surface mb-1">
                {format(new Date(), "dd/MM/yyyy", { locale: dateFnsLocale })}
              </div>
              <p className="text-primary text-sm font-bold">{currentShift.label}</p>
            </div>
          </div>

          {/* Tools Status Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title flex items-center gap-2">
                <Server className="w-4 h-4" />
                {t("shift_handoff.sectionTools", "Monitoring Tools Status")}
              </h3>
            </div>
            <div className="card-body space-y-4">
              {latestToolsStatus.map((tool) => (
                <div key={tool.name} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-on-surface-variant">{tool.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full", toolDotColor(tool.status))} />
                    <span className={cn("text-xs font-bold uppercase tracking-widest", toolStatusColor(tool.status))}>
                      {toolStatusLabel(tool.status, t)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="card">
            <div className="card-body space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-on-surface-variant uppercase tracking-widest font-bold">{t("shift_handoff.statActive", "Active")}</span>
                <span className="text-lg font-bold text-on-surface">{stats.total}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-on-surface-variant uppercase tracking-widest font-bold">{t("shift_handoff.openIncidents", "Open Incidents")}</span>
                <span className={cn("text-lg font-bold", stats.activeIncidents > 0 ? "text-error" : "text-on-surface")}>{stats.activeIncidents}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-on-surface-variant uppercase tracking-widest font-bold">{t("shift_handoff.statAuthors", "Analysts")}</span>
                <span className="text-lg font-bold text-on-surface">{stats.uniqueAuthors}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New/Edit Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <HandoffModal
            editHandoff={editingHandoff}
            currentShift={currentShift}
            settings={settings}
            defaultToolsStatus={latestToolsStatus}
            t={t}
            onClose={() => {
              setIsFormOpen(false);
              setEditingHandoff(null);
            }}
            onSuccess={({ focusNewest } = {}) => {
              setIsFormOpen(false);
              setEditingHandoff(null);
              void fetchHandoffs({ focusNewest });
            }}
          />
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <SettingsModal
            t={t}
            settings={settings}
            onSave={(nextSettings) => {
              setSettings(nextSettings);
              saveSettings(nextSettings);
              setNotice(t("shift_handoff.settingsSaved", "Settings saved."));
              setShowSettings(false);
            }}
            onClose={() => setShowSettings(false)}
          />
        )}
      </AnimatePresence>

      {/* Lightbox */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-[100] bg-inverse-surface/90 flex items-center justify-center p-8" onClick={() => setLightboxSrc(null)}>
          <button type="button" aria-label="Close" onClick={() => setLightboxSrc(null)} className="absolute top-6 right-6 text-white hover:text-white/70">
            <X className="h-8 w-8" />
          </button>
          <img src={lightboxSrc} alt="Attachment" className="max-w-full max-h-full rounded-sm shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ── Modal Form ────────────────────────────────────────────────────────────────

function HandoffModal({
  editHandoff,
  currentShift,
  settings,
  defaultToolsStatus,
  t,
  onClose,
  onSuccess,
}: {
  editHandoff: HandoffDoc | null;
  currentShift: { period: string; date: string; label: string };
  settings: HandoffSettings;
  defaultToolsStatus: ToolStatusEntry[];
  t: (key: string, fallback?: string) => string;
  onClose: () => void;
  onSuccess: (options?: { focusNewest?: boolean }) => void;
}) {
  const isEditing = !!editHandoff;

  const [team, setTeam] = useState(editHandoff ? editHandoff.team_members.join(", ") : "");
  const [visibility, setVisibility] = useState(editHandoff ? editHandoff.visibility_days : settings.defaultVisibility);
  const [shiftFocus, setShiftFocus] = useState(editHandoff?.shift_focus || "");
  const [observations, setObservations] = useState(editHandoff?.observations || "");
  const [bodyHtml, setBodyHtml] = useState(editHandoff?.body || "");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [incidents, setIncidents] = useState<IncidentEntry[]>(editHandoff?.incidents || []);
  const [toolsStatus, setToolsStatus] = useState<ToolStatusEntry[]>(
    editHandoff?.tools_status?.length
      ? editHandoff.tools_status.map((tool) => ({ ...tool }))
      : defaultToolsStatus.map((tool) => ({ ...tool })),
  );

  // Pending files (for new handoff — uploaded after creation)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addIncident() {
    setIncidents([...incidents, { title: "", severity: "medium", status: "active", action_needed: "" }]);
  }

  function updateIncident(idx: number, field: keyof IncidentEntry, value: string) {
    setIncidents(incidents.map((inc, i) => (i === idx ? { ...inc, [field]: value } : inc)));
  }

  function removeIncident(idx: number) {
    setIncidents(incidents.filter((_, i) => i !== idx));
  }

  function updateToolStatus(name: string, status: string) {
    setToolsStatus(toolsStatus.map((ts) => (ts.name === name ? { ...ts, status } : ts)));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    const valid = files.filter((f) => f.type.startsWith("image/") && f.size <= 2 * 1024 * 1024);
    setPendingFiles((prev) => [...prev, ...valid].slice(0, 5));
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = bodyHtml.trim();

    if (!handoffBodyHasMeaningfulContent(body)) {
      setFormError(t("shift_handoff.errBodyRequired", "Handoff notes cannot be empty."));
      return;
    }

    const teamMembers = team
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (teamMembers.length === 0) {
      setFormError(t("shift_handoff.errMembersRequired", "At least one team member is required."));
      return;
    }

    if (body.length > HANDOFF_BODY_MAX_LENGTH) {
      setFormError(
        t(
          "shift_handoff.errBodyTooLong",
          "Handoff notes exceed the supported size. Reduce the embedded content or move large screenshots to image attachments.",
        ),
      );
      return;
    }

    setSubmitting(true);
    setFormError("");

    try {
      if (isEditing) {
        const res = await fetch(`${API_URL}/api/shift-handoffs/${editHandoff!.id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            team_members: teamMembers,
            body,
            visibility_days: visibility,
            incidents: incidents.filter((i) => i.title.trim()),
            tools_status: toolsStatus,
            observations,
            shift_focus: shiftFocus,
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(
            typeof payload?.detail === "string"
              ? payload.detail
              : t("shift_handoff.saveFailed", "Could not save handoff."),
          );
        }
      } else {
        const res = await fetch(`${API_URL}/api/shift-handoffs`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shift_date: currentShift.date,
            team_members: teamMembers,
            body,
            visibility_days: visibility,
            incidents: incidents.filter((i) => i.title.trim()),
            tools_status: toolsStatus,
            observations,
            shift_focus: shiftFocus,
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(
            typeof payload?.detail === "string"
              ? payload.detail
              : t("shift_handoff.saveFailed", "Could not save handoff."),
          );
        }

        // Upload pending files
        if (pendingFiles.length > 0) {
          const data = await res.json();
          for (const file of pendingFiles) {
            const formData = new FormData();
            formData.append("file", file);
            await fetch(`${API_URL}/api/shift-handoffs/${data.id}/attachments`, {
              method: "POST",
              credentials: "include",
              body: formData,
            });
          }
        }
      }
      onSuccess({ focusNewest: !isEditing });
    } catch (error) {
      setFormError(
        error instanceof Error && error.message
          ? error.message
          : t("shift_handoff.saveFailed", "Could not save handoff."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      title={isEditing ? t("shift_handoff.editTitle", "Edit Handoff") : t("shift_handoff.createTitle", "New Shift Handoff")}
      description={t(
        "shift_handoff.modalDescription",
        "Capture shift context, unresolved incidents and tool posture without leaving the operational workspace.",
      )}
      icon={
        <>
          <Shield className="h-4 w-4 text-primary" />
          {isEditing ? t("shift_handoff.editTitle", "Edit Handoff") : t("shift_handoff.createTitle", "New Shift Handoff")}
        </>
      }
      variant="editor"
      onClose={onClose}
      ariaLabel={t("shift_handoff.closeModal", "Close handoff modal")}
      bodyClassName="bg-surface"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            {t("shift_handoff.cancel", "Cancel")}
          </button>
          <button type="submit" form="handoff-form" disabled={submitting} className="btn btn-primary">
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{t("shift_handoff.saving", "Saving...")}</>
            ) : isEditing ? (
              t("shift_handoff.save", "Save Changes")
            ) : (
              t("shift_handoff.create", "Create Handoff")
            )}
          </button>
        </>
      }
    >
      <form id="handoff-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
        {formError && (
          <div className="rounded-sm bg-error/10 border border-error/20 px-4 py-2.5 text-xs font-bold text-error flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> {formError}
          </div>
        )}

        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant">
              {t("shift_handoff.fieldDate", "Shift Date")}
            </label>
            <div className="bg-surface-container-low border border-outline-variant/20 rounded-sm px-4 py-2.5 text-sm font-medium text-on-surface flex items-center gap-3">
              <Calendar className="w-4 h-4 text-on-surface-variant" />
              {isEditing ? editHandoff!.shift_date : currentShift.date}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant">
              {t("shift_handoff.fieldVisibility", "Visibility Window")}
            </label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(Number(e.target.value))}
              aria-label={t("shift_handoff.fieldVisibility", "Visibility Window")}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-sm px-4 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
            >
              {VISIBILITY_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} {t("shift_handoff.days", "days")}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant">
              {t("shift_handoff.fieldMembers", "Team Members")} *
            </label>
            <input
              type="text"
              required
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              placeholder={t("shift_handoff.fieldMembersPlaceholder", "e.g. Nilson, Samuel, Rony")}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-sm px-4 py-2.5 text-sm font-medium text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Shift Focus */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" />
            {t("shift_handoff.fieldFocus", "Shift Focus / Priority")}
          </label>
          <input
            type="text"
            value={shiftFocus}
            onChange={(e) => setShiftFocus(e.target.value)}
            maxLength={500}
            placeholder={t("shift_handoff.fieldFocusPlaceholder", "e.g. Phishing campaign follow-up")}
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-sm px-4 py-2.5 text-sm font-medium text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Tools Status */}
        <div className="space-y-3">
          <label className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant flex items-center gap-2">
            <Server className="w-3.5 h-3.5" />
            {t("shift_handoff.sectionTools", "Monitoring Tools Status")}
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {toolsStatus.map((tool) => (
              <div key={tool.name} className="bg-surface-container-lowest border border-outline-variant/20 p-3 rounded-sm space-y-2">
                <div className="text-xs font-bold text-on-surface">{tool.name}</div>
                <select
                  value={tool.status}
                  onChange={(e) => updateToolStatus(tool.name, e.target.value)}
                  aria-label={`${tool.name} status`}
                  className="w-full bg-surface-container-low border border-outline-variant/20 rounded-sm px-2 py-1.5 text-xs font-medium text-on-surface focus:outline-none focus:border-primary"
                >
                  {TOOL_STATUSES.map((s) => (
                    <option key={s} value={s}>{toolStatusLabel(s, t)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Incidents */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              {t("shift_handoff.sectionIncidents", "Active Incidents")}
            </label>
            <button type="button" onClick={addIncident} className="btn btn-outline py-1.5 px-3 text-[10px]">
              <Plus className="w-3 h-3" /> {t("shift_handoff.addIncident", "Add")}
            </button>
          </div>

          {incidents.length === 0 ? (
            <div className="text-xs text-on-surface-variant italic bg-surface-container-low p-3 rounded-sm border border-outline-variant/10 text-center">
              {t("shift_handoff.noIncidents", "No active incidents to report.")}
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map((inc, idx) => (
                <div key={idx} className="flex flex-col md:flex-row gap-3 bg-surface-container-lowest border border-outline-variant/20 p-3 rounded-sm items-start md:items-center">
                  <input
                    type="text"
                    value={inc.title}
                    onChange={(e) => updateIncident(idx, "title", e.target.value)}
                    placeholder={t("shift_handoff.incTitlePlaceholder", "Brief description")}
                    className="flex-1 bg-surface-container-low border border-outline-variant/20 rounded-sm px-3 py-1.5 text-sm font-medium text-on-surface focus:outline-none focus:border-primary w-full"
                  />
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <select
                      value={inc.severity}
                      onChange={(e) => updateIncident(idx, "severity", e.target.value)}
                      aria-label={t("shift_handoff.incSeverity", "Severity")}
                      className="bg-surface-container-low border border-outline-variant/20 rounded-sm px-2 py-1.5 text-xs font-medium text-on-surface focus:outline-none focus:border-primary"
                    >
                      {INCIDENT_SEVERITIES.map((s) => (
                        <option key={s} value={s}>{severityLabel(s, t)}</option>
                      ))}
                    </select>
                    <select
                      value={inc.status}
                      onChange={(e) => updateIncident(idx, "status", e.target.value)}
                      aria-label={t("shift_handoff.incStatus", "Status")}
                      className="bg-surface-container-low border border-outline-variant/20 rounded-sm px-2 py-1.5 text-xs font-medium text-on-surface focus:outline-none focus:border-primary"
                    >
                      {INCIDENT_STATUSES.map((s) => (
                        <option key={s} value={s}>{incidentStatusLabel(s, t)}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={inc.action_needed}
                      onChange={(e) => updateIncident(idx, "action_needed", e.target.value)}
                      placeholder={t("shift_handoff.incActionPlaceholder", "Next steps...")}
                      className="flex-1 bg-surface-container-low border border-outline-variant/20 rounded-sm px-3 py-1.5 text-sm font-medium text-on-surface focus:outline-none focus:border-primary min-w-0 hidden md:block"
                    />
                    <button
                      type="button"
                      aria-label={t("shift_handoff.removeIncident", "Remove incident")}
                      onClick={() => removeIncident(idx)}
                      className="p-1.5 text-error hover:bg-error/10 rounded-sm transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rich Text Editor for Summary */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5" />
            {t("shift_handoff.fieldBody", "Shift Summary")} *
          </label>
          <HandoffRichTextEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            placeholder={t("shift_handoff.fieldBodyPlaceholder", "Summarize incidents, ongoing investigations...")}
            imagePromptLabel={t("shift_handoff.insertImageUrl", "Enter image URL:")}
            labels={{
              bold: t("shift_handoff.fmtBold", "Bold"),
              italic: t("shift_handoff.fmtItalic", "Italic"),
              underline: t("shift_handoff.fmtUnderline", "Underline"),
              strike: t("shift_handoff.fmtStrike", "Strikethrough"),
              headingOne: t("shift_handoff.fmtHeadingOne", "Heading 1"),
              headingTwo: t("shift_handoff.fmtHeadingTwo", "Heading 2"),
              bulletList: t("shift_handoff.fmtBulletList", "Bullet list"),
              orderedList: t("shift_handoff.fmtOrderedList", "Ordered list"),
              quote: t("shift_handoff.fmtQuote", "Quote"),
              undo: t("shift_handoff.fmtUndo", "Undo"),
              redo: t("shift_handoff.fmtRedo", "Redo"),
              image: t("shift_handoff.insertImage", "Insert image URL"),
            }}
          />
        </div>

        {/* Additional Info */}
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant flex items-center gap-2">
            <FileText className="w-3.5 h-3.5" />
            {t("shift_handoff.fieldObservations", "Additional Observations")}
          </label>
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder={t("shift_handoff.fieldObservationsPlaceholder", "Pending escalations, external contacts, compliance notes...")}
            rows={3}
            maxLength={2000}
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-sm px-4 py-3 text-sm font-medium text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        {/* File Uploads */}
        {!isEditing && (
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant flex items-center gap-2">
              <Paperclip className="w-3.5 h-3.5" />
              {t("shift_handoff.sectionAttachments", "Image Attachments")} ({t("shift_handoff.maxSize", "Max 2MB per file")})
            </label>
            <div className="flex items-center gap-3">
              <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-outline py-2">
                <Paperclip className="w-4 h-4" /> {t("shift_handoff.browseFiles", "Browse files")}
              </button>
              <span className="text-xs text-on-surface-variant">PNG, JPG, GIF, WebP · {t("shift_handoff.maxFiles", "Up to 5 images")}</span>
            </div>
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-surface-container border border-outline-variant/20 px-3 py-1.5 rounded-sm">
                    <ImageIcon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium text-on-surface truncate max-w-[120px]">{file.name}</span>
                    <span className="text-[10px] text-on-surface-variant">({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
                    <button
                      type="button"
                      aria-label={t("shift_handoff.removePendingFile", "Remove file")}
                      onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="ml-1 text-on-surface-variant hover:text-error"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </ModalShell>
  );
}

// ── History Page ──────────────────────────────────────────────────────────────

const HISTORY_PERIOD_OPTIONS = [0, 30, 90, 180, 365] as const;

export function ShiftHandoffHistoryPage() {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const dateFnsLocale = getDateFnsLocale(locale);
  const [allHistory, setAllHistory] = useState<HandoffDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [periodFilter, setPeriodFilter] = useState<number>(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${API_URL}/api/shift-handoffs?include_expired=true&limit=500`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        setAllHistory(await res.json());
      } catch {
        setError(t("shift_handoff.historyLoadFailed", "Could not load history."));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  // Filter by period + text search
  const filtered = useMemo(() => {
    const now = new Date();
    let results = allHistory;

    // Period filter
    if (periodFilter > 0) {
      const cutoff = new Date(now.getTime() - periodFilter * 24 * 60 * 60 * 1000);
      results = results.filter((h) => new Date(h.created_at) >= cutoff);
    }

    // Text search
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      results = results.filter((h) => {
        const haystack = [
          h.body,
          h.observations,
          h.shift_focus,
          h.created_by,
          ...h.team_members,
          ...(h.incidents?.map((i) => `${i.title} ${i.action_needed}`) ?? []),
          ...(h.tools_status?.map((ts) => ts.name) ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    return results;
  }, [allHistory, periodFilter, searchQuery]);

  // Group by month (YYYY-MM)
  const grouped = useMemo(() => {
    const groups: { key: string; label: string; items: HandoffDoc[] }[] = [];
    const map = new Map<string, HandoffDoc[]>();

    for (const h of filtered) {
      const d = new Date(h.shift_date + "T12:00:00");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(h);
    }

    for (const [key, items] of map) {
      const [year, month] = key.split("-");
      const label = format(new Date(Number(year), Number(month) - 1, 1), "MMMM yyyy", { locale: dateFnsLocale });
      groups.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), items });
    }

    return groups;
  }, [filtered, dateFnsLocale]);
  const historySummaryLabel = useMemo(() => periodLabel(periodFilter), [periodFilter, t]);
  const filteredMonthsCount = grouped.length;

  function getUnresolvedFromPrevious(handoff: HandoffDoc) {
    const results: { shiftDate: string; team: string[]; incident: IncidentEntry }[] = [];
    for (const h of allHistory) {
      if (h.id === handoff.id) continue;
      if (h.shift_date >= handoff.shift_date) continue;
      if (!isAfter(new Date(h.expires_at), new Date(handoff.created_at))) continue;
      for (const inc of h.incidents ?? []) {
        if (inc.status !== "resolved") {
          results.push({ shiftDate: h.shift_date, team: h.team_members, incident: inc });
        }
      }
    }
    return results;
  }

  function periodLabel(days: number): string {
    if (days === 0) return t("shift_handoff.historyFilterAll", "All periods");
    if (days === 30) return t("shift_handoff.historyFilter30", "Last 30 days");
    if (days === 90) return t("shift_handoff.historyFilter90", "Last 90 days");
    if (days === 180) return t("shift_handoff.historyFilter180", "Last 6 months");
    return t("shift_handoff.historyFilter365", "Last year");
  }

  return (
    <div className="page-frame space-y-6">
      <PageHeader
        eyebrow={
          <>
            <History className="h-4 w-4" />
            {t("shift_handoff.history", "History")}
          </>
        }
        title={t("shift_handoff.historyTitle", "Handoff History")}
        description={t("shift_handoff.historySubtitle", "Review complete and expired handoffs with their full operational context.")}
        metrics={
          <>
            <PageMetricPill
              label={`${filtered.length} ${t("shift_handoff.historyCount", "handoffs")}`}
              dotClassName="bg-primary"
              tone="primary"
            />
            <PageMetricPill
              label={`${filteredMonthsCount} ${filteredMonthsCount === 1 ? "month" : "months"}`}
              dotClassName="bg-secondary"
            />
            <PageMetricPill label={historySummaryLabel} tone="muted" />
          </>
        }
      />

      <PageToolbar label={t("shift_handoff.historyFilterAll", "History filters")}>
        <PageToolbarGroup className="min-w-0 flex-1 sm:max-w-xl">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("shift_handoff.historySearch", "Search by team, content, incidents...")}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-sm pl-10 pr-10 py-2.5 text-sm font-medium text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </PageToolbarGroup>
        <PageToolbarGroup compact>
          {HISTORY_PERIOD_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setPeriodFilter(d)}
              className={cn(
                "shift-handoff-visibility-filter-button",
                periodFilter === d
                  ? "shift-handoff-visibility-filter-button-active"
                  : "shift-handoff-visibility-filter-button-inactive",
              )}
            >
              {periodLabel(d)}
            </button>
          ))}
        </PageToolbarGroup>
        <PageToolbarGroup>
          <button type="button" onClick={() => navigate("/shift-handoff")} className="btn btn-outline">
            {t("shift_handoff.backToTimeline", "Back to Timeline")}
          </button>
        </PageToolbarGroup>
      </PageToolbar>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="rounded-sm bg-error/10 border border-error/20 px-4 py-2.5 text-xs font-bold text-error flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="card p-10 text-center text-sm text-on-surface-variant">
          {allHistory.length === 0
            ? t("shift_handoff.historyEmpty", "No handoffs found in history.")
            : t("shift_handoff.historyNoResults", "No handoffs match the applied filters.")}
        </div>
      )}

      {!loading && !error && grouped.length > 0 && (
        <div className="space-y-8">
          {grouped.map((group: { key: string; label: string; items: HandoffDoc[] }) => (
            <div key={group.key}>
              {/* Month Header */}
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-black uppercase tracking-[0.15em] text-on-surface-variant">
                  {group.label}
                </h2>
                <span className="text-[10px] font-bold text-on-surface-variant/60">
                  ({group.items.length})
                </span>
                <div className="flex-1 h-px bg-outline-variant/20" />
              </div>

              {/* Cards */}
              <div className="space-y-3">
                {group.items.map((handoff: HandoffDoc) => (
                  <div key={handoff.id}>
                    <HistoryHandoffCard
                      handoff={handoff}
                      unresolvedPrev={getUnresolvedFromPrevious(handoff)}
                      dateFnsLocale={dateFnsLocale}
                      t={t}
                      isExpanded={expandedId === handoff.id}
                      onToggle={() => setExpandedId(expandedId === handoff.id ? null : handoff.id)}
                      onOpenAttachment={setLightboxSrc}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-[100] bg-inverse-surface/90 flex items-center justify-center p-8" onClick={() => setLightboxSrc(null)}>
          <button type="button" aria-label="Close" onClick={() => setLightboxSrc(null)} className="absolute top-6 right-6 text-white hover:text-white/70">
            <X className="h-8 w-8" />
          </button>
          <img src={lightboxSrc} alt="Attachment" className="max-w-full max-h-full rounded-sm shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

export function ShiftHandoffActiveIncidentsPage() {
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const dateFnsLocale = getDateFnsLocale(locale);
  const [activeIncidents, setActiveIncidents] = useState<ActiveIncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const criticalCount = useMemo(
    () => activeIncidents.filter((item) => item.severity === "critical").length,
    [activeIncidents],
  );

  const affectedHandoffsCount = useMemo(
    () => new Set(activeIncidents.map((item) => item.handoff_id)).size,
    [activeIncidents],
  );

  const fetchActiveIncidents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/shift-handoffs/incidents/active`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error();
      const data: ActiveIncidentItem[] = await response.json();
      if (data.length > 0) {
        setActiveIncidents(data);
        return;
      }

      const fallbackResponse = await fetch(`${API_URL}/api/shift-handoffs`, {
        credentials: "include",
      });
      if (!fallbackResponse.ok) throw new Error();
      const fallbackHandoffs: HandoffDoc[] = await fallbackResponse.json();
      const fallbackItems = fallbackHandoffs.flatMap((handoff) =>
        (handoff.incidents || [])
          .filter((incident) => incident.status !== "resolved")
          .map((incident) => ({
            id: incident.incident_id || `${handoff.id}-${incident.title}`,
            handoff_id: handoff.id,
            handoff_shift_date: handoff.shift_date,
            created_at: handoff.created_at,
            created_by: handoff.created_by,
            updated_at: handoff.updated_at,
            resolved_at: null,
            resolved_by: "",
            team_members: handoff.team_members,
            title: incident.title,
            severity: incident.severity,
            status: incident.status,
            action_needed: incident.action_needed,
          })),
      );
      setActiveIncidents(fallbackItems);
    } catch {
      setError(t("shift_handoff.activeIncidentLoadFailed", "Could not load active incidents."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchActiveIncidents();
  }, [fetchActiveIncidents]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function updateIncidentLifecycle(item: ActiveIncidentItem, status: IncidentEntry["status"]) {
    const key = `${item.handoff_id}:${item.id}:${status}`;
    setBusyKey(key);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/shift-handoffs/${item.handoff_id}/incidents/${item.id}/status`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            action_needed: item.action_needed,
          }),
        },
      );
      if (!response.ok) throw new Error();
      setNotice(
        status === "resolved"
          ? t("shift_handoff.incidentResolved", "Incident resolved.")
          : t("shift_handoff.incidentUpdated", "Incident lifecycle updated."),
      );
      await fetchActiveIncidents();
    } catch {
      setError(t("shift_handoff.incidentUpdateFailed", "Could not update incident status."));
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="page-frame space-y-6">
      <PageHeader
        eyebrow={
          <>
            <AlertTriangle className="h-4 w-4" />
            {t("shift_handoff.activeIncidentBoard", "Active Incidents")}
          </>
        }
        title={t("shift_handoff.activeIncidentTitle", "Incident Continuity Board")}
        description={t(
          "shift_handoff.activeIncidentSubtitle",
          "Track unresolved incidents across active handoffs and close or reclassify them without losing the originating shift context.",
        )}
        metrics={
          <>
            <PageMetricPill
              label={`${activeIncidents.length} ${t("shift_handoff.sectionIncidents", "incidents")}`}
              dotClassName={activeIncidents.length > 0 ? "bg-primary" : "bg-outline"}
              tone={activeIncidents.length > 0 ? "primary" : "muted"}
            />
            <PageMetricPill
              label={`${criticalCount} ${t("shift_handoff.sevCritical", "Critical")}`}
              dotClassName={criticalCount > 0 ? "bg-error" : "bg-outline"}
              tone={criticalCount > 0 ? "danger" : "muted"}
            />
            <PageMetricPill
              label={`${affectedHandoffsCount} ${t("shift_handoff.historyCount", "handoffs")}`}
              dotClassName="bg-secondary"
            />
          </>
        }
      />

      <PageToolbar label={t("shift_handoff.activeIncidentActions", "Incident actions")}>
        <PageToolbarGroup className="ml-auto">
          <button type="button" onClick={fetchActiveIncidents} className="btn btn-outline">
            <RotateCcw className="h-4 w-4" />
            {t("shift_handoff.refreshIncidentBoard", "Refresh board")}
          </button>
          <button type="button" onClick={() => navigate("/shift-handoff")} className="btn btn-outline">
            {t("shift_handoff.backToTimeline", "Back to Timeline")}
          </button>
        </PageToolbarGroup>
      </PageToolbar>

      {(error || notice) && (
        <div className="space-y-3">
          {error && <div className="rounded-sm bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
          {notice && <div className="rounded-sm bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div>}
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-sm text-on-surface-variant">
          {t("shift_handoff.loading", "Loading handoffs...")}
        </div>
      ) : activeIncidents.length === 0 ? (
        <div className="card p-8 text-sm text-on-surface-variant">
          {t("shift_handoff.noActiveIncidentsBoard", "No unresolved incidents across active handoffs.")}
        </div>
      ) : (
        <div className="surface-section overflow-hidden">
          <div className="surface-section-header">
            <div>
              <h3 className="surface-section-title">{t("shift_handoff.activeIncidentTable", "Persistent Active Incidents")}</h3>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                {t("shift_handoff.activeIncidentTableSubtitle", "Lifecycle is managed independently from the handoff snapshot and remains auditable across shifts.")}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant/10 text-[11px] text-on-surface-variant font-bold uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-3">Incident</th>
                  <th className="px-6 py-3">Shift</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3">Last Update</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
          {activeIncidents.map((item) => {
            const busy = busyKey.startsWith(`${item.handoff_id}:${item.id}:`);
            const canMutate = /^[a-f0-9]{24}$/i.test(item.id);
            return (
              <tr key={item.id} className="align-top">
                <td className="px-6 py-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("badge", incidentBadge(item.status))}>
                        {incidentStatusLabel(item.status, t)}
                      </span>
                      <span className="badge badge-neutral">
                        {severityLabel(item.severity, t)}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-on-surface">{item.title}</div>
                    <p className="text-sm text-on-surface-variant">
                      {t("shift_handoff.by", "by")} {item.created_by} · {item.team_members.join(", ")}
                    </p>
                    {item.action_needed ? (
                      <p className="text-sm text-on-surface">{item.action_needed}</p>
                    ) : null}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-on-surface">
                  {format(new Date(item.handoff_shift_date + "T12:00:00"), "dd/MM/yyyy", { locale: dateFnsLocale })}
                </td>
                <td className="px-6 py-4 text-sm text-on-surface">
                  {incidentStatusLabel(item.status, t)}
                </td>
                <td className="px-6 py-4 text-sm text-on-surface-variant">
                  {format(new Date(item.created_at), "dd/MM/yyyy HH:mm", { locale: dateFnsLocale })}
                </td>
                <td className="px-6 py-4 text-sm text-on-surface-variant">
                  {format(new Date(item.updated_at), "dd/MM/yyyy HH:mm", { locale: dateFnsLocale })}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap justify-end gap-2">
                    {item.status !== "monitoring" && (
                      <button
                        type="button"
                        onClick={() => void updateIncidentLifecycle(item, "monitoring")}
                        className="btn btn-outline"
                        disabled={busy || !canMutate}
                      >
                        {t("shift_handoff.statusMonitoring", "Monitoring")}
                      </button>
                    )}
                    {item.status !== "escalated" && (
                      <button
                        type="button"
                        onClick={() => void updateIncidentLifecycle(item, "escalated")}
                        className="btn btn-outline"
                        disabled={busy || !canMutate}
                      >
                        {t("shift_handoff.statusEscalated", "Escalated")}
                      </button>
                    )}
                    {item.status !== "resolved" && (
                      <button
                        type="button"
                        onClick={() => void updateIncidentLifecycle(item, "resolved")}
                        className="btn btn-primary"
                        disabled={busy || !canMutate}
                      >
                        {busy ? t("shift_handoff.saving", "Saving...") : t("shift_handoff.resolveIncident", "Resolve")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Settings Modal ────────────────────────────────────────────────────────────

function SettingsModal({
  t,
  settings,
  onSave,
  onClose,
}: {
  t: (key: string, fallback?: string) => string;
  settings: HandoffSettings;
  onSave: (nextSettings: HandoffSettings) => void;
  onClose: () => void;
}) {
  const [tools, setTools] = useState<string[]>([...settings.tools]);
  const [defaultVis, setDefaultVis] = useState(settings.defaultVisibility);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function addTool() {
    setTools((current) => [...current, ""]);
  }

  function updateTool(idx: number, value: string) {
    setTools((current) => current.map((tool, index) => (index === idx ? value : tool)));
  }

  function removeTool(idx: number) {
    setTools((current) => current.filter((_, index) => index !== idx));
  }

  function handleReset() {
    setTools([...BUILTIN_DEFAULT_TOOLS]);
    setDefaultVis(4);
    setError("");
  }

  function handleSave() {
    const normalizedTools = tools.map((tool) => tool.trim());
    if (normalizedTools.length === 0) {
      setError(t("shift_handoff.settingsToolsRequired", "At least one monitored tool is required."));
      return;
    }
    if (normalizedTools.some((tool) => !tool)) {
      setError(t("shift_handoff.settingsToolEmpty", "Tool names cannot be empty."));
      return;
    }

    const uniqueTools = new Set(normalizedTools.map((tool) => tool.toLowerCase()));
    if (uniqueTools.size !== normalizedTools.length) {
      setError(t("shift_handoff.settingsToolDuplicate", "Tool names must be unique."));
      return;
    }

    setError("");
    setNotice(t("shift_handoff.settingsSaved", "Settings saved."));
    setTools(normalizedTools);
    onSave({ tools: normalizedTools, defaultVisibility: defaultVis });
  }

  return (
    <ModalShell
      title={t("shift_handoff.settingsTitle", "Handoff Settings")}
      description={t("shift_handoff.settingsSubtitle", "Manage monitored tools and the default visibility used when creating new handoffs.")}
      icon={
        <>
          <Settings className="h-4 w-4 text-primary" />
          {t("shift_handoff.settings", "Settings")}
        </>
      }
      variant="editor"
      onClose={onClose}
      ariaLabel={t("shift_handoff.closeSettings", "Close handoff settings")}
      bodyClassName="space-y-6"
      footerClassName="justify-between"
      footer={
        <>
          <button type="button" onClick={handleReset} className="btn btn-ghost text-xs">
            <RotateCcw className="w-3.5 h-3.5" />
            {t("shift_handoff.settingsReset", "Reset to Default")}
          </button>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              {t("shift_handoff.cancel", "Cancel")}
            </button>
            <button type="button" onClick={handleSave} className="btn btn-primary">
              {t("shift_handoff.settingsSave", "Save Settings")}
            </button>
          </div>
        </>
      }
    >
      {notice && (
        <div className="rounded-sm bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 text-xs font-bold text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5" /> {notice}
        </div>
      )}

      {error && (
        <div className="rounded-sm bg-error/10 border border-error/20 px-4 py-2.5 text-xs font-bold text-error flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant flex items-center gap-2">
            <Server className="w-3.5 h-3.5" />
            {t("shift_handoff.settingsTools", "Monitored Tools")}
          </label>
          <button type="button" onClick={addTool} className="btn btn-outline py-1.5 px-3 text-[10px]">
            <Plus className="w-3.5 h-3.5" />
            {t("shift_handoff.settingsAddTool", "Add Tool")}
          </button>
        </div>

        <p className="text-sm text-on-surface-variant">
          {t("shift_handoff.settingsToolsHelp", "You can rename, add, or remove the tools that appear in the handoff workflow.")}
        </p>

        <div className="space-y-2">
          {tools.map((tool, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-sm border border-outline-variant/20 bg-surface-container-low p-3">
              <input
                type="text"
                value={tool}
                onChange={(e) => updateTool(idx, e.target.value)}
                placeholder={t("shift_handoff.settingsToolName", "Tool name")}
                className="flex-1 bg-surface-container-lowest border border-outline-variant/30 rounded-sm px-3 py-2 text-sm font-medium text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                aria-label={t("shift_handoff.settingsRemoveTool", "Remove tool")}
                onClick={() => removeTool(idx)}
                className="p-2 text-on-surface-variant hover:text-error rounded-sm transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" />
          {t("shift_handoff.settingsDefaultVisibility", "Default Visibility")}
        </label>
        <select
          value={defaultVis}
          onChange={(e) => setDefaultVis(Number(e.target.value))}
          aria-label={t("shift_handoff.settingsDefaultVisibility", "Default Visibility")}
          className="w-full max-w-xs bg-surface-container-lowest border border-outline-variant/30 rounded-sm px-4 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary appearance-none"
        >
          {VISIBILITY_OPTIONS.map((d) => (
            <option key={d} value={d}>{d} {t("shift_handoff.days", "days")}</option>
          ))}
        </select>
      </div>
    </ModalShell>
  );
}

function HistoryHandoffCard({
  handoff,
  unresolvedPrev,
  dateFnsLocale,
  t,
  isExpanded,
  onToggle,
  onOpenAttachment,
}: {
  handoff: HandoffDoc;
  unresolvedPrev: { shiftDate: string; team: string[]; incident: IncidentEntry }[];
  dateFnsLocale: ReturnType<typeof getDateFnsLocale>;
  t: (key: string, fallback?: string) => string;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenAttachment: (src: string) => void;
}) {
  const shiftPeriod = (() => {
    const created = new Date(handoff.created_at);
    const hour = created.getHours();
    return hour >= 7 && hour < 19 ? "day" : "night";
  })();

  const expired = new Date(handoff.expires_at) < new Date();
  const openIncidents = handoff.incidents?.filter((incident) => incident.status === "active" || incident.status === "escalated").length ?? 0;

  return (
    <div className={cn("card overflow-hidden transition-colors", expired && "opacity-70", isExpanded && "border-primary/30 shadow-md")}>
      {/* Clickable Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-5 flex items-center gap-5 cursor-pointer select-none text-left"
      >
        <div
          className={cn(
            "w-10 h-10 rounded-sm flex items-center justify-center shrink-0 border",
            shiftPeriod === "day"
              ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
              : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
          )}
        >
          {shiftPeriod === "day" ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h3 className="text-sm font-bold text-on-surface truncate">
              {format(new Date(handoff.shift_date + "T12:00:00"), "dd 'de' MMMM, yyyy", { locale: dateFnsLocale })}
            </h3>
            <span className="badge badge-neutral text-[9px]">
              {shiftPeriod === "day" ? t("shift_handoff.periodDay", "Day") : t("shift_handoff.periodNight", "Night")}
            </span>
            {expired && (
              <span className="badge badge-neutral text-[9px] opacity-70">
                {t("shift_handoff.historyExpired", "expired")}
              </span>
            )}
            {handoff.acknowledged_by && (
              <span className="badge badge-success text-[9px] flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> {t("shift_handoff.ackBy", "ack")}
              </span>
            )}
            {openIncidents > 0 && (
              <span className="badge badge-error text-[9px] flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />
                {openIncidents} {t("shift_handoff.openIncidents", "open incidents")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-on-surface-variant flex-wrap">
            <span className="flex items-center gap-1.5 font-medium truncate">
              <Users className="w-3.5 h-3.5 shrink-0" />
              {handoff.team_members.slice(0, 4).join(", ")}
              {handoff.team_members.length > 4 && <span className="text-[10px]">+{handoff.team_members.length - 4}</span>}
            </span>
            <span className="flex items-center gap-1.5 font-medium whitespace-nowrap">
              {t("shift_handoff.by", "by")} {handoff.created_by}
            </span>
          </div>
        </div>

        <div className="shrink-0 text-on-surface-variant">
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-outline-variant/10"
          >
            <div className="p-6 space-y-8 bg-surface-container-low/30">
              {handoff.shift_focus && (
                <div className="rounded-sm bg-primary/5 border border-primary/15 px-4 py-3 flex items-start gap-3">
                  <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-primary mb-1">
                      {t("shift_handoff.shiftFocusLabel", "Shift Focus")}
                    </div>
                    <p className="text-sm text-on-surface">{handoff.shift_focus}</p>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5" />
                  {t("shift_handoff.sectionNotes", "Handoff Notes")}
                </h4>
                <HandoffRichTextContent
                  body={handoff.body}
                  className="bg-surface-container-high/20 rounded-sm border border-outline-variant/10 p-4"
                />
              </div>

              {handoff.observations && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    {t("shift_handoff.fieldObservations", "Additional Observations")}
                  </h4>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{handoff.observations}</p>
                </div>
              )}

              {handoff.incidents && handoff.incidents.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {t("shift_handoff.sectionIncidents", "Active Incidents")}
                  </h4>
                  <div className="grid gap-3">
                    {handoff.incidents.map((incident, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-surface-container border border-outline-variant/20 p-3 rounded-sm">
                        <div className="flex items-center gap-3">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", severityDot(incident.severity))} />
                          <span className="font-bold text-on-surface text-sm">{incident.title}</span>
                          {incident.action_needed && (
                            <span className="text-xs text-on-surface-variant">— {incident.action_needed}</span>
                          )}
                        </div>
                        <span className={cn("badge", incidentBadge(incident.status))}>
                          {incidentStatusLabel(incident.status, t)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {handoff.tools_status && handoff.tools_status.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                    <Server className="w-3.5 h-3.5" />
                    {t("shift_handoff.sectionTools", "Monitoring Tools Status")}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {handoff.tools_status.map((tool, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-surface-container border border-outline-variant/20 px-3 py-1.5 rounded-sm">
                        <span className="text-xs font-bold text-on-surface">{tool.name}:</span>
                        <span className={cn("text-[10px] font-black uppercase tracking-widest", toolStatusColor(tool.status))}>
                          {toolStatusLabel(tool.status, t)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {handoff.attachments && handoff.attachments.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                    <Paperclip className="w-3.5 h-3.5" />
                    {t("shift_handoff.sectionAttachments", "Image Attachments")} ({handoff.attachments.length})
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {handoff.attachments.map((attachment) => (
                      <button
                        key={attachment.id}
                        type="button"
                        onClick={() => onOpenAttachment(attachment.data_uri)}
                        className="block w-28 h-28 rounded-sm overflow-hidden border border-outline-variant/20 hover:ring-2 hover:ring-primary/30 transition-all"
                      >
                        <img src={attachment.data_uri} alt={attachment.filename} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {unresolvedPrev.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-3 flex items-center gap-2">
                    <History className="w-3.5 h-3.5" />
                    {t("shift_handoff.unresolvedFromPrev", "Unresolved Incidents from Previous Shifts")}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {unresolvedPrev.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 bg-surface-container border border-outline-variant/20 px-3 py-1.5 rounded-sm"
                      >
                        <span className={cn("w-2 h-2 rounded-full shrink-0", severityDot(item.incident.severity))} />
                        <span className="text-xs font-bold text-on-surface">{item.incident.title}</span>
                        <span className={cn("badge text-[9px]", incidentBadge(item.incident.status))}>
                          {incidentStatusLabel(item.incident.status, t)}
                        </span>
                        <span className="text-[10px] text-on-surface-variant">
                          {t("shift_handoff.fromShift", "from shift on")} {format(new Date(item.shiftDate + "T12:00:00"), "dd/MM", { locale: dateFnsLocale })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between pt-6 border-t border-outline-variant/10 text-xs text-on-surface-variant gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-sm bg-surface-container-high flex items-center justify-center text-on-surface font-bold border border-outline-variant/20">
                    {handoff.created_by.charAt(0).toUpperCase()}
                  </div>
                  <span>
                    {t("shift_handoff.by", "by")} <strong className="text-on-surface font-bold">{handoff.created_by}</strong>
                  </span>
                  <span className="text-on-surface-variant/60">·</span>
                  <span className="font-medium">
                    {t("shift_handoff.visibilityLabel", "Visibility")} {handoff.visibility_days}{t("shift_handoff.daysShort", "d")}
                  </span>
                  <span className="text-on-surface-variant/60">·</span>
                  <span className="font-medium">
                    {format(new Date(handoff.created_at), "dd/MM/yyyy HH:mm", { locale: dateFnsLocale })}
                  </span>
                </div>
                {handoff.acknowledged_by && (
                  <span className="badge badge-success flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {handoff.acknowledged_by}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Simple icons for day/night ────────────────────────────────────────────────

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bold,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  FileText,
  History,
  Image as ImageIcon,
  Italic,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Server,
  Settings,
  Shield,
  Strikethrough,
  Trash2,
  Underline,
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
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface IncidentEntry {
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

// ── Constants ─────────────────────────────────────────────────────────────────

const BUILTIN_DEFAULT_TOOLS = ["SOAR", "SIEM", "Grafana (Dashboard)", "VPN", "EDR", "Firewall"];
const TOOL_STATUSES = ["operational", "degraded", "down", "maintenance"] as const;
const INCIDENT_SEVERITIES = ["critical", "high", "medium", "low"] as const;
const INCIDENT_STATUSES = ["active", "monitoring", "escalated", "resolved"] as const;
const VISIBILITY_OPTIONS = [4, 7, 14, 30] as const;
const FILTER_OPTIONS = [0, 4, 7, 14, 30] as const; // 0 = all active

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
  if (!isDay && h < 7) shiftDate.setDate(shiftDate.getDate() - 1);
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

  const fetchHandoffs = useCallback(async () => {
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
      if (!expandedId && data.length > 0) setExpandedId(data[0].id);
    } catch {
      setError(t("shift_handoff.loadFailed", "Could not load shift handoffs."));
    } finally {
      setLoading(false);
    }
  }, [t, expandedId, daysFilter]);

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
    if (handoffs.length === 0) return settings.tools.map((name) => ({ name, status: "operational" }));
    return handoffs[0].tools_status?.length
      ? handoffs[0].tools_status
      : settings.tools.map((name) => ({ name, status: "operational" }));
  }, [handoffs, settings.tools]);

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
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-copy">
          <p className="page-eyebrow">
            <Shield className="h-4 w-4" />
            {t("shift_handoff.eyebrow", "Operations")}
          </p>
          <h1 className="page-heading">{t("shift_handoff.title", "SOC Shift Handoff")}</h1>
          <p className="page-subheading">
            {t("shift_handoff.subtitle", "Register and review shift handoffs for your SOC rotation teams.")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={openCreate} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            {t("shift_handoff.newHandoff", "New Handoff")}
          </button>
          <button type="button" onClick={() => navigate("/shift-handoff/history")} className="btn btn-outline">
            <History className="w-4 h-4" />
            {t("shift_handoff.history", "History")}
          </button>
          <button type="button" onClick={() => setShowSettings(true)} className="btn btn-outline">
            <Settings className="w-4 h-4" />
            {t("shift_handoff.settings", "Settings")}
          </button>
        </div>
      </div>

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
          <div className="shift-handoff-timeline-toolbar">
            <h2 className="shift-handoff-timeline-title">
              <Activity className="w-5 h-5 text-primary" />
              {t("shift_handoff.timelineTitle", "Handoff Timeline")}
            </h2>

            <div className="shift-handoff-visibility-filter" role="group" aria-label={t("shift_handoff.visibilityFilter", "Visibility filter")}>
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
            </div>

            <span className="badge badge-neutral shift-handoff-timeline-badge">
              <Clock className="w-3 h-3 mr-1" />
              {stats.total} {t("shift_handoff.statActive", "active")}
            </span>
          </div>

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
                const shiftPeriod = (() => {
                  const created = new Date(handoff.created_at);
                  const h = created.getHours();
                  return h >= 7 && h < 19 ? "day" : "night";
                })();

                return (
                  <motion.div
                    key={handoff.id}
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
                              <div className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap bg-surface-container-high/20 rounded-sm p-4 border border-outline-variant/10">
                                {handoff.body}
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
            t={t}
            onClose={() => {
              setIsFormOpen(false);
              setEditingHandoff(null);
            }}
            onSuccess={() => {
              setIsFormOpen(false);
              setEditingHandoff(null);
              void fetchHandoffs();
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
  t,
  onClose,
  onSuccess,
}: {
  editHandoff: HandoffDoc | null;
  currentShift: { period: string; date: string; label: string };
  settings: HandoffSettings;
  t: (key: string, fallback?: string) => string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEditing = !!editHandoff;

  const [team, setTeam] = useState(editHandoff ? editHandoff.team_members.join(", ") : "");
  const [visibility, setVisibility] = useState(editHandoff ? editHandoff.visibility_days : settings.defaultVisibility);
  const [shiftFocus, setShiftFocus] = useState(editHandoff?.shift_focus || "");
  const [observations, setObservations] = useState(editHandoff?.observations || "");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const editorRef = useRef<HTMLDivElement>(null);

  const [incidents, setIncidents] = useState<IncidentEntry[]>(editHandoff?.incidents || []);
  const [toolsStatus, setToolsStatus] = useState<ToolStatusEntry[]>(
    editHandoff?.tools_status?.length
      ? editHandoff.tools_status
      : settings.tools.map((name) => ({ name, status: "operational" })),
  );

  // Pending files (for new handoff — uploaded after creation)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editorRef.current && editHandoff) {
      editorRef.current.innerText = editHandoff.body;
    }
  }, [editHandoff]);

  function handleFormat(command: string, value?: string) {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  }

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
    const body = editorRef.current?.innerText?.trim() || "";

    if (!body) {
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
        if (!res.ok) throw new Error();
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
        if (!res.ok) throw new Error();

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
      onSuccess();
    } catch {
      setFormError(t("shift_handoff.saveFailed", "Could not save handoff."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-inverse-surface/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-4xl bg-surface border border-outline-variant/20 rounded-sm shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between shrink-0 bg-surface-container-lowest">
          <h2 className="text-lg font-bold text-on-surface">
            {isEditing ? t("shift_handoff.editTitle", "Edit Handoff") : t("shift_handoff.createTitle", "New Shift Handoff")}
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low rounded-sm transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto bg-surface">
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
              <div className="border border-outline-variant/30 rounded-sm overflow-hidden bg-surface-container-lowest focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-colors">
                <div className="flex items-center gap-1 p-2 border-b border-outline-variant/20 bg-surface-container-low">
                  <button type="button" onClick={() => handleFormat("bold")} className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-sm" title={t("shift_handoff.fmtBold", "Bold")}>
                    <Bold className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => handleFormat("italic")} className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-sm" title={t("shift_handoff.fmtItalic", "Italic")}>
                    <Italic className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => handleFormat("underline")} className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-sm" title={t("shift_handoff.fmtUnderline", "Underline")}>
                    <Underline className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => handleFormat("strikeThrough")} className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-sm" title={t("shift_handoff.fmtStrike", "Strikethrough")}>
                    <Strikethrough className="w-4 h-4" />
                  </button>
                  <div className="w-px h-4 bg-outline-variant/30 mx-1" />
                  <button
                    type="button"
                    onClick={() => {
                      const url = prompt(t("shift_handoff.insertImageUrl", "Enter image URL:"));
                      if (url) handleFormat("insertImage", url);
                    }}
                    className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-sm"
                    title={t("shift_handoff.insertImage", "Insert image URL")}
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                </div>
                <div
                  ref={editorRef}
                  contentEditable
                  role="textbox"
                  aria-label={t("shift_handoff.fieldBody", "Shift Summary")}
                  className="min-h-[150px] resize-y overflow-y-auto p-4 text-sm text-on-surface outline-none max-w-none"
                  data-placeholder={t("shift_handoff.fieldBodyPlaceholder", "Summarize incidents, ongoing investigations...")}
                />
              </div>
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
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex items-center justify-end gap-3 shrink-0">
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
        </div>
      </motion.div>
    </div>
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
      {/* Header */}
      <div className="page-header">
        <div className="page-header-copy">
          <p className="page-eyebrow">
            <History className="h-4 w-4" />
            {t("shift_handoff.history", "History")}
          </p>
          <h1 className="page-heading">{t("shift_handoff.historyTitle", "Handoff History")}</h1>
          <p className="page-subheading">
            {t("shift_handoff.historySubtitle", "Review complete and expired handoffs with their full operational context.")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate("/shift-handoff")} className="btn btn-outline">
            {t("shift_handoff.backToTimeline", "Back to Timeline")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("shift_handoff.historySearch", "Search by team, content, incidents...")}
            className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-sm pl-10 pr-4 py-2.5 text-sm font-medium text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
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

        <div className="flex items-center gap-1 bg-surface-container-low rounded-sm p-1 border border-outline-variant/20 shrink-0">
          {HISTORY_PERIOD_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setPeriodFilter(d)}
              className={cn(
                "px-3 py-1.5 rounded-sm text-xs font-bold transition-colors whitespace-nowrap",
                periodFilter === d
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high",
              )}
            >
              {periodLabel(d)}
            </button>
          ))}
        </div>

        <span className="badge badge-neutral shrink-0">
          {filtered.length} {t("shift_handoff.historyCount", "handoffs")}
        </span>
      </div>

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-inverse-surface/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-3xl bg-surface border border-outline-variant/20 rounded-sm shadow-2xl flex flex-col max-h-[85vh]"
      >
        <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between shrink-0 bg-surface-container-lowest">
          <div>
            <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              {t("shift_handoff.settingsTitle", "Handoff Settings")}
            </h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              {t("shift_handoff.settingsSubtitle", "Manage monitored tools and the default visibility used when creating new handoffs.")}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low rounded-sm transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
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
        </div>

        <div className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest flex flex-wrap items-center justify-between gap-3 shrink-0">
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
        </div>
      </motion.div>
    </div>
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
                <div className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap bg-surface-container-high/20 rounded-sm p-4 border border-outline-variant/10">
                  {handoff.body}
                </div>
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

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  FileText,
  Image as ImageIcon,
  Loader2,
  Moon,
  Plus,
  RefreshCw,
  ScrollText,
  Shield,
  Sun,
  Trash2,
  Upload,
  UserCheck,
  UserCircle,
  Users,
  Wrench,
  X,
} from "lucide-react";
import API_URL from "../config";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

// ── Types ────────────────────────────────────────────────────────────────────

interface EditHistoryEntry {
  edited_by: string;
  edited_at: string;
  previous_body: string;
}

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

interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  data_uri: string;
  uploaded_by: string;
  uploaded_at: string;
}

interface HandoffItem {
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
  attachments: Attachment[];
  edit_history: EditHistoryEntry[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const VISIBILITY_OPTIONS = [4, 7, 14, 30] as const;
const BODY_MAX_LENGTH = 5000;
const INCIDENT_STATUSES = ["active", "monitoring", "escalated", "resolved"] as const;
const INCIDENT_SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
const TOOL_STATUSES = ["operational", "degraded", "down", "maintenance"] as const;
const DEFAULT_TOOLS = ["SIEM", "EDR", "Firewall", "IDS/IPS", "SOAR", "Ticketing"];

// ── Shift helpers ────────────────────────────────────────────────────────────

function getCurrentShift(): { date: string; period: "day" | "night"; label: string } {
  const now = new Date();
  const hour = now.getHours();

  // Night shift (19:00–07:00) belongs to the date it started on
  // Day shift (07:00–19:00) belongs to the current date
  let shiftDate: Date;
  let period: "day" | "night";

  if (hour >= 7 && hour < 19) {
    period = "day";
    shiftDate = now;
  } else {
    period = "night";
    // If between 00:00–06:59, the night shift started yesterday
    shiftDate = hour < 7 ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  }

  const dateStr = `${shiftDate.getFullYear()}-${String(shiftDate.getMonth() + 1).padStart(2, "0")}-${String(shiftDate.getDate()).padStart(2, "0")}`;
  const label = period === "day" ? "07:00 – 19:00" : "19:00 – 07:00";
  return { date: dateStr, period, label };
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Display helpers ──────────────────────────────────────────────────────────

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatDateOnly(value: string, locale: string) {
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(date);
}

function daysBadge(shiftDate: string, t: (key: string, fallback?: string) => string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(shiftDate + "T00:00:00");
  const diffMs = today.getTime() - target.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0)
    return { label: t("shift_handoff.today", "Today"), tone: "bg-primary/15 text-primary border border-primary/20" };
  if (diffDays === 1)
    return { label: t("shift_handoff.yesterday", "Yesterday"), tone: "bg-warning/10 text-warning border border-warning/15" };
  if (diffDays > 1)
    return { label: `${diffDays}d ${t("shift_handoff.ago", "ago")}`, tone: "bg-surface-container-highest text-on-surface-variant border border-outline-variant/15" };
  if (diffDays === -1)
    return { label: t("shift_handoff.tomorrow", "Tomorrow"), tone: "bg-primary/10 text-primary border border-primary/15" };
  return { label: `${Math.abs(diffDays)}d ${t("shift_handoff.ahead", "ahead")}`, tone: "bg-surface-container-highest text-on-surface-variant border border-outline-variant/15" };
}

function expiresIn(expiresAt: string, t: (key: string, fallback?: string) => string) {
  const now = new Date();
  const exp = new Date(expiresAt);
  const diffH = Math.max(0, Math.round((exp.getTime() - now.getTime()) / (1000 * 60 * 60)));
  if (diffH < 24) return `${diffH}h`;
  return `${Math.round(diffH / 24)} ${t("shift_handoff.days", "days")}`;
}

function severityTone(severity: string) {
  switch (severity) {
    case "critical": return "bg-error/10 text-error";
    case "high": return "bg-error/10 text-error";
    case "medium": return "bg-warning/10 text-warning";
    case "low": return "bg-primary/10 text-primary";
    default: return "bg-surface-container-highest text-on-surface-variant";
  }
}

function incidentStatusTone(status: string) {
  switch (status) {
    case "active": return "bg-error/10 text-error";
    case "escalated": return "bg-warning/10 text-warning";
    case "monitoring": return "bg-primary/10 text-primary";
    case "resolved": return "bg-emerald-500/10 text-emerald-600";
    default: return "bg-surface-container-highest text-on-surface-variant";
  }
}

function toolStatusTone(status: string) {
  switch (status) {
    case "operational": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/15";
    case "degraded": return "bg-warning/10 text-warning border-warning/15";
    case "down": return "bg-error/10 text-error border-error/15";
    case "maintenance": return "bg-surface-container-highest text-on-surface-variant border-outline-variant/15";
    default: return "bg-surface-container-highest text-on-surface-variant border-outline-variant/15";
  }
}

// ── Field validation ─────────────────────────────────────────────────────────

interface FieldErrors { date?: string; members?: string; body?: string }

function validateFields(date: string, members: string, body: string, isEditing: boolean, t: (key: string, fallback?: string) => string): FieldErrors {
  const errors: FieldErrors = {};
  if (!isEditing && !date) errors.date = t("shift_handoff.errDateRequired", "Shift date is required.");
  const parsed = members.split(",").map((m) => m.trim()).filter(Boolean);
  if (parsed.length === 0) errors.members = t("shift_handoff.errMembersRequired", "At least one team member is required.");
  if (!body.trim()) errors.body = t("shift_handoff.errBodyRequired", "Handoff notes cannot be empty.");
  else if (body.length > BODY_MAX_LENGTH) errors.body = t("shift_handoff.errBodyTooLong", "Handoff notes exceed the 5000-character limit.");
  return errors;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ShiftHandoff() {
  const { user } = useAuth();
  const { locale, t } = useLanguage();
  const currentShift = useMemo(() => getCurrentShift(), []);

  const [items, setItems] = useState<HandoffItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState(currentShift.date);
  const [formMembers, setFormMembers] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formVisibility, setFormVisibility] = useState(4);
  const [formFocus, setFormFocus] = useState("");
  const [formObservations, setFormObservations] = useState("");
  const [formIncidents, setFormIncidents] = useState<IncidentEntry[]>([]);
  const [formTools, setFormTools] = useState<ToolStatusEntry[]>(DEFAULT_TOOLS.map((n) => ({ name: n, status: "operational" })));
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLDivElement>(null);

  // Attachments (pending upload for new handoffs, or uploaded ones for existing)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Inline image insert
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Detail expansion
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Lightbox
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const canEdit = useCallback(
    (item: HandoffItem) => {
      if (!user) return false;
      return item.created_by === user.username || user.role === "admin" || user.role === "manager";
    },
    [user],
  );
  const canDelete = user?.role === "admin";

  // ── API ──────────────────────────────────────────────────────────────────

  const loadHandoffs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/shift-handoffs`, { credentials: "include" });
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as HandoffItem[];
      setItems(data);
    } catch {
      setError(t("shift_handoff.loadFailed", "Could not load shift handoffs."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void loadHandoffs(); }, [loadHandoffs]);

  // ── Form logic ───────────────────────────────────────────────────────────

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormDate(currentShift.date);
    setFormMembers("");
    setFormBody("");
    setFormVisibility(4);
    setFormFocus("");
    setFormObservations("");
    setFormIncidents([]);
    setFormTools(DEFAULT_TOOLS.map((n) => ({ name: n, status: "operational" })));
    setFieldErrors({});
    setTouched(new Set());
    setPendingFiles([]);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function openEditForm(item: HandoffItem) {
    setEditingId(item.id);
    setFormDate(item.shift_date);
    setFormMembers(item.team_members.join(", "));
    setFormBody(item.body);
    setFormVisibility(item.visibility_days);
    setFormFocus(item.shift_focus || "");
    setFormObservations(item.observations || "");
    setFormIncidents(item.incidents || []);
    setFormTools(item.tools_status?.length ? item.tools_status : DEFAULT_TOOLS.map((n) => ({ name: n, status: "operational" })));
    setFieldErrors({});
    setTouched(new Set());
    setPendingFiles([]);
    setShowForm(true);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function handleFieldBlur(field: string) {
    setTouched((prev) => new Set(prev).add(field));
    setFieldErrors(validateFields(formDate, formMembers, formBody, !!editingId, t));
  }

  const memberChips = useMemo(() => formMembers.split(",").map((m) => m.trim()).filter(Boolean), [formMembers]);
  const bodyPercent = Math.min(100, Math.round((formBody.length / BODY_MAX_LENGTH) * 100));
  const bodyWarning = bodyPercent > 90;

  // ── Incident rows ────────────────────────────────────────────────────────

  function addIncident() {
    setFormIncidents((prev) => [...prev, { title: "", status: "active", severity: "medium", action_needed: "" }]);
  }

  function updateIncident(idx: number, field: keyof IncidentEntry, value: string) {
    setFormIncidents((prev) => prev.map((inc, i) => (i === idx ? { ...inc, [field]: value } : inc)));
  }

  function removeIncident(idx: number) {
    setFormIncidents((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Tool status ──────────────────────────────────────────────────────────

  function updateToolStatus(idx: number, status: string) {
    setFormTools((prev) => prev.map((ts, i) => (i === idx ? { ...ts, status } : ts)));
  }

  // ── File handling ────────────────────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    const valid = files.filter((f) => f.type.startsWith("image/") && f.size <= 2 * 1024 * 1024);
    setPendingFiles((prev) => [...prev, ...valid].slice(0, 5));
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const files: File[] = Array.from(e.dataTransfer.files);
    const valid = files.filter((f) => f.type.startsWith("image/") && f.size <= 2 * 1024 * 1024);
    setPendingFiles((prev) => [...prev, ...valid].slice(0, 5));
  }

  function insertImageIntoBody(dataUri: string) {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const tag = `\n[image: ${dataUri.slice(0, 40)}...]\n`;
    const pos = textarea.selectionStart || formBody.length;
    setFormBody((prev) => prev.slice(0, pos) + tag + prev.slice(pos));
  }

  async function uploadFilesToHandoff(handoffId: string) {
    for (const file of pendingFiles) {
      const fd = new FormData();
      fd.append("file", file);
      await fetch(`${API_URL}/api/shift-handoffs/${handoffId}/attachments`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
    }
  }

  async function uploadSingleFile(handoffId: string, file: File) {
    setUploadingAttachment(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/api/shift-handoffs/${handoffId}/attachments`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("upload_failed");
      await loadHandoffs();
      setNotice(t("shift_handoff.imageUploaded", "Image uploaded."));
    } catch {
      setError(t("shift_handoff.uploadFailed", "Could not upload image."));
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function deleteAttachment(handoffId: string, attachmentId: string) {
    try {
      await fetch(`${API_URL}/api/shift-handoffs/${handoffId}/attachments/${attachmentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      await loadHandoffs();
    } catch {
      setError(t("shift_handoff.deleteFailed", "Could not delete attachment."));
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = validateFields(formDate, formMembers, formBody, !!editingId, t);
    setFieldErrors(errors);
    setTouched(new Set(["date", "members", "body"]));
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setError("");
    const members = formMembers.split(",").map((m) => m.trim()).filter(Boolean);
    const payload = {
      team_members: members,
      body: formBody,
      visibility_days: formVisibility,
      incidents: formIncidents.filter((i) => i.title.trim()),
      tools_status: formTools,
      observations: formObservations,
      shift_focus: formFocus,
      ...(!editingId && { shift_date: formDate }),
    };

    try {
      let handoffId = editingId;
      if (editingId) {
        const res = await fetch(`${API_URL}/api/shift-handoffs/${editingId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "update_failed");
        setNotice(t("shift_handoff.updated", "Handoff updated successfully."));
      } else {
        const res = await fetch(`${API_URL}/api/shift-handoffs`, {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "create_failed");
        const created = (await res.json()) as HandoffItem;
        handoffId = created.id;
        setNotice(t("shift_handoff.created", "Handoff created successfully."));
      }
      if (handoffId && pendingFiles.length > 0) {
        await uploadFilesToHandoff(handoffId);
      }
      resetForm();
      await loadHandoffs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Acknowledge ──────────────────────────────────────────────────────────

  async function acknowledgeHandoff(id: string) {
    try {
      const res = await fetch(`${API_URL}/api/shift-handoffs/${id}/acknowledge`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("ack_failed");
      setNotice(t("shift_handoff.acknowledged", "Handoff acknowledged."));
      await loadHandoffs();
    } catch {
      setError(t("shift_handoff.ackFailed", "Could not acknowledge handoff."));
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`${API_URL}/api/shift-handoffs/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("delete_failed");
      setNotice(t("shift_handoff.deleted", "Handoff deleted."));
      if (expandedId === id) setExpandedId(null);
      await loadHandoffs();
    } catch {
      setError(t("shift_handoff.deleteFailed", "Could not delete handoff."));
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const { currentHandoff, pastHandoffs } = useMemo(() => {
    const todayStr = currentShift.date;
    const current = items.find((i) => i.shift_date === todayStr) || null;
    const past = items.filter((i) => i.shift_date !== todayStr);
    return { currentHandoff: current, pastHandoffs: past };
  }, [items, currentShift.date]);

  const stats = useMemo(() => {
    const todayCount = currentHandoff ? 1 : 0;
    const uniqueAuthors = new Set(items.map((i) => i.created_by)).size;
    const activeIncidents = items.reduce((sum, i) => sum + (i.incidents?.filter((inc) => inc.status === "active" || inc.status === "escalated").length || 0), 0);
    return { total: items.length, todayCount, uniqueAuthors, activeIncidents };
  }, [items, currentHandoff]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="page-frame space-y-8">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-eyebrow">
            <ScrollText className="h-3.5 w-3.5" />
            {t("shift_handoff.eyebrow", "Operations")}
          </div>
          <h1 className="page-heading">{t("shift_handoff.title", "SOC Shift Handoff")}</h1>
          <p className="page-subheading">
            {t("shift_handoff.subtitle", "Register and review shift handoffs for your SOC rotation teams. Entries expire automatically based on the configured visibility window.")}
          </p>
        </div>
        <div className="summary-strip">
          <div className="summary-pill">
            {currentShift.period === "day" ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-indigo-400" />}
            {currentShift.label}
          </div>
          <div className="summary-pill">
            <FileText className="h-4 w-4 text-primary" />
            {stats.total} {t("shift_handoff.statActive", "active")}
          </div>
          {stats.activeIncidents > 0 && (
            <div className="summary-pill">
              <AlertTriangle className="h-4 w-4 text-error" />
              {stats.activeIncidents} {t("shift_handoff.openIncidents", "open incidents")}
            </div>
          )}
          <div className="summary-pill-muted">
            {stats.uniqueAuthors} {t("shift_handoff.statAuthors", "analysts")}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="page-toolbar">
        <div className="page-toolbar-copy">{t("shift_handoff.actions", "Shift handoff actions")}</div>
        <div className="page-toolbar-actions">
          <button type="button" onClick={() => void loadHandoffs()} className="btn btn-outline">
            <RefreshCw className="h-4 w-4" />
            {t("shift_handoff.refresh", "Refresh")}
          </button>
          <button type="button" onClick={openCreate} className="btn btn-primary">
            <Plus className="h-4 w-4" />
            {t("shift_handoff.newHandoff", "New Handoff")}
          </button>
        </div>
      </div>

      {/* Notice / Error */}
      {(notice || error) && (
        <div className="space-y-3">
          {notice && (
            <div className="rounded-sm border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-on-surface flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              <span className="flex-1">{notice}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setNotice("")} className="text-on-surface-variant hover:text-on-surface shrink-0"><X className="h-4 w-4" /></button>
            </div>
          )}
          {error && (
            <div className="rounded-sm border border-error/20 bg-error/10 px-4 py-3 text-sm text-error flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setError("")} className="text-error/60 hover:text-error shrink-0"><X className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      )}

      {/* ── Create / Edit Form ──────────────────────────────────────────── */}
      {showForm && (
        <div ref={formRef} className="surface-section">
          <div className="surface-section-header">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-sm bg-primary/10 flex items-center justify-center">
                {editingId ? <Edit3 className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-primary" />}
              </div>
              <div>
                <h2 className="surface-section-title">
                  {editingId ? t("shift_handoff.editTitle", "Edit Handoff") : t("shift_handoff.createTitle", "New Shift Handoff")}
                </h2>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-0.5">
                  {editingId ? t("shift_handoff.editDesc", "Update handoff details") : t("shift_handoff.createDesc", "Fill in the shift details below")}
                </p>
              </div>
            </div>
            <button type="button" aria-label="Close form" onClick={resetForm} className="btn btn-ghost"><X className="h-4 w-4" /></button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-6">
            {/* ── Section: Shift ID ─────────────────────────────────────── */}
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant pb-2 border-b border-outline-variant/10">
                <Calendar className="h-3.5 w-3.5" />
                {t("shift_handoff.sectionIdentification", "Shift Identification")}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Date */}
                <label className="block space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                    {t("shift_handoff.fieldDate", "Shift Date")} <span className="text-error">*</span>
                  </div>
                  {editingId ? (
                    <div className="flex items-center gap-2 rounded-sm bg-surface-container-high px-4 py-3 text-sm text-on-surface">
                      <Calendar className="h-4 w-4 text-on-surface-variant" />
                      {formatDateOnly(formDate, locale)}
                    </div>
                  ) : (
                    <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} onBlur={() => handleFieldBlur("date")}
                      className="w-full border-0 border-b-2 border-outline bg-surface-container-high px-4 py-3 text-sm text-on-surface outline-none focus:border-primary rounded-sm transition-colors" />
                  )}
                  {touched.has("date") && fieldErrors.date && <p className="text-[11px] text-error flex items-center gap-1 mt-1"><AlertTriangle className="h-3 w-3" /> {fieldErrors.date}</p>}
                </label>

                {/* Shift Focus */}
                <label className="block space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                    {t("shift_handoff.fieldFocus", "Shift Focus / Priority")}
                  </div>
                  <input type="text" value={formFocus} onChange={(e) => setFormFocus(e.target.value)} maxLength={500}
                    placeholder={t("shift_handoff.fieldFocusPlaceholder", "e.g. Phishing campaign follow-up")}
                    className="w-full border-0 border-b-2 border-outline bg-surface-container-high px-4 py-3 text-sm text-on-surface outline-none focus:border-primary rounded-sm transition-colors" />
                </label>

                {/* Visibility */}
                <label className="block space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                    <Clock className="inline h-3 w-3 mr-1" />
                    {t("shift_handoff.fieldVisibility", "Visibility Window")}
                  </div>
                  <div className="flex gap-2">
                    {VISIBILITY_OPTIONS.map((d) => (
                      <button key={d} type="button" onClick={() => setFormVisibility(d)}
                        className={`px-3 py-2.5 text-xs font-bold rounded-sm border transition-all ${formVisibility === d ? "bg-primary/10 text-primary border-primary/30" : "bg-surface-container-high text-on-surface-variant border-outline-variant/20 hover:border-outline-variant/40"}`}>
                        {d}d
                      </button>
                    ))}
                  </div>
                </label>
              </div>
            </div>

            {/* ── Section: Team ──────────────────────────────────────────── */}
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant pb-2 border-b border-outline-variant/10">
                <Users className="h-3.5 w-3.5" />
                {t("shift_handoff.sectionTeam", "Shift Team")}
              </div>
              <label className="block space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                  {t("shift_handoff.fieldMembers", "Team Members")} <span className="text-error">*</span>
                </div>
                <input type="text" value={formMembers} onChange={(e) => setFormMembers(e.target.value)} onBlur={() => handleFieldBlur("members")}
                  placeholder={t("shift_handoff.fieldMembersPlaceholder", "e.g. Nilson, Samuel, Rony")}
                  className="w-full border-0 border-b-2 border-outline bg-surface-container-high px-4 py-3 text-sm text-on-surface outline-none focus:border-primary rounded-sm transition-colors" />
                {touched.has("members") && fieldErrors.members && <p className="text-[11px] text-error flex items-center gap-1 mt-1"><AlertTriangle className="h-3 w-3" /> {fieldErrors.members}</p>}
                {memberChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {memberChips.map((name, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-primary/8 text-primary border border-primary/15 rounded-sm">
                        <UserCircle className="h-3 w-3" /> {name}
                      </span>
                    ))}
                  </div>
                )}
              </label>
            </div>

            {/* ── Section: Active Incidents (inspired by JotForm matrix) ── */}
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/10">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant">
                  <Shield className="h-3.5 w-3.5" />
                  {t("shift_handoff.sectionIncidents", "Active Incidents")}
                </div>
                <button type="button" onClick={addIncident} className="btn btn-outline text-xs">
                  <Plus className="h-3.5 w-3.5" /> {t("shift_handoff.addIncident", "Add")}
                </button>
              </div>

              {formIncidents.length === 0 ? (
                <div className="rounded-sm bg-surface-container-low px-4 py-4 text-xs text-on-surface-variant text-center">
                  {t("shift_handoff.noIncidents", "No active incidents to report. Click \"Add\" if there are ongoing incidents.")}
                </div>
              ) : (
                <div className="space-y-3">
                  {formIncidents.map((inc, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-3 items-start rounded-sm border border-outline-variant/15 bg-surface-container-high/30 p-3">
                      <div className="col-span-12 md:col-span-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline mb-1">{t("shift_handoff.incTitle", "Incident")}</div>
                        <input type="text" value={inc.title} onChange={(e) => updateIncident(idx, "title", e.target.value)}
                          placeholder={t("shift_handoff.incTitlePlaceholder", "Brief description")}
                          className="w-full border-0 border-b border-outline bg-transparent px-0 py-1.5 text-sm text-on-surface outline-none focus:border-primary" />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline mb-1">{t("shift_handoff.incSeverity", "Severity")}</div>
                        <select value={inc.severity} onChange={(e) => updateIncident(idx, "severity", e.target.value)}
                          aria-label={t("shift_handoff.incSeverity", "Severity")}
                          className="w-full border-0 border-b border-outline bg-transparent px-0 py-1.5 text-xs text-on-surface outline-none focus:border-primary uppercase font-bold">
                          {INCIDENT_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline mb-1">{t("shift_handoff.incStatus", "Status")}</div>
                        <select value={inc.status} onChange={(e) => updateIncident(idx, "status", e.target.value)}
                          aria-label={t("shift_handoff.incStatus", "Status")}
                          className="w-full border-0 border-b border-outline bg-transparent px-0 py-1.5 text-xs text-on-surface outline-none focus:border-primary uppercase font-bold">
                          {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="col-span-12 md:col-span-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline mb-1">{t("shift_handoff.incAction", "Action Needed")}</div>
                        <input type="text" value={inc.action_needed} onChange={(e) => updateIncident(idx, "action_needed", e.target.value)}
                          placeholder={t("shift_handoff.incActionPlaceholder", "Next steps...")}
                          className="w-full border-0 border-b border-outline bg-transparent px-0 py-1.5 text-sm text-on-surface outline-none focus:border-primary" />
                      </div>
                      <div className="col-span-12 md:col-span-1 flex md:justify-end md:items-end md:pb-1">
                        <button type="button" aria-label={t("shift_handoff.removeIncident", "Remove incident")} onClick={() => removeIncident(idx)} className="text-error/50 hover:text-error p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Section: Tools Status (inspired by JotForm equipment matrix) */}
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant pb-2 border-b border-outline-variant/10">
                <Wrench className="h-3.5 w-3.5" />
                {t("shift_handoff.sectionTools", "Monitoring Tools Status")}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {formTools.map((tool, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{tool.name}</div>
                    <div className="flex flex-wrap gap-1">
                      {TOOL_STATUSES.map((s) => (
                        <button key={s} type="button" onClick={() => updateToolStatus(idx, s)}
                          className={`px-2 py-1 text-[9px] font-black uppercase rounded-sm border transition-all ${tool.status === s ? toolStatusTone(s) : "bg-transparent text-on-surface-variant/40 border-outline-variant/10 hover:border-outline-variant/30"}`}>
                          {s === "operational" ? "OK" : s === "degraded" ? "DEG" : s === "down" ? "DOWN" : "MAINT"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Section: Notes ─────────────────────────────────────────── */}
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant pb-2 border-b border-outline-variant/10">
                <FileText className="h-3.5 w-3.5" />
                {t("shift_handoff.sectionNotes", "Handoff Notes")}
              </div>

              <label className="block space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                    {t("shift_handoff.fieldBody", "Shift Summary")} <span className="text-error">*</span>
                  </div>
                  <div className={`text-[10px] font-mono tabular-nums ${bodyWarning ? "text-warning font-bold" : "text-on-surface-variant"}`}>
                    {formBody.length.toLocaleString()}/{BODY_MAX_LENGTH.toLocaleString()}
                  </div>
                </div>
                <textarea ref={bodyRef} value={formBody} onChange={(e) => setFormBody(e.target.value)} onBlur={() => handleFieldBlur("body")}
                  placeholder={t("shift_handoff.fieldBodyPlaceholder", "Summarize incidents, ongoing investigations, and anything the next shift needs to know...")}
                  rows={8} maxLength={BODY_MAX_LENGTH}
                  className="w-full border border-outline-variant/20 bg-surface-container-high px-4 py-3 text-sm text-on-surface outline-none focus:border-primary rounded-sm transition-colors resize-y leading-relaxed" />
                <div className="h-0.5 rounded-full bg-surface-container-highest overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${bodyWarning ? "bg-warning" : "bg-primary/40"}`}
                    style={{ width: `${bodyPercent}%` }} />
                </div>
                {touched.has("body") && fieldErrors.body && <p className="text-[11px] text-error flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {fieldErrors.body}</p>}
              </label>

              {/* Observations */}
              <label className="block space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-outline">
                  {t("shift_handoff.fieldObservations", "Additional Observations")}
                </div>
                <textarea value={formObservations} onChange={(e) => setFormObservations(e.target.value)}
                  placeholder={t("shift_handoff.fieldObservationsPlaceholder", "Pending escalations, external contacts, compliance notes...")}
                  rows={3} maxLength={2000}
                  className="w-full border border-outline-variant/20 bg-surface-container-high px-4 py-3 text-sm text-on-surface outline-none focus:border-primary rounded-sm transition-colors resize-y leading-relaxed" />
              </label>
            </div>

            {/* ── Section: Attachments ───────────────────────────────────── */}
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant pb-2 border-b border-outline-variant/10">
                <ImageIcon className="h-3.5 w-3.5" />
                {t("shift_handoff.sectionAttachments", "Image Attachments")}
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="rounded-sm border-2 border-dashed border-outline-variant/30 bg-surface-container-high/30 p-6 text-center hover:border-primary/40 transition-colors"
              >
                <Upload className="h-6 w-6 text-on-surface-variant/40 mx-auto mb-2" />
                <p className="text-xs text-on-surface-variant mb-2">
                  {t("shift_handoff.dropImages", "Drag and drop images here, or")}
                </p>
                <label className="btn btn-outline text-xs cursor-pointer inline-flex">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {t("shift_handoff.browseFiles", "Browse files")}
                  <input type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
                </label>
                <p className="text-[10px] text-on-surface-variant/60 mt-2">
                  PNG, JPG, GIF, WebP · {t("shift_handoff.maxSize", "Max 2MB per file")} · {t("shift_handoff.maxFiles", "Up to 5 images")}
                </p>
              </div>

              {/* Pending files preview */}
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {pendingFiles.map((file, idx) => (
                    <div key={idx} className="relative group w-24 h-24 rounded-sm overflow-hidden border border-outline-variant/20 bg-surface-container-high">
                      <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                      <button type="button" aria-label={t("shift_handoff.removePendingFile", "Remove file")} onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 w-5 h-5 bg-inverse-surface/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-3 w-3" />
                      </button>
                      <div className="absolute bottom-0 inset-x-0 bg-inverse-surface/60 px-1 py-0.5 text-[9px] text-white truncate">{file.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit row */}
            <div className="flex items-center justify-between pt-4 border-t border-outline-variant/10">
              <p className="text-[10px] text-on-surface-variant"><span className="text-error">*</span> {t("shift_handoff.requiredFields", "Required fields")}</p>
              <div className="flex gap-3">
                <button type="button" onClick={resetForm} className="btn btn-outline">{t("shift_handoff.cancel", "Cancel")}</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />{t("shift_handoff.saving", "Saving...")}</> : editingId ? t("shift_handoff.save", "Save Changes") : t("shift_handoff.create", "Create Handoff")}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Current Shift (always open at top) ──────────────────────────── */}
      {!loading && currentHandoff && (
        <div className="surface-section ring-2 ring-primary/20">
          <div className="surface-section-header bg-primary/5">
            <div className="flex items-center gap-3">
              {currentShift.period === "day" ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5 text-indigo-400" />}
              <div>
                <h3 className="text-sm font-bold tracking-tight text-on-surface">
                  {t("shift_handoff.currentShift", "Current Shift")} — {formatDateOnly(currentHandoff.shift_date, locale)}
                </h3>
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                  {currentShift.label} · {t("shift_handoff.by", "by")} {currentHandoff.created_by}
                  {currentHandoff.acknowledged_by && (
                    <> · <CheckCircle2 className="inline h-3 w-3 text-emerald-500" /> {t("shift_handoff.ackBy", "ack")} {currentHandoff.acknowledged_by}</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!currentHandoff.acknowledged_by && user && currentHandoff.created_by !== user.username && (
                <button type="button" onClick={() => void acknowledgeHandoff(currentHandoff.id)} className="btn btn-primary text-xs">
                  <UserCheck className="h-3.5 w-3.5" /> {t("shift_handoff.acknowledge", "Acknowledge")}
                </button>
              )}
              {canEdit(currentHandoff) && (
                <button type="button" onClick={() => openEditForm(currentHandoff)} className="btn btn-outline text-xs">
                  <Edit3 className="h-3.5 w-3.5" /> {t("shift_handoff.edit", "Edit")}
                </button>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Shift focus */}
            {currentHandoff.shift_focus && (
              <div className="rounded-sm bg-primary/5 border border-primary/15 px-4 py-3 flex items-start gap-3">
                <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-primary mb-1">{t("shift_handoff.shiftFocusLabel", "Shift Focus")}</div>
                  <p className="text-sm text-on-surface">{currentHandoff.shift_focus}</p>
                </div>
              </div>
            )}

            {/* Incidents */}
            {currentHandoff.incidents && currentHandoff.incidents.length > 0 && (
              <div className="space-y-3">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5" /> {t("shift_handoff.sectionIncidents", "Active Incidents")}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-outline-variant/15 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        <th className="text-left py-2 pr-3">{t("shift_handoff.incTitle", "Incident")}</th>
                        <th className="text-left py-2 pr-3">{t("shift_handoff.incSeverity", "Severity")}</th>
                        <th className="text-left py-2 pr-3">{t("shift_handoff.incStatus", "Status")}</th>
                        <th className="text-left py-2">{t("shift_handoff.incAction", "Action Needed")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentHandoff.incidents.map((inc, idx) => (
                        <tr key={idx} className="border-b border-outline-variant/10">
                          <td className="py-2 pr-3 font-medium text-on-surface">{inc.title}</td>
                          <td className="py-2 pr-3"><span className={`badge ${severityTone(inc.severity)}`}>{inc.severity}</span></td>
                          <td className="py-2 pr-3"><span className={`badge ${incidentStatusTone(inc.status)}`}>{inc.status}</span></td>
                          <td className="py-2 text-on-surface-variant">{inc.action_needed || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tools status */}
            {currentHandoff.tools_status && currentHandoff.tools_status.length > 0 && (
              <div className="space-y-3">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5" /> {t("shift_handoff.sectionTools", "Monitoring Tools Status")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {currentHandoff.tools_status.map((ts, idx) => (
                    <div key={idx} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border text-[11px] font-bold ${toolStatusTone(ts.status)}`}>
                      {ts.name}
                      <span className="uppercase text-[9px]">{ts.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Body */}
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-2 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" /> {t("shift_handoff.sectionNotes", "Handoff Notes")}
              </div>
              <div className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed bg-surface-container-high/20 rounded-sm p-4 border border-outline-variant/10">
                {currentHandoff.body}
              </div>
            </div>

            {/* Observations */}
            {currentHandoff.observations && (
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant mb-2">
                  {t("shift_handoff.fieldObservations", "Additional Observations")}
                </div>
                <p className="text-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed">{currentHandoff.observations}</p>
              </div>
            )}

            {/* Attachments */}
            {currentHandoff.attachments && currentHandoff.attachments.length > 0 && (
              <div className="space-y-3">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-on-surface-variant flex items-center gap-2">
                  <ImageIcon className="h-3.5 w-3.5" /> {t("shift_handoff.sectionAttachments", "Image Attachments")} ({currentHandoff.attachments.length})
                </div>
                <div className="flex flex-wrap gap-3">
                  {currentHandoff.attachments.map((att) => (
                    <div key={att.id} className="relative group">
                      <button type="button" onClick={() => setLightboxSrc(att.data_uri)} className="block w-32 h-32 rounded-sm overflow-hidden border border-outline-variant/20 hover:ring-2 hover:ring-primary/30 transition-all">
                        <img src={att.data_uri} alt={att.filename} className="w-full h-full object-cover" />
                      </button>
                      {canEdit(currentHandoff) && (
                        <button type="button" aria-label={t("shift_handoff.removeAttachment", "Remove attachment")} onClick={() => void deleteAttachment(currentHandoff.id, att.id)}
                          className="absolute top-1 right-1 w-5 h-5 bg-error/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {/* Inline upload for existing handoff */}
                {canEdit(currentHandoff) && currentHandoff.attachments.length < 5 && (
                  <label className="btn btn-outline text-xs cursor-pointer inline-flex">
                    {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {t("shift_handoff.addImage", "Add image")}
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingAttachment}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadSingleFile(currentHandoff.id, f); e.target.value = ""; }} />
                  </label>
                )}
              </div>
            )}

            {/* If no attachments but user can edit, show add button */}
            {(!currentHandoff.attachments || currentHandoff.attachments.length === 0) && canEdit(currentHandoff) && (
              <label className="btn btn-outline text-xs cursor-pointer inline-flex">
                {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                {t("shift_handoff.attachImage", "Attach image")}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingAttachment}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadSingleFile(currentHandoff.id, f); e.target.value = ""; }} />
              </label>
            )}

            {/* Team + meta */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-outline-variant/10">
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{t("shift_handoff.team", "Team")}:</span>
              {currentHandoff.team_members.map((name, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-surface-container-highest text-on-surface-variant rounded-sm">
                  <UserCircle className="h-3 w-3" /> {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty state for current shift */}
      {!loading && !currentHandoff && !showForm && (
        <div className="surface-section ring-1 ring-outline-variant/20">
          <div className="p-8 flex flex-col items-center justify-center gap-4">
            <div className="w-14 h-14 rounded-full bg-warning/10 flex items-center justify-center">
              {currentShift.period === "day" ? <Sun className="h-7 w-7 text-amber-500/50" /> : <Moon className="h-7 w-7 text-indigo-400/50" />}
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-on-surface">{t("shift_handoff.noCurrentHandoff", "No handoff for the current shift")}</p>
              <p className="text-xs text-on-surface-variant">{currentShift.label} · {formatDateOnly(currentShift.date, locale)}</p>
            </div>
            <button type="button" onClick={openCreate} className="btn btn-primary mt-1">
              <Plus className="h-4 w-4" /> {t("shift_handoff.createCurrentShift", "Create handoff for this shift")}
            </button>
          </div>
        </div>
      )}

      {/* ── Past Handoffs ───────────────────────────────────────────────── */}
      {!loading && pastHandoffs.length > 0 && (
        <div className="surface-section">
          <div className="surface-section-header">
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              {t("shift_handoff.pastHandoffs", "Previous Handoffs")}
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
              {pastHandoffs.length} {t("shift_handoff.entries", "entries")}
            </span>
          </div>
          <div className="p-6 space-y-0">
            {pastHandoffs.map((item, idx) => {
              const badge = daysBadge(item.shift_date, t);
              const isExpanded = expandedId === item.id;
              const isLast = idx === pastHandoffs.length - 1;

              return (
                <div key={item.id} className="relative flex gap-5">
                  <div className="flex flex-col items-center shrink-0 w-10">
                    <div className="w-3 h-3 rounded-full border-2 shrink-0 z-10 mt-5 bg-surface-container-highest border-outline-variant/30" />
                    {!isLast && <div className="w-px flex-1 bg-outline-variant/15 min-h-[2rem]" />}
                  </div>

                  <div className={`flex-1 rounded-sm border border-outline-variant/15 bg-surface-container-lowest shadow-sm overflow-hidden mb-4 transition-shadow ${isExpanded ? "shadow-md ring-1 ring-primary/10" : "hover:shadow-md"}`}>
                    <button type="button" onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-container-high/20 transition-colors text-left gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-sm whitespace-nowrap uppercase tracking-wider ${badge.tone}`}>{badge.label}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-on-surface">{formatDateOnly(item.shift_date, locale)}</div>
                          <div className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1.5"><Users className="h-3 w-3 shrink-0" /> {item.team_members.slice(0, 3).join(", ")}{item.team_members.length > 3 && <span className="text-[10px]">+{item.team_members.length - 3}</span>}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {item.acknowledged_by && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        {item.incidents?.some((i) => i.status === "active" || i.status === "escalated") && <AlertTriangle className="h-3.5 w-3.5 text-error" />}
                        <span className="hidden sm:inline text-[10px] text-on-surface-variant font-mono">{expiresIn(item.expires_at, t)}</span>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-on-surface-variant" /> : <ChevronDown className="h-4 w-4 text-on-surface-variant" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-outline-variant/10 p-5 space-y-5">
                        {item.shift_focus && (
                          <div className="rounded-sm bg-primary/5 border border-primary/15 px-3 py-2 text-xs">
                            <span className="font-bold text-primary uppercase tracking-wider text-[10px]">{t("shift_handoff.shiftFocusLabel", "Focus")}:</span> {item.shift_focus}
                          </div>
                        )}
                        {item.incidents && item.incidents.length > 0 && (
                          <div className="space-y-2">
                            {item.incidents.map((inc, iIdx) => (
                              <div key={iIdx} className="flex items-center gap-3 text-xs">
                                <span className={`badge ${severityTone(inc.severity)}`}>{inc.severity}</span>
                                <span className={`badge ${incidentStatusTone(inc.status)}`}>{inc.status}</span>
                                <span className="text-on-surface font-medium">{inc.title}</span>
                                {inc.action_needed && <span className="text-on-surface-variant">— {inc.action_needed}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {item.tools_status && item.tools_status.some((ts) => ts.status !== "operational") && (
                          <div className="flex flex-wrap gap-1.5">
                            {item.tools_status.filter((ts) => ts.status !== "operational").map((ts, tIdx) => (
                              <span key={tIdx} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border text-[10px] font-bold ${toolStatusTone(ts.status)}`}>
                                {ts.name}: {ts.status}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{item.body}</div>
                        {item.observations && <p className="text-xs text-on-surface-variant whitespace-pre-wrap italic">{item.observations}</p>}
                        {item.attachments && item.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {item.attachments.map((att) => (
                              <button key={att.id} type="button" onClick={() => setLightboxSrc(att.data_uri)} className="w-20 h-20 rounded-sm overflow-hidden border border-outline-variant/20 hover:ring-2 hover:ring-primary/30 transition-all">
                                <img src={att.data_uri} alt={att.filename} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-on-surface-variant uppercase tracking-wider pt-3 border-t border-outline-variant/10">
                          <span><UserCircle className="inline h-3 w-3" /> {item.created_by}</span>
                          <span><Calendar className="inline h-3 w-3" /> {formatDate(item.created_at, locale)}</span>
                          {item.acknowledged_by && <span><CheckCircle2 className="inline h-3 w-3 text-emerald-500" /> {item.acknowledged_by} · {formatDate(item.acknowledged_at, locale)}</span>}
                        </div>
                        {(canEdit(item) || canDelete) && (
                          <div className="flex items-center gap-2 pt-2">
                            {canEdit(item) && <button type="button" onClick={() => openEditForm(item)} className="btn btn-outline text-xs"><Edit3 className="h-3.5 w-3.5" /> {t("shift_handoff.edit", "Edit")}</button>}
                            {canDelete && (
                              confirmDeleteId === item.id ? (
                                <div className="flex items-center gap-2 ml-auto">
                                  <span className="text-[11px] text-error font-medium">{t("shift_handoff.confirmDelete", "Delete?")}</span>
                                  <button type="button" onClick={() => void handleDelete(item.id)} className="btn btn-error text-xs">{t("shift_handoff.confirmYes", "Yes")}</button>
                                  <button type="button" onClick={() => setConfirmDeleteId(null)} className="btn btn-outline text-xs">{t("shift_handoff.cancel", "Cancel")}</button>
                                </div>
                              ) : (
                                <button type="button" onClick={() => setConfirmDeleteId(item.id)} className="btn btn-outline text-xs text-error border-error/20 hover:bg-error/10 ml-auto"><Trash2 className="h-3.5 w-3.5" /> {t("shift_handoff.delete", "Delete")}</button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm">{t("shift_handoff.loading", "Loading handoffs...")}</span>
        </div>
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <div className="fixed inset-0 z-[100] bg-inverse-surface/90 flex items-center justify-center p-8" onClick={() => setLightboxSrc(null)}>
          <button type="button" aria-label="Close" onClick={() => setLightboxSrc(null)} className="absolute top-6 right-6 text-white hover:text-white/70"><X className="h-8 w-8" /></button>
          <img src={lightboxSrc} alt="Attachment" className="max-w-full max-h-full rounded-sm shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

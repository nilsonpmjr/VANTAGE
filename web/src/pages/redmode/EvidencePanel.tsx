import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  Check,
  Clock3,
  Copy,
  FileText,
  Filter,
  GitCompare,
  History,
  Image,
  Link2,
  Loader2,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Search,
  Send,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { MarkdownContent, MarkdownEditor } from "../../components/markdown";
import {
  createEvidenceDraft,
  deleteEvidenceDraftAttachment,
  discardEvidenceDraft,
  evidenceAttachmentDownloadUrl,
  getEvidenceDraft,
  getEvidenceNote,
  listEvidenceDrafts,
  listEvidenceNotes,
  listEvidenceRevisions,
  listFindings,
  publishEvidenceDraft,
  rebaseEvidenceDraft,
  saveEvidenceDraft,
  uploadEvidenceDraftAttachments,
  type EvidenceAttachment,
  type EvidenceDraft,
  type EvidenceDraftSummary,
  type EvidenceNote,
  type EvidenceNoteInput,
  type EvidenceNoteSummary,
  type EvidenceRevision,
  type Finding,
} from "./api";

export const ptesPhases = [
  ["pre-engagement", "Pré-engajamento"],
  ["reconnaissance", "Reconhecimento"],
  ["threat-modeling", "Modelagem de ameaças"],
  ["vulnerability-analysis", "Análise de vulnerabilidades"],
  ["exploitation", "Exploração"],
  ["post-exploitation", "Pós-exploração"],
  ["reporting", "Relatório"],
] as const;

export function phaseLabel(phase: string): string {
  return ptesPhases.find(([key]) => key === phase)?.[1] ?? phase;
}

const NOTE_PAGE_SIZE = 30;
const NEW_NOTE_TOKEN = "new";

type MobilePane = "notes" | "document" | "properties";

interface EvidenceForm {
  title: string;
  markdown: string;
  phase: string;
  tags: string;
  targets: string;
  findingIds: string[];
  attachmentIds: string[];
}

function emptyForm(): EvidenceForm {
  return {
    title: "",
    markdown: "",
    phase: "pre-engagement",
    tags: "",
    targets: "",
    findingIds: [],
    attachmentIds: [],
  };
}

function noteToForm(note: EvidenceNote): EvidenceForm {
  return {
    title: note.title,
    markdown: note.markdown,
    phase: note.phase,
    tags: note.tags.join(", "),
    targets: note.targets.join("\n"),
    findingIds: note.finding_ids,
    attachmentIds: note.attachment_ids,
  };
}

function draftToForm(draft: EvidenceDraft): EvidenceForm {
  return {
    title: draft.title,
    markdown: draft.markdown,
    phase: draft.phase,
    tags: draft.tags.join(", "),
    targets: draft.targets.join("\n"),
    findingIds: draft.finding_ids,
    attachmentIds: draft.attachment_ids,
  };
}

function uniqueList(values: string[], caseInsensitive = false): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = caseInsensitive ? value.toLocaleLowerCase("pt-BR") : value;
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formPayload(form: EvidenceForm): EvidenceNoteInput {
  return {
    title: form.title.trim(),
    markdown: form.markdown,
    phase: form.phase,
    tags: uniqueList(
      form.tags.split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
      true,
    ),
    targets: uniqueList(form.targets.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)),
    finding_ids: uniqueList(form.findingIds),
    attachment_ids: uniqueList(form.attachmentIds),
  };
}

function noteSummary(note: EvidenceNote): EvidenceNoteSummary {
  const excerpt = note.markdown
    .replace(/<[^>]*>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[\s#>*+\-\d.)]+/gm, "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    id: note.id,
    project_slug: note.project_slug,
    origin: note.origin,
    created_by: note.created_by,
    created_at: note.created_at,
    updated_at: note.updated_at,
    title: note.title,
    excerpt: excerpt.length > 240 ? `${excerpt.slice(0, 237).trim()}...` : excerpt,
    phase: note.phase,
    tags: note.tags,
    target_count: note.targets.length,
    finding_count: note.finding_ids.length,
    attachment_count: note.attachment_ids.length,
    revision: note.revision,
  };
}

function draftSummary(draft: EvidenceDraft): EvidenceDraftSummary {
  const excerpt = noteSummary({
    ...draft,
    id: draft.note_id,
    origin: "human",
    created_by: draft.author,
    revision: {
      id: draft.base_revision_id || "",
      number: 0,
      previous_revision_id: null,
      author: draft.author,
      created_at: draft.updated_at,
    },
  }).excerpt;
  return {
    note_id: draft.note_id,
    project_slug: draft.project_slug,
    version: draft.version,
    base_revision_id: draft.base_revision_id,
    updated_at: draft.updated_at,
    title: draft.title,
    excerpt,
    phase: draft.phase,
    tags: draft.tags,
    attachment_count: draft.attachment_ids.length,
    is_new: draft.base_revision_id === null,
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

function sortNotes(items: EvidenceNoteSummary[]): EvidenceNoteSummary[] {
  return [...items].sort((left, right) => (
    new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  ));
}

function isFormEqual(left: EvidenceForm | null, right: EvidenceForm): boolean {
  return Boolean(left) && JSON.stringify(left) === JSON.stringify(right);
}

function ShortcutHint({ children }: { children: ReactNode }) {
  return <kbd className="rounded-sm border border-outline-variant/30 bg-surface px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">{children}</kbd>;
}

export default function EvidencePanel({
  slug,
  findingRefresh,
  onAdded,
}: {
  slug: string;
  findingRefresh: number;
  onAdded?: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedToken = searchParams.get("note") || "";
  const query = searchParams.get("q") || "";
  const phaseFilter = searchParams.get("phase") || "all";
  const tagFilter = searchParams.get("tag") || "all";

  const [notes, setNotes] = useState<EvidenceNoteSummary[]>([]);
  const [drafts, setDrafts] = useState<EvidenceDraftSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listError, setListError] = useState("");
  const [listReload, setListReload] = useState(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [findingsError, setFindingsError] = useState("");

  const [selected, setSelected] = useState<EvidenceNote | null>(null);
  const [draft, setDraft] = useState<EvidenceDraft | null>(null);
  const [form, setForm] = useState<EvidenceForm>(emptyForm);
  const [baseline, setBaseline] = useState<EvidenceForm | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [remoteConflict, setRemoteConflict] = useState<EvidenceNote | null>(null);
  const [revisions, setRevisions] = useState<EvidenceRevision[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewedRevision, setViewedRevision] = useState<EvidenceRevision | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [mobilePane, setMobilePane] = useState<MobilePane>(selectedToken ? "document" : "notes");

  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const dirty = baseline !== null && !isFormEqual(baseline, form);
  const allTags = useMemo(() => Array.from(new Set(notes.flatMap((note) => note.tags)))
    .sort((left, right) => left.localeCompare(right, "pt-BR")), [notes]);
  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return notes.filter((note) => {
      if (phaseFilter !== "all" && note.phase !== phaseFilter) return false;
      if (tagFilter !== "all" && !note.tags.includes(tagFilter)) return false;
      if (!needle) return true;
      return [note.title, note.excerpt, note.created_by, note.revision.author, phaseLabel(note.phase), ...note.tags]
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [notes, phaseFilter, query, tagFilter]);
  const unpublishedDrafts = useMemo(() => drafts.filter((item) => (
    item.is_new
    && !notes.some((note) => note.id === item.note_id)
    && (phaseFilter === "all" || item.phase === phaseFilter)
    && (tagFilter === "all" || item.tags.includes(tagFilter))
    && (!query.trim() || [item.title, item.excerpt, item.phase, ...item.tags]
      .some((value) => value.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))))
  )), [drafts, notes, phaseFilter, query, tagFilter]);

  function updateLocation(key: "note" | "q" | "phase" | "tag", value?: string, replace = true) {
    const next = new URLSearchParams(searchParams);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace });
  }

  function confirmDiscard(): boolean {
    return !dirty || window.confirm("Descartar as alterações ainda não confirmadas pelo servidor?");
  }

  function focusDocument() {
    window.requestAnimationFrame(() => {
      documentRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    });
  }

  function chooseNote(noteId: string) {
    if (noteId === selectedToken || !confirmDiscard()) return;
    setMobilePane("document");
    updateLocation("note", noteId, false);
  }

  async function startNewNote() {
    if (selectedToken === NEW_NOTE_TOKEN) {
      setMobilePane("document");
      titleRef.current?.focus();
      return;
    }
    if (!confirmDiscard() || creating) return;
    setCreating(true);
    setSaveError("");
    try {
      const created = await createEvidenceDraft(slug);
      const next = draftToForm(created);
      setDraft(created);
      setSelected(null);
      setForm(next);
      setBaseline(next);
      setDrafts((current) => [
        draftSummary(created),
        ...current.filter((item) => item.note_id !== created.note_id),
      ]);
      setSaveStatus("saved");
      setMobilePane("document");
      updateLocation("note", created.note_id, false);
      window.requestAnimationFrame(() => titleRef.current?.focus());
    } catch {
      setSaveError("Não foi possível iniciar um novo rascunho.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError("");
    Promise.all([
      listEvidenceNotes(slug, 0, NOTE_PAGE_SIZE),
      listEvidenceDrafts(slug),
    ])
      .then(([result, draftResult]) => {
        if (!active) return;
        setNotes((current) => sortNotes([
          ...result.items,
          ...current.filter((note) => (
            note.id === selectedToken
            && note.project_slug === slug
            && !result.items.some((loaded) => loaded.id === note.id)
          )),
        ]));
        setTotal(result.total);
        setLoadedCount(result.items.length);
        setDrafts(draftResult.items);
      })
      .catch(() => {
        if (active) setListError("Não foi possível carregar o caderno de evidências.");
      })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [listReload, slug]);

  useEffect(() => {
    let active = true;
    setFindingsError("");
    listFindings(slug, 0, 100)
      .then((result) => { if (active) setFindings(result.items); })
      .catch(() => { if (active) setFindingsError("Não foi possível carregar os findings relacionados."); });
    return () => { active = false; };
  }, [findingRefresh, slug]);

  useEffect(() => {
    setSaveError("");
    setDetailError("");
    setRemoteConflict(null);
    setViewedRevision(null);
    if (!selectedToken) {
      setDetailLoading(false);
      setSelected(null);
      setDraft(null);
      setBaseline(null);
      setForm(emptyForm());
      setRevisions([]);
      setSaveStatus("idle");
      return;
    }
    if (selectedToken === NEW_NOTE_TOKEN) {
      setDetailLoading(true);
      return;
    }
    let active = true;
    setDetailLoading(true);
    Promise.allSettled([
      getEvidenceNote(slug, selectedToken),
      getEvidenceDraft(slug, selectedToken),
    ])
      .then(([noteResult, draftResult]) => {
        if (!active) return;
        const note = noteResult.status === "fulfilled" ? noteResult.value : null;
        const privateDraft = draftResult.status === "fulfilled" ? draftResult.value : null;
        if (!note && !privateDraft) {
          const reasons = [noteResult, draftResult]
            .filter((result) => result.status === "rejected")
            .map((result) => result.status === "rejected" && result.reason instanceof Error
              ? result.reason.message
              : "");
          setSelected(null);
          setDraft(null);
          setBaseline(null);
          setDetailError(reasons.every((reason) => reason.includes("not_found"))
            ? "Esta nota não existe mais ou não está acessível."
            : "Não foi possível abrir esta nota.");
          return;
        }
        const next = privateDraft ? draftToForm(privateDraft) : noteToForm(note as EvidenceNote);
        setSelected(note);
        setDraft(privateDraft);
        setForm(next);
        setBaseline(next);
        setSaveStatus(privateDraft ? "saved" : "idle");
        if (privateDraft) {
          setDrafts((current) => [
            draftSummary(privateDraft),
            ...current.filter((item) => item.note_id !== privateDraft.note_id),
          ]);
        }
        if (note) {
          setNotes((current) => current.some((item) => item.id === note.id)
            ? current
            : sortNotes([noteSummary(note), ...current]));
          if (privateDraft && privateDraft.base_revision_id !== note.revision.id) {
            setConflicts((current) => new Set(current).add(note.id));
            setRemoteConflict(note);
            setSaveStatus("conflict");
          }
        }
      })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedToken, slug]);

  useEffect(() => {
    if (!selected?.id) {
      setRevisions([]);
      return;
    }
    let active = true;
    setHistoryLoading(true);
    listEvidenceRevisions(slug, selected.id)
      .then((result) => { if (active) setRevisions(result.items); })
      .catch(() => { if (active) setRevisions([]); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [selected?.id, selected?.revision.id, slug]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  async function loadMore() {
    setListLoadingMore(true);
    setListError("");
    try {
      const result = await listEvidenceNotes(slug, loadedCount, NOTE_PAGE_SIZE);
      setNotes((current) => sortNotes([
        ...current,
        ...result.items.filter((note) => !current.some((existing) => existing.id === note.id)),
      ]));
      setTotal(result.total);
      setLoadedCount((current) => current + result.items.length);
    } catch {
      setListError("Não foi possível carregar mais notas.");
    } finally {
      setListLoadingMore(false);
    }
  }

  const saveDraftNow = useCallback(async (force = false): Promise<EvidenceDraft | null> => {
    if (!selectedToken || selectedToken === NEW_NOTE_TOKEN || saving || (publishing && !force)) return draft;
    if (!dirty && !force) return draft;
    const submitted = form;
    const payload = formPayload(submitted);
    const baseRevisionId = draft?.base_revision_id ?? selected?.revision.id ?? null;
    setSaving(true);
    setSaveStatus("saving");
    setSaveError("");
    try {
      const saved = await saveEvidenceDraft(
        slug,
        selectedToken,
        baseRevisionId,
        draft?.version ?? 0,
        payload,
      );
      setDraft(saved);
      setBaseline(submitted);
      setDrafts((current) => [
        draftSummary(saved),
        ...current.filter((item) => item.note_id !== saved.note_id),
      ]);
      setSaveStatus("saved");
      setConflicts((current) => {
        const next = new Set(current);
        next.delete(saved.note_id);
        return next;
      });
      return saved;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      if (reason === "evidence_draft_conflict") {
        setConflicts((current) => new Set(current).add(selectedToken));
        setSaveStatus("conflict");
        setSaveError("A revisão publicada mudou. Seu texto local e o último rascunho confirmado foram preservados.");
        try {
          setRemoteConflict(await getEvidenceNote(slug, selectedToken));
        } catch {
          setRemoteConflict(null);
        }
      } else if (reason === "evidence_draft_changed_retry") {
        setSaveStatus("error");
        setSaveError("O rascunho mudou em outra aba. Reabra a nota antes de continuar.");
      } else if (reason === "finding_not_in_project") {
        setSaveStatus("error");
        setSaveError("Um finding selecionado não pertence mais a este engagement.");
      } else {
        setSaveStatus("error");
        setSaveError("Falha no autosave. O conteúdo continua no editor; tente salvar novamente.");
      }
      throw cause;
    } finally {
      setSaving(false);
    }
  }, [dirty, draft, form, publishing, saving, selected, selectedToken, slug]);

  useEffect(() => {
    if (!dirty || saving || publishing || uploading || conflicts.has(selectedToken) || viewedRevision) return;
    const timer = window.setTimeout(() => {
      void saveDraftNow().catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [conflicts, dirty, publishing, saveDraftNow, saving, selectedToken, uploading, viewedRevision]);

  async function publishDraft() {
    if (!selectedToken || publishing || saving) return;
    if (!form.title.trim()) {
      setSaveError("Informe um título antes de publicar a nota.");
      titleRef.current?.focus();
      return;
    }
    setPublishing(true);
    setSaveError("");
    try {
      const ready = dirty || !draft ? await saveDraftNow(true) : draft;
      if (!ready) throw new Error("evidence_draft_not_found");
      const published = await publishEvidenceDraft(slug, selectedToken, ready.version);
      const next = noteToForm(published);
      const wasNew = selected === null;
      setSelected(published);
      setDraft(null);
      setForm(next);
      setBaseline(next);
      setDrafts((current) => current.filter((item) => item.note_id !== published.id));
      setNotes((current) => sortNotes([
        noteSummary(published),
        ...current.filter((item) => item.id !== published.id),
      ]));
      if (wasNew) {
        setTotal((current) => current + 1);
        setLoadedCount((current) => current + 1);
      }
      setSaveStatus("idle");
      setRemoteConflict(null);
      setConflicts((current) => {
        const nextConflicts = new Set(current);
        nextConflicts.delete(published.id);
        return nextConflicts;
      });
      onAdded?.();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      if (reason === "evidence_draft_conflict") {
        setConflicts((current) => new Set(current).add(selectedToken));
        setSaveStatus("conflict");
        setSaveError("Outra revisão foi publicada antes desta. Compare as versões para decidir como continuar.");
        try {
          setRemoteConflict(await getEvidenceNote(slug, selectedToken));
        } catch {
          setRemoteConflict(null);
        }
      } else if (!saveError) {
        setSaveError("Não foi possível publicar. O rascunho continua privado e preservado.");
      }
    } finally {
      setPublishing(false);
    }
  }

  async function discardDraftAndReload() {
    if (!draft || !window.confirm("Descartar este rascunho privado? Anexos ainda não publicados também serão removidos.")) return;
    setDetailLoading(true);
    try {
      await discardEvidenceDraft(slug, draft.note_id);
      setDrafts((current) => current.filter((item) => item.note_id !== draft.note_id));
      setDraft(null);
      setRemoteConflict(null);
      setConflicts((current) => {
        const next = new Set(current);
        next.delete(draft.note_id);
        return next;
      });
      if (selected) {
        const remote = await getEvidenceNote(slug, selected.id);
        const next = noteToForm(remote);
        setSelected(remote);
        setForm(next);
        setBaseline(next);
        setNotes((current) => sortNotes([noteSummary(remote), ...current.filter((item) => item.id !== remote.id)]));
      } else {
        setForm(emptyForm());
        setBaseline(null);
        updateLocation("note");
      }
      setSaveStatus("idle");
    } catch {
      setSaveError("Não foi possível descartar o rascunho.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function reapplyDraft() {
    if (!draft || !remoteConflict) return;
    setSaving(true);
    try {
      const rebased = await rebaseEvidenceDraft(
        slug,
        draft.note_id,
        draft.version,
        remoteConflict.revision.id,
      );
      setDraft(rebased);
      setBaseline(draftToForm(rebased));
      setSelected(remoteConflict);
      setRemoteConflict(null);
      setConflicts((current) => {
        const next = new Set(current);
        next.delete(rebased.note_id);
        return next;
      });
      setSaveStatus("saved");
      setSaveError("");
    } catch {
      setSaveError("A revisão remota mudou novamente. Atualize a comparação antes de reaplicar.");
    } finally {
      setSaving(false);
    }
  }

  async function copyDraftMarkdown() {
    try {
      await navigator.clipboard.writeText(form.markdown);
      setSaveError("");
    } catch {
      setSaveError("Não foi possível copiar o Markdown para a área de transferência.");
    }
  }

  async function uploadAttachments(files: File[]) {
    if (!selectedToken || !files.length || uploading) return;
    setUploading(true);
    setSaveError("");
    try {
      const ready = dirty || !draft ? await saveDraftNow(true) : draft;
      if (!ready) throw new Error("evidence_draft_not_found");
      const uploaded = await uploadEvidenceDraftAttachments(
        slug,
        selectedToken,
        ready.version,
        files,
      );
      const nextBaseline = draftToForm(uploaded);
      setDraft(uploaded);
      setBaseline(nextBaseline);
      setForm((current) => ({ ...current, attachmentIds: uploaded.attachment_ids }));
      setDrafts((current) => [draftSummary(uploaded), ...current.filter((item) => item.note_id !== uploaded.note_id)]);
      setSaveStatus("saved");
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setSaveError(reason === "evidence_file_too_large"
        ? "Um dos arquivos excede o limite permitido."
        : "Não foi possível enviar os anexos. O rascunho foi preservado.");
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function removeDraftAttachment(attachmentId: string) {
    if (!draft || uploading) return;
    setUploading(true);
    try {
      const ready = dirty ? await saveDraftNow(true) : draft;
      if (!ready) throw new Error("evidence_draft_not_found");
      const updated = await deleteEvidenceDraftAttachment(slug, ready.note_id, attachmentId);
      const next = draftToForm(updated);
      setDraft(updated);
      setForm(next);
      setBaseline(next);
      setDrafts((current) => [draftSummary(updated), ...current.filter((item) => item.note_id !== updated.note_id)]);
    } catch {
      setSaveError("Não foi possível excluir o anexo do rascunho.");
    } finally {
      setUploading(false);
    }
  }

  function insertAttachmentReference(attachment: EvidenceAttachment, asImage: boolean) {
    const url = evidenceAttachmentDownloadUrl(slug, selectedToken, attachment.id, asImage);
    const reference = asImage
      ? `![${attachment.filename}](${url})`
      : `[${attachment.filename}](${url})`;
    setViewedRevision(null);
    setForm((current) => ({
      ...current,
      markdown: `${current.markdown}${current.markdown.trim() ? "\n\n" : ""}${reference}`,
    }));
    focusDocument();
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLocaleLowerCase("pt-BR");
      if (key === "n") {
        event.preventDefault();
        void startNewNote();
      } else if (key === "k") {
        event.preventDefault();
        setMobilePane("notes");
        window.requestAnimationFrame(() => searchRef.current?.focus());
      } else if (key === "p" && event.shiftKey) {
        event.preventDefault();
        setPropertiesOpen((current) => {
          const next = !current;
          if (next) setMobilePane("properties");
          else focusDocument();
          return next;
        });
      } else if (key === "s" && selectedToken && dirty) {
        event.preventDefault();
        void saveDraftNow().catch(() => undefined);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [dirty, saveDraftNow, selectedToken]);

  const visibleAttachments = draft?.attachments ?? selected?.attachments ?? [];
  const saveStatusText = saveStatus === "saving"
    ? "Salvando rascunho..."
    : saveStatus === "saved"
      ? "Rascunho salvo"
      : saveStatus === "error"
        ? "Erro no autosave"
        : saveStatus === "conflict"
          ? "Conflito com revisão publicada"
          : draft
            ? "Rascunho privado"
            : "Sem rascunho";

  const noteList = (
    <aside className={`${mobilePane === "notes" ? "flex" : "hidden"} min-h-[34rem] flex-col border-r border-outline-variant/20 bg-surface-container-low/60 lg:flex lg:min-h-0`} aria-label="Navegação das notas">
      <div className="space-y-3 border-b border-outline-variant/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Caderno de evidências</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              {total} publicada{total === 1 ? "" : "s"} · {drafts.length} rascunho{drafts.length === 1 ? "" : "s"} privado{drafts.length === 1 ? "" : "s"}
            </p>
          </div>
          <button type="button" className="btn btn-primary px-3" disabled={creating} onClick={() => void startNewNote()} title="Nova nota (Ctrl+N)">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Nova
          </button>
        </div>
        <label className="relative block">
          <span className="sr-only">Buscar notas</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => updateLocation("q", event.target.value)}
            placeholder="Buscar título, tag ou autor"
            className="w-full rounded-sm border border-outline-variant/30 bg-surface py-2 pl-9 pr-3 text-sm text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="sr-only">Filtrar notas por fase</span>
            <select
              value={phaseFilter}
              onChange={(event) => updateLocation("phase", event.target.value)}
              className="w-full rounded-sm border border-outline-variant/30 bg-surface px-2 py-2 text-xs text-on-surface"
            >
              <option value="all">Todas as fases</option>
              {ptesPhases.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrar notas por tag</span>
            <select
              value={tagFilter}
              onChange={(event) => updateLocation("tag", event.target.value)}
              className="w-full rounded-sm border border-outline-variant/30 bg-surface px-2 py-2 text-xs text-on-surface"
            >
              <option value="all">Todas as tags</option>
              {tagFilter !== "all" && !allTags.includes(tagFilter) && <option value={tagFilter}>{tagFilter}</option>}
              {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {unpublishedDrafts.length > 0 && (
          <ul className="mb-2 space-y-2" aria-label="Rascunhos ainda não publicados">
            {unpublishedDrafts.map((item) => (
              <li key={item.note_id}>
                <button
                  type="button"
                  aria-current={selectedToken === item.note_id ? "page" : undefined}
                  className={`w-full rounded-sm border p-3 text-left ${selectedToken === item.note_id ? "border-primary/60 bg-primary/10" : "border-warning/30 bg-warning/5"}`}
                  onClick={() => chooseNote(item.note_id)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-on-surface">{item.title || "Nota sem título"}</span>
                    <span className="badge badge-warning">Rascunho privado</span>
                  </span>
                  {item.excerpt && <span className="mt-1 line-clamp-2 block text-xs text-on-surface-variant">{item.excerpt}</span>}
                  <span className="mt-2 block text-[11px] text-on-surface-variant">Ainda não publicado · salvo em {formatDate(item.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {listLoading ? (
          <p className="flex items-center gap-2 p-3 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Carregando notas...</p>
        ) : listError && notes.length === 0 ? (
          <div className="p-3 text-sm">
            <p className="text-error" role="alert">{listError}</p>
            <button type="button" className="mt-3 font-semibold text-primary hover:underline" onClick={() => setListReload((value) => value + 1)}>Tentar novamente</button>
          </div>
        ) : filteredNotes.length === 0 && unpublishedDrafts.length === 0 ? (
          <div className="p-4 text-center">
            <BookOpen className="mx-auto h-6 w-6 text-on-surface-variant" />
            <p className="mt-3 text-sm font-semibold text-on-surface">
              {total === 0 ? "Nenhuma nota publicada" : "Nenhuma nota encontrada"}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              {total === 0 ? "Crie a primeira nota do engagement." : "Ajuste a busca ou os filtros."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredNotes.map((note) => {
              const active = selectedToken === note.id;
              const conflicted = conflicts.has(note.id);
              const hasDraft = drafts.some((item) => item.note_id === note.id);
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => chooseNote(note.id)}
                    className={`w-full rounded-sm border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${active ? "border-primary/60 bg-primary/10" : "border-transparent bg-surface-container hover:border-outline-variant/40"}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{note.title}</span>
                      <span className={`badge shrink-0 ${conflicted || hasDraft ? "badge-warning" : "badge-neutral"}`}>{conflicted ? "Conflito" : hasDraft ? "Rascunho privado" : "Publicada"}</span>
                    </span>
                    {note.excerpt && <span className="mt-1 line-clamp-2 block text-xs leading-5 text-on-surface-variant">{note.excerpt}</span>}
                    <span className="mt-2 block text-[11px] text-on-surface-variant">
                      {phaseLabel(note.phase)} · {note.revision.author} · rev. {note.revision.number}
                    </span>
                    <span className="mt-1 block text-[11px] text-on-surface-variant">Atualizada em {formatDate(note.updated_at)}</span>
                    {note.tags.length > 0 && (
                      <span className="mt-2 flex flex-wrap gap-1">
                        {note.tags.slice(0, 4).map((tag) => <span key={tag} className="rounded-sm bg-surface-container-high px-1.5 py-0.5 text-[10px] text-on-surface-variant">#{tag}</span>)}
                        {note.tags.length > 4 && <span className="text-[10px] text-on-surface-variant">+{note.tags.length - 4}</span>}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {listError && notes.length > 0 && <p className="p-3 text-xs text-error" role="alert">{listError}</p>}
        {notes.length < total && (
          <button type="button" className="mt-2 w-full rounded-sm px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10" disabled={listLoadingMore} onClick={() => void loadMore()}>
            {listLoadingMore ? "Carregando..." : `Carregar mais · ${notes.length} de ${total}`}
          </button>
        )}
      </div>
      <div className="hidden border-t border-outline-variant/20 px-3 py-2 text-[10px] text-on-surface-variant xl:flex xl:flex-wrap xl:gap-2">
        <ShortcutHint>Ctrl+N</ShortcutHint> nova <ShortcutHint>Ctrl+K</ShortcutHint> busca
      </div>
    </aside>
  );

  const documentPanel = (
    <main ref={documentRef} className={`${mobilePane === "document" ? "flex" : "hidden"} min-w-0 flex-col bg-surface lg:flex`} aria-label="Documento da evidência">
      {!selectedToken ? (
        <div className="grid min-h-[34rem] flex-1 place-items-center p-8 text-center lg:min-h-0">
          <div>
            <FileText className="mx-auto h-9 w-9 text-on-surface-variant" />
            <h3 className="mt-4 text-base font-bold text-on-surface">Selecione uma nota</h3>
            <p className="mt-2 max-w-sm text-sm text-on-surface-variant">Abra uma nota do caderno ou crie um rascunho privado. Só a ação Publicar altera o histórico da equipe.</p>
            <button type="button" className="btn btn-primary mt-5" onClick={() => void startNewNote()}><Plus className="h-4 w-4" /> Criar rascunho</button>
          </div>
        </div>
      ) : detailLoading ? (
        <p className="flex min-h-[34rem] items-center justify-center gap-2 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Abrindo nota...</p>
      ) : detailError ? (
        <div className="grid min-h-[34rem] place-items-center p-6 text-center">
          <div>
            <AlertTriangle className="mx-auto h-7 w-7 text-error" />
            <p className="mt-3 text-sm text-error" role="alert">{detailError}</p>
            <button type="button" className="mt-3 font-semibold text-primary hover:underline" onClick={() => updateLocation("note")}>Voltar à lista</button>
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-outline-variant/20 bg-surface-container-lowest px-4 py-3 sm:px-5">
            <div className="flex items-start gap-3">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Título da nota</span>
                <input
                  ref={titleRef}
                  value={viewedRevision?.title ?? form.title}
                  maxLength={200}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  disabled={Boolean(viewedRevision)}
                  placeholder="Título da evidência"
                  className="w-full border-0 bg-transparent text-xl font-bold tracking-tight text-on-surface outline-none placeholder:text-on-surface-variant/50 focus-visible:ring-2 focus-visible:ring-primary"
                />
              </label>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={publishing || saving || Boolean(viewedRevision) || conflicts.has(selectedToken) || !form.title.trim()}
                  onClick={() => void publishDraft()}
                >
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Publicar
                </button>
                <button
                  type="button"
                  className="btn btn-ghost hidden px-2 lg:inline-flex"
                  aria-label={propertiesOpen ? "Fechar propriedades" : "Abrir propriedades"}
                  title={`${propertiesOpen ? "Fechar" : "Abrir"} propriedades (Ctrl+Shift+P)`}
                  onClick={() => {
                    setPropertiesOpen((current) => !current);
                    if (propertiesOpen) focusDocument();
                  }}
                >
                  {propertiesOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
              <span className={`badge ${draft || conflicts.has(selectedToken) ? "badge-warning" : "badge-neutral"}`}>
                {viewedRevision
                  ? `Histórico · revisão ${viewedRevision.number}`
                  : conflicts.has(selectedToken)
                    ? "Conflito de edição"
                    : draft
                      ? selected ? `Rascunho sobre revisão ${selected.revision.number}` : "Rascunho ainda não publicado"
                      : `Publicada · revisão ${selected?.revision.number || 1}`}
              </span>
              {!viewedRevision && (
                <span className={`inline-flex items-center gap-1 ${saveStatus === "error" || saveStatus === "conflict" ? "text-error" : ""}`} aria-live="polite">
                  {saveStatus === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saveStatus === "saved" ? <Check className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                  {saveStatusText}
                </span>
              )}
              {viewedRevision
                ? <span>por {viewedRevision.author} em {formatDate(viewedRevision.created_at)}</span>
                : selected && <span>· última publicação por {selected.revision.author}</span>}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {viewedRevision ? (
              <section className="rounded-sm border border-outline-variant/30 bg-surface-container-lowest" aria-label={`Revisão ${viewedRevision.number}`}>
                <div className="flex items-center justify-between gap-3 border-b border-outline-variant/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-on-surface">Revisão imutável {viewedRevision.number}</p>
                    <p className="text-xs text-on-surface-variant">{viewedRevision.author} · {formatDate(viewedRevision.created_at)}</p>
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={() => setViewedRevision(null)}><RotateCcw className="h-4 w-4" /> Voltar ao rascunho</button>
                </div>
                <MarkdownContent markdown={viewedRevision.markdown} className="p-5" />
              </section>
            ) : (
              <MarkdownEditor
                value={form.markdown}
                persistedValue={baseline?.markdown || ""}
                additionalDirty={dirty}
                onChange={(markdown) => setForm((current) => ({ ...current, markdown }))}
                onPersist={async () => { await saveDraftNow(); }}
                persistLabel="Salvar rascunho"
                error={saveError}
                disabled={publishing}
                label="Nota de evidência"
                placeholder="Registre observações, comandos, saídas, tabelas e próximos passos em Markdown..."
                maxLength={100_000}
                initialMode="split"
              />
            )}
            {conflicts.has(selectedToken) && !viewedRevision && (
              <section className="mt-3 rounded-sm border border-warning/40 bg-warning/10 p-4 text-sm text-on-surface" aria-label="Comparação do conflito">
                <div className="flex items-center gap-2 font-bold"><GitCompare className="h-4 w-4" /> Compare antes de continuar</div>
                <p className="mt-1 text-xs text-on-surface-variant">Nenhum merge foi aplicado. O rascunho privado e a revisão atual continuam separados.</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="min-w-0 rounded-sm bg-surface p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Meu rascunho</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{form.markdown || "(vazio)"}</pre></div>
                  <div className="min-w-0 rounded-sm bg-surface p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Revisão publicada atual</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{remoteConflict?.markdown || "Carregando comparação..."}</pre></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => void copyDraftMarkdown()}><Copy className="h-4 w-4" /> Copiar meu texto</button>
                  <button type="button" className="btn btn-ghost" onClick={() => void discardDraftAndReload()}><Trash2 className="h-4 w-4" /> Descartar rascunho</button>
                  <button type="button" className="btn btn-primary" disabled={!remoteConflict || saving} onClick={() => void reapplyDraft()}><RotateCcw className="h-4 w-4" /> Reaplicar manualmente</button>
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </main>
  );

  const propertiesPanel = (
    <aside className={`${propertiesOpen && mobilePane === "properties" ? "flex" : "hidden"} min-h-[34rem] flex-col border-l border-outline-variant/20 bg-surface-container-low/60 ${propertiesOpen ? "lg:flex lg:min-h-0" : "lg:hidden"}`} aria-label="Propriedades da nota">
      <div className="flex items-center justify-between border-b border-outline-variant/20 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Propriedades</p>
          <p className="mt-1 text-xs text-on-surface-variant">Contexto estruturado da nota</p>
        </div>
        <button
          type="button"
          className="rounded-sm p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Fechar propriedades"
          onClick={() => {
            setPropertiesOpen(false);
            setMobilePane("document");
            focusDocument();
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {!selectedToken || detailLoading || detailError ? (
        <p className="p-4 text-sm text-on-surface-variant">Abra uma nota para consultar e editar suas propriedades.</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Fase PTES
            <select
              value={form.phase}
              disabled={Boolean(viewedRevision) || publishing}
              onChange={(event) => setForm((current) => ({ ...current, phase: event.target.value }))}
              className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface px-3 py-2 text-sm font-medium normal-case tracking-normal text-on-surface"
            >
              {ptesPhases.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>

          <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            <span className="flex items-center gap-2"><Tag className="h-3.5 w-3.5" /> Tags</span>
            <input
              value={form.tags}
              disabled={Boolean(viewedRevision) || publishing}
              onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
              placeholder="recon, web, validação"
              className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-on-surface"
            />
            <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal">Separe por vírgula.</span>
          </label>

          <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
            Alvos relacionados
            <textarea
              value={form.targets}
              disabled={Boolean(viewedRevision) || publishing}
              onChange={(event) => setForm((current) => ({ ...current, targets: event.target.value }))}
              placeholder="Um alvo por linha"
              className="mt-2 min-h-24 w-full rounded-sm border border-outline-variant/30 bg-surface px-3 py-2 font-mono text-sm font-normal normal-case tracking-normal text-on-surface"
            />
          </label>

          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Findings relacionados</legend>
            {findingsError ? (
              <p className="mt-2 text-xs text-error" role="alert">{findingsError}</p>
            ) : findings.length === 0 ? (
              <p className="mt-2 text-xs text-on-surface-variant">Nenhum finding disponível.</p>
            ) : (
              <div className="mt-2 max-h-44 space-y-2 overflow-y-auto rounded-sm border border-outline-variant/20 bg-surface p-2">
                {findings.map((finding) => (
                  <label key={finding.id} className="flex items-start gap-2 rounded-sm px-2 py-1.5 text-sm text-on-surface hover:bg-surface-container-low">
                    <input
                      type="checkbox"
                      disabled={Boolean(viewedRevision) || publishing}
                      className="mt-0.5 accent-primary"
                      checked={form.findingIds.includes(finding.id)}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        findingIds: event.target.checked
                          ? [...current.findingIds, finding.id]
                          : current.findingIds.filter((id) => id !== finding.id),
                      }))}
                    />
                    <span>{finding.title}<span className="mt-0.5 block text-[11px] text-on-surface-variant">{phaseLabel(finding.phase)}</span></span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <section className="border-t border-outline-variant/20 pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant"><Paperclip className="h-3.5 w-3.5" /> Anexos</p>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                disabled={uploading || Boolean(viewedRevision)}
                onClick={() => uploadRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Enviar
              </button>
              <input
                ref={uploadRef}
                type="file"
                multiple
                className="sr-only"
                aria-label="Selecionar anexos"
                onChange={(event) => void uploadAttachments(Array.from(event.target.files || []))}
              />
            </div>
            {visibleAttachments.length === 0 ? (
              <p className="mt-2 text-xs text-on-surface-variant">Nenhum arquivo anexado.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {visibleAttachments.map((attachment) => {
                  const publishedAttachment = Boolean(selected?.attachment_ids.includes(attachment.id));
                  const imageAttachment = attachment.content_type.startsWith("image/");
                  return (
                    <li key={attachment.id} className="rounded-sm border border-outline-variant/20 bg-surface p-2">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <a
                          href={evidenceAttachmentDownloadUrl(slug, selectedToken, attachment.id)}
                          className="min-w-0 truncate text-xs font-semibold text-primary hover:underline"
                        >
                          {attachment.filename} · {Math.max(1, Math.round(attachment.size / 1024))} KB
                        </a>
                        <span className={`badge shrink-0 ${publishedAttachment ? "badge-neutral" : "badge-warning"}`}>{publishedAttachment ? "Publicado" : "Privado"}</span>
                      </div>
                      {!viewedRevision && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline" onClick={() => insertAttachmentReference(attachment, false)}><Link2 className="h-3 w-3" /> Inserir link</button>
                          {imageAttachment && <button type="button" className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline" onClick={() => insertAttachmentReference(attachment, true)}><Image className="h-3 w-3" /> Incorporar imagem</button>}
                          {!publishedAttachment && <button type="button" className="inline-flex items-center gap-1 text-[11px] font-bold text-error hover:underline" onClick={() => void removeDraftAttachment(attachment.id)}><Trash2 className="h-3 w-3" /> Excluir</button>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {selected && (
            <section className="border-t border-outline-variant/20 pt-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant"><History className="h-3.5 w-3.5" /> Histórico da equipe</p>
              {historyLoading ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-on-surface-variant"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando revisões...</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {revisions.map((revision) => (
                    <li key={revision.id}>
                      <button
                        type="button"
                        className={`w-full rounded-sm px-2 py-2 text-left text-xs hover:bg-surface-container-high ${viewedRevision?.id === revision.id ? "bg-primary/10 text-primary" : "text-on-surface"}`}
                        onClick={() => { setViewedRevision(revision); setMobilePane("document"); }}
                      >
                        <span className="font-bold">Revisão {revision.number}</span>
                        <span className="mt-0.5 block text-[11px] text-on-surface-variant">{revision.author} · {formatDate(revision.created_at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {draft && <p className="mt-2 text-[11px] text-on-surface-variant">Seu rascunho privado não aparece neste histórico até ser publicado.</p>}
            </section>
          )}

          {draft && !viewedRevision && (
            <button type="button" className="inline-flex items-center gap-2 text-xs font-bold text-error hover:underline" onClick={() => void discardDraftAndReload()}>
              <Trash2 className="h-3.5 w-3.5" /> Descartar rascunho privado
            </button>
          )}

          <dl className="space-y-3 border-t border-outline-variant/20 pt-4 text-xs">
            <div><dt className="font-bold uppercase tracking-wider text-on-surface-variant">Autoria</dt><dd className="mt-1 text-on-surface">{draft?.author || selected?.created_by || "Você"}{draft ? " · rascunho privado" : ""}</dd></div>
            {selected && <>
              <div><dt className="font-bold uppercase tracking-wider text-on-surface-variant">Criada</dt><dd className="mt-1 text-on-surface">{formatDate(selected.created_at)}</dd></div>
              <div><dt className="font-bold uppercase tracking-wider text-on-surface-variant">Atualizada</dt><dd className="mt-1 text-on-surface">{formatDate(selected.updated_at)}</dd></div>
              <div><dt className="font-bold uppercase tracking-wider text-on-surface-variant">Identificador</dt><dd className="mt-1 break-all font-mono text-on-surface">{selected.id}</dd></div>
            </>}
          </dl>
        </div>
      )}
    </aside>
  );

  function mobileTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, pane: MobilePane) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const panes: MobilePane[] = propertiesOpen ? ["notes", "document", "properties"] : ["notes", "document"];
    const current = panes.indexOf(pane);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = panes[(current + direction + panes.length) % panes.length];
    event.preventDefault();
    setMobilePane(next);
  }

  return (
    <section className="card overflow-hidden" aria-label="Caderno operacional de evidências">
      <div className="flex items-center justify-between gap-3 border-b border-outline-variant/20 bg-surface-container-high p-2 lg:hidden" role="tablist" aria-label="Áreas do caderno">
        {([
          ["notes", "1. Notas"],
          ["document", "2. Documento"],
          ...(propertiesOpen ? [["properties", "3. Propriedades"]] : []),
        ] as Array<[MobilePane, string]>).map(([pane, label]) => (
          <button
            key={pane}
            type="button"
            role="tab"
            aria-selected={mobilePane === pane}
            className={`flex-1 rounded-sm px-2 py-2 text-xs font-bold focus-visible:outline-2 focus-visible:outline-primary ${mobilePane === pane ? "bg-surface text-primary" : "text-on-surface-variant"}`}
            onClick={() => setMobilePane(pane)}
            onKeyDown={(event) => mobileTabKeyDown(event, pane)}
          >
            {label}
          </button>
        ))}
        {!propertiesOpen && (
          <button type="button" className="rounded-sm p-2 text-on-surface-variant focus-visible:outline-2 focus-visible:outline-primary" aria-label="Abrir propriedades" onClick={() => { setPropertiesOpen(true); setMobilePane("properties"); }}>
            <Filter className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className={`min-w-0 lg:grid lg:h-[44rem] ${propertiesOpen ? "lg:grid-cols-[minmax(15rem,0.8fr)_minmax(28rem,2fr)_minmax(16rem,0.9fr)]" : "lg:grid-cols-[minmax(15rem,0.8fr)_minmax(28rem,2.9fr)]"}`}>
        {noteList}
        {documentPanel}
        {propertiesPanel}
      </div>
    </section>
  );
}

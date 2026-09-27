import {
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
  FileText,
  Filter,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Search,
  Tag,
  X,
} from "lucide-react";
import { MarkdownEditor } from "../../components/markdown";
import {
  createEvidenceNote,
  evidenceAttachmentDownloadUrl,
  getEvidenceNote,
  listEvidenceNotes,
  listFindings,
  updateEvidenceNote,
  type EvidenceNote,
  type EvidenceNoteInput,
  type EvidenceNoteSummary,
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
  const [total, setTotal] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listError, setListError] = useState("");
  const [listReload, setListReload] = useState(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [findingsError, setFindingsError] = useState("");

  const [selected, setSelected] = useState<EvidenceNote | null>(null);
  const [form, setForm] = useState<EvidenceForm>(emptyForm);
  const [baseline, setBaseline] = useState<EvidenceForm | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [mobilePane, setMobilePane] = useState<MobilePane>(selectedToken ? "document" : "notes");

  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);

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

  function updateLocation(key: "note" | "q" | "phase" | "tag", value?: string, replace = true) {
    const next = new URLSearchParams(searchParams);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace });
  }

  function confirmDiscard(): boolean {
    return !dirty || window.confirm("Descartar as alterações não salvas desta nota?");
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

  function startNewNote() {
    if (selectedToken === NEW_NOTE_TOKEN) {
      setMobilePane("document");
      titleRef.current?.focus();
      return;
    }
    if (!confirmDiscard()) return;
    setMobilePane("document");
    updateLocation("note", NEW_NOTE_TOKEN, false);
  }

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError("");
    listEvidenceNotes(slug, 0, NOTE_PAGE_SIZE)
      .then((result) => {
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
    if (!selectedToken) {
      setDetailLoading(false);
      setSelected(null);
      setBaseline(null);
      setForm(emptyForm());
      return;
    }
    if (selectedToken === NEW_NOTE_TOKEN) {
      const next = emptyForm();
      setDetailLoading(false);
      setSelected(null);
      setForm(next);
      setBaseline(next);
      window.requestAnimationFrame(() => titleRef.current?.focus());
      return;
    }
    let active = true;
    setDetailLoading(true);
    getEvidenceNote(slug, selectedToken)
      .then((note) => {
        if (!active) return;
        const next = noteToForm(note);
        setSelected(note);
        setForm(next);
        setBaseline(next);
        setNotes((current) => current.some((item) => item.id === note.id)
          ? current
          : sortNotes([noteSummary(note), ...current]));
      })
      .catch((cause) => {
        if (!active) return;
        const reason = cause instanceof Error ? cause.message : "";
        setSelected(null);
        setBaseline(null);
        setDetailError(reason === "evidence_not_found"
          ? "Esta nota não existe mais ou não está acessível."
          : "Não foi possível abrir esta nota.");
      })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedToken, slug]);

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

  async function saveNote() {
    const payload = formPayload(form);
    if (!payload.title) {
      setSaveError("Informe um título antes de publicar a nota.");
      titleRef.current?.focus();
      throw new Error("evidence_title_required");
    }
    if (!selectedToken || !dirty || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const saved = selectedToken === NEW_NOTE_TOKEN
        ? await createEvidenceNote(slug, payload)
        : selected
          ? await updateEvidenceNote(slug, selected.id, selected.revision.id, payload)
          : null;
      if (!saved) throw new Error("evidence_not_loaded");
      const next = noteToForm(saved);
      setSelected(saved);
      setForm(next);
      setBaseline(next);
      setNotes((current) => sortNotes([noteSummary(saved), ...current.filter((item) => item.id !== saved.id)]));
      if (selectedToken === NEW_NOTE_TOKEN) {
        setTotal((current) => current + 1);
        setLoadedCount((current) => current + 1);
      }
      setConflicts((current) => {
        const nextConflicts = new Set(current);
        nextConflicts.delete(saved.id);
        return nextConflicts;
      });
      if (selectedToken === NEW_NOTE_TOKEN) updateLocation("note", saved.id, true);
      onAdded?.();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      if (reason === "evidence_changed_retry" && selectedToken !== NEW_NOTE_TOKEN) {
        setConflicts((current) => new Set(current).add(selectedToken));
        setSaveError("Esta nota mudou em outra sessão. Seu texto foi preservado; recarregue a versão remota antes de editar novamente.");
      } else if (reason === "finding_not_in_project") {
        setSaveError("Um finding selecionado não pertence mais a este engagement.");
      } else if (reason !== "evidence_title_required") {
        setSaveError("Não foi possível salvar a nota. O conteúdo permanece no editor.");
      }
      throw cause;
    } finally {
      setSaving(false);
    }
  }

  async function reloadRemote() {
    if (!selected || !confirmDiscard()) return;
    setDetailLoading(true);
    setSaveError("");
    try {
      const note = await getEvidenceNote(slug, selected.id);
      const next = noteToForm(note);
      setSelected(note);
      setForm(next);
      setBaseline(next);
      setNotes((current) => sortNotes([noteSummary(note), ...current.filter((item) => item.id !== note.id)]));
      setConflicts((current) => {
        const nextConflicts = new Set(current);
        nextConflicts.delete(note.id);
        return nextConflicts;
      });
    } catch {
      setDetailError("Não foi possível recarregar esta nota.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLocaleLowerCase("pt-BR");
      if (key === "n") {
        event.preventDefault();
        startNewNote();
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
        void saveNote().catch(() => undefined);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  const noteList = (
    <aside className={`${mobilePane === "notes" ? "flex" : "hidden"} min-h-[34rem] flex-col border-r border-outline-variant/20 bg-surface-container-low/60 lg:flex lg:min-h-0`} aria-label="Navegação das notas">
      <div className="space-y-3 border-b border-outline-variant/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Caderno de evidências</p>
            <p className="mt-1 text-xs text-on-surface-variant">{total} nota{total === 1 ? "" : "s"} publicada{total === 1 ? "" : "s"}</p>
          </div>
          <button type="button" className="btn btn-primary px-3" onClick={startNewNote} title="Nova nota (Ctrl+N)">
            <Plus className="h-4 w-4" /> Nova
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
        {selectedToken === NEW_NOTE_TOKEN && (
          <button
            type="button"
            className="mb-2 w-full rounded-sm border border-primary/60 bg-primary/10 p-3 text-left"
            onClick={() => setMobilePane("document")}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-on-surface">{form.title || "Nota sem título"}</span>
              <span className="badge badge-warning">Rascunho local</span>
            </span>
            <span className="mt-2 block text-xs text-on-surface-variant">Ainda não publicado · origem humana</span>
          </button>
        )}
        {listLoading ? (
          <p className="flex items-center gap-2 p-3 text-sm text-on-surface-variant"><Loader2 className="h-4 w-4 animate-spin" /> Carregando notas...</p>
        ) : listError && notes.length === 0 ? (
          <div className="p-3 text-sm">
            <p className="text-error" role="alert">{listError}</p>
            <button type="button" className="mt-3 font-semibold text-primary hover:underline" onClick={() => setListReload((value) => value + 1)}>Tentar novamente</button>
          </div>
        ) : filteredNotes.length === 0 ? (
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
                      <span className={`badge shrink-0 ${conflicted ? "badge-warning" : "badge-neutral"}`}>{conflicted ? "Conflito" : "Publicada"}</span>
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
            <p className="mt-2 max-w-sm text-sm text-on-surface-variant">Abra uma nota do caderno ou crie um documento em branco. Nada é publicado antes do primeiro salvamento confirmado.</p>
            <button type="button" className="btn btn-primary mt-5" onClick={startNewNote}><Plus className="h-4 w-4" /> Criar nota</button>
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
                  value={form.title}
                  maxLength={200}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Título da evidência"
                  className="w-full border-0 bg-transparent text-xl font-bold tracking-tight text-on-surface outline-none placeholder:text-on-surface-variant/50 focus-visible:ring-2 focus-visible:ring-primary"
                />
              </label>
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
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
              <span className={`badge ${selectedToken === NEW_NOTE_TOKEN ? "badge-warning" : conflicts.has(selectedToken) ? "badge-warning" : "badge-neutral"}`}>
                {selectedToken === NEW_NOTE_TOKEN ? "Rascunho local" : conflicts.has(selectedToken) ? "Conflito de edição" : `Publicada · revisão ${selected?.revision.number || 1}`}
              </span>
              <span>origem humana</span>
              {selected && <span>· última revisão por {selected.revision.author}</span>}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <MarkdownEditor
              value={form.markdown}
              persistedValue={baseline?.markdown || ""}
              additionalDirty={dirty}
              onChange={(markdown) => setForm((current) => ({ ...current, markdown }))}
              onPersist={async () => saveNote()}
              error={saveError}
              disabled={saving}
              label="Nota de evidência"
              placeholder="Registre observações, comandos, saídas, tabelas e próximos passos em Markdown..."
              maxLength={100_000}
              initialMode="split"
            />
            {conflicts.has(selectedToken) && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-on-surface">
                <span>Há uma revisão remota mais recente. Recarregar descarta apenas as alterações locais ainda não publicadas.</span>
                <button type="button" className="inline-flex items-center gap-2 font-bold text-primary hover:underline" onClick={() => void reloadRemote()}>
                  <RotateCcw className="h-4 w-4" /> Recarregar versão remota
                </button>
              </div>
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

          {selected?.attachments.length ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Anexos publicados</p>
              <ul className="mt-2 space-y-2">
                {selected.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <a
                      href={evidenceAttachmentDownloadUrl(slug, selected.id, attachment.id)}
                      className="block rounded-sm border border-outline-variant/20 bg-surface p-2 text-xs font-semibold text-primary hover:underline"
                    >
                      {attachment.filename} · {Math.max(1, Math.round(attachment.size / 1024))} KB
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <dl className="space-y-3 border-t border-outline-variant/20 pt-4 text-xs">
            <div><dt className="font-bold uppercase tracking-wider text-on-surface-variant">Autoria</dt><dd className="mt-1 text-on-surface">{selected?.created_by || "Você · rascunho local"}</dd></div>
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

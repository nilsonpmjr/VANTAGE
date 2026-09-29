import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  FileDiff,
  History,
  Layers,
  Link2,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Tag,
  Trash2,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MarkdownContent, MarkdownEditor } from "../../components/markdown";
import {
  compareFindingRevisions,
  createFindingDraft,
  discardFindingDraft,
  getFinding,
  getFindingDraft,
  getFindingLinks,
  listEvidence,
  listFindingDrafts,
  listFindingRevisions,
  listFindings,
  publishFindingDraft,
  rebaseFindingDraft,
  resolveEvidenceReferences,
  saveFindingDraft,
  suggestEvidenceReferences,
  type Evidence,
  type EvidenceLinks,
  type EvidenceReference,
  type Finding,
  type FindingDraft,
  type FindingDraftSummary,
  type FindingInput,
  type FindingRevision,
  type FindingRevisionComparison,
} from "./api";
import { phaseLabel, ptesPhases } from "./EvidencePanel";

const severityLabels: Record<FindingInput["severity"], string> = {
  informational: "Informativo",
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
  critical: "Crítico",
};

const emptyForm: FindingInput = {
  title: "",
  description: "",
  severity: "medium",
  phase: "pre-engagement",
  targets: [],
  evidence_ids: [],
};

function formKey(form: FindingInput): string {
  return JSON.stringify(form);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function findingForm(item: Finding | FindingDraft): FindingInput {
  return {
    title: item.title,
    description: item.description,
    severity: item.severity,
    phase: item.phase,
    targets: [...item.targets],
    evidence_ids: [...item.evidence_ids],
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

export default function FindingsPanel({
  slug,
  evidenceRefresh,
  readOnly = false,
  onSaved,
}: {
  slug: string;
  evidenceRefresh: number;
  readOnly?: boolean;
  onSaved?: () => void;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFinding = searchParams.get("finding");
  const [items, setItems] = useState<Finding[]>([]);
  const [drafts, setDrafts] = useState<FindingDraftSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [form, setForm] = useState<FindingInput>(emptyForm);
  const [baseline, setBaseline] = useState<FindingInput | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [baseRevisionId, setBaseRevisionId] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [history, setHistory] = useState<FindingRevision[]>([]);
  const [inspectedRevision, setInspectedRevision] = useState<FindingRevision | null>(null);
  const [comparison, setComparison] = useState<FindingRevisionComparison | null>(null);
  const [references, setReferences] = useState<EvidenceReference[]>([]);
  const [links, setLinks] = useState<EvidenceLinks>({ outgoing: [], backlinks: [] });
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [targetsText, setTargetsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<Finding | null>(null);
  const savingRef = useRef(false);
  const openedRequestRef = useRef<string | null>(null);
  const dirty = baseline !== null && formKey(form) !== formKey(baseline);

  const refreshList = useCallback(async () => {
    const [published, privateDrafts] = await Promise.all([
      listFindings(slug, 0, 100, { q: query.trim(), severity: severityFilter, phase: phaseFilter }),
      listFindingDrafts(slug),
    ]);
    setItems(published.items);
    setTotal(published.total);
    setDrafts(privateDrafts.items);
  }, [phaseFilter, query, severityFilter, slug]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void refreshList()
        .catch(() => { if (active) setError("Não foi possível carregar os findings."); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [refreshList]);

  useEffect(() => {
    let active = true;
    void listEvidence(slug, 0, 100)
      .then((result) => { if (active) setEvidence(result.items); })
      .catch(() => { if (active) setError("Não foi possível carregar as evidências associáveis."); });
    return () => { active = false; };
  }, [evidenceRefresh, slug]);

  const openFinding = useCallback(async (findingId: string, syncLocation = true) => {
    setOpening(true);
    setError("");
    setConflict(null);
    setComparison(null);
    setInspectedRevision(null);
    try {
      let published: Finding | null = items.find((item) => item.id === findingId) || null;
      if (!published) {
        try { published = await getFinding(slug, findingId); } catch { published = null; }
      }
      let privateDraft: FindingDraft | null = null;
      try { privateDraft = await getFindingDraft(slug, findingId); } catch { privateDraft = null; }
      if (!published && !privateDraft) throw new Error("finding_not_found");
      const nextForm = findingForm(privateDraft || (published as Finding));
      setSelectedId(findingId);
      setSelectedFinding(published);
      setForm(nextForm);
      setBaseline(nextForm);
      setTargetsText(nextForm.targets.join("\n"));
      setDraftVersion(privateDraft?.version || 0);
      setBaseRevisionId(privateDraft?.base_revision_id ?? published?.revision.id ?? null);
      setHasDraft(Boolean(privateDraft));
      setItems((current) => published && !current.some((item) => item.id === published?.id)
        ? [published, ...current]
        : current);
      if (syncLocation) {
        const next = new URLSearchParams(searchParams);
        next.set("finding", findingId);
        setSearchParams(next, { replace: true });
      }
    } catch {
      setError("Este finding não existe mais ou não está acessível.");
    } finally {
      setOpening(false);
    }
  }, [items, searchParams, setSearchParams, slug]);

  useEffect(() => {
    if (!requestedFinding || openedRequestRef.current === requestedFinding) return;
    openedRequestRef.current = requestedFinding;
    void openFinding(requestedFinding, false);
  }, [openFinding, requestedFinding]);

  useEffect(() => {
    if (!selectedId) {
      setHistory([]);
      setLinks({ outgoing: [], backlinks: [] });
      return;
    }
    let active = true;
    if (selectedFinding) {
      void Promise.all([listFindingRevisions(slug, selectedId), getFindingLinks(slug, selectedId)])
        .then(([revisions, nextLinks]) => {
          if (!active) return;
          setHistory(revisions.items);
          setLinks(nextLinks);
        })
        .catch(() => { if (active) setError("Não foi possível carregar histórico e vínculos."); });
    } else {
      setHistory([]);
      setLinks({ outgoing: [], backlinks: [] });
    }
    return () => { active = false; };
  }, [selectedFinding, selectedId, slug]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void resolveEvidenceReferences(slug, form.description)
        .then((result) => { if (active) setReferences(result.items); })
        .catch(() => { if (active) setReferences([]); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [form.description, slug]);

  const saveNow = useCallback(async (description?: string): Promise<FindingDraft | null> => {
    if (readOnly || !selectedId || savingRef.current) return null;
    const payload = { ...form, description: description ?? form.description, targets: unique(form.targets) };
    if (baseline && formKey(payload) === formKey(baseline)) return null;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await saveFindingDraft(slug, selectedId, baseRevisionId, draftVersion, payload);
      const next = findingForm(saved);
      setDraftVersion(saved.version);
      setBaseRevisionId(saved.base_revision_id);
      setHasDraft(true);
      setBaseline(next);
      setForm(next);
      setTargetsText(next.targets.join("\n"));
      setDrafts((current) => [{
        finding_id: saved.finding_id,
        project_slug: saved.project_slug,
        version: saved.version,
        base_revision_id: saved.base_revision_id,
        updated_at: saved.updated_at,
        title: saved.title,
        severity: saved.severity,
        phase: saved.phase,
        is_new: saved.base_revision_id === null,
      }, ...current.filter((item) => item.finding_id !== saved.finding_id)]);
      return saved;
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      if (reason === "finding_draft_conflict") {
        try { setConflict(await getFinding(slug, selectedId)); } catch { setError("A publicação mudou e não pôde ser recarregada."); }
      } else if (reason === "finding_draft_changed_retry") {
        try {
          const remoteDraft = await getFindingDraft(slug, selectedId);
          setDraftVersion(remoteDraft.version);
        } catch { /* Preserve the local document for another save attempt. */ }
        setError("O rascunho mudou em outra sessão. O conteúdo local foi preservado.");
      } else if (reason === "evidence_not_in_project") {
        setError("Uma evidência selecionada não pertence mais a este engagement.");
      } else {
        setError("Não foi possível salvar o rascunho.");
      }
      throw cause;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [baseRevisionId, baseline, draftVersion, form, readOnly, selectedId, slug]);

  useEffect(() => {
    if (readOnly || !dirty || conflict || publishing) return;
    const timer = window.setTimeout(() => { void saveNow().catch(() => undefined); }, 750);
    return () => window.clearTimeout(timer);
  }, [conflict, dirty, publishing, readOnly, saveNow]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function createNew() {
    if (readOnly) return;
    setError("");
    try {
      const created = await createFindingDraft(slug);
      setDrafts((current) => [{
        finding_id: created.finding_id,
        project_slug: created.project_slug,
        version: created.version,
        base_revision_id: null,
        updated_at: created.updated_at,
        title: created.title,
        severity: created.severity,
        phase: created.phase,
        is_new: true,
      }, ...current]);
      await openFinding(created.finding_id);
    } catch { setError("Não foi possível criar o rascunho."); }
  }

  async function publish() {
    if (readOnly || !selectedId) return;
    setPublishing(true);
    setError("");
    try {
      const saved = dirty ? await saveNow() : null;
      const version = saved?.version || draftVersion;
      if (!version) throw new Error("finding_draft_not_publishable");
      const published = await publishFindingDraft(slug, selectedId, version);
      const next = findingForm(published);
      setSelectedFinding(published);
      setItems((current) => [published, ...current.filter((item) => item.id !== published.id)]);
      setDrafts((current) => current.filter((item) => item.finding_id !== published.id));
      setTotal((current) => selectedFinding ? current : current + 1);
      setForm(next);
      setBaseline(next);
      setDraftVersion(0);
      setBaseRevisionId(published.revision.id);
      setHasDraft(false);
      setConflict(null);
      setHistory((await listFindingRevisions(slug, published.id)).items);
      setLinks(await getFindingLinks(slug, published.id));
      onSaved?.();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      if (reason === "finding_draft_not_publishable") setError("Preencha título e documento antes de publicar.");
      else if (reason.includes("reference")) setError("Corrija as referências internas inválidas antes de publicar.");
      else if (!conflict) setError("Não foi possível publicar o finding.");
    } finally { setPublishing(false); }
  }

  async function discard() {
    if (!selectedId || !hasDraft) return;
    try {
      await discardFindingDraft(slug, selectedId);
      setDrafts((current) => current.filter((item) => item.finding_id !== selectedId));
      setHasDraft(false);
      setDraftVersion(0);
      if (selectedFinding) {
        const next = findingForm(selectedFinding);
        setForm(next);
        setBaseline(next);
        setTargetsText(next.targets.join("\n"));
        setBaseRevisionId(selectedFinding.revision.id);
      } else {
        closeDocument();
      }
    } catch { setError("Não foi possível descartar o rascunho."); }
  }

  async function acceptRemoteBase() {
    if (!selectedId || !conflict) return;
    try {
      if (hasDraft) {
        const rebased = await rebaseFindingDraft(slug, selectedId, draftVersion, conflict.revision.id);
        setDraftVersion(rebased.version);
        setBaseRevisionId(rebased.base_revision_id);
        setBaseline(findingForm(rebased));
      } else {
        setBaseRevisionId(conflict.revision.id);
      }
      setSelectedFinding(conflict);
      setConflict(null);
      setError("");
    } catch { setError("A base mudou novamente. Reabra o finding para continuar."); }
  }

  function closeDocument() {
    if (dirty && !window.confirm("Descartar as alterações ainda não salvas?")) return;
    setSelectedId(null);
    setSelectedFinding(null);
    setForm(emptyForm);
    setBaseline(null);
    setDraftVersion(0);
    setBaseRevisionId(null);
    setHasDraft(false);
    setTargetsText("");
    setConflict(null);
    openedRequestRef.current = null;
    const next = new URLSearchParams(searchParams);
    next.delete("finding");
    setSearchParams(next, { replace: true });
  }

  async function compareWithPrevious(revision: FindingRevision) {
    const index = history.findIndex((item) => item.id === revision.id);
    const previous = history[index + 1];
    if (!previous || !selectedId) return;
    try {
      setComparison(await compareFindingRevisions(slug, selectedId, previous.id, revision.id));
      setInspectedRevision(null);
    } catch { setError("Não foi possível comparar estas revisões."); }
  }

  const referenceSearch = useCallback(async (value: string) => {
    const result = await suggestEvidenceReferences(slug, value);
    return result.items.filter((item) => item.reference).map((item) => ({
      key: item.key,
      label: item.label,
      reference: item.reference as string,
      type: item.type,
      excerpt: item.excerpt,
    }));
  }, [slug]);

  const listRows = useMemo(() => {
    const published = items.map((item) => ({
      id: item.id,
      title: item.title,
      severity: item.severity,
      phase: item.phase,
      targets: item.targets || [],
      evidenceIds: item.evidence_ids || [],
      updatedAt: item.updated_at,
      draft: drafts.some((draft) => draft.finding_id === item.id),
      isNew: false,
    }));
    const unpublished = drafts.filter((draft) => !items.some((item) => item.id === draft.finding_id)).map((draft) => ({
      id: draft.finding_id,
      title: draft.title || "Finding sem título",
      severity: draft.severity,
      phase: draft.phase,
      targets: [],
      evidenceIds: [],
      updatedAt: draft.updated_at,
      draft: true,
      isNew: true,
    }));
    return [...unpublished, ...published];
  }, [drafts, items]);

  return (
    <section id="finding-editor" className="scroll-mt-24 space-y-4">
      {error && (
        <p className="rounded-sm border border-error/30 bg-error/10 p-3 text-sm text-error" role="alert">
          {error}
        </p>
      )}

      {conflict && (
        <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-on-surface" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
            <div>
              <strong>O finding publicado mudou.</strong>
              <p className="mt-1 text-on-surface-variant">Seu texto local foi preservado. Atualize a base antes de salvar novamente.</p>
            </div>
          </div>
          <button type="button" className="btn btn-secondary mt-3" onClick={() => void acceptRemoteBase()}>
            Usar revisão {conflict.revision.number} como base
          </button>
        </div>
      )}

      {/* Visualização de Lista Contínua (OM6-01) */}
      {!selectedId ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-outline-variant/20 bg-surface-container-low p-3">
            <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[18rem]">
              <label className="relative min-w-[14rem] flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-on-surface-variant" />
                <input
                  className="w-full rounded-sm border border-outline-variant/30 bg-surface py-1.5 pl-8 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant/60"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar título e conteúdo"
                  aria-label="Buscar findings"
                />
              </label>
              <select
                className="rounded-sm border border-outline-variant/30 bg-surface py-1.5 px-3 text-xs text-on-surface"
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value)}
                aria-label="Filtrar por severidade"
              >
                <option value="">Todas severidades</option>
                {Object.entries(severityLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select
                className="rounded-sm border border-outline-variant/30 bg-surface py-1.5 px-3 text-xs text-on-surface"
                value={phaseFilter}
                onChange={(event) => setPhaseFilter(event.target.value)}
                aria-label="Filtrar por fase"
              >
                <option value="">Todas as fases</option>
                {ptesPhases.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-on-surface-variant">
                {total} publicado{total === 1 ? "" : "s"} · {drafts.length} rascunho{drafts.length === 1 ? "" : "s"}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  className="btn btn-primary inline-flex items-center gap-1.5 py-1.5 px-3 text-xs"
                  onClick={() => void createNew()}
                >
                  <Plus className="h-4 w-4" /> Novo finding
                </button>
              )}
            </div>
          </div>

          <div className="card overflow-x-auto p-0" aria-label="Lista de findings">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20 bg-surface-container-low text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  <th className="py-3 px-4">Finding</th>
                  <th className="py-3 px-4">Severidade</th>
                  <th className="py-3 px-4">Fase PTES</th>
                  <th className="py-3 px-4">Alvos</th>
                  <th className="py-3 px-4">Evidências</th>
                  <th className="py-3 px-4">Atualização</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-sm text-on-surface-variant">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando findings...
                      </span>
                    </td>
                  </tr>
                ) : listRows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition hover:bg-surface-container-low/60 cursor-pointer"
                    onClick={() => void openFinding(row.id)}
                  >
                    <td className="py-3 px-4 font-semibold text-on-surface">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-left font-semibold text-on-surface hover:text-primary hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            void openFinding(row.id);
                          }}
                        >
                          {row.title}
                        </button>
                        {row.draft && (
                          <span className="badge badge-warning text-[10px]">Rascunho</span>
                        )}
                        {row.isNew && (
                          <span className="badge badge-neutral text-[10px]">Novo</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="badge badge-neutral text-xs">{severityLabels[row.severity]}</span>
                    </td>
                    <td className="py-3 px-4 text-xs text-on-surface-variant">
                      {phaseLabel(row.phase)}
                    </td>
                    <td className="py-3 px-4 text-xs text-on-surface-variant">
                      {row.targets.length > 0 ? `${row.targets.length} alvo${row.targets.length === 1 ? "" : "s"}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-xs text-on-surface-variant">
                      {row.evidenceIds.length > 0 ? `${row.evidenceIds.length} evidência${row.evidenceIds.length === 1 ? "" : "s"}` : "—"}
                    </td>
                    <td className="py-3 px-4 text-xs text-on-surface-variant">
                      {formatDate(row.updatedAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        className="btn btn-secondary py-1 px-2.5 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openFinding(row.id);
                        }}
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && listRows.length === 0 && (
              <div className="p-8 text-center text-sm text-on-surface-variant">
                Nenhum finding encontrado.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Visualização de Detalhe do Finding (OM6-01) */
        <div className="space-y-4" aria-label="Detalhe do finding">
          {opening ? (
            <div className="card p-12 text-center text-sm text-on-surface-variant">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" /> Abrindo finding...
              </span>
            </div>
          ) : (
            <>
              {/* Barra Superior de Ações e Retorno */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-3">
                <button
                  type="button"
                  onClick={closeDocument}
                  className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar para lista de findings
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    {saving && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando rascunho...</>}
                    {!saving && dirty && "Alterações locais"}
                    {!saving && !dirty && hasDraft && "Rascunho salvo"}
                    {!saving && !dirty && !hasDraft && selectedFinding && `Revisão ${selectedFinding.revision.number}`}
                  </div>
                  {hasDraft && !readOnly && (
                    <button
                      type="button"
                      className="btn btn-secondary text-error py-1.5 px-3 text-xs inline-flex items-center gap-1"
                      onClick={() => void discard()}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Descartar rascunho
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      className="btn btn-primary py-1.5 px-4 text-xs inline-flex items-center gap-1.5"
                      disabled={publishing || saving || Boolean(conflict) || (!hasDraft && !dirty)}
                      onClick={() => void publish()}
                    >
                      {publishing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {publishing ? "Publicando..." : selectedFinding ? "Publicar revisão" : "Publicar finding"}
                    </button>
                  )}
                </div>
              </div>

              {/* Identidade Compacta do Finding */}
              <div className="card space-y-3 p-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  Título do finding
                  <input
                    className="mt-1 w-full border-0 border-b border-outline-variant/40 bg-transparent px-0 py-1.5 text-xl font-bold normal-case tracking-normal text-on-surface outline-none focus:border-primary placeholder:text-on-surface-variant/40"
                    value={form.title}
                    disabled={readOnly}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    maxLength={200}
                    placeholder="Título do finding"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="badge badge-neutral">{severityLabels[form.severity]}</span>
                  <span className="badge badge-neutral">{phaseLabel(form.phase)}</span>
                  {selectedFinding && (
                    <span className="text-on-surface-variant">
                      Revisão {selectedFinding.revision.number} por <strong>{selectedFinding.revision.author}</strong> · Atualizado em {formatDate(selectedFinding.updated_at)}
                    </span>
                  )}
                </div>
              </div>

              {/* Grid Principal: Documento à esquerda, Propriedades e Vínculos à direita */}
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="space-y-4 min-w-0">
                  <MarkdownEditor
                    value={form.description}
                    onChange={(description) => setForm((current) => ({ ...current, description }))}
                    persistedValue={baseline?.description || ""}
                    additionalDirty={dirty && form.description === baseline?.description}
                    onPersist={(description) => saveNow(description).then(() => undefined)}
                    persistLabel="Salvar rascunho"
                    label="Documento do finding"
                    placeholder="Descreva o finding em Markdown..."
                    maxLength={100000}
                    references={references}
                    onReferenceSearch={referenceSearch}
                    disabled={readOnly}
                  />

                  {comparison && (
                    <section className="rounded-sm border border-outline-variant/30 bg-surface-container-low p-4" aria-label="Comparação de revisões">
                      <div className="flex items-center justify-between">
                        <h3 className="flex items-center gap-2 text-sm font-bold text-on-surface">
                          <FileDiff className="h-4 w-4" /> Diferenças entre revisões
                        </h3>
                        <button className="text-xs font-semibold text-primary hover:underline" type="button" onClick={() => setComparison(null)}>
                          Fechar
                        </button>
                      </div>
                      {Object.keys(comparison.property_changes).length > 0 && (
                        <dl className="mt-3 space-y-2 text-xs">
                          {Object.entries(comparison.property_changes).map(([field, change]) => (
                            <div key={field}>
                              <dt className="font-bold text-on-surface">{field}</dt>
                              <dd className="text-on-surface-variant">Antes: {JSON.stringify(change.before)} · Depois: {JSON.stringify(change.after)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-sm bg-surface p-3 text-xs text-on-surface">
                        {comparison.document_diff || "O documento Markdown não mudou."}
                      </pre>
                    </section>
                  )}

                  {inspectedRevision && (
                    <section className="rounded-sm border border-outline-variant/30 bg-surface-container-low p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-on-surface">Revisão {inspectedRevision.number}</h3>
                        <button className="text-xs font-semibold text-primary hover:underline" type="button" onClick={() => setInspectedRevision(null)}>
                          Fechar
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {severityLabels[inspectedRevision.severity]} · {phaseLabel(inspectedRevision.phase)} · {inspectedRevision.author}
                      </p>
                      <MarkdownContent markdown={inspectedRevision.description} references={[]} className="mt-4" />
                    </section>
                  )}
                </div>

                {/* Coluna de Propriedades Estruturadas e Contexto */}
                <aside className="card space-y-5 p-4" aria-label="Propriedades do finding">
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Propriedades</h3>
                    <label className="mt-3 block text-xs font-medium text-on-surface">
                      Severidade
                      <select
                        className="mt-1 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-2 text-sm text-on-surface"
                        value={form.severity}
                        disabled={readOnly}
                        onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value as FindingInput["severity"] }))}
                      >
                        {Object.entries(severityLabels).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-3 block text-xs font-medium text-on-surface">
                      Fase PTES
                      <select
                        className="mt-1 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-2 text-sm text-on-surface"
                        value={form.phase}
                        disabled={readOnly}
                        onChange={(event) => setForm((current) => ({ ...current, phase: event.target.value }))}
                      >
                        {ptesPhases.map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-3 block text-xs font-medium text-on-surface">
                      Alvos afetados
                      <textarea
                        className="mt-1 min-h-20 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-2 text-sm font-mono text-on-surface"
                        value={targetsText}
                        disabled={readOnly}
                        onChange={(event) => {
                          setTargetsText(event.target.value);
                          setForm((current) => ({ ...current, targets: unique(event.target.value.split(/\r?\n/)) }));
                        }}
                        placeholder="Um alvo por linha"
                      />
                    </label>
                  </section>

                  <section className="border-t border-outline-variant/20 pt-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Evidências associadas</h3>
                    {evidence.length === 0 ? (
                      <p className="mt-2 text-xs text-on-surface-variant">Nenhuma evidência disponível.</p>
                    ) : (
                      <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                        {evidence.map((proof) => (
                          <label key={proof.id} className="flex items-start gap-2 text-xs text-on-surface hover:bg-surface-container-low p-1 rounded-sm">
                            <input
                              type="checkbox"
                              checked={form.evidence_ids.includes(proof.id)}
                              disabled={readOnly}
                              className="mt-0.5 accent-primary"
                              onChange={(event) => setForm((current) => ({
                                ...current,
                                evidence_ids: event.target.checked
                                  ? unique([...current.evidence_ids, proof.id])
                                  : current.evidence_ids.filter((id) => id !== proof.id),
                              }))}
                            />
                            <span className="line-clamp-2">{proof.text.slice(0, 90) || proof.file?.filename || proof.id}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="border-t border-outline-variant/20 pt-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Referências internas</h3>
                    {references.length === 0 ? (
                      <p className="mt-2 text-xs text-on-surface-variant">Digite <code>[[</code> no documento para ligar entidades.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {references.map((reference) => (
                          <li key={reference.key}>
                            <button
                              type="button"
                              disabled={!reference.href}
                              onClick={() => reference.href && navigate(reference.href)}
                              className={`text-left text-xs font-semibold ${reference.broken ? "text-error" : "text-primary hover:underline"}`}
                            >
                              {reference.label}
                            </button>
                            {reference.context && (
                              <span className="mt-0.5 line-clamp-2 block text-[10px] text-on-surface-variant">{reference.context}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {selectedFinding && links.backlinks.length > 0 && (
                      <>
                        <h4 className="mt-4 text-xs font-semibold text-on-surface">Backlinks</h4>
                        <ul className="mt-2 space-y-2">
                          {links.backlinks.map((backlink) => (
                            <li key={`${backlink.type}:${backlink.id}`}>
                              <button
                                type="button"
                                className="text-left text-xs font-semibold text-primary hover:underline"
                                onClick={() => navigate(backlink.href)}
                              >
                                {backlink.label}
                              </button>
                              {backlink.context && (
                                <span className="mt-0.5 line-clamp-2 block text-[10px] text-on-surface-variant">{backlink.context}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>

                  {history.length > 0 && (
                    <section className="border-t border-outline-variant/20 pt-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Histórico de revisões</h3>
                      <ul className="mt-2 space-y-2">
                        {history.map((revision, index) => (
                          <li key={revision.id} className="rounded-sm bg-surface-container-low p-2 text-xs">
                            <strong className="text-on-surface">Revisão {revision.number}</strong>
                            <span className="mt-0.5 block text-[10px] text-on-surface-variant">
                              {revision.author} · {formatDate(revision.created_at)}
                            </span>
                            <div className="mt-2 flex gap-3">
                              <button
                                type="button"
                                className="font-semibold text-primary hover:underline"
                                onClick={() => { setInspectedRevision(revision); setComparison(null); }}
                              >
                                Ver
                              </button>
                              {index < history.length - 1 && (
                                <button
                                  type="button"
                                  className="font-semibold text-primary hover:underline"
                                  onClick={() => void compareWithPrevious(revision)}
                                >
                                  Comparar
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </aside>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

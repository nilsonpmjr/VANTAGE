import { useEffect, useState, type FormEvent } from "react";
import {
  createFinding, listEvidence, listFindingRevisions, listFindings, updateFinding,
  type Evidence, type Finding, type FindingInput, type FindingRevision,
} from "./api";
import { phaseLabel, ptesPhases } from "./EvidencePanel";

const severityLabels: Record<FindingInput["severity"], string> = {
  informational: "Informativo", low: "Baixo", medium: "Médio", high: "Alto", critical: "Crítico",
};

export default function FindingsPanel({ slug, evidenceRefresh, onSaved }: { slug: string; evidenceRefresh: number; onSaved?: () => void }) {
  const [items, setItems] = useState<Finding[]>([]);
  const [total, setTotal] = useState(0);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [editing, setEditing] = useState<Finding | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<FindingInput["severity"]>("medium");
  const [phase, setPhase] = useState("pre-engagement");
  const [targets, setTargets] = useState("");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [history, setHistory] = useState<FindingRevision[]>([]);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([listFindings(slug), listEvidence(slug, 0, 100)])
      .then(([findings, proofs]) => { if (active) { setItems(findings.items); setTotal(findings.total); setEvidence(proofs.items); } })
      .catch(() => { if (active) setError("Não foi possível carregar os findings."); });
    return () => { active = false; };
  }, [slug, evidenceRefresh]);

  function resetForm() {
    setEditing(null); setTitle(""); setDescription(""); setSeverity("medium");
    setPhase("pre-engagement"); setTargets(""); setEvidenceIds([]); setError("");
  }

  function startEdit(item: Finding) {
    setEditing(item); setTitle(item.title); setDescription(item.description);
    setSeverity(item.severity); setPhase(item.phase); setTargets(item.targets.join("\n"));
    setEvidenceIds(item.evidence_ids); setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSaving(true);
    const payload: FindingInput = {
      title: title.trim(), description: description.trim(), severity, phase,
      targets: targets.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
      evidence_ids: evidenceIds,
    };
    try {
      const saved = editing
        ? await updateFinding(slug, editing.id, editing.revision.id, payload)
        : await createFinding(slug, payload);
      setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      if (!editing) setTotal((current) => current + 1);
      resetForm();
      onSaved?.();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setError(reason === "finding_changed_retry" ? "Este finding mudou em outra sessão. Recarregue a página antes de editar."
        : reason === "evidence_not_in_project" ? "Uma evidência selecionada não pertence mais a este projeto."
          : "Não foi possível salvar o finding.");
    } finally { setSaving(false); }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await listFindings(slug, items.length);
      setItems((current) => [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setTotal(result.total);
    } catch { setError("Não foi possível carregar mais findings."); }
    finally { setLoadingMore(false); }
  }

  async function showHistory(findingId: string) {
    if (historyFor === findingId) { setHistoryFor(null); return; }
    try {
      const result = await listFindingRevisions(slug, findingId);
      setHistory(result.items); setHistoryFor(findingId); setError("");
    } catch { setError("Não foi possível carregar as revisões."); }
  }

  return <section className="card p-6">
    <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Findings manuais</h2>
    <p className="mt-2 text-sm text-on-surface-variant">Achados do operador, com revisões e evidências vinculadas. Nenhuma avaliação por LLM nesta etapa.</p>
    <form className="mt-5 space-y-3" onSubmit={(event) => void submit(event)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-on-surface">{editing ? `Editar finding · revisão ${editing.revision.number}` : "Novo finding"}</h3>
        {editing && <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={resetForm}>Cancelar edição</button>}
      </div>
      <label className="block text-sm font-medium text-on-surface">Título
        <input className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-2 text-on-surface" value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={200} required />
      </label>
      <label className="block text-sm font-medium text-on-surface">Descrição
        <textarea className="mt-2 min-h-28 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-3 text-on-surface" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={100000} required />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-medium text-on-surface">Severidade
          <select className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-2 text-on-surface" value={severity} onChange={(event) => setSeverity(event.target.value as FindingInput["severity"])}>{Object.entries(severityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        </label>
        <label className="text-sm font-medium text-on-surface">Fase PTES
          <select className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-2 text-on-surface" value={phase} onChange={(event) => setPhase(event.target.value)}>{ptesPhases.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        </label>
      </div>
      <label className="block text-sm font-medium text-on-surface">Alvos afetados (um por linha)
        <textarea className="mt-2 min-h-20 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-3 text-on-surface" value={targets} onChange={(event) => setTargets(event.target.value)} />
      </label>
      {evidence.length > 0 && <fieldset className="rounded-sm border border-outline-variant/30 p-3">
        <legend className="px-1 text-sm font-medium text-on-surface">Evidências associadas</legend>
        <div className="max-h-36 space-y-2 overflow-y-auto">
          {evidence.map((proof) => <label key={proof.id} className="flex items-start gap-2 text-sm text-on-surface">
            <input type="checkbox" checked={evidenceIds.includes(proof.id)} onChange={(event) => setEvidenceIds((current) => event.target.checked ? [...current, proof.id] : current.filter((id) => id !== proof.id))} />
            <span>{proof.text.slice(0, 100) || proof.file?.filename || proof.id} · {proof.author}</span>
          </label>)}
        </div>
      </fieldset>}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Salvando..." : editing ? "Salvar revisão" : "Criar finding"}</button>
    </form>
    <ul className="mt-6 space-y-3">
      {items.map((item) => <li key={item.id} className="rounded-sm bg-surface-container-low p-4 text-sm text-on-surface">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-bold">{item.title}</h3><p className="mt-1 text-xs text-on-surface-variant">{severityLabels[item.severity]} · {phaseLabel(item.phase)} · origem humana · revisão {item.revision.number} por {item.revision.author}</p><p className="mt-1 text-xs text-on-surface-variant">ID: {item.id}</p></div>
          <div className="flex gap-3"><button type="button" className="font-semibold text-primary hover:underline" onClick={() => startEdit(item)}>Editar</button><button type="button" className="font-semibold text-primary hover:underline" onClick={() => void showHistory(item.id)}>Revisões</button></div>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words">{item.description}</p>
        {item.targets.length > 0 && <p className="mt-2 text-xs text-on-surface-variant">Alvos: {item.targets.join(", ")}</p>}
        <p className="mt-1 text-xs text-on-surface-variant">{item.evidence_ids.length} evidência(s) associada(s)</p>
        {historyFor === item.id && <ul className="mt-3 space-y-2 border-t border-outline-variant/30 pt-3">{history.map((revision) => <li key={revision.id} className="text-xs text-on-surface-variant">Revisão {revision.number} · {revision.author} · {new Date(revision.created_at).toLocaleString("pt-BR")} · {revision.description.slice(0, 140)}</li>)}</ul>}
      </li>)}
      {items.length === 0 && <li className="text-sm text-on-surface-variant">Nenhum finding registrado.</li>}
    </ul>
    {items.length < total && <button type="button" className="mt-4 font-semibold text-primary hover:underline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Carregando..." : "Carregar mais findings"}</button>}
  </section>;
}

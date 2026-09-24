import { useEffect, useRef, useState, type FormEvent } from "react";
import { addEvidence, evidenceFileDownloadUrl, getEvidenceLimits, listEvidence, listFindings, type Evidence, type EvidenceLimits, type Finding } from "./api";

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

export default function EvidencePanel({ slug, findingRefresh, onAdded }: { slug: string; findingRefresh: number; onAdded?: () => void }) {
  const [items, setItems] = useState<Evidence[]>([]);
  const [total, setTotal] = useState(0);
  const [limits, setLimits] = useState<EvidenceLimits | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<string>("pre-engagement");
  const [target, setTarget] = useState("");
  const [findingId, setFindingId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([listEvidence(slug), getEvidenceLimits(), listFindings(slug, 0, 100)])
      .then(([result, nextLimits, nextFindings]) => { if (active) { setItems(result.items); setTotal(result.total); setLimits(nextLimits); setFindings(nextFindings.items); } })
      .catch(() => { if (active) setError("Não foi possível carregar as evidências."); });
    return () => { active = false; };
  }, [slug, findingRefresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!text.trim() && !file) { setError("Informe uma nota ou anexe um arquivo."); return; }
    if (file && limits && file.size > limits.max_file_bytes) { setError("O arquivo excede o limite permitido."); return; }
    setSaving(true);
    try {
      const created = await addEvidence(slug, { text, phase, target, finding_id: findingId, file });
      setItems((current) => [created, ...current]);
      setTotal((current) => current + 1);
      setText(""); setTarget(""); setFindingId(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onAdded?.();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setError(reason === "finding_not_in_project" ? "O finding informado não pertence a este projeto." : "Não foi possível registrar a evidência.");
    } finally { setSaving(false); }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await listEvidence(slug, items.length);
      setItems((current) => [...current, ...result.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setTotal(result.total);
    } catch { setError("Não foi possível carregar mais evidências."); }
    finally { setLoadingMore(false); }
  }

  return <section className="card p-6">
    <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Evidências manuais</h2>
    <p className="mt-2 text-sm text-on-surface-variant">Notas e arquivos ficam restritos aos membros deste projeto.</p>
    <form className="mt-5 space-y-3" onSubmit={(event) => void submit(event)}>
      <label className="block text-sm font-medium text-on-surface">Nota
        <textarea className="mt-2 min-h-28 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-3 text-on-surface" value={text} onChange={(event) => setText(event.target.value)} maxLength={limits?.max_text_characters ?? 100000} />
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm font-medium text-on-surface">Fase PTES
          <select className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-2 text-on-surface" value={phase} onChange={(event) => setPhase(event.target.value)}>{ptesPhases.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        </label>
        <label className="text-sm font-medium text-on-surface">Alvo (opcional)
          <input className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-2 text-on-surface" value={target} onChange={(event) => setTarget(event.target.value)} maxLength={2048} />
        </label>
        <label className="text-sm font-medium text-on-surface">Finding (opcional)
          <select className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-2 text-on-surface" value={findingId} onChange={(event) => setFindingId(event.target.value)}>
            <option value="">Nenhum</option>
            {findings.map((finding) => <option key={finding.id} value={finding.id}>{finding.title}</option>)}
          </select>
          <input className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low p-2 text-on-surface" aria-label="ID de outro finding" placeholder="Ou cole o ID de outro finding" value={findingId} onChange={(event) => setFindingId(event.target.value)} maxLength={64} />
        </label>
      </div>
      <label className="block text-sm font-medium text-on-surface">Anexo (opcional)
        <input ref={fileRef} type="file" className="mt-2 block w-full text-sm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      {limits && <p className="text-xs text-on-surface-variant">Até {limits.max_text_characters.toLocaleString("pt-BR")} caracteres e {Math.round(limits.max_file_bytes / 1024 / 1024)} MB por anexo.</p>}
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Registrando..." : "Registrar evidência"}</button>
    </form>
    <ul className="mt-6 space-y-3">
      {items.map((item) => <li key={item.id} className="rounded-sm bg-surface-container-low p-4 text-sm text-on-surface">
        <p className="text-xs text-on-surface-variant">{phaseLabel(item.phase)} · {item.author} · {new Date(item.created_at).toLocaleString("pt-BR")} · origem humana</p>
        {item.target && <p className="mt-2">Alvo: {item.target}</p>}
        {item.finding_id && <p className="mt-1">Finding: {item.finding_id}</p>}
        {item.text && <p className="mt-2 whitespace-pre-wrap break-words">{item.text}</p>}
        {item.file && <a className="mt-2 inline-block font-semibold text-primary hover:underline" href={evidenceFileDownloadUrl(slug, item.id)}>Baixar {item.file.filename}</a>}
      </li>)}
      {items.length === 0 && <li className="text-sm text-on-surface-variant">Nenhuma evidência registrada.</li>}
    </ul>
    {items.length < total && <button type="button" className="mt-4 font-semibold text-primary hover:underline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Carregando..." : "Carregar mais evidências"}</button>}
  </section>;
}

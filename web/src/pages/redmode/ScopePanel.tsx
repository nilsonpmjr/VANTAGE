import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import {
  getActiveScope,
  getScopeLimits,
  getScopeVersion,
  listScopeVersions,
  scopeFileDownloadUrl,
  submitScope,
  type ScopeRule,
  type ScopeLimits,
  type ScopeVersion,
  type ScopeVersionSummary,
} from "./api";

const categoryLabels: Record<ScopeRule["category"], string> = {
  client: "Cliente",
  third_party: "Terceiro",
  excluded: "Excluído",
};

const categoryClasses: Record<ScopeRule["category"], string> = {
  client: "badge-primary",
  third_party: "badge-warning",
  excluded: "badge-error",
};

const TARGETS_PER_PAGE = 100;

export default function ScopePanel({
  slug,
  initialVersionId,
  onPublished,
}: {
  slug: string;
  initialVersionId?: string;
  onPublished?: () => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [limits, setLimits] = useState<ScopeLimits | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeScope, setActiveScope] = useState<ScopeVersion | null>(null);
  const [selectedScope, setSelectedScope] = useState<ScopeVersion | null>(null);
  const [versions, setVersions] = useState<ScopeVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [targetCategory, setTargetCategory] = useState<"all" | ScopeRule["category"]>("all");
  const [targetPage, setTargetPage] = useState(1);

  const filteredRules = useMemo(() => {
    if (!selectedScope) return [];
    const query = targetQuery.trim().toLocaleLowerCase("pt-BR");
    return selectedScope.rules.filter((rule) => (
      (targetCategory === "all" || rule.category === targetCategory)
      && (!query || rule.value.toLocaleLowerCase("pt-BR").includes(query) || rule.kind.includes(query))
    ));
  }, [selectedScope, targetCategory, targetQuery]);
  const targetPageCount = Math.max(1, Math.ceil(filteredRules.length / TARGETS_PER_PAGE));
  const visibleRules = useMemo(() => {
    const start = (targetPage - 1) * TARGETS_PER_PAGE;
    return filteredRules.slice(start, start + TARGETS_PER_PAGE);
  }, [filteredRules, targetPage]);
  const categoryCounts = useMemo(() => {
    const rules = selectedScope?.rules || [];
    return {
      all: rules.length,
      client: rules.filter((rule) => rule.category === "client").length,
      third_party: rules.filter((rule) => rule.category === "third_party").length,
      excluded: rules.filter((rule) => rule.category === "excluded").length,
    };
  }, [selectedScope]);

  useEffect(() => {
    setTargetPage(1);
  }, [selectedScope?.id, targetCategory, targetQuery]);

  useEffect(() => {
    if (targetPage > targetPageCount) setTargetPage(targetPageCount);
  }, [targetPage, targetPageCount]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [scope, history, requestedScope] = await Promise.all([
          getActiveScope(slug).catch((cause: unknown) => {
            if (cause instanceof Error && cause.message === "scope_not_published") return null;
            throw cause;
          }),
          listScopeVersions(slug),
          initialVersionId ? getScopeVersion(slug, initialVersionId).catch(() => null) : Promise.resolve(null),
        ]);
        if (!mounted) return;
        setActiveScope(scope);
        setSelectedScope(requestedScope || scope);
        setVersions(history.items);
        if (requestedScope) {
          window.requestAnimationFrame(() => document.getElementById("scope")?.scrollIntoView({ block: "start" }));
        }
      } catch {
        if (mounted) setError("Não foi possível carregar o escopo deste projeto.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [initialVersionId, slug]);

  useEffect(() => {
    let mounted = true;
    getScopeLimits().then((value) => { if (mounted) setLimits(value); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (limits && (files.length > limits.max_files || files.some((file) => file.size > limits.max_file_bytes))) {
      setError("Os anexos excedem os limites exibidos. Ajuste os arquivos antes de publicar.");
      return;
    }
    setPublishing(true);
    setError("");
    try {
      const version = await submitScope(slug, text, files);
      setActiveScope(version);
      setSelectedScope(version);
      setText("");
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onPublished?.();
      try {
        const history = await listScopeVersions(slug);
        setVersions(history.items);
      } catch {
        setVersions((current) => [{
          id: version.id,
          author: version.author,
          created_at: version.created_at,
          rule_count: version.rules.length,
          source_hash: version.source.sha256,
        }, ...current]);
        setError("Escopo publicado, mas não foi possível atualizar o histórico agora.");
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setError(reason === "scope_has_no_targets"
        ? "Nenhum IP, CIDR, domínio ou URL válido foi encontrado. A versão anterior continua ativa."
        : reason === "scope_file_no_text"
          ? "O documento não contém texto extraível. A versão anterior continua ativa."
          : reason === "scope_file_protected" || reason === "scope_file_unreadable"
            ? "O documento está protegido ou não pode ser lido. A versão anterior continua ativa."
        : reason === "scope_file_type_not_supported" || reason === "scope_file_not_utf8" || reason === "scope_file_invalid_json" || reason === "scope_file_invalid_csv"
          ? "Um anexo é incompatível ou ilegível. A versão anterior continua ativa."
          : reason === "scope_file_too_large" || reason === "scope_too_many_files" || reason === "scope_text_too_large"
            ? "O envio excedeu os limites de escopo. A versão anterior continua ativa."
            : "Não foi possível publicar o escopo. A versão anterior continua ativa.");
    } finally {
      setPublishing(false);
    }
  }

  async function selectVersion(versionId: string) {
    setError("");
    try {
      setSelectedScope(await getScopeVersion(slug, versionId));
    } catch {
      setError("Não foi possível abrir esta versão do escopo.");
    }
  }

  return (
    <section id="scope" className="card scroll-mt-24 space-y-5 p-6">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Escopo do projeto</h2>
        <p className="mt-2 text-sm text-on-surface-variant">Cole o material recebido e/ou anexe arquivos. Alvos explícitos entram como ativos do cliente, salvo exclusões e terceiros identificados nas fontes. A publicação é imediata, sem revisão intermediária.</p>
      </div>
      <form onSubmit={(event) => void handlePublish(event)} className="space-y-3">
        <label htmlFor="redmode-scope-text" className="block text-sm font-medium text-on-surface">Texto do escopo</label>
        <textarea
          id="redmode-scope-text"
          className="min-h-44 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-3 font-mono text-sm text-on-surface"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={500000}
          placeholder="192.0.2.10&#10;https://app.example.test&#10;Terceiros: ...&#10;Exclusões: ..."
          required={files.length === 0}
        />
        <label htmlFor="redmode-scope-files" className="block text-sm font-medium text-on-surface">Arquivos de escopo</label>
        <input
          id="redmode-scope-files"
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.csv,.json,.pdf,.docx,.xlsx"
          className="block w-full text-sm text-on-surface-variant file:mr-3 file:rounded-sm file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:font-semibold file:text-primary"
          onChange={(event) => setFiles(Array.from(event.target.files || []))}
        />
        <p className="text-xs text-on-surface-variant">
          {limits
            ? `TXT, CSV, JSON, PDF, DOCX ou XLSX · até ${limits.max_files} arquivos de ${(limits.max_file_bytes / 1024 / 1024).toLocaleString("pt-BR")} MB cada`
            : "TXT, CSV, JSON, PDF, DOCX ou XLSX · o servidor validará os limites de tamanho e quantidade"}
        </p>
        {files.length > 0 && <p className="text-xs text-on-surface-variant">Selecionados: {files.map((file) => file.name).join(", ")}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-on-surface-variant">{text.length.toLocaleString("pt-BR")} / 500.000 caracteres</span>
          <button type="submit" className="btn btn-primary" disabled={publishing || (!text.trim() && files.length === 0)}>{publishing ? "Publicando..." : "Publicar nova versão"}</button>
        </div>
      </form>
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
      {loading ? <p className="text-sm text-on-surface-variant">Carregando escopo...</p> : !activeScope && !error ? (
        <p className="text-sm text-on-surface-variant">Nenhum escopo publicado ainda.</p>
      ) : (
        <>
          <div className="border-t border-outline-variant/20 pt-5">
            <h3 className="text-sm font-bold text-on-surface">Versão ativa</h3>
            <p className="mt-1 text-xs text-on-surface-variant">{activeScope.id} · {activeScope.author} · {new Date(activeScope.created_at).toLocaleString("pt-BR")}</p>
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-surface">Histórico</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {versions.map((version) => (
                <button key={version.id} type="button" className={selectedScope?.id === version.id ? "btn btn-primary" : "btn btn-outline"} onClick={() => void selectVersion(version.id)}>
                  {new Date(version.created_at).toLocaleString("pt-BR")} · {version.rule_count} alvos
                </button>
              ))}
            </div>
          </div>
          {selectedScope && (
            <div className="space-y-4">
              <div className="flex flex-col gap-4 border-t border-outline-variant/20 pt-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-on-surface">{selectedScope.id === activeScope.id ? "Alvos ativos" : "Alvos desta versão"}</h3>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {categoryCounts.all.toLocaleString("pt-BR")} regras · {categoryCounts.client.toLocaleString("pt-BR")} cliente · {categoryCounts.third_party.toLocaleString("pt-BR")} terceiros · {categoryCounts.excluded.toLocaleString("pt-BR")} excluídas
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                  <label className="relative min-w-64 flex-1">
                    <span className="sr-only">Buscar alvo</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                    <input
                      type="search"
                      value={targetQuery}
                      onChange={(event) => setTargetQuery(event.target.value)}
                      placeholder="Buscar IP, CIDR, domínio ou URL"
                      className="w-full rounded-sm border border-outline-variant/30 bg-surface-container-low py-2 pl-10 pr-3 text-sm text-on-surface"
                    />
                  </label>
                  <label>
                    <span className="sr-only">Filtrar categoria</span>
                    <select
                      value={targetCategory}
                      onChange={(event) => setTargetCategory(event.target.value as "all" | ScopeRule["category"])}
                      className="w-full rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm text-on-surface sm:w-auto"
                    >
                      <option value="all">Todas as categorias</option>
                      <option value="client">Cliente</option>
                      <option value="third_party">Terceiros</option>
                      <option value="excluded">Excluídos</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
                <span>
                  {filteredRules.length
                    ? `Exibindo ${((targetPage - 1) * TARGETS_PER_PAGE + 1).toLocaleString("pt-BR")}–${Math.min(targetPage * TARGETS_PER_PAGE, filteredRules.length).toLocaleString("pt-BR")} de ${filteredRules.length.toLocaleString("pt-BR")}`
                    : "Nenhum alvo corresponde aos filtros"}
                </span>
                <span>Página {targetPage.toLocaleString("pt-BR")} de {targetPageCount.toLocaleString("pt-BR")}</span>
              </div>
              <ul className="space-y-2">
                {visibleRules.map((rule) => (
                  <li key={`${rule.kind}:${rule.value}`} className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-surface-container-low px-3 py-2 text-sm text-on-surface">
                    <span className="break-all font-mono">{rule.value}</span>
                    <span className="flex flex-wrap items-center gap-2"><span className={`badge ${categoryClasses[rule.category]}`}>{categoryLabels[rule.category]}</span><span className="text-xs text-on-surface-variant">{rule.origins.map((origin) => {
                      const sourceName = origin.source_id === "text"
                        ? "texto"
                        : selectedScope.source.files.find((file) => file.source_id === origin.source_id)?.filename || "anexo";
                      return `${sourceName}, ${origin.position || `linha ${origin.line}`}`;
                    }).join(" · ")}</span></span>
                  </li>
                ))}
              </ul>
              {targetPageCount > 1 && (
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={targetPage === 1}
                    onClick={() => setTargetPage((current) => Math.max(1, current - 1))}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={targetPage === targetPageCount}
                    onClick={() => setTargetPage((current) => Math.min(targetPageCount, current + 1))}
                  >
                    Próxima
                  </button>
                </div>
              )}
              {selectedScope.source.files.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-on-surface">Anexos desta versão</h4>
                  <ul className="mt-2 space-y-2">
                    {selectedScope.source.files.map((file) => (
                      <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-on-surface-variant">
                        <span>{file.filename} · {(file.size / 1024).toFixed(1)} KB</span>
                        <a className="font-semibold text-primary hover:underline" href={scopeFileDownloadUrl(slug, selectedScope.id, file.id)}>Baixar</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <details className="text-sm text-on-surface-variant">
                <summary className="cursor-pointer font-semibold">Ver texto de origem</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-surface-container-low p-3 text-xs text-on-surface">{selectedScope.source.text || "Esta versão foi enviada somente por arquivos."}</pre>
              </details>
            </div>
          )}
        </>
      )}
    </section>
  );
}

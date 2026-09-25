import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  File,
  FileText,
  Layers3,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  getActiveScope,
  getScopeLimits,
  getScopeSource,
  getScopeVersion,
  listScopeAssets,
  listScopeSources,
  listScopeVersions,
  scopeFileDownloadUrl,
  submitScope,
  type ScopeAsset,
  type ScopeAssetPage,
  type ScopeLimits,
  type ScopeRule,
  type ScopeSource,
  type ScopeSourceDetail,
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

const kindLabels: Record<ScopeAsset["kind"], string> = {
  ip: "IP",
  cidr: "Bloco CIDR",
  domain: "Domínio",
  url: "URL",
  asn: "ASN",
};

const warningLabels: Record<string, string> = {
  no_targets_detected: "Nenhum alvo identificado",
  context_only: "Somente contexto não executável",
  representation_not_materialized: "Representação não materializada",
};

const SOURCE_CONTENT_PAGE = 20_000;
const SOURCE_ASSET_PAGE = 50;
const INVENTORY_PAGE = 50;

type ScopeView = "sources" | "effective";
type MobileSourceStep = "list" | "content" | "context";

function formatBytes(size: number): string {
  if (size < 1024) return `${size.toLocaleString("pt-BR")} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
  return `${(size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

function sourcePosition(asset: ScopeAsset): string {
  return asset.origins
    .map((origin) => origin.position || `linha ${origin.line}`)
    .join(" · ");
}

function AssetMetadata({ asset }: { asset: ScopeAsset }) {
  const attributes = asset.normalized?.attributes;
  if (!attributes) return null;
  const details: string[] = [];
  if (attributes.family) details.push(`IPv${attributes.family}`);
  if (attributes.prefix !== undefined) details.push(`prefixo /${attributes.prefix}`);
  if (attributes.address_count) details.push(`${attributes.address_count} endereços`);
  if (attributes.registrable_domain) details.push(`raiz ${attributes.registrable_domain}`);
  if (attributes.subdomain) details.push(`subdomínio ${attributes.subdomain}`);
  if (attributes.port) details.push(`porta ${attributes.port}`);
  if (attributes.path) details.push(`caminho ${attributes.path}`);
  if (asset.kind === "asn") details.push("contexto; não autoriza execução");
  if (!details.length) return null;
  return <p className="mt-1 break-words text-xs text-on-surface-variant">{details.join(" · ")}</p>;
}

export default function ScopePanel({
  slug,
  initialVersionId,
  onPublished,
}: {
  slug: string;
  initialVersionId?: string;
  onPublished?: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSourceRef = useRef(searchParams.get("source"));
  const initialView = searchParams.get("view") === "effective" ? "effective" : "sources";
  const [view, setView] = useState<ScopeView>(initialView);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [limits, setLimits] = useState<ScopeLimits | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeScope, setActiveScope] = useState<ScopeVersion | null>(null);
  const [selectedScope, setSelectedScope] = useState<ScopeVersion | null>(null);
  const [versions, setVersions] = useState<ScopeVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publisherOpen, setPublisherOpen] = useState(true);
  const [error, setError] = useState("");

  const [sources, setSources] = useState<ScopeSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourceDetail, setSourceDetail] = useState<ScopeSourceDetail | null>(null);
  const [sourceDetailLoading, setSourceDetailLoading] = useState(false);
  const [sourceDetailError, setSourceDetailError] = useState("");
  const [sourceContentOffset, setSourceContentOffset] = useState(0);
  const [sourceAssetOffset, setSourceAssetOffset] = useState(0);
  const [mobileStep, setMobileStep] = useState<MobileSourceStep>("list");

  const [assetQuery, setAssetQuery] = useState("");
  const deferredAssetQuery = useDeferredValue(assetQuery);
  const [assetCategory, setAssetCategory] = useState<"all" | ScopeRule["category"]>("all");
  const [assetKind, setAssetKind] = useState<"all" | ScopeAsset["kind"]>("all");
  const [assetOffset, setAssetOffset] = useState(0);
  const [assetPage, setAssetPage] = useState<ScopeAssetPage | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState("");

  const libraryRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{
    handle: "sources" | "content";
    startX: number;
    left: number;
    middle: number;
  } | null>(null);
  const [panelWidths, setPanelWidths] = useState({ left: 27, middle: 44 });

  const sourceNames = useMemo(
    () => new Map(sources.map((source) => [source.source_id, source.name])),
    [sources],
  );
  const inventoryPageCount = Math.max(1, Math.ceil((assetPage?.total || 0) / INVENTORY_PAGE));
  const inventoryPageNumber = Math.floor(assetOffset / INVENTORY_PAGE) + 1;

  function updateLocation(nextView: ScopeView, versionId?: string, sourceId?: string | null) {
    const next = new URLSearchParams(searchParams);
    if (versionId) next.set("version", versionId);
    next.delete("scope");
    next.set("view", nextView);
    if (nextView === "sources" && sourceId) next.set("source", sourceId);
    else next.delete("source");
    setSearchParams(next, { replace: true });
  }

  function chooseView(nextView: ScopeView) {
    setView(nextView);
    updateLocation(nextView, selectedScope?.id, nextView === "sources" ? selectedSourceId : null);
  }

  function chooseSource(sourceId: string) {
    setSelectedSourceId(sourceId);
    setSourceDetail(null);
    setSourceContentOffset(0);
    setSourceAssetOffset(0);
    setMobileStep("content");
    setView("sources");
    updateLocation("sources", selectedScope?.id, sourceId);
  }

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
          initialVersionId
            ? getScopeVersion(slug, initialVersionId).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!mounted) return;
        setActiveScope(scope);
        setSelectedScope(requestedScope || scope);
        setVersions(history.items);
        setPublisherOpen(!scope);
        if (requestedScope) {
          window.requestAnimationFrame(() => {
            document.getElementById("scope")?.scrollIntoView({ block: "start" });
          });
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

  useEffect(() => {
    if (!selectedScope) {
      setSources([]);
      return;
    }
    let mounted = true;
    setSourcesLoading(true);
    setSourcesError("");
    listScopeSources(slug, selectedScope.id, 0, 100)
      .then((page) => {
        if (!mounted) return;
        setSources(page.items);
        const requested = requestedSourceRef.current;
        requestedSourceRef.current = null;
        const nextSource = page.items.find((source) => source.source_id === requested)?.source_id
          || page.items[0]?.source_id
          || null;
        setSelectedSourceId(nextSource);
        setSourceDetail(null);
        setSourceContentOffset(0);
        setSourceAssetOffset(0);
        if (view === "sources" && nextSource) updateLocation("sources", selectedScope.id, nextSource);
      })
      .catch(() => {
        if (mounted) setSourcesError("Não foi possível carregar as fontes desta versão.");
      })
      .finally(() => { if (mounted) setSourcesLoading(false); });
    return () => { mounted = false; };
    // URL synchronization is intentionally tied to a version transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScope?.id, slug]);

  useEffect(() => {
    if (!selectedScope || !selectedSourceId) {
      setSourceDetail(null);
      return;
    }
    let mounted = true;
    setSourceDetailLoading(true);
    setSourceDetailError("");
    getScopeSource(slug, selectedScope.id, selectedSourceId, {
      contentOffset: sourceContentOffset,
      contentLimit: SOURCE_CONTENT_PAGE,
      assetOffset: sourceAssetOffset,
      assetLimit: SOURCE_ASSET_PAGE,
    })
      .then((detail) => { if (mounted) setSourceDetail(detail); })
      .catch(() => {
        if (mounted) {
          setSourceDetail(null);
          setSourceDetailError("Não foi possível abrir esta fonte agora.");
        }
      })
      .finally(() => { if (mounted) setSourceDetailLoading(false); });
    return () => { mounted = false; };
  }, [selectedScope, selectedSourceId, slug, sourceAssetOffset, sourceContentOffset]);

  useEffect(() => {
    if (!selectedScope || view !== "effective") return;
    let mounted = true;
    setAssetsLoading(true);
    setAssetsError("");
    listScopeAssets(slug, selectedScope.id, {
      q: deferredAssetQuery.trim() || undefined,
      category: assetCategory === "all" ? undefined : assetCategory,
      kind: assetKind === "all" ? undefined : assetKind,
      sort_by: "canonical",
      direction: "asc",
      offset: assetOffset,
      limit: INVENTORY_PAGE,
    })
      .then((page) => { if (mounted) setAssetPage(page); })
      .catch(() => {
        if (mounted) setAssetsError("Não foi possível carregar o escopo efetivo desta versão.");
      })
      .finally(() => { if (mounted) setAssetsLoading(false); });
    return () => { mounted = false; };
  }, [assetCategory, assetKind, assetOffset, deferredAssetQuery, selectedScope, slug, view]);

  useEffect(() => {
    setAssetOffset(0);
  }, [assetCategory, assetKind, deferredAssetQuery, selectedScope?.id]);

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (limits && (
      files.length > limits.max_files
      || files.some((file) => file.size > limits.max_file_bytes)
    )) {
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
      setView("sources");
      setPublisherOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      updateLocation("sources", version.id, null);
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
            : reason === "scope_file_type_not_supported" || reason === "scope_file_not_utf8"
              || reason === "scope_file_invalid_json" || reason === "scope_file_invalid_csv"
              ? "Um anexo é incompatível ou ilegível. A versão anterior continua ativa."
              : reason === "scope_file_too_large" || reason === "scope_too_many_files"
                || reason === "scope_text_too_large"
                ? "O envio excedeu os limites de escopo. A versão anterior continua ativa."
                : "Não foi possível publicar o escopo. A versão anterior continua ativa.");
    } finally {
      setPublishing(false);
    }
  }

  async function selectVersion(versionId: string) {
    setError("");
    try {
      const version = await getScopeVersion(slug, versionId);
      setSelectedScope(version);
      setSelectedSourceId(null);
      setMobileStep("list");
      updateLocation(view, versionId, null);
    } catch {
      setError("Não foi possível abrir esta versão do escopo.");
    }
  }

  function beginResize(handle: "sources" | "content", event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      handle,
      startX: event.clientX,
      left: panelWidths.left,
      middle: panelWidths.middle,
    };
  }

  function resizePanels(event: ReactPointerEvent<HTMLDivElement>) {
    const state = resizeRef.current;
    const width = libraryRef.current?.getBoundingClientRect().width;
    if (!state || !width) return;
    const delta = ((event.clientX - state.startX) / width) * 100;
    if (state.handle === "sources") {
      const right = 100 - state.left - state.middle;
      const minimumLeft = Math.max(18, 100 - right - 58);
      const maximumLeft = Math.min(40, 100 - right - 30);
      const left = Math.min(maximumLeft, Math.max(minimumLeft, state.left + delta));
      const middle = 100 - right - left;
      setPanelWidths({ left, middle });
      return;
    }
    const middle = Math.min(58, 100 - state.left - 18, Math.max(30, state.middle + delta));
    setPanelWidths({ left: state.left, middle });
  }

  function stopResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeRef.current = null;
  }

  const sourceListPanel: ReactNode = (
    <div className="flex h-full min-h-0 flex-col border-outline-variant/20 bg-surface-container-low/60">
      <div className="border-b border-outline-variant/20 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Fontes recebidas</p>
        <p className="mt-1 text-xs text-on-surface-variant">{sources.length} fonte{sources.length === 1 ? "" : "s"} nesta versão</p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {sourcesLoading ? (
          <p className="p-3 text-sm text-on-surface-variant">Carregando fontes...</p>
        ) : sourcesError ? (
          <p className="p-3 text-sm text-error" role="alert">{sourcesError}</p>
        ) : sources.length === 0 ? (
          <p className="p-3 text-sm text-on-surface-variant">Nenhuma fonte disponível nesta versão.</p>
        ) : sources.map((source) => (
          <button
            key={source.source_id}
            type="button"
            onClick={() => chooseSource(source.source_id)}
            className={`w-full rounded-sm border p-3 text-left transition ${
              selectedSourceId === source.source_id
                ? "border-primary/60 bg-primary/10"
                : "border-transparent bg-surface-container hover:border-outline-variant/40"
            }`}
          >
            <span className="flex items-start gap-2">
              {source.type === "text"
                ? <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                : <File className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-on-surface">{source.name}</span>
                <span className="mt-1 block text-[11px] text-on-surface-variant">
                  {source.type === "text" ? "Texto colado" : formatBytes(source.size)} · {source.mime_type}
                </span>
                <span className="mt-1 block text-[11px] text-on-surface-variant">
                  {source.author} · {new Date(source.created_at).toLocaleString("pt-BR")} · {source.extraction.status === "complete" ? "extração concluída" : "fonte histórica"}
                </span>
                <span className="mt-1 block font-mono text-[10px] text-on-surface-variant">
                  {source.source_id.slice(0, 10)} · {source.sha256.slice(0, 10)}
                </span>
              </span>
              <span className="badge badge-primary">{source.extraction.rule_count}</span>
            </span>
            {source.extraction.warnings.length > 0 && (
              <span className="mt-2 flex items-center gap-1 text-[11px] text-warning">
                <AlertTriangle className="h-3 w-3" />
                {source.extraction.warnings.map((warning) => warningLabels[warning] || warning).join(" · ")}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );

  const sourceContentPanel: ReactNode = (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {sourceDetailLoading && !sourceDetail ? (
        <p className="p-5 text-sm text-on-surface-variant">Abrindo representação...</p>
      ) : sourceDetailError ? (
        <p className="p-5 text-sm text-error" role="alert">{sourceDetailError}</p>
      ) : !sourceDetail ? (
        <div className="grid h-full place-items-center p-6 text-center text-sm text-on-surface-variant">
          Selecione uma fonte para ler o conteúdo extraído.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/20 px-5 py-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-on-surface">{sourceDetail.name}</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {sourceDetail.author} · {new Date(sourceDetail.created_at).toLocaleString("pt-BR")} · {formatBytes(sourceDetail.size)}
              </p>
            </div>
            {sourceDetail.original.available && sourceDetail.original.file_id && selectedScope && (
              <a
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                href={scopeFileDownloadUrl(slug, selectedScope.id, sourceDetail.original.file_id)}
              >
                <Download className="h-3.5 w-3.5" /> Original
              </a>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-5">
            {sourceDetail.representation.available && sourceDetail.representation.content !== null ? (
              <pre className="min-h-full whitespace-pre-wrap break-words rounded-sm border border-outline-variant/20 bg-surface-container-low p-4 font-mono text-xs leading-6 text-on-surface">
                {sourceDetail.representation.content}
              </pre>
            ) : (
              <div className="rounded-sm border border-warning/30 bg-warning/10 p-4">
                <p className="text-sm font-semibold text-on-surface">Representação não disponível</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Esta versão é anterior à materialização do texto extraído. O original continua acessível quando disponível.
                </p>
              </div>
            )}
          </div>
          {sourceDetail.representation.available && (
            <div className="flex items-center justify-between gap-3 border-t border-outline-variant/20 px-4 py-3 text-xs text-on-surface-variant">
              <span>
                {((sourceDetail.representation.offset || 0) + 1).toLocaleString("pt-BR")}–
                {Math.min(
                  (sourceDetail.representation.offset || 0) + (sourceDetail.representation.content?.length || 0),
                  sourceDetail.representation.total_characters || 0,
                ).toLocaleString("pt-BR")} de {(sourceDetail.representation.total_characters || 0).toLocaleString("pt-BR")} caracteres
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={sourceContentOffset === 0 || sourceDetailLoading}
                  onClick={() => setSourceContentOffset((current) => Math.max(0, current - SOURCE_CONTENT_PAGE))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={!sourceDetail.representation.truncated || sourceDetailLoading}
                  onClick={() => setSourceContentOffset((current) => current + SOURCE_CONTENT_PAGE)}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );

  const sourceContextPanel: ReactNode = (
    <div className="flex h-full min-h-0 flex-col bg-surface-container-low/40">
      <div className="border-b border-outline-variant/20 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Contexto extraído</p>
        <p className="mt-1 text-xs text-on-surface-variant">
          {sourceDetail?.assets.total || 0} item{sourceDetail?.assets.total === 1 ? "" : "s"} nesta fonte
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {sourceDetailLoading && !sourceDetail ? (
          <p className="text-sm text-on-surface-variant">Carregando contexto...</p>
        ) : sourceDetail && sourceDetail.assets.total === 0 ? (
          <div className="rounded-sm border border-outline-variant/20 bg-surface p-4 text-sm text-on-surface-variant">
            A fonte foi lida, mas não contém alvos nem contexto técnico reconhecido.
          </div>
        ) : sourceDetail?.assets.items.map((asset) => (
          <article key={asset.asset_id} className="rounded-sm border border-outline-variant/20 bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{kindLabels[asset.kind]}</span>
              <span className={`badge ${categoryClasses[asset.category]}`}>{categoryLabels[asset.category]}</span>
            </div>
            <p className="mt-2 break-all font-mono text-xs font-semibold text-on-surface">{asset.value}</p>
            <AssetMetadata asset={asset} />
            <p className="mt-2 text-[11px] text-on-surface-variant">{sourcePosition(asset)}</p>
            {asset.source_ids.length > 1 && (
              <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary">
                <Layers3 className="h-3 w-3" /> Também em {asset.source_ids
                  .filter((sourceId) => sourceId !== selectedSourceId)
                  .map((sourceId) => sourceNames.get(sourceId) || sourceId.slice(0, 10))
                  .join(", ")}
              </p>
            )}
          </article>
        ))}
      </div>
      {sourceDetail && sourceDetail.assets.total > SOURCE_ASSET_PAGE && (
        <div className="flex items-center justify-end gap-2 border-t border-outline-variant/20 px-3 py-2">
          <button
            type="button"
            className="btn btn-outline"
            disabled={sourceAssetOffset === 0}
            onClick={() => setSourceAssetOffset((current) => Math.max(0, current - SOURCE_ASSET_PAGE))}
          >
            Anterior
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={sourceAssetOffset + SOURCE_ASSET_PAGE >= sourceDetail.assets.total}
            onClick={() => setSourceAssetOffset((current) => current + SOURCE_ASSET_PAGE)}
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );

  return (
    <section id="scope" className="card scroll-mt-24 space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Escopo e alvos</h2>
          <p className="mt-2 max-w-4xl text-sm text-on-surface-variant">
            Fontes preservam o material recebido. Escopo efetivo consolida somente as declarações que alimentam a autorização; relações derivadas e ASN não ampliam esse limite.
          </p>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => setPublisherOpen((current) => !current)}>
          {publisherOpen ? "Fechar publicação" : "Publicar nova versão"}
        </button>
      </div>

      {publisherOpen && (
        <form onSubmit={(event) => void handlePublish(event)} className="space-y-3 rounded-sm border border-outline-variant/20 bg-surface-container-low/40 p-4">
          <label htmlFor="redmode-scope-text" className="block text-sm font-medium text-on-surface">Texto do escopo</label>
          <textarea
            id="redmode-scope-text"
            className="min-h-36 w-full rounded-sm border border-outline-variant/30 bg-surface px-3 py-3 font-mono text-sm text-on-surface"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={500000}
            placeholder="192.0.2.10&#10;https://app.example.test&#10;AS64512&#10;Terceiros: ...&#10;Exclusões: ..."
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
              : "TXT, CSV, JSON, PDF, DOCX ou XLSX · o servidor validará tamanho e quantidade"}
          </p>
          {files.length > 0 && (
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex items-center gap-3 rounded-sm border border-outline-variant/20 bg-surface px-3 py-2">
                  <File className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-on-surface">{file.name}</span>
                    <span className="text-[11px] text-on-surface-variant">{formatBytes(file.size)} · {file.type || "tipo desconhecido"}</span>
                  </span>
                  <button
                    type="button"
                    className="rounded-sm p-1 text-on-surface-variant hover:bg-error/10 hover:text-error"
                    aria-label={`Remover ${file.name}`}
                    onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-on-surface-variant">{text.length.toLocaleString("pt-BR")} / 500.000 caracteres</span>
            <button type="submit" className="btn btn-primary" disabled={publishing || (!text.trim() && files.length === 0)}>
              {publishing ? "Publicando..." : "Publicar nova versão"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-error" role="alert">{error}</p>}
      {loading ? <p className="text-sm text-on-surface-variant">Carregando escopo...</p> : !activeScope && !error ? (
        <p className="text-sm text-on-surface-variant">Nenhum escopo publicado ainda.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-t border-outline-variant/20 pt-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h3 className="text-sm font-bold text-on-surface">Versão consultada</h3>
              {selectedScope && (
                <p className="mt-1 text-xs text-on-surface-variant">
                  {selectedScope.id === activeScope?.id ? "Ativa" : "Histórica"} · {selectedScope.id.slice(0, 12)} · {selectedScope.author} · {new Date(selectedScope.created_at).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
            <label className="text-xs font-semibold text-on-surface-variant">
              Histórico
              <select
                value={selectedScope?.id || ""}
                onChange={(event) => void selectVersion(event.target.value)}
                className="ml-2 rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {new Date(version.created_at).toLocaleString("pt-BR")} · {version.rule_count} alvos{version.id === activeScope?.id ? " · ativa" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedScope && (
            <div className="space-y-4">
              <div className="flex gap-1 rounded-sm bg-surface-container-low p-1" role="tablist" aria-label="Perspectiva do escopo">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "sources"}
                  className={`flex-1 rounded-sm px-4 py-2 text-sm font-bold ${view === "sources" ? "bg-surface text-primary shadow-sm" : "text-on-surface-variant"}`}
                  onClick={() => chooseView("sources")}
                >
                  <span className="inline-flex items-center gap-2"><Database className="h-4 w-4" /> Fontes</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "effective"}
                  className={`flex-1 rounded-sm px-4 py-2 text-sm font-bold ${view === "effective" ? "bg-surface text-primary shadow-sm" : "text-on-surface-variant"}`}
                  onClick={() => chooseView("effective")}
                >
                  <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Escopo efetivo</span>
                </button>
              </div>

              {view === "sources" ? (
                <div className="overflow-hidden rounded-sm border border-outline-variant/20">
                  <div className="flex gap-1 border-b border-outline-variant/20 bg-surface-container-low p-2 lg:hidden">
                    {([
                      ["list", "1. Fontes"],
                      ["content", "2. Conteúdo"],
                      ["context", "3. Contexto"],
                    ] as Array<[MobileSourceStep, string]>).map(([step, label]) => (
                      <button
                        key={step}
                        type="button"
                        className={`flex-1 rounded-sm px-2 py-2 text-xs font-bold ${mobileStep === step ? "bg-surface text-primary" : "text-on-surface-variant"}`}
                        onClick={() => setMobileStep(step)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="h-[34rem] lg:hidden">
                    {mobileStep === "list" ? sourceListPanel : mobileStep === "content" ? sourceContentPanel : sourceContextPanel}
                  </div>
                  <div
                    ref={libraryRef}
                    className="hidden h-[38rem] min-w-0 lg:grid"
                    style={{
                      gridTemplateColumns: `${panelWidths.left}fr 6px ${panelWidths.middle}fr 6px ${100 - panelWidths.left - panelWidths.middle}fr`,
                    }}
                  >
                    {sourceListPanel}
                    <div
                      role="separator"
                      aria-label="Redimensionar lista de fontes"
                      className="cursor-col-resize touch-none border-x border-outline-variant/20 bg-surface-container-high hover:bg-primary/30"
                      onPointerDown={(event) => beginResize("sources", event)}
                      onPointerMove={resizePanels}
                      onPointerUp={stopResize}
                      onPointerCancel={stopResize}
                    />
                    {sourceContentPanel}
                    <div
                      role="separator"
                      aria-label="Redimensionar contexto da fonte"
                      className="cursor-col-resize touch-none border-x border-outline-variant/20 bg-surface-container-high hover:bg-primary/30"
                      onPointerDown={(event) => beginResize("content", event)}
                      onPointerMove={resizePanels}
                      onPointerUp={stopResize}
                      onPointerCancel={stopResize}
                    />
                    {sourceContextPanel}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-on-surface">Inventário consolidado</h3>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        Paginação e filtros são aplicados no servidor. Itens de contexto permanecem visíveis, mas não executáveis.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <label className="relative sm:min-w-64">
                        <span className="sr-only">Buscar ativo</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
                        <input
                          type="search"
                          value={assetQuery}
                          onChange={(event) => setAssetQuery(event.target.value)}
                          placeholder="Buscar valor canônico"
                          className="w-full rounded-sm border border-outline-variant/30 bg-surface-container-low py-2 pl-10 pr-3 text-sm text-on-surface"
                        />
                      </label>
                      <select
                        value={assetKind}
                        onChange={(event) => setAssetKind(event.target.value as "all" | ScopeAsset["kind"])}
                        className="rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                        aria-label="Filtrar tipo de ativo"
                      >
                        <option value="all">Todos os tipos</option>
                        {Object.entries(kindLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
                      </select>
                      <select
                        value={assetCategory}
                        onChange={(event) => setAssetCategory(event.target.value as "all" | ScopeRule["category"])}
                        className="rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                        aria-label="Filtrar categoria do ativo"
                      >
                        <option value="all">Todas as categorias</option>
                        <option value="client">Cliente</option>
                        <option value="third_party">Terceiros</option>
                        <option value="excluded">Excluídos</option>
                      </select>
                    </div>
                  </div>

                  {assetPage && (
                    <div className="space-y-2">
                      <p className="text-xs text-on-surface-variant">
                        {assetPage.total.toLocaleString("pt-BR")} itens · {assetPage.totals.by_category.client.toLocaleString("pt-BR")} cliente · {assetPage.totals.by_category.third_party.toLocaleString("pt-BR")} terceiros · {assetPage.totals.by_category.excluded.toLocaleString("pt-BR")} excluídos
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                        {Object.entries(assetPage.totals.by_kind).map(([kind, count]) => (
                          <div key={kind} className="rounded-sm border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{kindLabels[kind as ScopeAsset["kind"]]}</p>
                            <p className="mt-1 text-lg font-bold text-on-surface">{count.toLocaleString("pt-BR")}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {assetsLoading && !assetPage ? (
                    <p className="text-sm text-on-surface-variant">Carregando inventário...</p>
                  ) : assetsError ? (
                    <p className="text-sm text-error" role="alert">{assetsError}</p>
                  ) : !assetPage?.items.length ? (
                    <p className="rounded-sm border border-outline-variant/20 bg-surface-container-low p-4 text-sm text-on-surface-variant">
                      Nenhum ativo corresponde aos filtros selecionados.
                    </p>
                  ) : (
                    <ul className={`space-y-2 transition-opacity ${assetsLoading ? "opacity-60" : "opacity-100"}`}>
                      {assetPage.items.map((asset) => (
                        <li key={asset.asset_id} className="rounded-sm border border-outline-variant/20 bg-surface-container-low px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{kindLabels[asset.kind]}</span>
                                {!asset.executable && <span className="badge badge-warning">Contexto</span>}
                              </div>
                              <p className="mt-1 break-all font-mono text-sm font-semibold text-on-surface">{asset.value}</p>
                              {asset.original_value !== asset.value && (
                                <p className="mt-1 break-all text-xs text-on-surface-variant">Informado: {asset.original_value}</p>
                              )}
                              <AssetMetadata asset={asset} />
                            </div>
                            <span className={`badge ${categoryClasses[asset.category]}`}>{categoryLabels[asset.category]}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-on-surface-variant">
                            {asset.source_ids.map((sourceId) => (
                              <button
                                key={sourceId}
                                type="button"
                                className="rounded-sm bg-surface px-2 py-1 font-semibold text-primary hover:underline"
                                onClick={() => chooseSource(sourceId)}
                              >
                                {sourceNames.get(sourceId) || sourceId.slice(0, 10)}
                              </button>
                            ))}
                            <span className="px-1 py-1">{sourcePosition(asset)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
                    <span>
                      {assetPage?.total
                        ? `${(assetOffset + 1).toLocaleString("pt-BR")}–${Math.min(assetOffset + INVENTORY_PAGE, assetPage.total).toLocaleString("pt-BR")} de ${assetPage.total.toLocaleString("pt-BR")}`
                        : "0 ativos"}
                    </span>
                    <span className="flex items-center gap-3">
                      Página {inventoryPageNumber.toLocaleString("pt-BR")} de {inventoryPageCount.toLocaleString("pt-BR")}
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={assetOffset === 0 || assetsLoading}
                        onClick={() => setAssetOffset((current) => Math.max(0, current - INVENTORY_PAGE))}
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        disabled={!assetPage || assetOffset + INVENTORY_PAGE >= assetPage.total || assetsLoading}
                        onClick={() => setAssetOffset((current) => current + INVENTORY_PAGE)}
                      >
                        Próxima
                      </button>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

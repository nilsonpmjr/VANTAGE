import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  Clock,
  Filter,
  Lock,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  User,
  X,
} from "lucide-react";
import { PageHeader } from "../../components/page/PageChrome";
import { useLanguage } from "../../context/LanguageContext";
import {
  createProject,
  listProjects,
  type ProjectFilters,
  type ProjectStatus,
  type ProjectSummary,
} from "./api";
import { phaseLabel, ptesPhases } from "./EvidencePanel";

const statusLabels: Record<ProjectStatus, string> = {
  active: "Ativo",
  completed: "Concluído",
  archived: "Arquivado",
};

const sortOptions = [
  { value: "last_activity_at", label: "Atividade recente" },
  { value: "created_at", label: "Data de criação" },
  { value: "display_name", label: "Nome do engagement" },
];

const PAGE_SIZE = 20;

function formatActivity(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
      }).format(date);
}

export default function RedModeFeed() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLanguage();

  // URL state extraction
  const qParam = searchParams.get("q") || "";
  const accessParam = (searchParams.get("access") as "all" | "mine" | "discoverable") || "all";
  const statusParam = (searchParams.get("status") as ProjectStatus | "") || "";
  const phaseParam = searchParams.get("phase") || "";
  const sortParam = (searchParams.get("sort") as "last_activity_at" | "created_at" | "display_name") || "last_activity_at";
  const orderParam = (searchParams.get("order") as "asc" | "desc") || "desc";
  const pageParam = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  // Local search text for responsive typing before debounce
  const [searchInput, setSearchInput] = useState(qParam);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  // Engagement creation state
  const [creating, setCreating] = useState(() => searchParams.get("create") === "1");
  const [submitting, setSubmitting] = useState(false);
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");

  const debounceTimerRef = useRef<number | null>(null);

  // Sync search input if URL changes externally
  useEffect(() => {
    setSearchInput(qParam);
  }, [qParam]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Debounced search param updater
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (value.trim()) {
        next.set("q", value.trim());
      } else {
        next.delete("q");
      }
      next.set("page", "1");
      setSearchParams(next, { replace: true });
    }, 280);
  };

  const updateParam = (key: string, value: string, defaultValue?: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.set("page", "1");
    setSearchParams(next, { replace: true });
  };

  const setPage = (newPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (newPage <= 1) {
      next.delete("page");
    } else {
      next.set("page", String(newPage));
    }
    setSearchParams(next);
  };

  const clearFilters = () => {
    const next = new URLSearchParams();
    setSearchInput("");
    setSearchParams(next, { replace: true });
  };

  const hasActiveFilters = Boolean(
    qParam.trim() ||
      (accessParam && accessParam !== "all") ||
      statusParam ||
      phaseParam ||
      sortParam !== "last_activity_at" ||
      orderParam !== "desc",
  );

  // Data fetching effect
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const offset = (pageParam - 1) * PAGE_SIZE;
    const filters: ProjectFilters = {
      search: qParam.trim() || undefined,
      access: accessParam !== "all" ? accessParam : undefined,
      status: statusParam || undefined,
      phase: phaseParam || undefined,
      sort_by: sortParam,
      order: orderParam,
    };

    listProjects(offset, PAGE_SIZE, filters)
      .then((data) => {
        if (!cancelled) {
          setProjects(data.items);
          setTotal(data.total);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("redmode.feed.loadError", "Não foi possível carregar os engagements."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessParam, orderParam, pageParam, phaseParam, qParam, reloadToken, sortParam, statusParam, t]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const project = await createProject(slug.trim(), displayName.trim());
      // Navigate to project detail preserving browser history
      navigate(`/redmode/engagements/${project.slug}`, { replace: false });
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === "project_slug_exists"
          ? t("redmode.feed.slugExists", "Já existe um projeto com esse identificador.")
          : t("redmode.feed.createError", "Não foi possível criar o projeto. Confira os campos e tente novamente."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const offset = (pageParam - 1) * PAGE_SIZE;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className="page-frame space-y-6">
      <PageHeader
        eyebrow={<><ShieldAlert className="h-4 w-4" /> Offensive Mode</>}
        title="Engagements"
        description="Acompanhe os engagements da equipe. O conteúdo de cada projeto é reservado aos seus membros."
        actions={
          <button
            type="button"
            className="btn btn-primary inline-flex items-center gap-1.5"
            onClick={() => setCreating((value) => !value)}
          >
            <Plus className="h-4 w-4" /> {t("redmode.feed.newEngagement", "Novo engagement")}
          </button>
        }
      />

      {/* Formulário de Criação de Engagement */}
      {creating && (
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="card p-6 space-y-4"
          aria-label="Criar engagement"
        >
          <div>
            <h2 className="text-base font-bold text-on-surface">
              {t("redmode.feed.createTitle", "Novo engagement")}
            </h2>
            <p className="text-sm text-on-surface-variant">
              {t("redmode.feed.createSubtitle", "Você será o primeiro membro e responsável.")}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-on-surface">
              {t("redmode.feed.displayName", "Nome de exibição")}
              <input
                className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-on-surface"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                minLength={2}
                maxLength={120}
                placeholder="Ex: Banco Central Security Assessment"
                required
              />
            </label>
            <label className="block text-sm font-medium text-on-surface">
              {t("redmode.feed.slug", "Identificador")}
              <input
                className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-on-surface"
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]"
                minLength={3}
                maxLength={64}
                placeholder="cliente-projeto"
                required
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? t("redmode.feed.creating", "Criando...") : t("redmode.feed.createSubmit", "Criar engagement")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>
              {t("common.cancel", "Cancelar")}
            </button>
          </div>
        </form>
      )}

      {/* Barra de Filtros e Busca do Portfólio (OM4-03) */}
      <section
        className="card p-4 space-y-4"
        aria-label="Filtros do portfólio de engagements"
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* Campo de Busca */}
          <label className="relative min-w-[16rem] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-on-surface-variant" />
            <input
              type="search"
              className="w-full rounded-sm border border-outline-variant/30 bg-surface-container-low py-2 pl-9 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant/60"
              placeholder={t("redmode.feed.searchPlaceholder", "Buscar por nome ou slug...")}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="Buscar engagements"
            />
          </label>

          {/* Filtro de Acesso */}
          <div className="flex items-center rounded-sm border border-outline-variant/30 bg-surface-container-low p-1 text-xs">
            <button
              type="button"
              className={`rounded-sm px-3 py-1 font-semibold transition ${
                accessParam === "all" ? "bg-surface text-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface"
              }`}
              onClick={() => updateParam("access", "all")}
            >
              {t("redmode.feed.accessAll", "Todos")}
            </button>
            <button
              type="button"
              className={`rounded-sm px-3 py-1 font-semibold transition ${
                accessParam === "mine" ? "bg-surface text-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface"
              }`}
              onClick={() => updateParam("access", "mine")}
            >
              {t("redmode.feed.accessMine", "Meus projetos")}
            </button>
            <button
              type="button"
              className={`rounded-sm px-3 py-1 font-semibold transition ${
                accessParam === "discoverable" ? "bg-surface text-primary shadow-xs" : "text-on-surface-variant hover:text-on-surface"
              }`}
              onClick={() => updateParam("access", "discoverable")}
            >
              {t("redmode.feed.accessDiscoverable", "Descobríveis")}
            </button>
          </div>

          {/* Filtro de Estado */}
          <select
            className="rounded-sm border border-outline-variant/30 bg-surface-container-low py-2 px-3 text-xs text-on-surface"
            value={statusParam}
            onChange={(e) => updateParam("status", e.target.value)}
            aria-label="Filtrar por estado"
          >
            <option value="">{t("redmode.feed.allStatuses", "Todos os estados")}</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          {/* Filtro de Fase */}
          <select
            className="rounded-sm border border-outline-variant/30 bg-surface-container-low py-2 px-3 text-xs text-on-surface"
            value={phaseParam}
            onChange={(e) => updateParam("phase", e.target.value)}
            aria-label="Filtrar por fase"
          >
            <option value="">{t("redmode.feed.allPhases", "Todas as fases")}</option>
            {ptesPhases.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          {/* Ordenação */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-on-surface-variant flex items-center gap-1">
              <ArrowUpDown className="h-3.5 w-3.5" /> Ordenar:
            </span>
            <select
              className="rounded-sm border border-outline-variant/30 bg-surface-container-low py-1.5 px-2 text-xs text-on-surface"
              value={sortParam}
              onChange={(e) => updateParam("sort", e.target.value, "last_activity_at")}
              aria-label="Ordenar por"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-sm border border-outline-variant/30 bg-surface-container-low p-1.5 text-on-surface hover:bg-surface"
              title={orderParam === "asc" ? "Ordem crescente" : "Ordem decrescente"}
              onClick={() => updateParam("order", orderParam === "asc" ? "desc" : "asc", "desc")}
              aria-label="Alternar direção de ordenação"
            >
              {orderParam === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Linha de Filtros Ativos e Limpar */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/20 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-on-surface-variant flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" /> Filtros ativos:
              </span>
              {qParam && (
                <span className="badge badge-neutral flex items-center gap-1">
                  Busca: "{qParam}"
                  <button type="button" onClick={() => handleSearchChange("")} aria-label="Remover filtro de busca">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {accessParam !== "all" && (
                <span className="badge badge-neutral flex items-center gap-1">
                  Acesso: {accessParam === "mine" ? "Meus projetos" : "Descobríveis"}
                  <button type="button" onClick={() => updateParam("access", "all")} aria-label="Remover filtro de acesso">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {statusParam && (
                <span className="badge badge-neutral flex items-center gap-1">
                  Estado: {statusLabels[statusParam]}
                  <button type="button" onClick={() => updateParam("status", "")} aria-label="Remover filtro de estado">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {phaseParam && (
                <span className="badge badge-neutral flex items-center gap-1">
                  Fase: {phaseLabel(phaseParam)}
                  <button type="button" onClick={() => updateParam("phase", "")} aria-label="Remover filtro de fase">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>

            <button
              type="button"
              className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
              onClick={clearFilters}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          </div>
        )}
      </section>

      {/* Erro com Ação de Retry */}
      {error && (
        <div className="rounded-sm border border-error/30 bg-error/10 p-4 flex flex-wrap items-center justify-between gap-3 text-sm text-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-secondary py-1 px-3 text-xs"
            onClick={() => setReloadToken((c) => c + 1)}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Conteúdo: Loading, Empty ou Grid de Cards */}
      {loading ? (
        <div className="card p-12 text-center text-sm text-on-surface-variant flex flex-col items-center justify-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span>Carregando engagements...</span>
        </div>
      ) : projects.length === 0 ? (
        hasActiveFilters ? (
          <div className="card p-12 text-center space-y-3">
            <h2 className="text-base font-bold text-on-surface">
              Nenhum engagement encontrado para os filtros selecionados
            </h2>
            <p className="text-sm text-on-surface-variant max-w-md mx-auto">
              Tente ajustar os termos de busca ou remover alguns filtros para visualizar os projetos.
            </p>
            <button type="button" className="btn btn-secondary mt-2" onClick={clearFilters}>
              Limpar filtros
            </button>
          </div>
        ) : (
          <div className="card p-12 text-center space-y-3">
            <h2 className="text-lg font-bold text-on-surface">Nenhum engagement ainda</h2>
            <p className="text-sm text-on-surface-variant max-w-md mx-auto">
              Crie o primeiro engagement para abrir o hub da equipe ofensiva.
            </p>
            <button
              type="button"
              className="btn btn-primary mt-2"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4" /> Criar primeiro engagement
            </button>
          </div>
        )
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2" aria-label="Lista de engagements">
            {projects.map((project) => {
              const canOpen = project.can_open !== false;
              return (
                <article
                  key={project.slug}
                  className={`card p-6 flex flex-col justify-between transition ${
                    canOpen ? "card-hover" : "opacity-85 border-outline-variant/40"
                  }`}
                  aria-label={`Engagement ${project.display_name}`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-primary">
                          {phaseLabel(project.phase)}
                        </p>
                        <h2 className="mt-1 text-lg font-bold text-on-surface">
                          {project.display_name}
                        </h2>
                        <p className="text-xs font-mono text-on-surface-variant">{project.slug}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className={`badge ${
                            project.status === "active"
                              ? "badge-primary"
                              : project.status === "completed"
                              ? "badge-success"
                              : "badge-neutral"
                          }`}
                        >
                          {statusLabels[project.status]}
                        </span>
                        {!canOpen && (
                          <span className="badge badge-warning flex items-center gap-1 text-[10px]">
                            <Lock className="h-2.5 w-2.5" /> Acesso restrito
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 border-t border-outline-variant/20 pt-4 text-xs text-on-surface-variant">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 shrink-0 text-on-surface-variant/70" />
                        <span className="truncate">Responsável: <strong>{project.responsible}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-on-surface-variant/70" />
                        <span className="truncate">Atividade: {formatActivity(project.last_activity_at)}</span>
                      </div>
                      {project.created_at && (
                        <div className="flex items-center gap-1.5 col-span-2">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-on-surface-variant/70" />
                          <span>Criado em: {formatDate(project.created_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 border-t border-outline-variant/10 pt-4">
                    {canOpen ? (
                      <Link
                        to={`/redmode/engagements/${project.slug}`}
                        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary hover:underline"
                      >
                        Abrir engagement <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant italic">
                        <Lock className="h-3.5 w-3.5" /> Requer associação ao projeto para abrir
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Paginação do Portfólio */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-on-surface-variant pt-2">
            <span>
              Mostrando <strong>{offset + 1}</strong>–<strong>{Math.min(offset + projects.length, total)}</strong> de <strong>{total}</strong> engagement{total === 1 ? "" : "s"}
            </span>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-outline py-1 px-3 text-xs"
                  disabled={pageParam <= 1}
                  onClick={() => setPage(pageParam - 1)}
                >
                  Anterior
                </button>
                <span className="text-xs">
                  Página {pageParam} de {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-outline py-1 px-3 text-xs"
                  disabled={pageParam >= totalPages}
                  onClick={() => setPage(pageParam + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

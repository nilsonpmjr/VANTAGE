import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Plus, ShieldAlert } from "lucide-react";
import { PageHeader } from "../../components/page/PageChrome";
import { createProject, listProjects, type ProjectSummary } from "./api";

function formatActivity(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function RedModeFeed() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    let active = true;
    listProjects(offset)
      .then((data) => {
        if (active) {
          setProjects(data.items);
          setTotal(data.total);
        }
      })
      .catch(() => { if (active) setError("Não foi possível carregar os projetos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [offset]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const project = await createProject(slug.trim(), displayName.trim());
      navigate(`/redmode/engagements/${project.slug}`);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "project_slug_exists"
        ? "Já existe um projeto com esse identificador."
        : "Não foi possível criar o projeto. Confira os campos e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-frame">
      <PageHeader
        eyebrow={<><ShieldAlert className="h-4 w-4" /> Offensive Mode</>}
        title="Engagements"
        description="Acompanhe os engagements da equipe. O conteúdo de cada projeto é reservado aos seus membros."
        actions={<button type="button" className="btn btn-primary" onClick={() => setCreating((value) => !value)}><Plus className="h-4 w-4" /> Novo engagement</button>}
      />

      {creating && (
        <form onSubmit={(event) => void handleCreate(event)} className="card p-6 space-y-4" aria-label="Criar engagement">
          <div>
            <h2 className="text-base font-bold text-on-surface">Novo engagement</h2>
            <p className="text-sm text-on-surface-variant">Você será o primeiro membro e responsável.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-on-surface">
              Nome de exibição
              <input className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-on-surface" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={120} required />
            </label>
            <label className="block text-sm font-medium text-on-surface">
              Identificador
              <input className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-on-surface" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]" minLength={3} maxLength={64} placeholder="cliente-projeto" required />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Criando..." : "Criar engagement"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {error && <div className="rounded-sm border border-error/30 bg-error/10 px-4 py-3 text-sm text-error" role="alert">{error}</div>}
      {loading ? <div className="card p-6 text-sm text-on-surface-variant">Carregando projetos...</div> : projects.length === 0 ? (
        <div className="card p-8 text-center">
          <h2 className="text-lg font-bold text-on-surface">Nenhum engagement ainda</h2>
          <p className="mt-2 text-sm text-on-surface-variant">Crie o primeiro engagement para abrir o hub da equipe.</p>
        </div>
      ) : (
        <><div className="grid gap-4 lg:grid-cols-2">
          {projects.map((project) => (
            <article className="card card-hover p-6" key={project.slug}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-primary">{project.phase}</p>
                  <h2 className="mt-2 text-lg font-bold text-on-surface">{project.display_name}</h2>
                  <p className="text-xs text-on-surface-variant">{project.slug}</p>
                </div>
                <span className="badge badge-primary">{project.status}</span>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/20 pt-4 text-xs text-on-surface-variant">
                <span>Responsável: {project.responsible}</span>
                <span>Atividade: {formatActivity(project.last_activity_at)}</span>
              </div>
              <Link to={`/redmode/engagements/${project.slug}`} className="mt-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary hover:underline">Abrir engagement <ArrowRight className="h-4 w-4" /></Link>
            </article>
          ))}
        </div>
        {total > 20 && (
          <div className="flex items-center justify-between gap-3 text-sm text-on-surface-variant">
            <span>Mostrando {offset + 1}–{offset + projects.length} de {total}</span>
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline" disabled={offset === 0} onClick={() => { setLoading(true); setOffset((value) => Math.max(0, value - 20)); }}>Anterior</button>
              <button type="button" className="btn btn-outline" disabled={offset + 20 >= total} onClick={() => { setLoading(true); setOffset((value) => value + 20); }}>Próxima</button>
            </div>
          </div>
        )}</>
      )}
    </div>
  );
}

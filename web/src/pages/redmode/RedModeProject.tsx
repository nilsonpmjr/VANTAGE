import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  Camera,
  ChevronRight,
  Crosshair,
  LayoutDashboard,
  ShieldAlert,
  Users,
} from "lucide-react";
import { PageHeader, PageMetricPill } from "../../components/page/PageChrome";
import { useAuth } from "../../context/AuthContext";
import {
  changeProjectPhase,
  changeProjectMember,
  getProject,
  listProjectActivity,
  rememberEngagement,
  type ProjectActivity,
  type ProjectDetail,
} from "./api";
import ScopePanel from "./ScopePanel";
import EvidencePanel, { phaseLabel, ptesPhases } from "./EvidencePanel";
import FindingsPanel from "./FindingsPanel";

type ProjectSection = "overview" | "scope" | "evidence" | "findings" | "activity" | "team";

const projectSections = new Set<ProjectSection>([
  "overview",
  "scope",
  "evidence",
  "findings",
  "activity",
  "team",
]);

const activityLabels: Record<string, string> = {
  project_created: "Projeto criado",
  member_added: "Membro adicionado",
  member_removed: "Membro removido",
  scope_published: "Escopo publicado",
  evidence_added: "Evidência registrada",
  finding_created: "Finding criado",
  finding_updated: "Finding revisado",
  phase_changed: "Fase alterada",
};

function ActivityList({ activity, emptyCopy }: { activity: ProjectActivity[]; emptyCopy: string }) {
  if (!activity.length) {
    return <p className="text-sm text-on-surface-variant">{emptyCopy}</p>;
  }

  return (
    <ol className="space-y-3">
      {activity.map((event, index) => (
        <li
          key={`${event.at}-${index}`}
          className="relative border-l-2 border-primary/40 py-1 pl-4 text-sm text-on-surface"
        >
          <span className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-primary" />
          <span className="font-semibold">{activityLabels[event.type] || event.type}</span>
          <span className="text-on-surface-variant"> · {event.subject}</span>
          <p className="mt-1 text-xs text-on-surface-variant">
            por {event.author} · {new Date(event.at).toLocaleString("pt-BR")}
          </p>
        </li>
      ))}
    </ol>
  );
}

function TeamSection({
  project,
  currentUsername,
  saving,
  error,
  username,
  onUsernameChange,
  onAdd,
  onRemove,
}: {
  project: ProjectDetail;
  currentUsername?: string;
  saving: boolean;
  error: string;
  username: string;
  onUsernameChange: (value: string) => void;
  onAdd: (event: FormEvent<HTMLFormElement>) => void;
  onRemove: (username: string) => void;
}) {
  const canManage = currentUsername === project.responsible;

  return (
    <section className="card overflow-hidden">
      <div className="card-header">
        <div>
          <h2 className="card-title">Equipe e acesso</h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            Somente membros habilitados podem abrir os dados, arquivos e findings deste engagement.
          </p>
        </div>
        <Users className="h-5 w-5 text-primary" />
      </div>
      <div className="card-body">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {project.members.map((member) => (
            <div
              key={member}
              className="flex items-center justify-between gap-3 rounded-sm border border-outline-variant/20 bg-surface-container-low px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-on-surface">{member}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  {member === project.responsible ? "Responsável" : "Membro"}
                </p>
              </div>
              {canManage && member !== project.responsible && (
                <button
                  type="button"
                  className="text-xs font-bold text-error hover:underline"
                  disabled={saving}
                  onClick={() => onRemove(member)}
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>

        {canManage && (
          <form onSubmit={onAdd} className="mt-6 flex flex-wrap items-end gap-3 border-t border-outline-variant/20 pt-6">
            <label className="min-w-64 flex-1 text-sm font-medium text-on-surface">
              Adicionar usuário habilitado
              <input
                className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2.5 text-on-surface"
                value={username}
                onChange={(event) => onUsernameChange(event.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Adicionando..." : "Adicionar membro"}
            </button>
          </form>
        )}
        {error && <p className="mt-3 text-sm text-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}

function ProjectOverview({
  project,
  activity,
  activityError,
  currentUsername,
  savingPhase,
  phaseError,
  onPhaseChange,
}: {
  project: ProjectDetail;
  activity: ProjectActivity[];
  activityError: string;
  currentUsername?: string;
  savingPhase: boolean;
  phaseError: string;
  onPhaseChange: (phase: string) => void;
}) {
  const basePath = `/redmode/engagements/${encodeURIComponent(project.slug)}`;
  const currentPhaseIndex = Math.max(
    ptesPhases.findIndex(([key]) => key === project.phase),
    0,
  );
  const areas = [
    {
      path: `${basePath}/scope`,
      label: "Escopo e alvos",
      copy: "Versões autorizadas, fontes e inventário pesquisável de alvos.",
      icon: Crosshair,
    },
    {
      path: `${basePath}/evidence`,
      label: "Evidências",
      copy: "Notas, anexos e vínculos produzidos durante a operação.",
      icon: Camera,
    },
    {
      path: `${basePath}/findings`,
      label: "Findings",
      copy: "Achados manuais, severidade, revisão e evidências associadas.",
      icon: ShieldAlert,
    },
    {
      path: `${basePath}/team`,
      label: "Equipe e acesso",
      copy: `${project.members.length} membro${project.members.length === 1 ? "" : "s"} com acesso ao engagement.`,
      icon: Users,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="card-header">
          <div>
            <h2 className="card-title">Postura do engagement</h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              Progresso operacional pelas fases PTES, sem misturar ferramentas do SOC.
            </p>
          </div>
          <LayoutDashboard className="h-5 w-5 text-primary" />
        </div>
        <div className="card-body">
          {currentUsername === project.responsible && (
            <div className="mb-5 flex flex-col gap-3 rounded-sm border border-outline-variant/20 bg-surface-container-low p-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-on-surface">Fase operacional atual</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Alterações ficam registradas no histórico do engagement.
                </p>
              </div>
              <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Fase PTES
                <select
                  className="mt-2 block min-w-64 rounded-sm border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm font-medium normal-case tracking-normal text-on-surface"
                  value={project.phase}
                  disabled={savingPhase}
                  onChange={(event) => onPhaseChange(event.target.value)}
                >
                  {ptesPhases.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
            </div>
          )}
          {phaseError && <p className="mb-4 text-sm text-error" role="alert">{phaseError}</p>}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {ptesPhases.map(([key, label], index) => {
              const current = index === currentPhaseIndex;
              const complete = index < currentPhaseIndex;
              return (
                <div
                  key={key}
                  className={`rounded-sm border px-4 py-3 ${
                    current
                      ? "border-primary/50 bg-primary/10"
                      : "border-outline-variant/20 bg-surface-container-low"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`font-mono text-xs font-bold ${current ? "text-primary" : "text-on-surface-variant"}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className={`badge ${current ? "badge-primary" : complete ? "badge-success" : "badge-neutral"}`}>
                      {current ? "Atual" : complete ? "Concluída" : "Pendente"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-on-surface">{label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {areas.map((area) => (
          <Link key={area.path} to={area.path} className="card card-hover group p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary/10 text-primary">
                <area.icon className="h-4 w-4" />
              </span>
              <ChevronRight className="h-4 w-4 text-on-surface-variant transition-transform group-hover:translate-x-1 group-hover:text-primary" />
            </div>
            <h2 className="mt-5 text-sm font-bold uppercase tracking-wider text-on-surface">{area.label}</h2>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{area.copy}</p>
          </Link>
        ))}
      </section>

      <section className="card overflow-hidden">
        <div className="card-header">
          <div>
            <h2 className="card-title">Atividade recente</h2>
            <p className="mt-2 text-sm text-on-surface-variant">Últimas alterações registradas no engagement.</p>
          </div>
          <Link to={`${basePath}/activity`} className="text-xs font-bold uppercase tracking-wider text-primary hover:underline">
            Ver histórico
          </Link>
        </div>
        <div className="card-body">
          {activityError ? (
            <p className="text-sm text-error" role="alert">{activityError}</p>
          ) : (
            <ActivityList activity={activity.slice(0, 5)} emptyCopy="Nenhuma atividade registrada ainda." />
          )}
        </div>
      </section>
    </div>
  );
}

export default function RedModeProject() {
  const { slug, section: sectionParam } = useParams<{ slug: string; section?: string }>();
  const [searchParams] = useSearchParams();
  const requestedScopeVersion = searchParams.get("scope") || undefined;
  const activeSection = (sectionParam || (requestedScopeVersion ? "scope" : "overview")) as ProjectSection;
  const validSection = projectSections.has(activeSection);
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [activity, setActivity] = useState<ProjectActivity[]>([]);
  const [username, setUsername] = useState("");
  const [memberError, setMemberError] = useState("");
  const [savingMember, setSavingMember] = useState(false);
  const [savingPhase, setSavingPhase] = useState(false);
  const [phaseError, setPhaseError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [evidenceRefresh, setEvidenceRefresh] = useState(0);
  const [findingRefresh, setFindingRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);
    setError("");
    getProject(slug)
      .then((data) => {
        if (!active) return;
        setProject(data);
        void rememberEngagement(data.slug).catch(() => undefined);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error && cause.message === "project_membership_required"
          ? "Você pode ver este projeto na lista, mas precisa ser membro para abrir os detalhes."
          : "Não foi possível abrir este engagement.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const refreshActivity = useCallback(async () => {
    if (!slug) return;
    try {
      const events = await listProjectActivity(slug);
      setActivity(events.items);
      setActivityError("");
    } catch {
      setActivityError("Não foi possível carregar o histórico.");
    }
  }, [slug]);

  useEffect(() => {
    if (activeSection === "overview" || activeSection === "activity") {
      void refreshActivity();
    }
  }, [activeSection, refreshActivity]);

  async function updateMember(target: string, add: boolean) {
    if (!project) return;
    setSavingMember(true);
    setMemberError("");
    try {
      const updated = await changeProjectMember(project.slug, target.trim(), add);
      setProject(updated);
      setUsername("");
      await refreshActivity();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setMemberError(reason === "member_not_eligible"
        ? "O usuário precisa estar ativo e ter acesso ao Offensive Mode."
        : reason === "member_already_added"
          ? "Esse usuário já é membro."
          : "Não foi possível alterar a equipe. Tente novamente.");
    } finally {
      setSavingMember(false);
    }
  }

  function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void updateMember(username, true);
  }

  async function updatePhase(phase: string) {
    if (!project || phase === project.phase) return;
    setSavingPhase(true);
    setPhaseError("");
    try {
      const updated = await changeProjectPhase(project.slug, phase);
      setProject(updated);
      await refreshActivity();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setPhaseError(reason === "project_changed_retry"
        ? "A fase mudou em outra sessão. Recarregue o engagement e tente novamente."
        : "Não foi possível alterar a fase do engagement.");
    } finally {
      setSavingPhase(false);
    }
  }

  const sectionLabel = useMemo(() => ({
    overview: "Overview",
    scope: "Escopo e alvos",
    evidence: "Evidências",
    findings: "Findings",
    activity: "Atividade",
    team: "Equipe e acesso",
  }[activeSection]), [activeSection]);

  return (
    <div className="page-frame">
      <Link
        to="/redmode/engagements"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Todos os engagements
      </Link>

      {loading ? (
        <div className="card p-6 text-sm text-on-surface-variant">Carregando engagement...</div>
      ) : error ? (
        <div className="card p-6" role="alert"><p className="text-on-surface">{error}</p></div>
      ) : project ? (
        <>
          <PageHeader
            eyebrow="RED TEAM / OFFENSIVE MODE"
            title={project.display_name}
            description={`${sectionLabel || "Área desconhecida"} · ${phaseLabel(project.phase)}`}
            metrics={(
              <>
                <PageMetricPill label={project.status} tone={project.status === "active" ? "primary" : "muted"} />
                <PageMetricPill label={`${project.members.length} membro${project.members.length === 1 ? "" : "s"}`} icon={<Users className="h-3.5 w-3.5" />} />
                <PageMetricPill label={new Date(project.last_activity_at).toLocaleDateString("pt-BR")} icon={<CalendarDays className="h-3.5 w-3.5" />} />
              </>
            )}
          />

          {!validSection ? (
            <section className="card p-6" role="alert">
              <h2 className="text-base font-bold text-on-surface">Área do engagement não encontrada</h2>
              <Link to={`/redmode/engagements/${encodeURIComponent(project.slug)}`} className="mt-3 inline-flex font-semibold text-primary hover:underline">
                Voltar ao overview
              </Link>
            </section>
          ) : activeSection === "overview" ? (
            <ProjectOverview
              project={project}
              activity={activity}
              activityError={activityError}
              currentUsername={user?.username}
              savingPhase={savingPhase}
              phaseError={phaseError}
              onPhaseChange={(phase) => void updatePhase(phase)}
            />
          ) : activeSection === "scope" ? (
            <ScopePanel
              slug={project.slug}
              initialVersionId={requestedScopeVersion}
              onPublished={() => void refreshActivity()}
            />
          ) : activeSection === "evidence" ? (
            <EvidencePanel
              slug={project.slug}
              findingRefresh={findingRefresh}
              onAdded={() => {
                setEvidenceRefresh((current) => current + 1);
                void refreshActivity();
              }}
            />
          ) : activeSection === "findings" ? (
            <FindingsPanel
              slug={project.slug}
              evidenceRefresh={evidenceRefresh}
              onSaved={() => {
                setFindingRefresh((current) => current + 1);
                void refreshActivity();
              }}
            />
          ) : activeSection === "activity" ? (
            <section className="card overflow-hidden">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Atividade do engagement</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">Trilha cronológica das alterações operacionais.</p>
                </div>
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div className="card-body">
                {activityError ? <p className="text-sm text-error" role="alert">{activityError}</p> : (
                  <ActivityList activity={activity} emptyCopy="Nenhuma atividade registrada ainda." />
                )}
              </div>
            </section>
          ) : (
            <TeamSection
              project={project}
              currentUsername={user?.username}
              saving={savingMember}
              error={memberError}
              username={username}
              onUsernameChange={setUsername}
              onAdd={handleAddMember}
              onRemove={(member) => void updateMember(member, false)}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

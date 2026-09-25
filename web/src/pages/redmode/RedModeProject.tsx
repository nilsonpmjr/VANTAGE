import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Users } from "lucide-react";
import { PageHeader } from "../../components/page/PageChrome";
import { useAuth } from "../../context/AuthContext";
import { changeProjectMember, getProject, listProjectActivity, rememberEngagement, type ProjectActivity, type ProjectDetail } from "./api";
import ScopePanel from "./ScopePanel";
import EvidencePanel from "./EvidencePanel";
import FindingsPanel from "./FindingsPanel";

const activityLabels: Record<ProjectActivity["type"], string> = {
  project_created: "Projeto criado",
  member_added: "Membro adicionado",
  member_removed: "Membro removido",
  scope_published: "Escopo publicado",
  evidence_added: "Evidência registrada",
  finding_created: "Finding criado",
  finding_updated: "Finding revisado",
};

export default function RedModeProject() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [activity, setActivity] = useState<ProjectActivity[]>([]);
  const [username, setUsername] = useState("");
  const [memberError, setMemberError] = useState("");
  const [savingMember, setSavingMember] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [evidenceRefresh, setEvidenceRefresh] = useState(0);
  const [findingRefresh, setFindingRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    let active = true;
    getProject(slug)
      .then((data) => {
        if (!active) return;
        setProject(data);
        void rememberEngagement(data.slug).catch(() => undefined);
        void listProjectActivity(slug)
          .then((events) => { if (active) setActivity(events.items); })
          .catch(() => { if (active) setActivityError("Não foi possível carregar o histórico."); });
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error && cause.message === "project_membership_required"
          ? "Você pode ver este projeto no feed, mas precisa ser membro para abrir os detalhes."
          : "Não foi possível abrir este projeto.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  async function updateMember(target: string, add: boolean) {
    if (!project) return;
    setSavingMember(true);
    setMemberError("");
    try {
      const updated = await changeProjectMember(project.slug, target.trim(), add);
      setProject(updated);
      setUsername("");
      try {
        const events = await listProjectActivity(project.slug);
        setActivity(events.items);
        setActivityError("");
      } catch {
        setActivityError("Equipe atualizada, mas não foi possível carregar o histórico.");
      }
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

  return (
    <div className="page-frame">
      <Link to="/redmode/engagements" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Voltar aos engagements</Link>
      {loading ? <div className="card p-6 text-sm text-on-surface-variant">Carregando projeto...</div> : error ? (
        <div className="card p-6" role="alert"><p className="text-on-surface">{error}</p></div>
      ) : project ? (
        <>
          <PageHeader eyebrow="Offensive Mode" title={project.display_name} description={`${project.phase} · ${project.status}`} />
          <section className="card p-6">
            <div className="flex items-center gap-2 text-primary"><Users className="h-4 w-4" /><h2 className="text-sm font-bold uppercase tracking-wider">Equipe</h2></div>
            <p className="mt-3 text-sm text-on-surface">Responsável: {project.responsible}</p>
            <ul className="mt-4 space-y-2">
              {project.members.map((member) => (
                <li key={member} className="flex items-center justify-between gap-3 rounded-sm bg-surface-container-low px-3 py-2 text-sm text-on-surface">
                  <span>{member}</span>
                  {user?.username === project.responsible && member !== project.responsible && (
                    <button type="button" className="text-xs font-bold text-error hover:underline" disabled={savingMember} onClick={() => void updateMember(member, false)}>Remover</button>
                  )}
                </li>
              ))}
            </ul>
            {user?.username === project.responsible && (
              <form onSubmit={handleAddMember} className="mt-5 flex flex-wrap items-end gap-3">
                <label className="min-w-52 flex-1 text-sm font-medium text-on-surface">Adicionar usuário habilitado
                  <input className="mt-2 w-full rounded-sm border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-on-surface" value={username} onChange={(event) => setUsername(event.target.value)} required />
                </label>
                <button type="submit" className="btn btn-primary" disabled={savingMember}>Adicionar membro</button>
              </form>
            )}
            {memberError && <p className="mt-3 text-sm text-error" role="alert">{memberError}</p>}
          </section>
          <section className="card p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Atividade do projeto</h2>
            {activityError && <p className="mt-3 text-sm text-error" role="alert">{activityError}</p>}
            <ul className="mt-4 space-y-3">
              {activity.map((event, index) => (
                <li key={`${event.at}-${index}`} className="border-l-2 border-primary/40 pl-3 text-sm text-on-surface">
                  <span className="font-semibold">{activityLabels[event.type] || event.type}</span> · {event.subject}
                  <p className="mt-1 text-xs text-on-surface-variant">por {event.author} · {new Date(event.at).toLocaleString("pt-BR")}</p>
                </li>
              ))}
            </ul>
          </section>
          <ScopePanel slug={project.slug} onPublished={() => {
            void listProjectActivity(project.slug).then((events) => setActivity(events.items)).catch(() => setActivityError("Não foi possível atualizar o histórico."));
          }} />
          <EvidencePanel slug={project.slug} findingRefresh={findingRefresh} onAdded={() => {
            setEvidenceRefresh((current) => current + 1);
            void listProjectActivity(project.slug).then((events) => setActivity(events.items)).catch(() => setActivityError("Não foi possível atualizar o histórico."));
          }} />
          <FindingsPanel slug={project.slug} evidenceRefresh={evidenceRefresh} onSaved={() => {
            setFindingRefresh((current) => current + 1);
            void listProjectActivity(project.slug).then((events) => setActivity(events.items)).catch(() => setActivityError("Não foi possível atualizar o histórico."));
          }} />
        </>
      ) : null}
    </div>
  );
}

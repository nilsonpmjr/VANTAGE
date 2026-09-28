import { useEffect, useState } from "react";
import EvidencePanel from "../pages/redmode/EvidencePanel";

const createdAt = "2026-09-26T12:00:00Z";
const updatedAt = "2026-09-27T14:00:00Z";

function revision(noteId: string, number = 3) {
  return {
    id: `revision-${noteId}`,
    number,
    previous_revision_id: `revision-${noteId}-previous`,
    author: "analista.red",
    created_at: updatedAt,
  };
}

const notes = [
  {
    id: "note-long", project_slug: "cliente-demo", origin: "human", created_by: "analista.red",
    created_at: createdAt, updated_at: updatedAt, title: "Validação completa do portal administrativo",
    excerpt: "Reprodução documentada do comportamento observado no portal administrativo.",
    phase: "exploitation", tags: ["web", "autenticação", "portal", "reteste", "prioridade", "cliente"],
    target_count: 3, finding_count: 1, attachment_count: 1, revision: revision("note-long"),
  },
  {
    id: "note-short", project_slug: "cliente-demo", origin: "human", created_by: "operador.um",
    created_at: createdAt, updated_at: "2026-09-27T13:00:00Z", title: "Cabeçalhos observados",
    excerpt: "Servidor respondeu com cache desabilitado.", phase: "reconnaissance", tags: ["web", "headers"],
    target_count: 1, finding_count: 0, attachment_count: 0, revision: revision("note-short", 1),
  },
  {
    id: "note-code", project_slug: "cliente-demo", origin: "human", created_by: "analista.red",
    created_at: createdAt, updated_at: "2026-09-27T11:00:00Z", title: "Comandos de reprodução",
    excerpt: "Sequência sintética usada durante a validação.", phase: "vulnerability-analysis", tags: ["reprodução", "http"],
    target_count: 2, finding_count: 1, attachment_count: 0, revision: revision("note-code", 2),
  },
] as const;

const longMarkdown = `## Resumo da observação

O portal administrativo aceitou uma sessão sintética durante o roteiro de validação.

> Todos os alvos e valores desta tela são fictícios.

### Reprodução

1. Abrir o endpoint de autenticação.
2. Enviar a requisição de teste.
3. Confirmar o cabeçalho de resposta.

\`\`\`http
GET /admin HTTP/1.1
Host: portal.example.test
Authorization: Bearer synthetic-token
\`\`\`

| Campo | Valor observado |
| --- | --- |
| Status | 200 |
| Cache | desabilitado |
| Perfil | operador sintético |

### Próximos passos

- [x] Registrar a evidência
- [ ] Vincular a revisão do finding
- [ ] Executar o reteste após a correção
`;

function detail(note: (typeof notes)[number]) {
  const targetCount = note.target_count;
  const findingCount = note.finding_count;
  const attachmentCount = note.attachment_count;
  return {
    ...note,
    markdown: note.id === "note-long" ? longMarkdown : note.excerpt,
    targets: ["portal.example.test", "198.51.100.24", "api.example.test"].slice(0, targetCount),
    finding_ids: findingCount ? ["finding-1"] : [],
    attachment_ids: attachmentCount ? ["attachment-1"] : [],
    attachments: attachmentCount ? [{
      id: "attachment-1", filename: "resposta-http.txt", size: 4096, sha256: "0".repeat(64),
      content_type: "text/plain",
    }] : [],
  };
}

function draftDetail() {
  const published = detail(notes[0]);
  return {
    id: "cliente-demo:note-long:analista.red",
    note_id: "note-long",
    project_slug: "cliente-demo",
    author: "analista.red",
    version: 7,
    base_revision_id: new URLSearchParams(window.location.search).get("scenario") === "conflict"
      ? "revision-outdated"
      : published.revision.id,
    created_at: createdAt,
    updated_at: updatedAt,
    title: `${published.title} — rascunho`,
    markdown: `${published.markdown}\n\n> Complemento privado confirmado pelo autosave.`,
    phase: published.phase,
    tags: published.tags,
    targets: published.targets,
    finding_ids: published.finding_ids,
    attachment_ids: ["attachment-1", "attachment-draft"],
    attachments: [
      ...published.attachments,
      {
        id: "attachment-draft", filename: "captura-privada.png", size: 128000,
        sha256: "1".repeat(64), content_type: "image/png", created_by: "analista.red",
        created_at: updatedAt,
      },
    ],
  };
}

export default function EvidenceNotebookVisualHarness() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const nativeFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
      const path = url.pathname;
      if (path.endsWith("/evidence/notes") && (!init?.method || init.method === "GET")) {
        return Response.json({ items: notes, total: notes.length });
      }
      if (path.endsWith("/evidence/drafts") && (!init?.method || init.method === "GET")) {
        const draft = draftDetail();
        return Response.json({ items: [{
          note_id: draft.note_id, project_slug: draft.project_slug, version: draft.version,
          base_revision_id: draft.base_revision_id, updated_at: draft.updated_at,
          title: draft.title, excerpt: "Complemento privado confirmado pelo autosave.",
          phase: draft.phase, tags: draft.tags, attachment_count: draft.attachment_ids.length,
          is_new: false,
        }] });
      }
      if (path.endsWith("/findings")) {
        return Response.json({
          items: [{
            id: "finding-1", project_slug: "cliente-demo", origin: "human", created_at: createdAt,
            updated_at: updatedAt, title: "Controle de sessão insuficiente",
            description: "Finding sintético para o roteiro visual.", severity: "high", phase: "exploitation",
            targets: ["portal.example.test"], evidence_ids: ["note-long"], revision: revision("finding-1", 2),
          }],
          total: 1,
        });
      }
      const marker = "/evidence/notes/";
      if (path.includes(marker)) {
        const noteId = path.split(marker, 2)[1].split("/", 1)[0];
        const note = notes.find((item) => item.id === noteId);
        if (path.endsWith("/revisions") && note) {
          const current = detail(note);
          return Response.json({ items: [
            {
              ...current, id: current.revision.id, note_id: current.id,
              number: current.revision.number, previous_revision_id: current.revision.previous_revision_id,
              author: current.revision.author, created_at: current.revision.created_at,
            },
            {
              ...current, id: `${current.revision.id}-previous`, note_id: current.id,
              number: Math.max(1, current.revision.number - 1), previous_revision_id: null,
              author: "operador.um", created_at: createdAt,
              title: "Validação inicial do portal administrativo",
              markdown: "## Registro inicial\n\nPrimeira observação sintética.",
            },
          ] });
        }
        return note
          ? Response.json(detail(note))
          : Response.json({ detail: "evidence_storage_unavailable" }, { status: 503 });
      }
      const draftMarker = "/evidence/drafts/";
      if (path.includes(draftMarker)) {
        const noteId = path.split(draftMarker, 2)[1].split("/", 1)[0];
        return noteId === "note-long"
          ? Response.json(draftDetail())
          : Response.json({ detail: "evidence_draft_not_found" }, { status: 404 });
      }
      return nativeFetch(input, init);
    };
    setReady(true);
    return () => { window.fetch = nativeFetch; };
  }, []);

  return (
    <main data-workspace="redmode" className="min-h-screen bg-background p-4 text-on-surface sm:p-6">
      <div className="mx-auto max-w-[96rem] space-y-5">
        <header>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Roteiro visual OM3-04</p>
          <h1 className="mt-2 text-2xl font-bold">Caderno operacional de evidências</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Valide rascunho privado, autosave, publicação, histórico e anexos em claro, escuro e tela estreita.
          </p>
        </header>
        {ready ? <EvidencePanel slug="cliente-demo" findingRefresh={0} /> : <p>Preparando dados sintéticos...</p>}
      </div>
    </main>
  );
}

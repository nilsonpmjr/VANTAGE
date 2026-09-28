import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EvidencePanel from "./EvidencePanel";

const apiMocks = vi.hoisted(() => ({
  createEvidenceDraft: vi.fn(),
  deleteEvidenceDraftAttachment: vi.fn(),
  discardEvidenceDraft: vi.fn(),
  getEvidenceDraft: vi.fn(),
  getEvidenceLinks: vi.fn(),
  getEvidenceNote: vi.fn(),
  listEvidenceDrafts: vi.fn(),
  listEvidenceNotes: vi.fn(),
  listEvidenceRevisions: vi.fn(),
  listFindings: vi.fn(),
  publishEvidenceDraft: vi.fn(),
  rebaseEvidenceDraft: vi.fn(),
  resolveEvidenceReferences: vi.fn(),
  saveEvidenceDraft: vi.fn(),
  searchEvidenceNotebook: vi.fn(),
  suggestEvidenceReferences: vi.fn(),
  uploadEvidenceDraftAttachments: vi.fn(),
}));

vi.mock("./api", () => ({
  ...apiMocks,
  evidenceAttachmentDownloadUrl: (slug: string, noteId: string, attachmentId: string, inline = false) => (
    `/api/redmode/projects/${slug}/evidence/notes/${noteId}/attachments/${attachmentId}${inline ? "?inline=true" : ""}`
  ),
}));

const summary = {
  id: "note-1",
  project_slug: "demo",
  origin: "human" as const,
  created_by: "alice",
  created_at: "2026-09-26T12:00:00Z",
  updated_at: "2026-09-26T13:00:00Z",
  title: "Validação do portal",
  excerpt: "A rota administrativa respondeu.",
  phase: "reconnaissance",
  tags: ["web", "recon"],
  target_count: 1,
  finding_count: 0,
  attachment_count: 0,
  revision: {
    id: "revision-1",
    number: 1,
    previous_revision_id: null,
    author: "alice",
    created_at: "2026-09-26T13:00:00Z",
  },
};

const detail = {
  id: summary.id,
  project_slug: summary.project_slug,
  origin: summary.origin,
  created_by: summary.created_by,
  created_at: summary.created_at,
  updated_at: summary.updated_at,
  title: summary.title,
  markdown: "## Observação\n\nA rota administrativa respondeu.",
  phase: summary.phase,
  tags: summary.tags,
  targets: ["portal.example.test"],
  finding_ids: [],
  attachment_ids: [],
  attachments: [],
  references: [],
  revision: summary.revision,
};

const privateDraft = {
  id: "demo:note-draft:alice",
  note_id: "note-draft",
  project_slug: "demo",
  author: "alice",
  version: 1,
  base_revision_id: null,
  created_at: "2026-09-26T14:00:00Z",
  updated_at: "2026-09-26T14:00:00Z",
  title: "",
  markdown: "",
  phase: "pre-engagement",
  tags: [],
  targets: [],
  finding_ids: [],
  attachment_ids: [],
  attachments: [],
  references: [],
};

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPanel(initialEntry = "/redmode/engagements/demo/evidence", onAdded = vi.fn()) {
  return {
    onAdded,
    ...render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <EvidencePanel slug="demo" findingRefresh={0} onAdded={onAdded} />
        <LocationProbe />
      </MemoryRouter>,
    ),
  };
}

describe("EvidencePanel notebook", () => {
  beforeEach(() => {
    apiMocks.listEvidenceNotes.mockResolvedValue({ items: [summary], total: 1 });
    apiMocks.listEvidenceDrafts.mockResolvedValue({ items: [] });
    apiMocks.listFindings.mockResolvedValue({ items: [], total: 0 });
    apiMocks.listEvidenceRevisions.mockResolvedValue({ items: [{
      ...detail,
      id: detail.revision.id,
      note_id: detail.id,
      number: detail.revision.number,
      previous_revision_id: detail.revision.previous_revision_id,
      author: detail.revision.author,
      created_at: detail.revision.created_at,
    }] });
    apiMocks.getEvidenceLinks.mockResolvedValue({ outgoing: [], backlinks: [] });
    apiMocks.resolveEvidenceReferences.mockResolvedValue({ items: [] });
    apiMocks.suggestEvidenceReferences.mockResolvedValue({ items: [] });
    apiMocks.searchEvidenceNotebook.mockResolvedValue({
      items: [{
        type: "evidence",
        id: summary.id,
        reference: `[[evidence:${summary.id}]]`,
        key: `evidence:${summary.id}`,
        label: summary.title,
        excerpt: summary.excerpt,
        phase: summary.phase,
        updated_at: summary.updated_at,
        href: `/redmode/engagements/demo/evidence?note=${summary.id}`,
        private: false,
        broken: false,
      }],
      total: 1,
    });
    apiMocks.getEvidenceNote.mockImplementation(async (_slug: string, noteId: string) => {
      if (noteId === privateDraft.note_id) throw new Error("evidence_not_found");
      return detail;
    });
    apiMocks.getEvidenceDraft.mockImplementation(async (_slug: string, noteId: string) => {
      if (noteId === privateDraft.note_id) return privateDraft;
      throw new Error("evidence_draft_not_found");
    });
    apiMocks.createEvidenceDraft.mockResolvedValue(privateDraft);
    apiMocks.saveEvidenceDraft.mockImplementation(async (
      _slug: string,
      noteId: string,
      baseRevisionId: string | null,
      expectedVersion: number,
      payload: typeof privateDraft,
    ) => ({
      ...privateDraft,
      ...payload,
      id: `demo:${noteId}:alice`,
      note_id: noteId,
      base_revision_id: baseRevisionId,
      version: expectedVersion + 1,
      updated_at: "2026-09-26T14:01:00Z",
      attachments: [],
    }));
    apiMocks.publishEvidenceDraft.mockResolvedValue({
      ...detail,
      id: privateDraft.note_id,
      title: "Nota de validação",
      markdown: "Resultado **confirmado**.",
    });
    apiMocks.discardEvidenceDraft.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("restores URL filters and keeps the selected note in the engagement route", async () => {
    const user = userEvent.setup();
    renderPanel("/redmode/engagements/demo/evidence?phase=reconnaissance&tag=web");

    expect(await screen.findByRole("button", { name: /Validação do portal/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Filtrar notas por fase")).toHaveValue("reconnaissance");
    expect(screen.getByLabelText("Filtrar notas por tag")).toHaveValue("web");

    await user.click(screen.getByRole("button", { name: /Validação do portal/ }));
    await waitFor(() => expect(apiMocks.getEvidenceNote).toHaveBeenCalledWith("demo", "note-1"));
    expect(screen.getByLabelText("location")).toHaveTextContent(
      "/redmode/engagements/demo/evidence?phase=reconnaissance&tag=web&note=note-1",
    );
    expect(await screen.findByDisplayValue("Validação do portal")).toBeInTheDocument();
    expect(screen.getByDisplayValue("portal.example.test")).toBeInTheDocument();
  });

  it("autosaves a private draft and only publishes after the explicit action", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    renderPanel(undefined, onAdded);
    await screen.findByRole("button", { name: /Validação do portal/ });

    await user.click(screen.getByRole("button", { name: "Nova" }));
    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("?note=note-draft"));
    expect(screen.getAllByText(/Rascunho/).length).toBeGreaterThan(0);
    expect(apiMocks.publishEvidenceDraft).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText("Título da evidência"), "Nota de validação");
    await user.type(screen.getByLabelText("Nota de evidência: texto Markdown"), "Resultado **confirmado**.");
    await waitFor(() => expect(apiMocks.saveEvidenceDraft).toHaveBeenCalledWith(
      "demo",
      "note-draft",
      null,
      1,
      expect.objectContaining({
      title: "Nota de validação",
      markdown: "Resultado **confirmado**.",
      phase: "pre-engagement",
      }),
    ), { timeout: 2500 });
    expect(onAdded).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(apiMocks.publishEvidenceDraft).toHaveBeenCalledWith("demo", "note-draft", 2));
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("location")).toHaveTextContent("?note=note-draft");
  });

  it("preserves local edits and marks the note when optimistic locking detects a conflict", async () => {
    const user = userEvent.setup();
    apiMocks.getEvidenceDraft.mockResolvedValue({
      ...privateDraft,
      id: "demo:note-1:alice",
      note_id: "note-1",
      base_revision_id: detail.revision.id,
      title: detail.title,
      markdown: detail.markdown,
      phase: detail.phase,
      tags: detail.tags,
      targets: detail.targets,
    });
    apiMocks.saveEvidenceDraft.mockRejectedValue(new Error("evidence_draft_conflict"));
    renderPanel("/redmode/engagements/demo/evidence?note=note-1");

    const title = await screen.findByDisplayValue("Validação do portal");
    await user.clear(title);
    await user.type(title, "Validação atualizada localmente");
    await user.click(screen.getByRole("button", { name: "Salvar rascunho" }));

    expect(await screen.findByText(/A revisão publicada mudou/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Validação atualizada localmente")).toBeInTheDocument();
    expect(screen.getAllByText(/Conflito/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Reaplicar manualmente/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Descartar rascunho/ }).length).toBeGreaterThan(0);
  });

  it("loads additional note summaries progressively", async () => {
    const second = { ...summary, id: "note-2", title: "Outra nota" };
    apiMocks.listEvidenceNotes
      .mockResolvedValueOnce({ items: [summary], total: 2 })
      .mockResolvedValueOnce({ items: [second], total: 2 });
    const user = userEvent.setup();
    renderPanel();

    await screen.findByRole("button", { name: /Validação do portal/ });
    await user.click(screen.getByRole("button", { name: /Carregar mais/ }));

    expect(await screen.findByRole("button", { name: /Outra nota/ })).toBeInTheDocument();
    expect(apiMocks.listEvidenceNotes).toHaveBeenLastCalledWith("demo", 1, 30);
  });

  it("searches findings with URL filters and follows the result", async () => {
    const user = userEvent.setup();
    apiMocks.searchEvidenceNotebook.mockResolvedValue({
      items: [{
        type: "finding",
        id: "finding-1",
        reference: "[[finding:finding-1]]",
        key: "finding:finding-1",
        label: "Falha de autorização",
        excerpt: "Outro usuário consegue abrir o recurso.",
        phase: "vulnerability-analysis",
        updated_at: "2026-09-26T15:00:00Z",
        href: "/redmode/engagements/demo/findings?finding=finding-1",
        private: false,
        broken: false,
      }],
      total: 1,
    });
    renderPanel("/redmode/engagements/demo/evidence?q=autoriza%C3%A7%C3%A3o&type=finding&from=2026-09-01&to=2026-09-30");

    await user.click(await screen.findByRole("button", { name: /Falha de autorização/ }));
    expect(apiMocks.searchEvidenceNotebook).toHaveBeenCalledWith("demo", expect.objectContaining({
      q: "autorização",
      type: "finding",
      dateFrom: "2026-09-01T00:00:00.000Z",
      dateTo: "2026-09-30T23:59:59.999Z",
    }));
    expect(screen.getByLabelText("location")).toHaveTextContent(
      "/redmode/engagements/demo/findings?finding=finding-1",
    );
  });

  it("shows dynamically resolved outgoing links and published backlinks", async () => {
    apiMocks.getEvidenceNote.mockResolvedValue({
      ...detail,
      markdown: "Consulte [[finding:finding-1]].",
      references: [{ kind: "finding", id: "finding-1", key: "finding:finding-1" }],
    });
    apiMocks.resolveEvidenceReferences.mockResolvedValue({ items: [{
      kind: "finding",
      id: "finding-1",
      key: "finding:finding-1",
      label: "Falha de autorização renomeada",
      href: "/redmode/engagements/demo/findings?finding=finding-1",
      broken: false,
      context: "Consulte finding:finding-1.",
    }] });
    apiMocks.getEvidenceLinks.mockResolvedValue({
      outgoing: [],
      backlinks: [{
        type: "evidence",
        id: "note-2",
        label: "Nota que aponta para cá",
        href: "/redmode/engagements/demo/evidence?note=note-2",
        context: "Ligação com evidence:note-1.",
        author: "bob",
        updated_at: "2026-09-26T16:00:00Z",
      }],
    });
    renderPanel("/redmode/engagements/demo/evidence?note=note-1");

    expect((await screen.findAllByText("Falha de autorização renomeada")).length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "Nota que aponta para cá" })).toBeInTheDocument();
  });

  it("recovers the last server-confirmed private draft on reload", async () => {
    apiMocks.getEvidenceDraft.mockResolvedValue({
      ...privateDraft,
      id: "demo:note-1:alice",
      note_id: "note-1",
      base_revision_id: detail.revision.id,
      title: "Rascunho recuperado",
      markdown: "Conteúdo confirmado pelo autosave.",
      phase: detail.phase,
      tags: detail.tags,
      targets: detail.targets,
    });
    renderPanel("/redmode/engagements/demo/evidence?note=note-1");

    expect(await screen.findByDisplayValue("Rascunho recuperado")).toBeInTheDocument();
    expect(screen.getByLabelText("Nota de evidência: texto Markdown")).toHaveValue("Conteúdo confirmado pelo autosave.");
    expect(screen.getAllByText("Rascunho salvo").length).toBeGreaterThan(0);
  });

  it("opens immutable history without mixing it with the private draft", async () => {
    const user = userEvent.setup();
    apiMocks.getEvidenceDraft.mockResolvedValue({
      ...privateDraft,
      id: "demo:note-1:alice",
      note_id: "note-1",
      base_revision_id: detail.revision.id,
      title: "Meu rascunho",
      markdown: "Texto privado",
      phase: detail.phase,
      tags: detail.tags,
      targets: detail.targets,
    });
    renderPanel("/redmode/engagements/demo/evidence?note=note-1");

    await screen.findByDisplayValue("Meu rascunho");
    await user.click(await screen.findByRole("button", { name: /Revisão 1/ }));
    expect(screen.getByLabelText("Revisão 1")).toHaveTextContent("A rota administrativa respondeu.");
    expect(screen.getByDisplayValue("Validação do portal")).toBeDisabled();
    expect(screen.getByText(/Seu rascunho privado não aparece neste histórico/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Voltar ao rascunho/ }));
    expect(screen.getByDisplayValue("Meu rascunho")).toBeInTheDocument();
  });

  it("uploads an image privately and inserts its authenticated stable reference", async () => {
    const user = userEvent.setup();
    const attachment = {
      id: "attachment-1",
      filename: "captura.png",
      size: 8,
      sha256: "0".repeat(64),
      content_type: "image/png",
    };
    apiMocks.uploadEvidenceDraftAttachments.mockImplementation(async (
      _slug: string,
      noteId: string,
      expectedVersion: number,
    ) => ({
      ...privateDraft,
      id: `demo:${noteId}:alice`,
      note_id: noteId,
      base_revision_id: detail.revision.id,
      version: expectedVersion + 1,
      title: detail.title,
      markdown: detail.markdown,
      phase: detail.phase,
      tags: detail.tags,
      targets: detail.targets,
      attachment_ids: [attachment.id],
      attachments: [attachment],
    }));
    renderPanel("/redmode/engagements/demo/evidence?note=note-1");
    await screen.findByDisplayValue("Validação do portal");

    await user.upload(
      screen.getByLabelText("Selecionar anexos"),
      new File(["fake-png"], "captura.png", { type: "image/png" }),
    );
    await waitFor(() => expect(apiMocks.uploadEvidenceDraftAttachments).toHaveBeenCalledWith(
      "demo",
      "note-1",
      1,
      [expect.objectContaining({ name: "captura.png" })],
    ));
    await user.click(await screen.findByRole("button", { name: /Incorporar imagem/ }));
    expect((screen.getByLabelText("Nota de evidência: texto Markdown") as HTMLTextAreaElement).value).toContain(
      "![captura.png](/api/redmode/projects/demo/evidence/notes/note-1/attachments/attachment-1?inline=true)",
    );
  });

  it("supports shortcuts for saving, search, properties, and note creation", async () => {
    const user = userEvent.setup();
    renderPanel("/redmode/engagements/demo/evidence?note=note-1");

    const title = await screen.findByDisplayValue("Validação do portal");
    await user.type(title, " revisada");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(apiMocks.saveEvidenceDraft).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() => expect(screen.getByPlaceholderText("Buscar notas, findings, fontes e alvos")).toHaveFocus());

    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    expect(screen.getAllByRole("button", { name: "Abrir propriedades" }).length).toBeGreaterThan(0);

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("?note=note-draft"));
  });
});

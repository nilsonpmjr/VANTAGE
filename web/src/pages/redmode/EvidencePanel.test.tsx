import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EvidencePanel from "./EvidencePanel";

const apiMocks = vi.hoisted(() => ({
  createEvidenceNote: vi.fn(),
  getEvidenceNote: vi.fn(),
  listEvidenceNotes: vi.fn(),
  listFindings: vi.fn(),
  updateEvidenceNote: vi.fn(),
}));

vi.mock("./api", () => ({
  ...apiMocks,
  evidenceAttachmentDownloadUrl: (slug: string, noteId: string, attachmentId: string) => (
    `/api/redmode/projects/${slug}/evidence/notes/${noteId}/attachments/${attachmentId}`
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
  revision: summary.revision,
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
    apiMocks.listFindings.mockResolvedValue({ items: [], total: 0 });
    apiMocks.getEvidenceNote.mockResolvedValue(detail);
    apiMocks.createEvidenceNote.mockResolvedValue({ ...detail, id: "note-created" });
    apiMocks.updateEvidenceNote.mockResolvedValue({
      ...detail,
      revision: {
        ...detail.revision,
        id: "revision-2",
        number: 2,
        previous_revision_id: detail.revision.id,
      },
    });
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

  it("keeps a new note local until the operator explicitly saves it", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    renderPanel(undefined, onAdded);
    await screen.findByRole("button", { name: /Validação do portal/ });

    await user.click(screen.getByRole("button", { name: "Nova" }));
    expect(screen.getByLabelText("location")).toHaveTextContent("?note=new");
    expect(screen.getAllByText("Rascunho local").length).toBeGreaterThan(0);
    expect(apiMocks.createEvidenceNote).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText("Título da evidência"), "Nota de validação");
    await user.type(screen.getByLabelText("Nota de evidência: texto Markdown"), "Resultado **confirmado**.");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(apiMocks.createEvidenceNote).toHaveBeenCalledWith("demo", expect.objectContaining({
      title: "Nota de validação",
      markdown: "Resultado **confirmado**.",
      phase: "pre-engagement",
    })));
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("location")).toHaveTextContent("?note=note-created");
  });

  it("preserves local edits and marks the note when optimistic locking detects a conflict", async () => {
    const user = userEvent.setup();
    apiMocks.updateEvidenceNote.mockRejectedValue(new Error("evidence_changed_retry"));
    renderPanel("/redmode/engagements/demo/evidence?note=note-1");

    const title = await screen.findByDisplayValue("Validação do portal");
    await user.clear(title);
    await user.type(title, "Validação atualizada localmente");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(/Esta nota mudou em outra sessão/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Validação atualizada localmente")).toBeInTheDocument();
    expect(screen.getAllByText(/Conflito/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Recarregar versão remota/ })).toBeInTheDocument();
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

  it("supports shortcuts for saving, search, properties, and note creation", async () => {
    const user = userEvent.setup();
    renderPanel("/redmode/engagements/demo/evidence?note=note-1");

    const title = await screen.findByDisplayValue("Validação do portal");
    await user.type(title, " revisada");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(apiMocks.updateEvidenceNote).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() => expect(screen.getByPlaceholderText("Buscar título, tag ou autor")).toHaveFocus());

    fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
    expect(screen.getAllByRole("button", { name: "Abrir propriedades" }).length).toBeGreaterThan(0);

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("?note=new"));
  });
});

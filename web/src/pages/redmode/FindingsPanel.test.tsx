import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FindingsPanel from "./FindingsPanel";

const apiMocks = vi.hoisted(() => ({
  compareFindingRevisions: vi.fn(),
  createFindingDraft: vi.fn(),
  discardFindingDraft: vi.fn(),
  getFinding: vi.fn(),
  getFindingDraft: vi.fn(),
  getFindingLinks: vi.fn(),
  listEvidence: vi.fn(),
  listFindingDrafts: vi.fn(),
  listFindingRevisions: vi.fn(),
  listFindings: vi.fn(),
  publishFindingDraft: vi.fn(),
  rebaseFindingDraft: vi.fn(),
  resolveEvidenceReferences: vi.fn(),
  saveFindingDraft: vi.fn(),
  suggestEvidenceReferences: vi.fn(),
}));

vi.mock("./api", () => apiMocks);

const finding = {
  id: "finding-1",
  project_slug: "demo",
  origin: "human" as const,
  created_at: "2026-09-28T12:00:00Z",
  updated_at: "2026-09-28T13:00:00Z",
  title: "Controle de acesso ausente",
  description: "# Resumo\n\nUm usuário comum acessa o painel.",
  severity: "high" as const,
  phase: "vulnerability-analysis",
  targets: ["portal.example.test"],
  evidence_ids: [],
  references: [],
  revision: {
    id: "revision-1",
    number: 1,
    previous_revision_id: null,
    author: "alice",
    created_at: "2026-09-28T13:00:00Z",
  },
};

const draft = {
  id: "demo:finding-new:alice",
  finding_id: "finding-new",
  project_slug: "demo",
  author: "alice",
  version: 1,
  base_revision_id: null,
  created_at: "2026-09-28T14:00:00Z",
  updated_at: "2026-09-28T14:00:00Z",
  title: "",
  description: "# Resumo\n\n# Impacto\n\n# Evidências\n\n# Reprodução\n\n# Recomendação\n",
  severity: "medium" as const,
  phase: "pre-engagement",
  targets: [],
  evidence_ids: [],
  references: [],
};

const revisions = [{
  ...finding,
  id: "revision-1",
  finding_id: finding.id,
  project_slug: "demo",
  number: 1,
  previous_revision_id: null,
  author: "alice",
  created_at: "2026-09-28T13:00:00Z",
}];

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPanel(initialEntry = "/offensive/projects/demo/findings", onSaved = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FindingsPanel slug="demo" evidenceRefresh={0} onSaved={onSaved} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("FindingsPanel documental", () => {
  beforeEach(() => {
    apiMocks.listFindings.mockResolvedValue({ items: [finding], total: 1 });
    apiMocks.listFindingDrafts.mockResolvedValue({ items: [] });
    apiMocks.listEvidence.mockResolvedValue({ items: [], total: 0 });
    apiMocks.getFinding.mockResolvedValue(finding);
    apiMocks.getFindingDraft.mockRejectedValue(new Error("finding_draft_not_found"));
    apiMocks.listFindingRevisions.mockResolvedValue({ items: revisions });
    apiMocks.getFindingLinks.mockResolvedValue({ outgoing: [], backlinks: [] });
    apiMocks.resolveEvidenceReferences.mockResolvedValue({ items: [] });
    apiMocks.suggestEvidenceReferences.mockResolvedValue({ items: [] });
    apiMocks.createFindingDraft.mockResolvedValue(draft);
    apiMocks.saveFindingDraft.mockImplementation(async (
      _slug: string,
      findingId: string,
      baseRevisionId: string | null,
      expectedVersion: number,
      payload: typeof draft,
    ) => ({
      ...draft,
      ...payload,
      id: `demo:${findingId}:alice`,
      finding_id: findingId,
      base_revision_id: baseRevisionId,
      version: expectedVersion + 1,
      updated_at: "2026-09-28T14:01:00Z",
      references: [],
    }));
    apiMocks.publishFindingDraft.mockResolvedValue({
      ...finding,
      id: draft.finding_id,
      title: "Falha documental",
      description: draft.description,
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("opens a legacy plain-text description in the three-area workspace and preserves the route", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /Controle de acesso ausente/ }));
    expect(await screen.findByDisplayValue("Controle de acesso ausente")).toBeInTheDocument();
    expect(screen.getByLabelText("Lista de findings")).toBeInTheDocument();
    expect(screen.getByLabelText("Propriedades do finding")).toBeInTheDocument();
    expect(screen.getByLabelText("Documento do finding: texto Markdown")).toHaveValue(finding.description);
    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("/offensive/projects/demo/findings?finding=finding-1"));

    await user.type(screen.getByLabelText("Buscar findings"), "painel");
    await user.selectOptions(screen.getByLabelText("Filtrar por severidade"), "high");
    await waitFor(() => expect(apiMocks.listFindings).toHaveBeenLastCalledWith(
      "demo", 0, 100, { q: "painel", severity: "high", phase: "" },
    ));
  });

  it("starts with the five-section template, autosaves privately and publishes explicitly", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    apiMocks.getFinding.mockImplementation(async (_slug: string, id: string) => {
      if (id === draft.finding_id) throw new Error("finding_not_found");
      return finding;
    });
    apiMocks.getFindingDraft.mockImplementation(async (_slug: string, id: string) => {
      if (id === draft.finding_id) return draft;
      throw new Error("finding_draft_not_found");
    });
    renderPanel(undefined, onSaved);

    await user.click(await screen.findByRole("button", { name: "Novo finding" }));
    const editor = await screen.findByLabelText("Documento do finding: texto Markdown");
    expect((editor as HTMLTextAreaElement).value).toContain("# Resumo");
    expect((editor as HTMLTextAreaElement).value).toContain("# Recomendação");
    await waitFor(() => expect(screen.getByLabelText("location")).toHaveTextContent("?finding=finding-new"));

    await user.type(screen.getByPlaceholderText("Título do finding"), "Falha documental");
    await waitFor(() => expect(apiMocks.saveFindingDraft).toHaveBeenCalledWith(
      "demo", "finding-new", null, 1,
      expect.objectContaining({ title: "Falha documental", severity: "medium", phase: "pre-engagement" }),
    ), { timeout: 2500 });
    expect(apiMocks.publishFindingDraft).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Publicar finding" }));
    await waitFor(() => expect(apiMocks.publishFindingDraft).toHaveBeenCalledWith("demo", "finding-new", 2));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("shows Markdown and property diffs as inert text", async () => {
    const user = userEvent.setup();
    const secondRevision = {
      ...revisions[0],
      id: "revision-2",
      number: 2,
      previous_revision_id: "revision-1",
      severity: "critical" as const,
      description: "Documento novo",
    };
    apiMocks.listFindingRevisions.mockResolvedValue({ items: [secondRevision, revisions[0]] });
    apiMocks.compareFindingRevisions.mockResolvedValue({
      base_revision_id: "revision-1",
      revision_id: "revision-2",
      document_diff: "-<img src=x onerror=alert(1)>\n+Documento novo",
      property_changes: { severity: { before: "high", after: "critical" } },
    });
    const { container } = renderPanel("/offensive/projects/demo/findings?finding=finding-1");

    await user.click(await screen.findByRole("button", { name: "Comparar" }));
    expect(await screen.findByLabelText("Comparação de revisões")).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(screen.getByLabelText("Comparação de revisões")).toHaveTextContent("Antes: \"high\" · Depois: \"critical\"");
    expect(container.querySelector("img")).toBeNull();
  });
});

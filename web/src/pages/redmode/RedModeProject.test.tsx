import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RedModeProject from "./RedModeProject";

const apiMocks = vi.hoisted(() => ({
  changeProjectMember: vi.fn(),
  changeProjectPhase: vi.fn(),
  changeProjectStatus: vi.fn(),
  confirmProjectIdentity: vi.fn(),
  getProject: vi.fn(),
  getProjectIdentity: vi.fn(),
  listProjectActivity: vi.fn(),
  rememberEngagement: vi.fn(),
  removeProjectIdentity: vi.fn(),
}));

vi.mock("./api", () => apiMocks);
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { username: "alice" } }),
}));
vi.mock("./ScopePanel", () => ({
  default: ({ readOnly }: { readOnly?: boolean }) => (
    <output aria-label="scope-read-only">{readOnly ? "yes" : "no"}</output>
  ),
}));
vi.mock("./EvidencePanel", () => ({
  default: ({ readOnly }: { readOnly?: boolean }) => (
    <output aria-label="evidence-read-only">{readOnly ? "yes" : "no"}</output>
  ),
  phaseLabel: (phase: string) => phase,
  ptesPhases: [["pre-engagement", "Pré-engagement"]],
}));
vi.mock("./FindingsPanel", () => ({
  default: ({ readOnly }: { readOnly?: boolean }) => (
    <output aria-label="findings-read-only">{readOnly ? "yes" : "no"}</output>
  ),
}));
vi.mock("./IdentityPanel", () => ({ default: () => null }));

const completedProject = {
  slug: "demo",
  display_name: "Cliente Demo",
  phase: "pre-engagement",
  status: "completed" as const,
  responsible: "alice",
  last_activity_at: "2026-09-28T12:00:00Z",
  completed_at: "2026-09-28T12:00:00Z",
  members: ["alice"],
  created_at: "2026-09-27T12:00:00Z",
};

const archivedProject = {
  ...completedProject,
  status: "archived" as const,
  completed_at: undefined,
  archived_at: "2026-09-28T13:00:00Z",
  last_activity_at: "2026-09-28T13:00:00Z",
};

function renderProject(path = "/redmode/engagements/demo/scope") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/redmode/engagements/:slug/:section?" element={<RedModeProject />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RedModeProject lifecycle", () => {
  beforeEach(() => {
    apiMocks.getProject.mockResolvedValue(completedProject);
    apiMocks.getProjectIdentity.mockResolvedValue({
      revision: 0,
      active_scope_version: null,
      confirmed: [],
      suggestions: [],
    });
    apiMocks.listProjectActivity.mockResolvedValue({ items: [] });
    apiMocks.rememberEngagement.mockResolvedValue(undefined);
    apiMocks.changeProjectStatus.mockResolvedValue(archivedProject);
  });

  it("keeps completed engagements editable and archives with optimistic state", async () => {
    const user = userEvent.setup();
    renderProject();

    expect(await screen.findByText("Engagement concluído")).toBeInTheDocument();
    expect(screen.getByLabelText("scope-read-only")).toHaveTextContent("no");
    await user.click(screen.getByRole("button", { name: "Arquivar" }));

    await waitFor(() => expect(apiMocks.changeProjectStatus).toHaveBeenCalledWith(
      "demo",
      "archived",
      "completed",
    ));
    expect(await screen.findByText("Engagement arquivado · somente leitura")).toBeInTheDocument();
    expect(screen.getByLabelText("scope-read-only")).toHaveTextContent("yes");
    expect(screen.getByRole("button", { name: "Reativar engagement" })).toBeInTheDocument();
  });

  it("labels a reactivation in plain language", async () => {
    apiMocks.getProject.mockResolvedValue(archivedProject);
    apiMocks.listProjectActivity.mockResolvedValue({ items: [{
      type: "status_changed",
      author: "alice",
      subject: "archived -> active",
      previous_status: "archived",
      new_status: "active",
      at: "2026-09-28T14:00:00Z",
    }] });
    renderProject("/redmode/engagements/demo/activity");

    expect(await screen.findByText("Engagement reativado")).toBeInTheDocument();
    expect(screen.getByText(/Arquivado → Ativo/)).toBeInTheDocument();
  });
});

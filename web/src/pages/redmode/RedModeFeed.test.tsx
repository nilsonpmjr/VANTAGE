import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RedModeFeed from "./RedModeFeed";
import type { ProjectSummary } from "./api";

const apiMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
}));

vi.mock("./api", () => apiMocks);
vi.mock("../../context/LanguageContext", () => ({
  useLanguage: () => ({
    language: "pt",
    locale: "pt-BR",
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

const sampleProjects: ProjectSummary[] = [
  {
    slug: "alpha-corp",
    display_name: "Alpha Corporation Red Team",
    phase: "reconnaissance",
    status: "active",
    responsible: "alice",
    created_at: "2026-09-19T12:00:00Z",
    last_activity_at: "2026-09-28T12:00:00Z",
    can_open: true,
  },
  {
    slug: "beta-bank",
    display_name: "Beta Bank Assessment",
    phase: "vulnerability-analysis",
    status: "completed",
    responsible: "bob",
    created_at: "2026-09-10T12:00:00Z",
    last_activity_at: "2026-09-24T12:00:00Z",
    can_open: false,
  },
];

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderFeed(initialEntry = "/redmode/engagements") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <RedModeFeed />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("RedModeFeed Portfolio (OM4-03)", () => {
  beforeEach(() => {
    apiMocks.listProjects.mockResolvedValue({
      items: sampleProjects,
      total: sampleProjects.length,
    });
    apiMocks.createProject.mockResolvedValue({
      ...sampleProjects[0],
      slug: "new-engagement",
      display_name: "New Engagement",
      members: ["alice"],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders engagements and distinguishes accessible vs restricted access projects", async () => {
    renderFeed();

    // Verify accessible project has "Abrir engagement" link
    expect(await screen.findByText("Alpha Corporation Red Team")).toBeInTheDocument();
    const openLink = screen.getByRole("link", { name: /Abrir engagement/i });
    expect(openLink).toHaveAttribute("href", "/redmode/engagements/alpha-corp");

    // Verify discoverable project without access has "Acesso restrito" and no link
    expect(screen.getByText("Beta Bank Assessment")).toBeInTheDocument();
    expect(screen.getByText("Acesso restrito")).toBeInTheDocument();
    expect(screen.getByText(/Requer associação ao projeto para abrir/i)).toBeInTheDocument();
  });

  it("filters by search term with debounce and synchronizes URL", async () => {
    const user = userEvent.setup();
    renderFeed();

    const searchInput = await screen.findByLabelText("Buscar engagements");
    await user.type(searchInput, "Beta");

    await waitFor(() => {
      expect(screen.getByLabelText("location")).toHaveTextContent("q=Beta");
    }, { timeout: 1500 });

    await waitFor(() => {
      expect(apiMocks.listProjects).toHaveBeenLastCalledWith(
        0,
        20,
        expect.objectContaining({ search: "Beta" }),
      );
    });
  });

  it("filters by access, status, and phase", async () => {
    const user = userEvent.setup();
    renderFeed();

    // Click "Meus projetos"
    await user.click(await screen.findByRole("button", { name: "Meus projetos" }));
    await waitFor(() => {
      expect(screen.getByLabelText("location")).toHaveTextContent("access=mine");
    });
    expect(apiMocks.listProjects).toHaveBeenLastCalledWith(
      0,
      20,
      expect.objectContaining({ access: "mine" }),
    );

    // Filter by status "Ativo"
    await user.selectOptions(screen.getByLabelText("Filtrar por estado"), "active");
    await waitFor(() => {
      expect(screen.getByLabelText("location")).toHaveTextContent("status=active");
    });

    // Active filters chips should be rendered
    expect(screen.getByText(/Filtros ativos:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Limpar filtros/ })).toBeInTheDocument();

    // Clicking "Limpar filtros" resets URL and query
    await user.click(screen.getByRole("button", { name: /Limpar filtros/ }));
    await waitFor(() => {
      expect(screen.getByLabelText("location")).toHaveTextContent("/redmode/engagements");
      expect(screen.getByLabelText("location")).not.toHaveTextContent("access=");
    });
  });

  it("displays custom empty state when active filters match nothing", async () => {
    apiMocks.listProjects.mockResolvedValue({ items: [], total: 0 });
    renderFeed("/redmode/engagements?q=NonExistent");

    expect(
      await screen.findByText("Nenhum engagement encontrado para os filtros selecionados"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Limpar filtros/ })).toHaveLength(2);
  });

  it("handles network errors with retry capability", async () => {
    apiMocks.listProjects.mockRejectedValue(new Error("network error"));
    renderFeed();

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os engagements.");
    const retryBtn = screen.getByRole("button", { name: "Tentar novamente" });
    expect(retryBtn).toBeInTheDocument();

    apiMocks.listProjects.mockResolvedValue({ items: sampleProjects, total: 2 });
    await userEvent.click(retryBtn);

    expect(await screen.findByText("Alpha Corporation Red Team")).toBeInTheDocument();
  });
});

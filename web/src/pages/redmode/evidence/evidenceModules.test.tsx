import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  extractTocEntries,
  slugifyHeadline,
  EvidenceTocPanel,
  EvidenceTableDialog,
  EvidenceLinkDialog,
  EvidenceRevisionDiffModal,
  EvidenceShortcutsModal,
  EvidenceTreeView,
  EvidenceSectionModal,
  EvidenceMoveModal,
  EvidenceImportModal,
  EvidenceBrokenLinksPanel,
} from "./index";
import type { EvidenceTreeNode, EvidenceBrokenLink } from "../api";

describe("LeafWiki Evidence Modules translated for RedMode", () => {
  describe("extractTocEntries & slugifyHeadline", () => {
    it("slugifies headlines cleanly removing markdown, accents and punctuation", () => {
      expect(slugifyHeadline("Validação de Vulnerabilidade")).toBe("validacao-de-vulnerabilidade");
      expect(slugifyHeadline("Teste #1 - Execução")).toBe("teste-1-execucao");
    });

    it("extracts H1, H2, and H3 while ignoring fenced code blocks and duplicates", () => {
      const markdown = `
# Introdução do Engagement

Texto inicial.

\`\`\`bash
# Isto é um comentário bash, não um heading
curl -s http://example.test
\`\`\`

## Escopo e Alvos
### Subdomínios Descobertos
## Escopo e Alvos
      `.trim();

      const entries = extractTocEntries(markdown);
      expect(entries).toHaveLength(4);
      expect(entries[0]).toEqual({
        level: 1,
        text: "Introdução do Engagement",
        id: "introducao-do-engagement",
      });
      expect(entries[1]).toEqual({
        level: 2,
        text: "Escopo e Alvos",
        id: "escopo-e-alvos",
      });
      expect(entries[2]).toEqual({
        level: 3,
        text: "Subdomínios Descobertos",
        id: "subdominios-descobertos",
      });
      expect(entries[3]).toEqual({
        level: 2,
        text: "Escopo e Alvos",
        id: "escopo-e-alvos-1",
      });
    });
  });

  describe("EvidenceTocPanel", () => {
    it("renders empty state when no headings exist", () => {
      render(<EvidenceTocPanel entries={[]} />);
      expect(screen.getByText("Nenhum título no documento")).toBeInTheDocument();
    });

    it("renders heading list and triggers selection callback", async () => {
      const onSelect = vi.fn();
      const entries = [
        { level: 1 as const, text: "Visão Geral", id: "visao-geral" },
        { level: 2 as const, text: "Metodologia", id: "metodologia" },
      ];
      render(<EvidenceTocPanel entries={entries} onSelectEntry={onSelect} />);

      expect(screen.getByText("Sumário (2)")).toBeInTheDocument();
      const button = screen.getByText("Visão Geral");
      await userEvent.click(button);
      expect(onSelect).toHaveBeenCalledWith(entries[0]);
    });
  });

  describe("EvidenceTableDialog", () => {
    it("generates markdown table based on row and column selection", async () => {
      const onInsert = vi.fn();
      const onClose = vi.fn();
      render(
        <EvidenceTableDialog
          isOpen={true}
          onClose={onClose}
          onInsertTable={onInsert}
        />
      );

      expect(screen.getByText("Inserir Tabela")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Inserir tabela" }));

      expect(onInsert).toHaveBeenCalledTimes(1);
      const generated = onInsert.mock.calls[0][0] as string;
      expect(generated).toContain("| Coluna 1 | Coluna 2 | Coluna 3 |");
      expect(generated).toContain("| --- | --- | --- |");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("EvidenceLinkDialog", () => {
    it("allows inserting external and internal links with suggestions", async () => {
      const onInsert = vi.fn();
      const onClose = vi.fn();
      const searchMock = vi.fn().mockResolvedValue([
        { key: "evidence:note-1", label: "Nota 1", type: "evidence", reference: "evidence:note-1" },
      ]);

      render(
        <EvidenceLinkDialog
          isOpen={true}
          onClose={onClose}
          initialText="Ver relatório"
          onInsertLink={onInsert}
          onSearchSuggestions={searchMock}
        />
      );

      const targetInput = screen.getByPlaceholderText("https://... ou digite para buscar notas");
      await userEvent.type(targetInput, "https://example.test");
      await userEvent.click(screen.getByRole("button", { name: "Inserir" }));

      expect(onInsert).toHaveBeenCalledWith("[Ver relatório](https://example.test)");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("EvidenceRevisionDiffModal", () => {
    it("computes diff and provides restore confirmation", async () => {
      const onRestore = vi.fn();
      const onClose = vi.fn();
      const revision = {
        id: "rev-1",
        note_id: "note-1",
        project_slug: "demo",
        number: 1,
        title: "Nota 1",
        phase: "reconnaissance",
        tags: [],
        targets: [],
        finding_ids: [],
        attachment_ids: [],
        previous_revision_id: null,
        author: "alice",
        created_at: "2026-09-28T12:00:00Z",
        markdown: "Linha original\nLinha antiga",
        attachments: [],
        references: [],
      };

      render(
        <EvidenceRevisionDiffModal
          isOpen={true}
          onClose={onClose}
          revision={revision}
          currentContent={"Linha original\nLinha modificada"}
          onRestoreRevision={onRestore}
        />
      );

      expect(screen.getByText("Comparação: Revisão #1 vs. Rascunho Atual")).toBeInTheDocument();
      expect(screen.getByText("Linha antiga")).toBeInTheDocument();
      expect(screen.getByText("Linha modificada")).toBeInTheDocument();

      // Click restore button
      await userEvent.click(screen.getByRole("button", { name: /Restaurar esta revisão no rascunho/ }));
      expect(screen.getByText(/Atenção: Substituir o rascunho atual/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /Sim, restaurar no rascunho/ }));
      expect(onRestore).toHaveBeenCalledWith(revision);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("EvidenceShortcutsModal", () => {
    it("renders keyboard shortcuts categorized", async () => {
      const onClose = vi.fn();
      render(<EvidenceShortcutsModal isOpen={true} onClose={onClose} />);

      expect(screen.getByText("Atalhos de Teclado")).toBeInTheDocument();
      expect(screen.getByText("Navegação e Espaço de Trabalho")).toBeInTheDocument();
      expect(screen.getByText("Documento e Versões")).toBeInTheDocument();
      expect(screen.getByText("Edição e Markdown Seguro")).toBeInTheDocument();

      const closeButtons = screen.getAllByRole("button", { name: "Fechar" });
      await userEvent.click(closeButtons[0]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("EvidenceTreeView", () => {
    const mockTree: EvidenceTreeNode[] = [
      {
        id: "folder-1",
        title: "Reconnaissance Folder",
        slug: "reconnaissance-folder",
        path: "reconnaissance-folder",
        kind: "section",
        parent_id: null,
        position: 1,
        pinned: false,
        favorite: false,
        phase: "reconnaissance",
        tags: [],
        target_count: 0,
        finding_count: 0,
        attachment_count: 0,
        updated_at: "2026-09-28T12:00:00Z",
        created_at: "2026-09-28T12:00:00Z",
        children: [
          {
            id: "note-1",
            title: "Nmap Scans",
            slug: "nmap-scans",
            path: "reconnaissance-folder/nmap-scans",
            kind: "page",
            parent_id: "folder-1",
            position: 1,
            pinned: true,
            favorite: true,
            phase: "reconnaissance",
            tags: [],
            target_count: 0,
            finding_count: 0,
            attachment_count: 0,
            updated_at: "2026-09-28T12:00:00Z",
            created_at: "2026-09-28T12:00:00Z",
            children: [],
          },
        ],
      },
      {
        id: "note-2",
        title: "Root Note",
        slug: "root-note",
        path: "root-note",
        kind: "page",
        parent_id: null,
        position: 2,
        pinned: false,
        favorite: false,
        phase: "initial-access",
        tags: [],
        target_count: 0,
        finding_count: 0,
        attachment_count: 0,
        updated_at: "2026-09-28T12:00:00Z",
        created_at: "2026-09-28T12:00:00Z",
        children: [],
      },
    ];

    it("renders folder and notes and handles note selection", async () => {
      const onSelectNote = vi.fn();
      const onCreateNote = vi.fn();
      const onCreateSection = vi.fn();
      const onTogglePin = vi.fn();
      const onToggleFavorite = vi.fn();
      const onMoveNote = vi.fn();
      const onCopyNote = vi.fn();
      const onExportNote = vi.fn();

      render(
        <EvidenceTreeView
          tree={mockTree}
          selectedNoteId={null}
          onSelectNote={onSelectNote}
          onCreateNote={onCreateNote}
          onCreateSection={onCreateSection}
          onTogglePin={onTogglePin}
          onToggleFavorite={onToggleFavorite}
          onMoveNote={onMoveNote}
          onCopyNote={onCopyNote}
          onExportNote={onExportNote}
        />
      );

      expect(screen.getByText("Reconnaissance Folder")).toBeInTheDocument();
      expect(screen.getByText("Root Note")).toBeInTheDocument();
      expect(screen.getAllByText("Nmap Scans").length).toBeGreaterThanOrEqual(1);

      // Click on Root Note
      await userEvent.click(screen.getByText("Root Note"));
      expect(onSelectNote).toHaveBeenCalledWith("note-2");
    });

    it("triggers favorite and pin actions from context menu", async () => {
      const onTogglePin = vi.fn();
      const onToggleFavorite = vi.fn();

      render(
        <EvidenceTreeView
          tree={mockTree}
          selectedNoteId="note-1"
          onSelectNote={vi.fn()}
          onCreateNote={vi.fn()}
          onCreateSection={vi.fn()}
          onTogglePin={onTogglePin}
          onToggleFavorite={onToggleFavorite}
          onMoveNote={vi.fn()}
          onCopyNote={vi.fn()}
          onExportNote={vi.fn()}
        />
      );

      // Open context menu for note-1
      const actionButtons = screen.getAllByTitle("Ações");
      expect(actionButtons.length).toBeGreaterThan(0);
      await userEvent.click(actionButtons[1]); // note-1 is index 1

      const unfavoriteButton = screen.getByText("Desfavoritar");
      await userEvent.click(unfavoriteButton);
      expect(onToggleFavorite).toHaveBeenCalledWith("note-1", false);

      // Open menu again for pin toggle
      await userEvent.click(actionButtons[1]);
      const unpinButton = screen.getByText("Desafixar");
      await userEvent.click(unpinButton);
      expect(onTogglePin).toHaveBeenCalledWith("note-1", false);
    });
  });

  describe("EvidenceSectionModal", () => {
    it("renders and submits section folder creation", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <EvidenceSectionModal
          isOpen={true}
          parentId="parent-1"
          onClose={onClose}
          onSubmit={onSubmit}
        />
      );

      expect(screen.getByText("Nova Pasta / Seção")).toBeInTheDocument();

      const input = screen.getByPlaceholderText(/Ex: Reconhecimento Externo/i);
      await userEvent.type(input, "02 - Exploração Web");

      const submitButton = screen.getByRole("button", { name: "Criar Pasta" });
      await userEvent.click(submitButton);

      expect(onSubmit).toHaveBeenCalledWith("02 - Exploração Web", "pre-engagement", "parent-1");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("EvidenceMoveModal", () => {
    it("renders available folder targets and submits move", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      const movingNode: EvidenceTreeNode = {
        id: "note-1",
        title: "Nota Alvo",
        slug: "nota-alvo",
        path: "nota-alvo",
        kind: "page",
        parent_id: null,
        position: 1,
        pinned: false,
        favorite: false,
        phase: "reconnaissance",
        tags: [],
        target_count: 0,
        finding_count: 0,
        attachment_count: 0,
        updated_at: "2026-09-28T12:00:00Z",
        created_at: "2026-09-28T12:00:00Z",
        children: [],
      };
      const tree: EvidenceTreeNode[] = [
        {
          id: "folder-target",
          title: "Pasta de Destino",
          slug: "pasta-de-destino",
          path: "pasta-de-destino",
          kind: "section",
          parent_id: null,
          position: 1,
          pinned: false,
          favorite: false,
          phase: "reconnaissance",
          tags: [],
          target_count: 0,
          finding_count: 0,
          attachment_count: 0,
          updated_at: "2026-09-28T12:00:00Z",
          created_at: "2026-09-28T12:00:00Z",
          children: [],
        },
      ];

      render(
        <EvidenceMoveModal
          isOpen={true}
          movingNode={movingNode}
          tree={tree}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      );

      expect(screen.getByText(/Mover.*Nota Alvo/i)).toBeInTheDocument();
      expect(screen.getByText("pasta-de-destino")).toBeInTheDocument();

      // Click on target folder
      await userEvent.click(screen.getByText("pasta-de-destino"));

      const submitButton = screen.getByRole("button", { name: "Confirmar Movimento" });
      await userEvent.click(submitButton);

      expect(onSubmit).toHaveBeenCalledWith("note-1", "folder-target");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("EvidenceImportModal", () => {
    it("accepts text input and triggers import", async () => {
      const onImport = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <EvidenceImportModal
          isOpen={true}
          onClose={onClose}
          onImport={onImport}
        />
      );

      expect(screen.getByText(/Importar Nota Markdown/i)).toBeInTheDocument();

      const textarea = screen.getByPlaceholderText(/title: Reconhecimento Web/i);
      await userEvent.type(textarea, "# Relatório Importado\nConteúdo aqui");

      const submitButton = screen.getByRole("button", { name: "Importar Nota" });
      await userEvent.click(submitButton);

      expect(onImport).toHaveBeenCalledWith("nota-importada.md", "# Relatório Importado\nConteúdo aqui");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("EvidenceBrokenLinksPanel", () => {
    it("renders broken links and navigates on click", async () => {
      const onRefresh = vi.fn();
      const onSelectNote = vi.fn();
      const brokenLinks: EvidenceBrokenLink[] = [
        {
          from_note_id: "note-1",
          from_title: "Escopo Principal",
          target: "Alvo Inexistente",
          raw_target: "Alvo Inexistente",
          snippet: "Ver [[Alvo Inexistente]] para mais detalhes",
          line: 14,
        },
      ];

      render(
        <EvidenceBrokenLinksPanel
          brokenLinks={brokenLinks}
          isLoading={false}
          onRefresh={onRefresh}
          onSelectNote={onSelectNote}
        />
      );

      expect(screen.getByText("Links Quebrados (1)")).toBeInTheDocument();
      expect(screen.getByText("[[Alvo Inexistente]]")).toBeInTheDocument();
      expect(screen.getByText("Escopo Principal")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Escopo Principal"));
      expect(onSelectNote).toHaveBeenCalledWith("note-1");

      const refreshButton = screen.getByTitle("Recarregar verificação");
      await userEvent.click(refreshButton);
      expect(onRefresh).toHaveBeenCalled();
    });
  });
});

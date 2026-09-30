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
} from "./index";

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
});

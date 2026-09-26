import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "./MarkdownEditor";

function renderEditor(overrides: Partial<React.ComponentProps<typeof MarkdownEditor>> = {}) {
  let currentValue = overrides.value ?? "texto inicial";
  const onChange = vi.fn((value: string) => { currentValue = value; });
  const result = render(
    <MemoryRouter>
      <MarkdownEditor
        value={currentValue}
        onChange={onChange}
        persistedValue="texto inicial"
        {...overrides}
      />
    </MemoryRouter>,
  );
  return { ...result, onChange };
}

describe("MarkdownEditor", () => {
  it("switches among edit, preview, and split without unmounting the source", async () => {
    const user = userEvent.setup();
    renderEditor({ initialMode: "edit" });
    const textarea = screen.getByLabelText("Documento Markdown: texto Markdown") as HTMLTextAreaElement;
    expect(textarea).toBeVisible();
    textarea.focus();
    fireEvent.select(textarea, { target: { selectionStart: 2, selectionEnd: 7 } });
    fireEvent.scroll(textarea, { target: { scrollTop: 32 } });

    await user.click(screen.getByRole("button", { name: "Prévia" }));
    expect(textarea.parentElement).toHaveClass("hidden");
    expect(screen.getByLabelText("Prévia do Markdown")).toHaveTextContent("texto inicial");

    await user.click(screen.getByRole("button", { name: "Lado a lado" }));
    expect(textarea.parentElement).not.toHaveClass("hidden");
    expect(screen.getByLabelText("Prévia do Markdown")).toBeVisible();
    await waitFor(() => {
      expect(textarea.selectionStart).toBe(2);
      expect(textarea.selectionEnd).toBe(7);
      expect(textarea.scrollTop).toBe(32);
    });
  });

  it("inserts Markdown syntax around the current selection", async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({ initialMode: "edit" });
    const textarea = screen.getByLabelText("Documento Markdown: texto Markdown") as HTMLTextAreaElement;
    fireEvent.select(textarea, { target: { selectionStart: 0, selectionEnd: 5 } });

    await user.click(screen.getByRole("button", { name: "Negrito (Ctrl+B)" }));
    expect(onChange).toHaveBeenLastCalledWith("**texto** inicial");
  });

  it("exposes dirty state and persistence callbacks", async () => {
    const user = userEvent.setup();
    const onPersist = vi.fn().mockResolvedValue(undefined);
    const onDirtyChange = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <MarkdownEditor
          value="texto alterado"
          persistedValue="texto inicial"
          onChange={() => {}}
          onPersist={onPersist}
          onDirtyChange={onDirtyChange}
          initialMode="edit"
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onPersist).toHaveBeenCalledWith("texto alterado");
    await waitFor(() => expect(screen.getByText("Conteúdo salvo")).toBeInTheDocument());

    rerender(
      <MemoryRouter>
        <MarkdownEditor
          value="texto alterado novamente"
          persistedValue="texto inicial"
          onChange={() => {}}
          onPersist={onPersist}
          initialMode="edit"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Alterações não salvas")).toBeInTheDocument();
  });

  it("reports persistence errors without discarding the document", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    renderEditor({
      value: "rascunho",
      persistedValue: "",
      initialMode: "edit",
      onPersist: vi.fn().mockRejectedValue(new Error("offline")),
      onError,
    });

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "offline" }));
    expect(screen.getByLabelText("Documento Markdown: texto Markdown")).toHaveValue("rascunho");
  });
});

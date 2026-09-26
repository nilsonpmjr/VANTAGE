import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Bold,
  Code2,
  Columns2,
  Eye,
  Heading2,
  Image,
  Italic,
  Link,
  List,
  ListChecks,
  Loader2,
  Pencil,
  Quote,
  Save,
  Table2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { MarkdownPreview } from "./MarkdownContent";

export type MarkdownEditorMode = "edit" | "preview" | "split";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  persistedValue?: string;
  onPersist?: (value: string) => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onError?: (error: Error | null) => void;
  error?: string | null;
  label?: string;
  placeholder?: string;
  initialMode?: MarkdownEditorMode;
  onModeChange?: (mode: MarkdownEditorMode) => void;
  disabled?: boolean;
  className?: string;
}

type Selection = { start: number; end: number; direction: "forward" | "backward" | "none" };

const MODE_OPTIONS: Array<{ mode: MarkdownEditorMode; label: string; icon: ReactNode }> = [
  { mode: "edit", label: "Editar", icon: <Pencil className="h-3.5 w-3.5" /> },
  { mode: "preview", label: "Prévia", icon: <Eye className="h-3.5 w-3.5" /> },
  { mode: "split", label: "Lado a lado", icon: <Columns2 className="h-3.5 w-3.5" /> },
];

function ToolbarButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      className="markdown-toolbar-button"
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function MarkdownEditor({
  value,
  onChange,
  persistedValue,
  onPersist,
  onDirtyChange,
  onError,
  error,
  label = "Documento Markdown",
  placeholder = "Escreva em Markdown...",
  initialMode = "split",
  onModeChange,
  disabled = false,
  className,
}: MarkdownEditorProps) {
  const sourceId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Selection>({ start: 0, end: 0, direction: "none" });
  const editorScrollRef = useRef(0);
  const previewScrollRef = useRef(0);
  const [mode, setMode] = useState<MarkdownEditorMode>(initialMode);
  const [persistedSnapshot, setPersistedSnapshot] = useState(persistedValue ?? value);
  const [saving, setSaving] = useState(false);
  const [persistError, setPersistError] = useState("");
  const dirty = value !== persistedSnapshot;
  const visibleError = error || persistError;

  useEffect(() => {
    if (persistedValue !== undefined) setPersistedSnapshot(persistedValue);
  }, [persistedValue]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function captureSelection() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    selectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      direction: textarea.selectionDirection,
    };
    editorScrollRef.current = textarea.scrollTop;
  }

  function restoreEditorState(focus = false) {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const selection = selectionRef.current;
      textarea.setSelectionRange(selection.start, selection.end, selection.direction);
      textarea.scrollTop = editorScrollRef.current;
      if (focus) textarea.focus();
    });
  }

  function chooseMode(nextMode: MarkdownEditorMode) {
    captureSelection();
    if (previewRef.current) previewScrollRef.current = previewRef.current.scrollTop;
    setMode(nextMode);
    onModeChange?.(nextMode);
    window.requestAnimationFrame(() => {
      if (previewRef.current) previewRef.current.scrollTop = previewScrollRef.current;
      if (nextMode !== "preview") restoreEditorState(false);
    });
  }

  function applyReplacement(replacement: string, selectionStart: number, selectionEnd: number) {
    onChange(replacement);
    selectionRef.current = { start: selectionStart, end: selectionEnd, direction: "none" };
    restoreEditorState(true);
  }

  function wrapSelection(before: string, after: string, fallback: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? selectionRef.current.start;
    const end = textarea?.selectionEnd ?? selectionRef.current.end;
    const selected = value.slice(start, end) || fallback;
    const replacement = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    const contentStart = start + before.length;
    applyReplacement(replacement, contentStart, contentStart + selected.length);
  }

  function prefixLines(prefix: string, fallback: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? selectionRef.current.start;
    const end = textarea?.selectionEnd ?? selectionRef.current.end;
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const selected = value.slice(lineStart, end) || fallback;
    const transformed = selected.split("\n").map((line) => `${prefix}${line}`).join("\n");
    const replacement = `${value.slice(0, lineStart)}${transformed}${value.slice(end)}`;
    applyReplacement(replacement, lineStart, lineStart + transformed.length);
  }

  function insertBlock(block: string, selectText?: string) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? selectionRef.current.start;
    const end = textarea?.selectionEnd ?? selectionRef.current.end;
    const leading = start > 0 && value[start - 1] !== "\n" ? "\n\n" : "";
    const trailing = end < value.length && value[end] !== "\n" ? "\n\n" : "";
    const inserted = `${leading}${block}${trailing}`;
    const replacement = `${value.slice(0, start)}${inserted}${value.slice(end)}`;
    const selectedOffset = selectText ? inserted.indexOf(selectText) : inserted.length;
    const selectionStart = start + Math.max(0, selectedOffset);
    applyReplacement(
      replacement,
      selectionStart,
      selectText ? selectionStart + selectText.length : selectionStart,
    );
  }

  async function persist() {
    if (!onPersist || !dirty || saving) return;
    setSaving(true);
    setPersistError("");
    onError?.(null);
    try {
      await onPersist(value);
      setPersistedSnapshot(value);
    } catch (cause) {
      const nextError = cause instanceof Error ? cause : new Error("markdown_persist_failed");
      setPersistError("Não foi possível salvar o documento.");
      onError?.(nextError);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier) return;
    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      void persist();
    } else if (key === "b") {
      event.preventDefault();
      wrapSelection("**", "**", "texto em negrito");
    } else if (key === "i") {
      event.preventDefault();
      wrapSelection("_", "_", "texto em itálico");
    } else if (key === "k") {
      event.preventDefault();
      wrapSelection("[", "](https://example.com)", "texto do link");
    }
  }

  const editorPanelClass = mode === "preview" ? "hidden" : "block";
  const previewPanelClass = mode === "edit" ? "hidden" : "block";
  const panelGridClass = mode === "split" ? "md:grid-cols-2" : "grid-cols-1";
  const status = useMemo(() => {
    if (saving) return "Salvando...";
    return dirty ? "Alterações não salvas" : "Conteúdo salvo";
  }, [dirty, saving]);

  return (
    <section className={cn("markdown-editor-shell", className)} aria-label={label}>
      <div className="markdown-editor-header">
        <div className="nav-pills" aria-label="Modo do editor">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              className={cn(
                "nav-pill-item inline-flex items-center gap-2",
                mode === option.mode ? "nav-pill-item-active" : "nav-pill-item-inactive",
              )}
              aria-pressed={mode === option.mode}
              onClick={() => chooseMode(option.mode)}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("text-xs", dirty ? "text-amber-600" : "text-on-surface-variant")}>{status}</span>
          {onPersist && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={disabled || !dirty || saving}
              onClick={() => void persist()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </button>
          )}
        </div>
      </div>

      {mode !== "preview" && (
        <div className="markdown-toolbar" role="toolbar" aria-label="Formatação Markdown">
          <ToolbarButton label="Negrito" shortcut="Ctrl+B" disabled={disabled} onClick={() => wrapSelection("**", "**", "texto em negrito")}><Bold className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Itálico" shortcut="Ctrl+I" disabled={disabled} onClick={() => wrapSelection("_", "_", "texto em itálico")}><Italic className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Título" disabled={disabled} onClick={() => prefixLines("## ", "Título")}><Heading2 className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Lista" disabled={disabled} onClick={() => prefixLines("- ", "item")}><List className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Lista de tarefas" disabled={disabled} onClick={() => prefixLines("- [ ] ", "tarefa")}><ListChecks className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Citação" disabled={disabled} onClick={() => prefixLines("> ", "citação")}><Quote className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Bloco de código" disabled={disabled} onClick={() => insertBlock("```text\ncódigo\n```", "código")}><Code2 className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Link" shortcut="Ctrl+K" disabled={disabled} onClick={() => wrapSelection("[", "](https://example.com)", "texto do link")}><Link className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Imagem autenticada" disabled={disabled} onClick={() => insertBlock("![descrição](/api/caminho-da-imagem)", "/api/caminho-da-imagem")}><Image className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Tabela" disabled={disabled} onClick={() => insertBlock("| Campo | Valor |\n| --- | --- |\n| item | detalhe |", "Campo")}><Table2 className="h-4 w-4" /></ToolbarButton>
        </div>
      )}

      <div className={cn("grid min-w-0", panelGridClass)}>
        <div className={cn(editorPanelClass, "min-w-0")}>
          <label htmlFor={sourceId} className="sr-only">{label}: texto Markdown</label>
          <textarea
            ref={textareaRef}
            id={sourceId}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            spellCheck
            className="markdown-editor-textarea"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onSelect={captureSelection}
            onBlur={captureSelection}
            onScroll={(event) => { editorScrollRef.current = event.currentTarget.scrollTop; }}
          />
        </div>
        <div
          ref={previewRef}
          className={cn(previewPanelClass, "markdown-preview-panel min-w-0")}
          onScroll={(event) => { previewScrollRef.current = event.currentTarget.scrollTop; }}
        >
          <MarkdownPreview markdown={value} />
        </div>
      </div>
      {visibleError && <p className="border-t border-error/20 bg-error/5 px-4 py-2 text-xs text-error" role="alert">{visibleError}</p>}
    </section>
  );
}

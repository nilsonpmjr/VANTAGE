import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link2, X, ExternalLink, FileText, Flag } from "lucide-react";

export interface LinkTargetSuggestion {
  key: string;
  label: string;
  type: "evidence" | "finding" | "target" | "source";
  reference: string;
}

interface EvidenceLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialText?: string;
  onInsertLink: (markdown: string) => void;
  onSearchSuggestions?: (query: string) => Promise<LinkTargetSuggestion[]>;
}

/**
 * Assistente para Inserção de Links e Wikilinks Internos.
 * Traduzido e adaptado de LeafWiki (`features/editor/LinkInsertDialog.tsx`).
 */
export function EvidenceLinkDialog({
  isOpen,
  onClose,
  initialText = "",
  onInsertLink,
  onSearchSuggestions,
}: EvidenceLinkDialogProps) {
  const [text, setText] = useState(initialText);
  const [target, setTarget] = useState("");
  const [suggestions, setSuggestions] = useState<LinkTargetSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const textInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setText(initialText);
    setTarget("");
    setSuggestions([]);
    setSelectedIndex(0);

    const frame = requestAnimationFrame(() => {
      if (initialText) {
        targetInputRef.current?.focus();
      } else {
        textInputRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [initialText, isOpen]);

  useEffect(() => {
    if (!isOpen || !onSearchSuggestions || !target.trim() || target.startsWith("http://") || target.startsWith("https://")) {
      setSuggestions([]);
      return;
    }

    let isCurrent = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void onSearchSuggestions(target.trim())
        .then((items) => {
          if (isCurrent) {
            setSuggestions(items.slice(0, 8));
            setSelectedIndex(0);
          }
        })
        .finally(() => {
          if (isCurrent) setLoading(false);
        });
    }, 150);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [isOpen, onSearchSuggestions, target]);

  if (!isOpen) return null;

  function handleSelectSuggestion(suggestion: LinkTargetSuggestion) {
    const label = text.trim() || suggestion.label;
    const md = `[[${suggestion.reference}|${label}]]`;
    onInsertLink(md);
    onClose();
  }

  function handleConfirm() {
    const trimmedTarget = target.trim();
    const trimmedText = text.trim() || trimmedTarget;
    if (!trimmedTarget) return;

    let md = "";
    if (trimmedTarget.startsWith("http://") || trimmedTarget.startsWith("https://")) {
      md = `[${trimmedText}](${trimmedTarget})`;
    } else if (trimmedTarget.startsWith("[[") && trimmedTarget.endsWith("]]")) {
      md = trimmedTarget;
    } else {
      // Default to typed internal wikilink
      md = `[[${trimmedTarget}|${trimmedText}]]`;
    }

    onInsertLink(md);
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0 && selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSelectSuggestion(suggestions[selectedIndex]);
      } else {
        handleConfirm();
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Inserir link no documento"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-outline-variant/40 bg-surface shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-4 py-3 bg-surface-container-low">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-on-surface">Inserir Link</h3>
          </div>
          <button
            type="button"
            className="btn btn-ghost p-1 text-on-surface-variant hover:text-on-surface"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <div>
            <label className="text-[11px] font-medium text-on-surface-variant block mb-1">
              Texto exibido (opcional)
            </label>
            <input
              ref={textInputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex: Validação do serviço"
              className="input input-sm w-full"
              onKeyDown={handleKeyDown}
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-on-surface-variant block mb-1">
              Destino do link (URL externa ou nome de nota/finding)
            </label>
            <input
              ref={targetInputRef}
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="https://... ou digite para buscar notas"
              className="input input-sm w-full"
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Autocomplete suggestions */}
          {suggestions.length > 0 && (
            <div className="rounded-md border border-outline-variant/30 bg-surface-container-lowest max-h-40 overflow-y-auto p-1">
              <p className="px-2 py-1 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                Sugestões no Engagement:
              </p>
              {suggestions.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left transition ${
                      isSelected ? "bg-primary text-on-primary font-medium" : "hover:bg-surface-container-high text-on-surface"
                    }`}
                    onClick={() => handleSelectSuggestion(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {item.type === "finding" ? (
                        <Flag className="h-3 w-3 shrink-0 text-rose-500" />
                      ) : (
                        <FileText className="h-3 w-3 shrink-0 text-primary" />
                      )}
                      <span className="truncate">{item.label}</span>
                    </div>
                    <span className="text-[10px] opacity-70 shrink-0 uppercase tracking-wider">{item.type}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-outline-variant/10 px-4 py-3 bg-surface-container-lowest flex justify-end gap-2">
          <button type="button" className="btn btn-outline py-1 px-3 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary py-1 px-3 text-xs"
            disabled={!target.trim()}
            onClick={handleConfirm}
          >
            Inserir
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search, FileText, Flag, Edit3, X, CornerDownLeft } from "lucide-react";

export interface QuickSwitcherItem {
  id: string;
  title: string;
  type: "evidence" | "draft" | "finding";
  phase?: string;
  author?: string;
  excerpt?: string;
}

interface EvidenceQuickSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: QuickSwitcherItem) => void;
  items: QuickSwitcherItem[];
}

/**
 * Alternador Rápido de Documentos (`Ctrl+O` / `Cmd+O`).
 * Traduzido e adaptado de LeafWiki (`features/page-switcher/PageQuickSwitcherDialog.tsx`).
 */
export function EvidenceQuickSwitcher({
  isOpen,
  onClose,
  onSelect,
  items,
}: EvidenceQuickSwitcherProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 25);
    return items
      .filter((item) => {
        return (
          item.title.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          (item.phase && item.phase.toLowerCase().includes(q)) ||
          (item.excerpt && item.excerpt.toLowerCase().includes(q))
        );
      })
      .slice(0, 30);
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const activeEl = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen]);

  if (!isOpen) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredItems.length > 0) {
        setActiveIndex((prev) => (prev + 1) % filteredItems.length);
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredItems.length > 0) {
        setActiveIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = filteredItems[activeIndex];
      if (selected) {
        onSelect(selected);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-16 sm:pt-24 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Alternador rápido de notas"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-outline-variant/40 bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-outline-variant/20 px-4 py-3 bg-surface-container-low">
          <Search className="h-5 w-5 text-on-surface-variant shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-hidden"
            placeholder="Abrir nota por título, fase ou tag"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Buscar documento no alternador rápido"
          />
          {query && (
            <button
              type="button"
              className="btn btn-ghost p-1 text-on-surface-variant hover:text-on-surface"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 rounded border border-outline-variant/30 px-1.5 py-0.5 text-[10px] font-mono text-on-surface-variant">
            ESC fechar
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-on-surface-variant">
              Nenhum documento encontrado para "{query}".
            </div>
          ) : (
            <ul ref={listRef} className="space-y-1" role="listbox">
              {filteredItems.map((item, index) => {
                const isActive = index === activeIndex;
                return (
                  <li
                    key={`${item.type}:${item.id}`}
                    role="option"
                    aria-selected={isActive}
                    className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm cursor-pointer transition ${
                      isActive
                        ? "bg-primary text-on-primary font-medium"
                        : "text-on-surface hover:bg-surface-container-high"
                    }`}
                    onClick={() => onSelect(item)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.type === "draft" ? (
                        <Edit3 className={`h-4 w-4 shrink-0 ${isActive ? "text-on-primary" : "text-amber-500"}`} />
                      ) : item.type === "finding" ? (
                        <Flag className={`h-4 w-4 shrink-0 ${isActive ? "text-on-primary" : "text-rose-500"}`} />
                      ) : (
                        <FileText className={`h-4 w-4 shrink-0 ${isActive ? "text-on-primary" : "text-primary"}`} />
                      )}
                      <div className="truncate">
                        <span className="truncate">{item.title || "Sem título"}</span>
                        {item.excerpt && (
                          <p className={`text-xs truncate ${isActive ? "text-on-primary/80" : "text-on-surface-variant"}`}>
                            {item.excerpt}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                          isActive
                            ? "bg-on-primary/20 text-on-primary"
                            : item.type === "draft"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : item.type === "finding"
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                            : "bg-surface-container-highest text-on-surface-variant"
                        }`}
                      >
                        {item.type === "draft" ? "Rascunho" : item.type === "finding" ? "Finding" : "Evidência"}
                      </span>
                      {isActive && <CornerDownLeft className="h-3.5 w-3.5 text-on-primary opacity-80" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-outline-variant/10 px-3 py-2 bg-surface-container-lowest text-[11px] text-on-surface-variant flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>↑↓ navegar</span>
            <span>↵ selecionar</span>
          </div>
          <span>{filteredItems.length} resultado{filteredItems.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}

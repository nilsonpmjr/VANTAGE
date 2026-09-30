import { AlignLeft, Hash } from "lucide-react";
import type { TocEntry } from "./extractTocEntries";

interface EvidenceTocPanelProps {
  entries: TocEntry[];
  onSelectEntry?: (entry: TocEntry) => void;
}

/**
 * Painel de Sumário / Índice Dinâmico (TOC) para o Caderno de Evidências.
 * Traduzido e adaptado de LeafWiki (`features/preview/TocSidePanel.tsx`).
 */
export function EvidenceTocPanel({ entries, onSelectEntry }: EvidenceTocPanelProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-on-surface-variant">
        <AlignLeft className="mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm font-semibold text-on-surface">Nenhum título no documento</p>
        <p className="mt-1 text-xs max-w-[240px]">
          Adicione títulos usando <code># Título</code>, <code>## Subtítulo</code> ou <code>### Seção</code> no Markdown para gerar o sumário automático.
        </p>
      </div>
    );
  }

  return (
    <nav className="p-3 text-xs" aria-label="Sumário da nota de evidência">
      <div className="mb-3 flex items-center justify-between border-b border-outline-variant/20 pb-2">
        <span className="font-bold text-on-surface flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
          <AlignLeft className="h-3.5 w-3.5 text-primary" /> Sumário ({entries.length})
        </span>
      </div>

      <ul className="space-y-1">
        {entries.map((entry) => {
          const indent =
            entry.level === 1 ? "" : entry.level === 2 ? "pl-3.5 border-l border-outline-variant/30" : "pl-6 border-l border-outline-variant/20";
          return (
            <li key={entry.id} className={indent}>
              <button
                type="button"
                className="group flex w-full items-start gap-1.5 rounded-sm px-2 py-1 text-left transition hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                onClick={() => onSelectEntry?.(entry)}
                title={`Ir para ${entry.text}`}
              >
                <Hash className="mt-0.5 h-3 w-3 shrink-0 text-outline group-hover:text-primary transition-colors" />
                <span className={`truncate ${entry.level === 1 ? "font-semibold text-on-surface" : entry.level === 2 ? "font-medium" : "text-xs"}`}>
                  {entry.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

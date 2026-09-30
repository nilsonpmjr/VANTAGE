import { useState } from "react";
import { Table, X } from "lucide-react";

interface EvidenceTableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertTable: (markdown: string) => void;
}

/**
 * Gerador e Inseridor de Tabelas Markdown.
 * Traduzido e adaptado de LeafWiki (`features/editor/MarkdownToolbar.tsx` - buildTableMarkdown).
 */
export function EvidenceTableDialog({
  isOpen,
  onClose,
  onInsertTable,
}: EvidenceTableDialogProps) {
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(3);
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [hoverGrid, setHoverGrid] = useState<{ r: number; c: number } | null>(null);

  if (!isOpen) return null;

  function buildMarkdownTable(c: number, r: number, headers: boolean): string {
    const colCount = Math.max(1, Math.min(12, c));
    const rowCount = Math.max(1, Math.min(50, r));

    const lines: string[] = [];
    if (headers) {
      lines.push("| " + Array.from({ length: colCount }, (_, i) => `Coluna ${i + 1}`).join(" | ") + " |");
      lines.push("| " + Array.from({ length: colCount }, () => "---").join(" | ") + " |");
    }

    for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
      lines.push("| " + Array.from({ length: colCount }, () => "   ").join(" | ") + " |");
    }

    return lines.join("\n") + "\n\n";
  }

  function handleConfirm() {
    const finalCols = hoverGrid ? hoverGrid.c : cols;
    const finalRows = hoverGrid ? hoverGrid.r : rows;
    const md = buildMarkdownTable(finalCols, finalRows, includeHeaders);
    onInsertTable(md);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Inserir tabela Markdown"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-outline-variant/40 bg-surface shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-4 py-3 bg-surface-container-low">
          <div className="flex items-center gap-2">
            <Table className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-on-surface">Inserir Tabela</h3>
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

        <div className="p-4 space-y-4 text-xs">
          {/* Interactive grid hover selector (LeafWiki style) */}
          <div className="flex flex-col items-center">
            <p className="text-[11px] text-on-surface-variant mb-2 font-medium">
              Selecione o tamanho: <strong>{hoverGrid ? `${hoverGrid.c} × ${hoverGrid.r}` : `${cols} × ${rows}`}</strong>
            </p>
            <div
              className="grid grid-cols-6 gap-1 p-2 bg-surface-container-lowest rounded border border-outline-variant/30"
              onMouseLeave={() => setHoverGrid(null)}
            >
              {Array.from({ length: 36 }).map((_, i) => {
                const r = Math.floor(i / 6) + 1;
                const c = (i % 6) + 1;
                const active = hoverGrid ? c <= hoverGrid.c && r <= hoverGrid.r : c <= cols && r <= rows;
                return (
                  <button
                    key={i}
                    type="button"
                    className={`h-5 w-5 rounded-xs border transition ${
                      active
                        ? "border-primary bg-primary/30"
                        : "border-outline-variant/30 hover:border-outline"
                    }`}
                    onMouseEnter={() => setHoverGrid({ r, c })}
                    onClick={() => {
                      setCols(c);
                      setRows(r);
                      setHoverGrid(null);
                    }}
                    aria-label={`${c} colunas por ${r} linhas`}
                  />
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-outline-variant/10">
            <div>
              <label className="text-[11px] font-medium text-on-surface-variant">Colunas</label>
              <input
                type="number"
                min={1}
                max={12}
                value={cols}
                onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))}
                className="input input-sm w-full mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-on-surface-variant">Linhas</label>
              <input
                type="number"
                min={1}
                max={50}
                value={rows}
                onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))}
                className="input input-sm w-full mt-1"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={includeHeaders}
              onChange={(e) => setIncludeHeaders(e.target.checked)}
              className="checkbox checkbox-sm"
            />
            <span className="text-on-surface">Incluir cabeçalho na primeira linha</span>
          </label>
        </div>

        <div className="border-t border-outline-variant/10 px-4 py-3 bg-surface-container-lowest flex justify-end gap-2">
          <button type="button" className="btn btn-outline py-1 px-3 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary py-1 px-3 text-xs" onClick={handleConfirm}>
            Inserir tabela
          </button>
        </div>
      </div>
    </div>
  );
}

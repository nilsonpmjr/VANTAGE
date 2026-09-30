import { useMemo, useState } from "react";
import { GitCompare, RotateCcw, X, AlertTriangle, Check } from "lucide-react";
import type { EvidenceRevision } from "../api";

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  text: string;
}

function computeSimpleDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const diff: DiffLine[] = [];

  // Simple LCS-based or line-matching diff
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length && newIdx < newLines.length) {
    if (oldLines[oldIdx] === newLines[newIdx]) {
      diff.push({ type: "unchanged", text: oldLines[oldIdx] });
      oldIdx++;
      newIdx++;
    } else {
      // Lookahead to find match
      const nextMatchInNew = newLines.indexOf(oldLines[oldIdx], newIdx);
      const nextMatchInOld = oldLines.indexOf(newLines[newIdx], oldIdx);

      if (nextMatchInNew !== -1 && (nextMatchInOld === -1 || nextMatchInNew - newIdx <= nextMatchInOld - oldIdx)) {
        while (newIdx < nextMatchInNew) {
          diff.push({ type: "added", text: newLines[newIdx] });
          newIdx++;
        }
      } else if (nextMatchInOld !== -1) {
        while (oldIdx < nextMatchInOld) {
          diff.push({ type: "removed", text: oldLines[oldIdx] });
          oldIdx++;
        }
      } else {
        diff.push({ type: "removed", text: oldLines[oldIdx] });
        diff.push({ type: "added", text: newLines[newIdx] });
        oldIdx++;
        newIdx++;
      }
    }
  }

  while (oldIdx < oldLines.length) {
    diff.push({ type: "removed", text: oldLines[oldIdx] });
    oldIdx++;
  }

  while (newIdx < newLines.length) {
    diff.push({ type: "added", text: newLines[newIdx] });
    newIdx++;
  }

  return diff;
}

interface EvidenceRevisionDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  revision: EvidenceRevision | null;
  currentContent: string;
  onRestoreRevision: (revision: EvidenceRevision) => void;
}

/**
 * Modal de Comparação e Restauração de Revisões com Diff Visual.
 * Traduzido e adaptado de LeafWiki (`features/history/RestoreRevisionDialog.tsx` & `PageHistoryContent.tsx`).
 */
export function EvidenceRevisionDiffModal({
  isOpen,
  onClose,
  revision,
  currentContent,
  onRestoreRevision,
}: EvidenceRevisionDiffModalProps) {
  const [confirmingRestore, setConfirmingRestore] = useState(false);

  const diffLines = useMemo(() => {
    if (!revision) return [];
    return computeSimpleDiff(revision.markdown, currentContent);
  }, [revision, currentContent]);

  if (!isOpen || !revision) return null;

  function handleConfirmRestore() {
    if (!revision) return;
    onRestoreRevision(revision);
    setConfirmingRestore(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={`Comparação da Revisão ${revision.number}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-lg border border-outline-variant/40 bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-3.5 bg-surface-container-low">
          <div className="flex items-center gap-3">
            <GitCompare className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-sm font-bold text-on-surface">
                Comparação: Revisão #{revision.number} vs. Rascunho Atual
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                Por {revision.author} em {new Date(revision.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
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

        {confirmingRestore ? (
          <div className="p-6 bg-amber-500/10 border-b border-amber-500/20 text-xs text-on-surface space-y-3">
            <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 font-bold">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Atenção: Substituir o rascunho atual pelo conteúdo da Revisão #{revision.number}?</span>
            </div>
            <p className="text-on-surface-variant">
              O conteúdo do seu rascunho de trabalho será sobrescrito com esta revisão. Você poderá revisar as alterações antes de publicar novamente.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                className="btn btn-outline py-1 px-3 text-xs"
                onClick={() => setConfirmingRestore(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary py-1 px-3 text-xs flex items-center gap-1.5"
                onClick={handleConfirmRestore}
              >
                <Check className="h-3.5 w-3.5" /> Sim, restaurar no rascunho
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-4 bg-surface-container-lowest font-mono text-xs">
          <div className="mb-3 flex items-center gap-4 text-[11px] text-on-surface-variant border-b border-outline-variant/10 pb-2">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-xs bg-rose-500/20 text-rose-600 border border-rose-500/30 text-center font-bold leading-3">-</span>
              Conteúdo da Revisão #{revision.number}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-xs bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 text-center font-bold leading-3">+</span>
              Conteúdo do Rascunho Atual
            </span>
          </div>

          <div className="rounded border border-outline-variant/20 overflow-hidden divide-y divide-outline-variant/5">
            {diffLines.map((line, idx) => (
              <div
                key={idx}
                className={`flex items-start px-3 py-1 ${
                  line.type === "added"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : line.type === "removed"
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                    : "text-on-surface/90"
                }`}
              >
                <span className="w-5 shrink-0 select-none opacity-50 font-bold">
                  {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                </span>
                <span className="whitespace-pre-wrap break-all flex-1">{line.text || "\u00A0"}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-outline-variant/10 px-5 py-3 bg-surface-container-low flex justify-between items-center">
          <button
            type="button"
            className="btn btn-outline py-1 px-3 text-xs flex items-center gap-1.5"
            onClick={() => setConfirmingRestore(true)}
          >
            <RotateCcw className="h-3.5 w-3.5 text-primary" /> Restaurar esta revisão no rascunho
          </button>
          <button type="button" className="btn btn-outline py-1 px-4 text-xs" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

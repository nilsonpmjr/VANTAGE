import React from "react";
import { AlertTriangle, ArrowRight, RefreshCw, FileText } from "lucide-react";
import type { EvidenceBrokenLink } from "../api";

export interface EvidenceBrokenLinksPanelProps {
  brokenLinks: EvidenceBrokenLink[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectNote: (noteId: string) => void;
}

export const EvidenceBrokenLinksPanel: React.FC<EvidenceBrokenLinksPanelProps> = ({
  brokenLinks,
  isLoading,
  onRefresh,
  onSelectNote,
}) => {
  return (
    <div className="flex flex-col h-full bg-slate-950 p-3 space-y-3 text-slate-200">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-xs">
            Links Quebrados ({brokenLinks.length})
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
          title="Recarregar verificação"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <p className="text-[11px] text-slate-400">
        Detecta referências e wikilinks para notas inexistentes ou alvos removidos.
      </p>

      {brokenLinks.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 bg-slate-900/40 rounded border border-slate-800/80">
          Nenhum link quebrado encontrado no caderno de evidências.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {brokenLinks.map((item, idx) => (
            <div
              key={`${item.from_note_id}-${item.target}-${idx}`}
              className="p-2.5 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onSelectNote(item.from_note_id)}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-300 hover:underline text-left truncate max-w-[70%]"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="truncate">{item.from_title}</span>
                </button>
                <span className="text-[10px] text-slate-500 font-mono">
                  Linha {item.line}
                </span>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-amber-300 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20 font-mono break-all">
                <ArrowRight className="w-3 h-3 flex-shrink-0" />
                <span>[[{item.raw_target || item.target}]]</span>
              </div>

              {item.snippet && (
                <div className="text-[10px] text-slate-400 italic bg-slate-950/70 p-1.5 rounded truncate">
                  &ldquo;{item.snippet}&rdquo;
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

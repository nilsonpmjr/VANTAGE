import React, { useState } from "react";
import { Folder, X } from "lucide-react";

export interface EvidenceSectionModalProps {
  isOpen: boolean;
  parentId?: string | null;
  onClose: () => void;
  onSubmit: (title: string, phase: string, parentId?: string | null) => Promise<void>;
}

export const EvidenceSectionModal: React.FC<EvidenceSectionModalProps> = ({
  isOpen,
  parentId,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState("pre-engagement");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(title.trim(), phase, parentId);
      setTitle("");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-md overflow-hidden text-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-sm">Nova Pasta / Seção</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Título da Pasta
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Reconhecimento Externo"
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Fase PTES Associada
            </label>
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-red-500"
            >
              <option value="pre-engagement">Pré-Engajamento</option>
              <option value="intelligence-gathering">Coleta de Inteligência (OSINT)</option>
              <option value="threat-modeling">Modelagem de Ameaças</option>
              <option value="vulnerability-analysis">Análise de Vulnerabilidades</option>
              <option value="exploitation">Exploração</option>
              <option value="post-exploitation">Pós-Exploração</option>
              <option value="reporting">Relatório</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 rounded"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="px-4 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded disabled:opacity-50"
            >
              {isSubmitting ? "Criando..." : "Criar Pasta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

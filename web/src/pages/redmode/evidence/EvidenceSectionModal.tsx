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
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-on-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant/20 bg-surface-container-high px-4 py-3 text-on-surface">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-sm">Nova Pasta / Seção</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">
              Título da Pasta
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Reconhecimento Externo"
              className="w-full rounded-sm border border-outline-variant/30 bg-surface px-3 py-1.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus-visible:outline-2 focus-visible:outline-primary transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">
              Fase PTES Associada
            </label>
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value)}
              className="w-full rounded-sm border border-outline-variant/30 bg-surface px-3 py-1.5 text-sm text-on-surface focus-visible:outline-2 focus-visible:outline-primary transition-colors"
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

          <div className="flex justify-end gap-2 pt-3 border-t border-outline-variant/20">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="btn btn-primary px-4 py-1.5 text-xs font-medium"
            >
              {isSubmitting ? "Criando..." : "Criar Pasta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

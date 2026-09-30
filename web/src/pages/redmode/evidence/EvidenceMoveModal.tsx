import React, { useState } from "react";
import { Move, Folder, X } from "lucide-react";
import type { EvidenceTreeNode } from "../api";

export interface EvidenceMoveModalProps {
  isOpen: boolean;
  movingNode: EvidenceTreeNode | null;
  tree: EvidenceTreeNode[];
  onClose: () => void;
  onSubmit: (nodeId: string, targetParentId: string | null) => Promise<void>;
}

export const EvidenceMoveModal: React.FC<EvidenceMoveModalProps> = ({
  isOpen,
  movingNode,
  tree,
  onClose,
  onSubmit,
}) => {
  const [targetParentId, setTargetParentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !movingNode) return null;

  // Flatten all available section folders, excluding the moving node and its children
  const getAvailableFolders = (
    nodes: EvidenceTreeNode[],
  ): Array<{ id: string; title: string; path: string }> => {
    const folders: Array<{ id: string; title: string; path: string }> = [];
    const traverse = (items: EvidenceTreeNode[]) => {
      for (const item of items) {
        if (item.id === movingNode.id) continue;
        if (item.kind === "section") {
          folders.push({
            id: item.id,
            title: item.title,
            path: item.path || item.title,
          });
          traverse(item.children);
        }
      }
    };
    traverse(nodes);
    return folders;
  };

  const availableFolders = getAvailableFolders(tree);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(movingNode.id, targetParentId);
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
            <Move className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">
              Mover &ldquo;{movingNode.title}&rdquo;
            </span>
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
              Destino
            </label>
            <div className="space-y-1 max-h-60 overflow-y-auto bg-surface-container-low border border-outline-variant/20 rounded p-2 text-xs">
              <label
                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                  targetParentId === null
                    ? "bg-primary/10 text-primary border border-primary/30 font-medium"
                    : "text-on-surface hover:bg-surface-container-high"
                }`}
              >
                <input
                  type="radio"
                  name="targetParent"
                  checked={targetParentId === null}
                  onChange={() => setTargetParentId(null)}
                  className="hidden"
                />
                <Folder className="w-3.5 h-3.5 text-on-surface-variant" />
                <span className="font-medium">Raiz (Sem pasta pai)</span>
              </label>

              {availableFolders.map((folder) => (
                <label
                  key={folder.id}
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                    targetParentId === folder.id
                      ? "bg-primary/10 text-primary border border-primary/30 font-medium"
                      : "text-on-surface hover:bg-surface-container-high"
                  }`}
                >
                  <input
                    type="radio"
                    name="targetParent"
                    checked={targetParentId === folder.id}
                    onChange={() => setTargetParentId(folder.id)}
                    className="hidden"
                  />
                  <Folder className="w-3.5 h-3.5 text-amber-500" />
                  <span className="truncate">{folder.path}</span>
                </label>
              ))}
            </div>
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
              disabled={isSubmitting}
              className="btn btn-primary px-4 py-1.5 text-xs font-medium"
            >
              {isSubmitting ? "Movendo..." : "Confirmar Movimento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

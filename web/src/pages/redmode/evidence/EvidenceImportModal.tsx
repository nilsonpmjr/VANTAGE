import React, { useState } from "react";
import { Upload, FileText, X } from "lucide-react";

export interface EvidenceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (filename: string, content: string) => Promise<void>;
}

export const EvidenceImportModal: React.FC<EvidenceImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") {
        setContent(text);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setIsSubmitting(true);
    try {
      await onImport(filename || "nota-importada.md", content);
      setContent("");
      setFilename("");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-outline-variant/30 bg-surface-container-lowest text-on-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant/20 bg-surface-container-high px-4 py-3 text-on-surface">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">
              Importar Nota Markdown (LeafWiki / Frontmatter)
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
              Selecionar arquivo (.md)
            </label>
            <input
              type="file"
              accept=".md,.markdown,.txt"
              onChange={handleFileUpload}
              className="text-xs text-on-surface-variant file:mr-2 file:py-1 file:px-3 file:rounded-sm file:border-0 file:text-xs file:bg-surface-container-high file:text-on-surface hover:file:bg-surface-container-highest cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-on-surface-variant">
                Conteúdo Markdown (com ou sem Frontmatter YAML)
              </label>
              <span className="text-[10px] text-on-surface-variant/70">
                Suporta metadados no formato &lsquo;--- title: ... ---&rsquo;
              </span>
            </div>
            <textarea
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="---\ntitle: Reconhecimento Web\nphase: reconnaissance\ntags:\n  - osint\n  - dns\n---\n\n# Resultados\nDescobertos subdomínios..."
              className="w-full bg-surface border border-outline-variant/30 rounded-sm p-2.5 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/50 focus-visible:outline-2 focus-visible:outline-primary transition-colors"
            />
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
              disabled={!content.trim() || isSubmitting}
              className="btn btn-primary px-4 py-1.5 text-xs font-medium flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              {isSubmitting ? "Importando..." : "Importar Nota"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

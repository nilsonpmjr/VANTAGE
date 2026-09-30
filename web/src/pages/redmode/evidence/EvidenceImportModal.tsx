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
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-xl overflow-hidden text-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-red-400" />
            <span className="font-semibold text-sm">
              Importar Nota Markdown (LeafWiki / Frontmatter)
            </span>
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
              Selecionar arquivo (.md)
            </label>
            <input
              type="file"
              accept=".md,.markdown,.txt"
              onChange={handleFileUpload}
              className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-300">
                Conteúdo Markdown (com ou sem Frontmatter YAML)
              </label>
              <span className="text-[10px] text-slate-500">
                Suporta metadados no formato &lsquo;--- title: ... ---&rsquo;
              </span>
            </div>
            <textarea
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="---\ntitle: Reconhecimento Web\nphase: reconnaissance\ntags:\n  - osint\n  - dns\n---\n\n# Resultados\nDescobertos subdomínios..."
              className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500"
            />
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
              disabled={!content.trim() || isSubmitting}
              className="px-4 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded disabled:opacity-50 flex items-center gap-1.5"
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

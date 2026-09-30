import { useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Download,
  Trash2,
  X,
  Plus,
  Maximize2,
  Copy,
  Check,
} from "lucide-react";
import type { EvidenceAttachment } from "../api";

interface EvidenceAssetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachments: EvidenceAttachment[];
  getDownloadUrl: (attachmentId: string, inline?: boolean) => string;
  onInsertSnippet: (snippet: string) => void;
  onDeleteAttachment?: (attachmentId: string) => Promise<void>;
  readOnly?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Gerenciador e Pré-visualizador de Anexos do Workspace.
 * Traduzido e adaptado de LeafWiki (`features/assets/AssetManagerDialog.tsx` & `AssetItem.tsx`).
 */
export function EvidenceAssetManagerModal({
  isOpen,
  onClose,
  attachments,
  getDownloadUrl,
  onInsertSnippet,
  onDeleteAttachment,
  readOnly = false,
}: EvidenceAssetManagerModalProps) {
  const [selectedPreview, setSelectedPreview] = useState<EvidenceAttachment | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  function copySnippet(att: EvidenceAttachment, asImage: boolean) {
    const url = getDownloadUrl(att.id, asImage);
    const snippet = asImage
      ? `![${att.filename}](${url})`
      : `[${att.filename}](${url})`;
    onInsertSnippet(snippet);
    setCopiedId(att.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Gerenciador de anexos"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-lg border border-outline-variant/40 bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4 bg-surface-container-low">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-bold text-on-surface">
              Anexos e Imagens da Nota ({attachments.length})
            </h3>
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

        {selectedPreview && (
          <div className="border-b border-outline-variant/20 bg-black/80 p-4 flex flex-col items-center justify-center relative">
            <button
              type="button"
              className="absolute top-2 right-2 btn btn-ghost text-white/80 hover:text-white"
              onClick={() => setSelectedPreview(null)}
              aria-label="Fechar pré-visualização"
            >
              <X className="h-4 w-4" />
            </button>
            {selectedPreview.content_type.startsWith("image/") ? (
              <img
                src={getDownloadUrl(selectedPreview.id, true)}
                alt={selectedPreview.filename}
                className="max-h-72 max-w-full object-contain rounded border border-white/20"
              />
            ) : (
              <div className="p-8 text-white/70 flex flex-col items-center">
                <FileText className="h-12 w-12 mb-2" />
                <p className="text-xs">{selectedPreview.filename}</p>
              </div>
            )}
            <p className="mt-2 text-xs text-white/70 font-mono">
              {selectedPreview.filename} ({formatFileSize(selectedPreview.size)})
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {attachments.length === 0 ? (
            <div className="p-12 text-center text-on-surface-variant">
              <ImageIcon className="mx-auto h-10 w-10 opacity-30 mb-2" />
              <p className="text-sm font-semibold text-on-surface">Nenhum anexo associado a esta nota</p>
              <p className="text-xs mt-1">
                Faça upload de evidências visuais, capturas de pacotes ou relatórios pelo painel lateral.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {attachments.map((att) => {
                const isImg = att.content_type.startsWith("image/");
                return (
                  <div
                    key={att.id}
                    className="flex flex-col justify-between rounded-md border border-outline-variant/30 bg-surface-container-lowest p-3 transition hover:border-outline-variant"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="h-12 w-12 rounded bg-surface-container-high flex items-center justify-center shrink-0 cursor-pointer overflow-hidden border border-outline-variant/20"
                        onClick={() => setSelectedPreview(att)}
                        title="Clique para ampliar"
                      >
                        {isImg ? (
                          <img
                            src={getDownloadUrl(att.id, true)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <FileText className="h-6 w-6 text-on-surface-variant" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-on-surface truncate" title={att.filename}>
                          {att.filename}
                        </p>
                        <p className="text-[11px] text-on-surface-variant font-mono mt-0.5">
                          {formatFileSize(att.size)} · {att.content_type}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-outline-variant/10 pt-2 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="btn btn-outline py-0.5 px-2 text-[10px] flex items-center gap-1"
                          onClick={() => copySnippet(att, isImg)}
                          title="Inserir Markdown no cursor"
                        >
                          {copiedId === att.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-500" /> Inserido!
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3" /> Inserir no texto
                            </>
                          )}
                        </button>
                        <a
                          href={getDownloadUrl(att.id, false)}
                          download={att.filename}
                          className="btn btn-ghost py-0.5 px-1.5 text-on-surface-variant hover:text-on-surface"
                          title="Baixar anexo"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </div>

                      {!readOnly && onDeleteAttachment && (
                        <button
                          type="button"
                          className="btn btn-ghost py-0.5 px-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                          onClick={() => void onDeleteAttachment(att.id)}
                          title="Excluir anexo do rascunho"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-outline-variant/10 px-5 py-3 bg-surface-container-lowest flex justify-end">
          <button type="button" className="btn btn-outline py-1 px-4 text-xs" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

import { X, Keyboard } from "lucide-react";

interface EvidenceShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

const modKey = isMac ? "⌘" : "Ctrl";

interface ShortcutCategory {
  title: string;
  items: Array<{
    keys: string[];
    description: string;
  }>;
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: "Navegação e Espaço de Trabalho",
    items: [
      { keys: [modKey, "O"], description: "Alternador rápido de notas e findings" },
      { keys: [modKey, "B"], description: "Recolher ou expandir o explorador esquerdo" },
      { keys: [modKey, "Shift", "B"], description: "Recolher ou expandir o painel de contexto direito" },
      { keys: ["Alt", "1...9"], description: "Alternar entre as abas de notas abertas" },
      { keys: ["Alt", "W"], description: "Fechar a aba de nota atual" },
    ],
  },
  {
    title: "Documento e Versões",
    items: [
      { keys: [modKey, "S"], description: "Salvar rascunho privado imediatamente" },
      { keys: [modKey, "Enter"], description: "Publicar rascunho como revisão imutável" },
      { keys: ["Esc"], description: "Fechar modais ou alternador rápido" },
    ],
  },
  {
    title: "Edição e Markdown Seguro",
    items: [
      { keys: [modKey, "B"], description: "Formatar seleção em negrito (**texto**)" },
      { keys: [modKey, "I"], description: "Formatar seleção em itálico (*texto*)" },
      { keys: [modKey, "K"], description: "Abrir assistente para inserir link ou wikilink" },
      { keys: ["Tab"], description: "Indentar linha ou seleção" },
      { keys: ["Shift", "Tab"], description: "Desindentar linha ou seleção" },
      { keys: ["?", "ou", modKey, "/"], description: "Exibir este catálogo de atalhos" },
    ],
  },
];

/**
 * Modal de Catálogo de Atalhos de Teclado.
 * Traduzido e adaptado de LeafWiki (`features/shortcuts/ShortcutsDialog.tsx`).
 */
export function EvidenceShortcutsModal({
  isOpen,
  onClose,
}: EvidenceShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Atalhos de teclado do workspace"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-outline-variant/40 bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4 bg-surface-container-low">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-on-surface">Atalhos de Teclado</h2>
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

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {SHORTCUT_CATEGORIES.map((category) => (
            <div key={category.title}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-3">
                {category.title}
              </h3>
              <div className="divide-y divide-outline-variant/10 rounded-md border border-outline-variant/20 bg-surface-container-lowest overflow-hidden">
                {category.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-4 px-3 py-2 text-xs"
                  >
                    <span className="text-on-surface">{item.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, kIdx) => (
                        <kbd
                          key={kIdx}
                          className="rounded-sm border border-outline-variant/30 bg-surface px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant shadow-xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-outline-variant/10 px-5 py-3 bg-surface-container-lowest flex justify-end">
          <button
            type="button"
            className="btn btn-outline py-1 px-4 text-xs"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

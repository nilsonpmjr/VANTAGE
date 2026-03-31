import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? "\u2318" : "Ctrl";

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 bg-surface-container-highest text-on-surface text-[10px] font-mono font-bold rounded-sm border border-outline-variant/30">
      {children}
    </kbd>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  const groups: ShortcutGroup[] = [
    {
      title: t("help.shortcutsGroupNavigation"),
      shortcuts: [
        { keys: ["G", "H"], description: t("help.shortcutGoHome") },
        { keys: ["G", "F"], description: t("help.shortcutGoFeed") },
        { keys: ["G", "R"], description: t("help.shortcutGoRecon") },
        { keys: ["G", "W"], description: t("help.shortcutGoWatchlist") },
        { keys: ["G", "D"], description: t("help.shortcutGoDashboard") },
        { keys: ["G", "P"], description: t("help.shortcutGoProfile") },
        { keys: ["G", "S"], description: t("help.shortcutGoSettings") },
      ],
    },
    {
      title: t("help.shortcutsGroupActions"),
      shortcuts: [
        { keys: [mod, "L"], description: t("help.shortcutFocusSearch") },
        { keys: [mod, "/"], description: t("help.shortcutToggleShortcuts") },
        { keys: ["Esc"], description: t("help.shortcutCloseModal") },
        { keys: ["?"], description: t("help.shortcutShowDialog") },
      ],
    },
  ];

  useEffect(() => {
    if (!open) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg bg-surface-container-lowest border border-outline-variant/20 rounded-sm shadow-xl z-10"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 bg-surface-container-high">
          <h2 className="text-sm font-bold tracking-tight text-on-surface">
            {t("help.shortcuts")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("help.shortcutCloseModal")}
            title={t("help.shortcutCloseModal")}
            className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-on-surface">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, kIdx) => (
                        <span key={kIdx} className="flex items-center gap-1">
                          {kIdx > 0 && (
                            <span className="text-[9px] text-outline font-bold">
                              {shortcut.keys[0].length === 1 &&
                              shortcut.keys[1].length === 1
                                ? t("help.then")
                                : "+"}
                            </span>
                          )}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-outline-variant/20 bg-surface-container-low">
          <p className="text-[10px] text-on-surface-variant">
            {t("help.press")} <Kbd>Esc</Kbd> {t("help.shortcutsFooterPost")}
          </p>
        </div>
      </div>
    </div>
  );
}

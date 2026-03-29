import { useEffect, useRef } from "react";
import { X } from "lucide-react";

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

const groups: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["G", "H"], description: "Go to Home" },
      { keys: ["G", "F"], description: "Go to Feed" },
      { keys: ["G", "R"], description: "Go to Recon" },
      { keys: ["G", "W"], description: "Go to Watchlist" },
      { keys: ["G", "D"], description: "Go to Dashboard" },
      { keys: ["G", "P"], description: "Go to Profile" },
      { keys: ["G", "S"], description: "Go to Settings" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: [mod, "L"], description: "Focus search bar" },
      { keys: [mod, "/"], description: "Toggle this panel" },
      { keys: ["Esc"], description: "Close overlay" },
      { keys: ["?"], description: "Show shortcuts" },
    ],
  },
];

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
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
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
                                ? "then"
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
            Press <Kbd>Esc</Kbd> to close. Shortcuts are disabled in text
            fields.
          </p>
        </div>
      </div>
    </div>
  );
}

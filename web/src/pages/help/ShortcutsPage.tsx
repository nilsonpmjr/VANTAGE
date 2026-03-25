import { Command } from "lucide-react";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
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
      { keys: ["G", "U"], description: "Go to Hunting" },
      { keys: ["G", "E"], description: "Go to Exposure" },
      { keys: ["G", "D"], description: "Go to Dashboard" },
      { keys: ["G", "P"], description: "Go to Profile" },
      { keys: ["G", "S"], description: "Go to Settings (admin)" },
      { keys: ["G", "N"], description: "Go to Notifications" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: [mod, "L"], description: "Focus search bar" },
      { keys: [mod, "K"], description: "Open command palette (coming soon)" },
      { keys: [mod, "/"], description: "Toggle shortcuts panel" },
      { keys: ["Esc"], description: "Close modal, dropdown, or flyout" },
      { keys: ["?"], description: "Show this shortcuts dialog" },
    ],
  },
  {
    title: "Feed & Tables",
    shortcuts: [
      { keys: ["J"], description: "Next item" },
      { keys: ["K"], description: "Previous item" },
      { keys: ["Enter"], description: "Open selected item" },
      { keys: [mod, "E"], description: "Export current view" },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 bg-surface-container-highest text-on-surface text-[11px] font-mono font-bold rounded-sm border border-outline-variant/30 shadow-sm">
      {children}
    </kbd>
  );
}

export default function ShortcutsPage() {
  return (
    <div className="mt-6 space-y-6">
      <div className="summary-strip">
        <div className="summary-pill">
          <Command className="w-3.5 h-3.5 text-primary" />
          {groups.reduce((sum, g) => sum + g.shortcuts.length, 0)} shortcuts
          registered
        </div>
        <div className="summary-pill-muted">
          Detected platform: {isMac ? "macOS" : "Windows / Linux"}
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.title} className="surface-section">
          <div className="surface-section-header">
            <h3 className="surface-section-title">{group.title}</h3>
          </div>
          <div className="divide-y divide-surface-container">
            {group.shortcuts.map((shortcut, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between px-6 py-3 hover:bg-surface-container-low transition-colors"
              >
                <span className="text-sm text-on-surface">
                  {shortcut.description}
                </span>
                <div className="flex items-center gap-1.5">
                  {shortcut.keys.map((key, kIdx) => (
                    <span key={kIdx} className="flex items-center gap-1">
                      {kIdx > 0 && (
                        <span className="text-[10px] text-outline font-bold">
                          {shortcut.keys.length === 2 &&
                          shortcut.keys[0].length === 1 &&
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

      <div className="card p-5">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
          How Shortcuts Work
        </h4>
        <ul className="space-y-2 text-sm text-on-surface-variant">
          <li>
            <strong className="text-on-surface">Sequence shortcuts</strong> (G
            then H) require pressing the keys within 1 second of each other.
          </li>
          <li>
            <strong className="text-on-surface">Modifier shortcuts</strong> (
            {mod}+L) require holding the modifier while pressing the letter.
          </li>
          <li>
            Shortcuts are{" "}
            <strong className="text-on-surface">disabled inside text fields</strong>{" "}
            (inputs, textareas, and contenteditable elements) to prevent
            accidental triggers.
          </li>
          <li>
            Press <Kbd>?</Kbd> anywhere in the app to open the shortcuts modal
            as an overlay.
          </li>
        </ul>
      </div>
    </div>
  );
}

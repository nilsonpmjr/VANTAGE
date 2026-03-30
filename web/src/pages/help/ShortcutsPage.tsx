import { Command } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

const mod = isMac ? "\u2318" : "Ctrl";

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 bg-surface-container-highest text-on-surface text-[11px] font-mono font-bold rounded-sm border border-outline-variant/30 shadow-sm">
      {children}
    </kbd>
  );
}

export default function ShortcutsPage() {
  const { t } = useLanguage();
  const groups = [
    {
      title: t("help.shortcutsGroupNavigation", "Navigation"),
      shortcuts: [
        { keys: ["G", "H"], description: t("help.shortcutGoHome", "Go to Home") },
        { keys: ["G", "F"], description: t("help.shortcutGoFeed", "Go to Feed") },
        { keys: ["G", "R"], description: t("help.shortcutGoRecon", "Go to Recon") },
        { keys: ["G", "W"], description: t("help.shortcutGoWatchlist", "Go to Watchlist") },
        { keys: ["G", "U"], description: t("help.shortcutGoHunting", "Go to Hunting") },
        { keys: ["G", "E"], description: t("help.shortcutGoExposure", "Go to Exposure") },
        { keys: ["G", "D"], description: t("help.shortcutGoDashboard", "Go to Dashboard") },
        { keys: ["G", "P"], description: t("help.shortcutGoProfile", "Go to Profile") },
        { keys: ["G", "S"], description: t("help.shortcutGoSettings", "Go to Settings (admin)") },
        { keys: ["G", "N"], description: t("help.shortcutGoNotifications", "Go to Notifications") },
      ],
    },
    {
      title: t("help.shortcutsGroupActions", "Actions"),
      shortcuts: [
        { keys: [mod, "L"], description: t("help.shortcutFocusSearch", "Focus search bar") },
        { keys: [mod, "/"], description: t("help.shortcutToggleShortcuts", "Toggle shortcuts panel") },
        { keys: ["Esc"], description: t("help.shortcutCloseModal", "Close modal, dropdown, or flyout") },
        { keys: ["?"], description: t("help.shortcutShowDialog", "Show this shortcuts dialog") },
      ],
    },
    {
      title: t("help.shortcutsGroupFeedTables", "Feed & Tables"),
      shortcuts: [
        { keys: ["J"], description: t("help.shortcutNextItem", "Next item") },
        { keys: ["K"], description: t("help.shortcutPreviousItem", "Previous item") },
        { keys: ["Enter"], description: t("help.shortcutOpenSelected", "Open selected item") },
        { keys: [mod, "E"], description: t("help.shortcutExportView", "Export current view") },
      ],
    },
  ];

  return (
    <div className="mt-6 space-y-6">
      <div className="summary-strip">
        <div className="summary-pill">
          <Command className="w-3.5 h-3.5 text-primary" />
          {groups.reduce((sum, g) => sum + g.shortcuts.length, 0)} {t("help.shortcutsRegistered", "shortcuts registered")}
        </div>
        <div className="summary-pill-muted">
          {t("help.detectedPlatform", "Detected platform")}: {isMac ? "macOS" : "Windows / Linux"}
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
                            ? t("help.then", "then")
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
          {t("help.howShortcutsWork", "How Shortcuts Work")}
        </h4>
        <ul className="space-y-2 text-sm text-on-surface-variant">
          <li>
            <strong className="text-on-surface">{t("help.sequenceShortcuts", "Sequence shortcuts")}</strong> (G
            {" "}{t("help.then", "then")} H) {t("help.sequenceShortcutsBody", "require pressing the keys within 1 second of each other.")}
          </li>
          <li>
            <strong className="text-on-surface">{t("help.modifierShortcuts", "Modifier shortcuts")}</strong> (
            {mod}+L) {t("help.modifierShortcutsBody", "require holding the modifier while pressing the letter.")}
          </li>
          <li>
            {t("help.shortcutsAre", "Shortcuts are")}{" "}
            <strong className="text-on-surface">{t("help.shortcutsDisabled", "disabled inside text fields")}</strong>{" "}
            {t("help.shortcutsDisabledBody", "(inputs, textareas, and contenteditable elements) to prevent accidental triggers.")}
          </li>
          <li>
            {t("help.press", "Press")} <Kbd>?</Kbd> {t("help.shortcutsOverlayBody", "anywhere in the app to open the shortcuts modal as an overlay.")}
          </li>
        </ul>
      </div>
    </div>
  );
}

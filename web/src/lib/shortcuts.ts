export type ShortcutGroup = {
  title: string;
  shortcuts: Array<{
    keys: string[];
    description: string;
  }>;
};

export const SHORTCUT_SEQUENCE_TIMEOUT_MS = 1000;

export function getShortcutSequenceMap(canAccessSettings: boolean) {
  return {
    h: "/",
    f: "/feed",
    r: "/recon",
    w: "/watchlist",
    d: "/dashboard",
    p: "/profile",
    n: "/notifications",
    ...(canAccessSettings ? { s: "/settings/extensions" } : {}),
  };
}

export function buildShortcutGroups(
  t: (key: string, fallback?: string) => string,
  mod: string,
  canAccessSettings: boolean,
): ShortcutGroup[] {
  const navigationShortcuts = [
    { keys: ["G", "H"], description: t("help.shortcutGoHome", "Go to Home") },
    { keys: ["G", "F"], description: t("help.shortcutGoFeed", "Go to Feed") },
    { keys: ["G", "R"], description: t("help.shortcutGoRecon", "Go to Recon") },
    { keys: ["G", "W"], description: t("help.shortcutGoWatchlist", "Go to Watchlist") },
    { keys: ["G", "D"], description: t("help.shortcutGoDashboard", "Go to Dashboard") },
    { keys: ["G", "P"], description: t("help.shortcutGoProfile", "Go to Profile") },
    { keys: ["G", "N"], description: t("help.shortcutGoNotifications", "Go to Notifications") },
  ];

  if (canAccessSettings) {
    navigationShortcuts.push({
      keys: ["G", "S"],
      description: t("help.shortcutGoSettings", "Go to Settings (admin)"),
    });
  }

  return [
    {
      title: t("help.shortcutsGroupNavigation", "Navigation"),
      shortcuts: navigationShortcuts,
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
}

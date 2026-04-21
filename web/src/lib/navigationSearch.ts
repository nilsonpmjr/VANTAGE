type TranslateFn = (key: string, fallback?: string) => string;

export type NavigationSearchGroup = "pages" | "settings" | "docs" | "support" | "actions";
export type NavigationSearchActionId = "open-shortcuts";

type NavigationSearchBaseEntry = {
  id: string;
  group: NavigationSearchGroup;
  label: string;
  section: string;
  aliases: string[];
  featured?: boolean;
};

export type NavigationSearchRouteEntry = NavigationSearchBaseEntry & {
  kind: "route";
  href: string;
};

export type NavigationSearchActionEntry = NavigationSearchBaseEntry & {
  kind: "action";
  actionId: NavigationSearchActionId;
};

export type NavigationSearchEntry =
  | NavigationSearchRouteEntry
  | NavigationSearchActionEntry;

type TopbarContext = {
  section: string;
  label: string;
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const groupOrder: Record<NavigationSearchGroup, number> = {
  pages: 0,
  settings: 1,
  docs: 2,
  support: 3,
  actions: 4,
};

function createBlob(entry: NavigationSearchEntry) {
  return normalizeSearchText([entry.section, entry.label, ...entry.aliases].join(" "));
}

function scoreEntry(entry: NavigationSearchEntry, normalizedQuery: string) {
  const label = normalizeSearchText(entry.label);
  const section = normalizeSearchText(entry.section);
  const aliases = entry.aliases.map(normalizeSearchText);
  const haystack = createBlob(entry);

  if (label.startsWith(normalizedQuery)) return 0;
  if (aliases.some((alias) => alias.startsWith(normalizedQuery))) return 1;
  if (label.includes(normalizedQuery)) return 2;
  if (aliases.some((alias) => alias.includes(normalizedQuery))) return 3;
  if (section.includes(normalizedQuery)) return 4;
  if (haystack.includes(normalizedQuery)) return 5;
  return Number.POSITIVE_INFINITY;
}

function buildProfileEntries(t: TranslateFn): NavigationSearchEntry[] {
  const accountSection = t("layout.sections.account", "Account");
  return [
    {
      id: "profile.identity",
      kind: "route",
      group: "pages",
      href: "/profile",
      label: t("layout.topbar.profile", "Profile"),
      section: accountSection,
      aliases: ["account", "identity", "operator profile"],
      featured: true,
    },
    {
      id: "profile.preferences",
      kind: "route",
      group: "settings",
      href: "/profile?tab=preferences",
      label: t("profile.tabs.preferences", "Preferences"),
      section: accountSection,
      aliases: ["language", "notifications", "theme", "user preferences"],
    },
    {
      id: "profile.api_keys",
      kind: "route",
      group: "settings",
      href: "/profile?tab=external_api_keys",
      label: t("profile.tabs.externalApiKeys", "External API Keys"),
      section: accountSection,
      aliases: ["api keys", "integrations", "providers", "credentials"],
    },
    {
      id: "profile.audit_logs",
      kind: "route",
      group: "settings",
      href: "/profile?tab=audit_logs",
      label: t("profile.tabs.auditLogs", "Audit Logs"),
      section: accountSection,
      aliases: ["audit", "logs", "activity history"],
    },
  ];
}

export function buildNavigationSearchEntries(
  t: TranslateFn,
  canAccessSettings: boolean,
): NavigationSearchEntry[] {
  const platformSection = t("layout.sections.platform", "Platform");
  const operationsSection = t("layout.sections.operations", "Operations");
  const administrationSection = t("layout.sections.administration", "Administration");
  const supportSection = t("layout.sections.support", "Support");
  const actionsSection = t("layout.topbar.navSearchGroupActions", "Actions");

  const entries: NavigationSearchEntry[] = [
    {
      id: "page.home",
      kind: "route",
      group: "pages",
      href: "/",
      label: t("layout.nav.home", "Home"),
      section: platformSection,
      aliases: ["workspace", "overview", "landing"],
      featured: true,
    },
    {
      id: "page.feed",
      kind: "route",
      group: "pages",
      href: "/feed",
      label: t("layout.nav.feed", "Feed"),
      section: operationsSection,
      aliases: ["threat feed", "intelligence feed", "stories"],
      featured: true,
    },
    {
      id: "page.recon",
      kind: "route",
      group: "pages",
      href: "/recon",
      label: t("layout.nav.recon", "Recon"),
      section: operationsSection,
      aliases: ["reconnaissance", "scan", "surface mapping"],
      featured: true,
    },
    {
      id: "page.watchlist",
      kind: "route",
      group: "pages",
      href: "/watchlist",
      label: t("layout.nav.watchlist", "Watchlist"),
      section: operationsSection,
      aliases: ["monitoring", "persistent monitoring", "tracked indicators"],
      featured: true,
    },
    {
      id: "page.shift_handoff",
      kind: "route",
      group: "pages",
      href: "/shift-handoff",
      label: t("layout.nav.shiftHandoff", "Shift Handoff"),
      section: operationsSection,
      aliases: ["handoff", "shift notes", "incidents", "operator turnover"],
    },
    {
      id: "page.dashboard",
      kind: "route",
      group: "pages",
      href: "/dashboard",
      label: t("layout.nav.dashboard", "Dashboard"),
      section: operationsSection,
      aliases: ["metrics", "overview", "stats", "history"],
      featured: true,
    },
    {
      id: "page.notifications",
      kind: "route",
      group: "pages",
      href: "/notifications",
      label: t("notifications.title", "Notifications Center"),
      section: operationsSection,
      aliases: ["alerts", "notification center", "events"],
      featured: true,
    },
    ...buildProfileEntries(t),
    {
      id: "docs.help",
      kind: "route",
      group: "docs",
      href: "/help/docs",
      label: t("help.docs", "Documentation"),
      section: supportSection,
      aliases: ["help center", "guides", "manual", "docs"],
      featured: true,
    },
    {
      id: "docs.shortcuts_page",
      kind: "route",
      group: "docs",
      href: "/help/shortcuts",
      label: t("help.shortcuts", "Keyboard Shortcuts"),
      section: supportSection,
      aliases: ["shortcuts page", "keyboard help", "hotkeys"],
    },
    {
      id: "docs.api_reference",
      kind: "route",
      group: "docs",
      href: "/help/api",
      label: t("help.apiReference", "API Reference"),
      section: supportSection,
      aliases: ["api", "reference", "endpoints", "developer docs"],
      featured: true,
    },
    {
      id: "support.contact",
      kind: "route",
      group: "support",
      href: "/help/support",
      label: t("help.contactSupport", "Contact Support"),
      section: supportSection,
      aliases: ["support", "contact", "help request", "message support"],
      featured: true,
    },
    {
      id: "action.shortcuts_overlay",
      kind: "action",
      group: "actions",
      actionId: "open-shortcuts",
      label: t("layout.topbar.navSearchOpenShortcuts", "Open Keyboard Shortcuts"),
      section: actionsSection,
      aliases: ["shortcuts", "hotkeys", "keyboard commands", "overlay"],
    },
  ];

  if (canAccessSettings) {
    entries.push(
      {
        id: "settings.extensions",
        kind: "route",
        group: "settings",
        href: "/settings/extensions",
        label: t("settings.extensions", "Extensions Catalog"),
        section: administrationSection,
        aliases: ["extensions", "catalog", "modules", "connectors"],
        featured: true,
      },
      {
        id: "settings.threat_ingestion",
        kind: "route",
        group: "settings",
        href: "/settings/threat-ingestion",
        label: t("settings.threatIngestion", "Threat Ingestion & SMTP"),
        section: administrationSection,
        aliases: ["smtp", "threat ingestion", "feed connectors", "mail"],
      },
      {
        id: "settings.system_health",
        kind: "route",
        group: "settings",
        href: "/settings/system-health",
        label: t("settings.systemHealth", "System Health"),
        section: administrationSection,
        aliases: ["health", "status", "runtime", "operational status"],
      },
      {
        id: "settings.users_roles",
        kind: "route",
        group: "settings",
        href: "/settings/users-roles",
        label: t("settings.usersRoles", "Users & Roles"),
        section: administrationSection,
        aliases: ["users", "roles", "iam", "user management"],
        featured: true,
      },
      {
        id: "settings.security_policies",
        kind: "route",
        group: "settings",
        href: "/settings/security-policies",
        label: t("settings.securityPolicies", "Security Policies"),
        section: administrationSection,
        aliases: ["policies", "password policy", "mfa policy", "security"],
        featured: true,
      },
      {
        id: "settings.api_credentials",
        kind: "route",
        group: "settings",
        href: "/settings/api-credentials",
        label: t("settings.apiCredentials", "Platform Credentials"),
        section: administrationSection,
        aliases: ["api keys", "credentials", "platforms", "virustotal", "shodan", "env"],
        featured: true,
      },
    );
  }

  return entries;
}

export function filterNavigationSearchEntries(
  entries: NavigationSearchEntry[],
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return entries.filter((entry) => entry.featured).slice(0, 9);
  }

  return [...entries]
    .map((entry) => ({ entry, score: scoreEntry(entry, normalizedQuery) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((left, right) => {
      if (left.score !== right.score) return left.score - right.score;
      if (left.entry.group !== right.entry.group) {
        return groupOrder[left.entry.group] - groupOrder[right.entry.group];
      }
      return left.entry.label.localeCompare(right.entry.label);
    })
    .map((item) => item.entry)
    .slice(0, 10);
}

export function getNavigationSearchGroupLabel(
  group: NavigationSearchGroup,
  t: TranslateFn,
) {
  switch (group) {
    case "pages":
      return t("layout.topbar.navSearchGroupPages", "Pages");
    case "settings":
      return t("layout.topbar.navSearchGroupSettings", "Settings");
    case "docs":
      return t("layout.topbar.navSearchGroupDocs", "Docs");
    case "support":
      return t("layout.topbar.navSearchGroupSupport", "Support");
    case "actions":
      return t("layout.topbar.navSearchGroupActions", "Actions");
  }
}

export function resolveTopbarContext(
  pathname: string,
  search: string,
  t: TranslateFn,
): TopbarContext {
  const params = new URLSearchParams(search);
  const operationsSection = t("layout.sections.operations", "Operations");
  const administrationSection = t("layout.sections.administration", "Administration");
  const supportSection = t("layout.sections.support", "Support");
  const accountSection = t("layout.sections.account", "Account");
  const analysisSection = t("layout.sections.analysis", "Analysis");
  const platformSection = t("layout.sections.platform", "Platform");

  if (pathname.startsWith("/settings/extensions")) {
    return { section: administrationSection, label: t("settings.extensions", "Extensions Catalog") };
  }
  if (pathname.startsWith("/settings/threat-ingestion")) {
    return { section: administrationSection, label: t("settings.threatIngestion", "Threat Ingestion & SMTP") };
  }
  if (pathname.startsWith("/settings/system-health")) {
    return { section: administrationSection, label: t("settings.systemHealth", "System Health") };
  }
  if (pathname.startsWith("/settings/users-roles")) {
    return { section: administrationSection, label: t("settings.usersRoles", "Users & Roles") };
  }
  if (pathname.startsWith("/settings/security-policies")) {
    return { section: administrationSection, label: t("settings.securityPolicies", "Security Policies") };
  }
  if (pathname.startsWith("/settings/api-credentials")) {
    return { section: administrationSection, label: t("settings.apiCredentials", "Platform Credentials") };
  }
  if (pathname === "/profile") {
    const tab = params.get("tab");
    if (tab === "preferences") {
      return { section: accountSection, label: t("profile.tabs.preferences", "Preferences") };
    }
    if (tab === "external_api_keys") {
      return { section: accountSection, label: t("profile.tabs.externalApiKeys", "External API Keys") };
    }
    if (tab === "audit_logs") {
      return { section: accountSection, label: t("profile.tabs.auditLogs", "Audit Logs") };
    }
    return { section: accountSection, label: t("layout.topbar.profile", "Profile") };
  }
  if (pathname.startsWith("/help/docs")) {
    return { section: supportSection, label: t("help.docs", "Documentation") };
  }
  if (pathname.startsWith("/help/shortcuts")) {
    return { section: supportSection, label: t("help.shortcuts", "Keyboard Shortcuts") };
  }
  if (pathname.startsWith("/help/api")) {
    return { section: supportSection, label: t("help.apiReference", "API Reference") };
  }
  if (pathname.startsWith("/help/support")) {
    return { section: supportSection, label: t("help.contactSupport", "Contact Support") };
  }
  if (pathname.startsWith("/analyze/")) {
    return { section: analysisSection, label: t("layout.topbar.analysisReport", "Analysis Report") };
  }
  if (pathname === "/batch") {
    return { section: analysisSection, label: t("layout.topbar.batchAnalysis", "Batch Analysis") };
  }
  if (pathname === "/feed") {
    return { section: operationsSection, label: t("layout.nav.feed", "Feed") };
  }
  if (pathname === "/recon") {
    return { section: operationsSection, label: t("layout.nav.recon", "Recon") };
  }
  if (pathname === "/watchlist") {
    return { section: operationsSection, label: t("layout.nav.watchlist", "Watchlist") };
  }
  if (pathname.startsWith("/shift-handoff")) {
    return { section: operationsSection, label: t("layout.nav.shiftHandoff", "Shift Handoff") };
  }
  if (pathname === "/dashboard") {
    return { section: operationsSection, label: t("layout.nav.dashboard", "Dashboard") };
  }
  if (pathname === "/notifications") {
    return { section: operationsSection, label: t("notifications.title", "Notifications Center") };
  }

  return { section: platformSection, label: t("layout.nav.home", "Home") };
}

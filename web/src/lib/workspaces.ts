export type WorkspaceId = "soc" | "offensive";

export const DEFAULT_WORKSPACE: WorkspaceId = "soc";
export const OFFENSIVE_WORKSPACE: WorkspaceId = "offensive";
export const LAST_WORKSPACE_STORAGE_KEY = "vantage.workspace.last-successful";
export const MFA_PENDING_STORAGE_KEY = "vantage.auth.mfa-pending";
export const MFA_WORKSPACE_STORAGE_KEY = "vantage.auth.mfa-workspace";

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return value === "soc" || value === "offensive";
}

export function workspaceForPath(pathname: string): WorkspaceId | null {
  if (pathname === "/redmode" || pathname.startsWith("/redmode/")) {
    return OFFENSIVE_WORKSPACE;
  }

  return null;
}

export function workspaceForOperationalPath(pathname: string): WorkspaceId | null {
  const offensiveWorkspace = workspaceForPath(pathname);
  if (offensiveWorkspace) return offensiveWorkspace;

  const socPrefixes = [
    "/feed",
    "/recon",
    "/watchlist",
    "/socc",
    "/shift-handoff",
    "/dashboard",
    "/analyze",
    "/batch",
  ];
  if (pathname === "/" || socPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return DEFAULT_WORKSPACE;
  }

  return null;
}

export function workspaceHome(workspace: WorkspaceId): string {
  return workspace === OFFENSIVE_WORKSPACE ? "/redmode" : "/";
}

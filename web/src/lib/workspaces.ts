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
  return pathname === "/redmode" || pathname.startsWith("/redmode/")
    ? OFFENSIVE_WORKSPACE
    : null;
}

export function workspaceHome(workspace: WorkspaceId): string {
  return workspace === OFFENSIVE_WORKSPACE ? "/redmode" : "/";
}

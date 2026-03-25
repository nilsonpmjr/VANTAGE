import type { AuthUser } from "../context/AuthContext";

const ROUTE_ROLE_POLICIES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/settings", roles: ["admin"] },
];

export function canAccessPath(user: AuthUser | null, path: string) {
  if (!user) return false;
  const policy = ROUTE_ROLE_POLICIES.find((item) => path.startsWith(item.prefix));
  if (!policy) return true;
  return policy.roles.includes(user.role);
}

export function resolveAccessiblePath(
  user: AuthUser | null,
  preferredPath: string,
  fallbackPath = "/",
) {
  return canAccessPath(user, preferredPath) ? preferredPath : fallbackPath;
}

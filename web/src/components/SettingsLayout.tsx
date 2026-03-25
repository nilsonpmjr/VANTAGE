import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";

export default function SettingsLayout() {
  const location = useLocation();

  if (location.pathname === "/settings") {
    return <Navigate to="/settings/extensions" replace />;
  }

  return (
    <div className="settings-layout px-4 sm:px-6">
      <aside className="settings-nav">
        <div className="settings-nav-shell">
          <div className="space-y-6">
            <div>
              <div className="text-xs font-semibold text-outline mb-2 mt-1 uppercase tracking-wider">
                Platform
              </div>
              <nav className="space-y-1">
                <NavLink
                  to="/settings/patterns"
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 text-[0.9375rem] font-medium rounded-lg transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface-variant hover:bg-surface-container-high"
                    )
                  }
                >
                  Operational Patterns
                </NavLink>
                <NavLink
                  to="/settings/extensions"
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 text-[0.9375rem] font-medium rounded-lg transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface-variant hover:bg-surface-container-high"
                    )
                  }
                >
                  Extensions Catalog
                </NavLink>
                <NavLink
                  to="/settings/threat-ingestion"
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 text-[0.9375rem] font-medium rounded-lg transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface-variant hover:bg-surface-container-high"
                    )
                  }
                >
                  Threat Ingestion & SMTP
                </NavLink>
                <NavLink
                  to="/settings/system-health"
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 text-[0.9375rem] font-medium rounded-lg transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface-variant hover:bg-surface-container-high"
                    )
                  }
                >
                  System Health
                </NavLink>
              </nav>
            </div>

            <div>
              <div className="text-xs font-semibold text-outline mb-2 mt-4 uppercase tracking-wider">
                IAM
              </div>
              <nav className="space-y-1">
                <NavLink
                  to="/settings/users-roles"
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 text-[0.9375rem] font-medium rounded-lg transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface-variant hover:bg-surface-container-high"
                    )
                  }
                >
                  Users & Roles
                </NavLink>
                <NavLink
                  to="/settings/security-policies"
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface-variant hover:bg-surface-container-high"
                    )
                  }
                >
                  Security Policies
                </NavLink>
              </nav>
            </div>
          </div>
        </div>
      </aside>

      <div className="settings-content min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}

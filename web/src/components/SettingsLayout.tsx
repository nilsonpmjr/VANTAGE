import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";
import { useLanguage } from "../context/LanguageContext";

export default function SettingsLayout() {
  const { t } = useLanguage();
  const location = useLocation();

  if (location.pathname === "/settings") {
    return <Navigate to="/settings/extensions" replace />;
  }

  return (
    <div className="settings-layout px-4 sm:px-6">
      <aside className="settings-nav">
        <div className="settings-nav-shell">
          <div className="settings-nav-copy">
            <span className="settings-nav-label">
              {t("settings.navLabel", "Structural navigation")}
            </span>
            <span className="settings-nav-helper">
              {t(
                "settings.navHelper",
                "Use this lane for planned section switching. Item context and row inspection stay in the main canvas and right rail.",
              )}
            </span>
          </div>
          <div className="space-y-6">
            <div>
              <div className="text-xs font-semibold text-outline mb-2 mt-1 uppercase tracking-wider">
                {t("layout.sections.platform", "Platform")}
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
                  {t("settings.patterns", "Operational Patterns")}
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
                  {t("settings.extensions", "Extensions Catalog")}
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
                  {t("settings.threatIngestion", "Threat Ingestion & SMTP")}
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
                  {t("settings.systemHealth", "System Health")}
                </NavLink>
              </nav>
            </div>

            <div>
              <div className="text-xs font-semibold text-outline mb-2 mt-4 uppercase tracking-wider">
                {t("layout.sections.iam", "IAM")}
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
                  {t("settings.usersRoles", "Users & Roles")}
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
                  {t("settings.securityPolicies", "Security Policies")}
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

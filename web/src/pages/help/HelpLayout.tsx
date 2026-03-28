import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useLanguage } from "../../context/LanguageContext";

export default function HelpLayout() {
  const { t } = useLanguage();
  const tabs = [
    { to: "/help/docs", label: t("help.docs", "Documentation") },
    { to: "/help/shortcuts", label: t("help.shortcuts", "Keyboard Shortcuts") },
    { to: "/help/api", label: t("help.apiReference", "API Reference") },
    { to: "/help/support", label: t("help.contactSupport", "Contact Support") },
  ];

  return (
    <div className="page-frame">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-eyebrow">{t("help.eyebrow", "Help Center")}</div>
          <h1 className="page-heading">{t("help.title", "Help Center")}</h1>
          <p className="page-subheading">
            {t("help.subtitle", "Guides, keyboard shortcuts, API documentation, and support channels for the VANTAGE platform.")}
          </p>
        </div>
      </div>

      <div className="nav-internal">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
            className={({ isActive }) =>
              cn(
                "nav-internal-item",
                isActive ? "nav-internal-item-active" : "nav-internal-item-inactive",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}

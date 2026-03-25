import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../../lib/utils";

const tabs = [
  { to: "/help/docs", label: "Documentation" },
  { to: "/help/shortcuts", label: "Keyboard Shortcuts" },
  { to: "/help/api", label: "API Reference" },
  { to: "/help/support", label: "Contact Support" },
];

export default function HelpLayout() {
  return (
    <div className="page-frame">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-eyebrow">Help Center</div>
          <h1 className="page-heading">Help Center</h1>
          <p className="page-subheading">
            Guides, keyboard shortcuts, API documentation, and support channels
            for the VANTAGE platform.
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

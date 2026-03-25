import { useState, useRef, useEffect } from "react";
import { Outlet, NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Rss,
  Radar,
  Eye,
  Crosshair,
  ShieldAlert,
  LayoutDashboard,
  Settings,
  User,
  Zap,
  Bell,
  History,
  HelpCircle,
  Activity,
  LogOut,
  Menu,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useAuth } from "../context/AuthContext";
import { canAccessPath } from "../lib/access";
import KeyboardShortcutsModal from "./help/KeyboardShortcutsModal";
import GlobalScanLauncher from "./scan/GlobalScanLauncher";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/feed", label: "Feed", icon: Rss },
  { path: "/recon", label: "Recon", icon: Radar },
  { path: "/watchlist", label: "Watchlist", icon: Eye },
  { path: "/hunting", label: "Hunting", icon: Crosshair },
  { path: "/exposure", label: "Exposure", icon: ShieldAlert },
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isScanLauncherOpen, setIsScanLauncherOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const canAccessSettings = canAccessPath(user, "/settings");

  const visibleNavItems = navItems.filter((item) => {
    if ((item.path === "/hunting" || item.path === "/exposure") && user?.role === "tech") {
      return true;
    }
    return true;
  });

  const handleHistoryClick = () => {
    const lastSearch = localStorage.getItem("lastSearch");
    if (lastSearch) {
      navigate(`/analyze/${encodeURIComponent(lastSearch)}`);
      return;
    }
    navigate("/dashboard?view=history");
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
        setIsHelpOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsShortcutsOpen((prev: boolean) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, []);

  return (
    <div className="min-h-screen bg-background flex">
      <aside className={cn("fixed left-0 top-0 h-screen bg-inverse-surface flex flex-col z-50 transition-all duration-300", isSidebarCollapsed ? "w-20" : "w-64")}>
        <div className={cn("py-8 flex items-center", isSidebarCollapsed ? "px-0 justify-center" : "px-6")}>
          <div className={cn("flex items-center", isSidebarCollapsed ? "justify-center" : "w-full")}>
            <div className={cn("sidebar-brand-lockup", isSidebarCollapsed && "is-collapsed")}>
              <img
                src="/branding/vantage/app-icon-dark.svg"
                alt="VANTAGE"
                className="sidebar-brand-compact"
              />
              <div className="sidebar-brand-full-shell" aria-hidden={isSidebarCollapsed}>
                <img
                  src="/branding/vantage/logo-dark.png"
                  alt="VANTAGE"
                  className="sidebar-brand-full"
                />
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={isSidebarCollapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 py-3 text-sm font-medium transition-colors rounded-sm",
                  isActive
                    ? "bg-primary/10 text-white border-l-4 border-primary"
                    : "text-outline hover:text-white hover:bg-white/5 border-l-4 border-transparent",
                  isSidebarCollapsed ? "justify-center px-0" : "px-4"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </NavLink>
            );
          })}

          {!isSidebarCollapsed ? (
            <div className="pt-4 pb-2 px-4 text-[10px] font-bold text-outline uppercase tracking-widest whitespace-nowrap">
              Administration
            </div>
          ) : (
            <div className="pt-4 pb-2 border-t border-white/5 mt-4"></div>
          )}
          {canAccessSettings && (
            <NavLink
              to="/settings"
              title={isSidebarCollapsed ? "Settings" : undefined}
              className={cn(
                "flex items-center gap-3 py-3 text-sm font-medium transition-colors rounded-sm",
                location.pathname.startsWith("/settings")
                  ? "bg-primary/10 text-white border-l-4 border-primary"
                  : "text-outline hover:text-white hover:bg-white/5 border-l-4 border-transparent",
                isSidebarCollapsed ? "justify-center px-0" : "px-4"
              )}
            >
              <Settings className="w-4 h-4 shrink-0" />
              {!isSidebarCollapsed && <span className="whitespace-nowrap">Settings</span>}
            </NavLink>
          )}
        </nav>

        <div className="p-4 border-t border-white/5 space-y-2">
          <button
            type="button"
            onClick={() => setIsScanLauncherOpen(true)}
            title={isSidebarCollapsed ? "Start Scan" : undefined}
            className={cn(
              "btn btn-primary w-full",
              isSidebarCollapsed && "px-0"
            )}
          >
            <Zap className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span className="whitespace-nowrap">Start Scan</span>}
          </button>
        </div>
      </aside>

      <div className={cn("flex-1 flex flex-col min-h-screen transition-all duration-300", isSidebarCollapsed ? "ml-20" : "ml-64")}>
        <header className="h-14 bg-surface-container-high border-b border-outline-variant/20 flex items-center justify-between px-6 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 text-on-surface-variant hover:bg-surface-container-highest rounded transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-on-surface-variant uppercase tracking-widest text-[10px] font-bold">
              <Activity className="w-3 h-3" />
              Analyst
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Link to="/notifications" className="p-1.5 text-on-surface-variant hover:bg-surface-container-highest rounded transition-colors relative">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-error rounded-full border border-surface-container-high"></span>
              </Link>
              <button onClick={handleHistoryClick} className="p-1.5 text-on-surface-variant hover:bg-surface-container-highest rounded transition-colors">
                <History className="w-4 h-4" />
              </button>
              <div className="relative" ref={helpRef}>
                <button 
                  onClick={() => setIsHelpOpen(!isHelpOpen)}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    isHelpOpen ? "bg-surface-container-highest text-on-surface" : "text-on-surface-variant hover:bg-surface-container-highest"
                  )}
                >
                  <HelpCircle className="w-4 h-4" />
                </button>

                {isHelpOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-surface-container-high border border-outline-variant/20 rounded-md shadow-lg py-1 z-50">
                    <div className="px-4 py-2 border-b border-outline-variant/20">
                      <p className="text-xs font-bold text-on-surface uppercase tracking-widest">Support & Resources</p>
                    </div>
                    <button
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-on-surface hover:bg-surface-container-highest hover:text-white transition-colors text-left"
                      onClick={() => { setIsHelpOpen(false); navigate("/help/docs"); }}
                    >
                      Documentation
                    </button>
                    <button
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-on-surface hover:bg-surface-container-highest hover:text-white transition-colors text-left"
                      onClick={() => { setIsHelpOpen(false); navigate("/help/shortcuts"); }}
                    >
                      Keyboard Shortcuts
                    </button>
                    <button
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-on-surface hover:bg-surface-container-highest hover:text-white transition-colors text-left"
                      onClick={() => { setIsHelpOpen(false); navigate("/help/api"); }}
                    >
                      API Reference
                    </button>
                    <div className="border-t border-outline-variant/20 my-1"></div>
                    <button
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-on-surface hover:bg-surface-container-highest hover:text-white transition-colors text-left"
                      onClick={() => { setIsHelpOpen(false); navigate("/help/support"); }}
                    >
                      Contact Support
                    </button>
                  </div>
                )}
              </div>
              <div className="relative ml-2" ref={profileRef}>
                <button 
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center overflow-hidden border border-outline-variant/20 hover:ring-2 hover:ring-primary transition-all"
                >
                  <img
                    src="https://api.dicebear.com/7.x/avataaars/svg?seed=Alexei"
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                </button>

                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-surface-container-high border border-outline-variant/20 rounded-md shadow-lg py-1 z-50">
                    <div className="px-4 py-2 border-b border-outline-variant/20">
                      <p className="text-sm font-medium text-on-surface">
                        {user?.name || user?.username || "Operator"}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {(user?.role || "tech").toUpperCase()}
                      </p>
                    </div>
                    <Link 
                      to="/profile" 
                      className="flex items-center gap-2 px-4 py-2 text-sm text-on-surface hover:bg-surface-container-highest hover:text-white transition-colors"
                      onClick={() => setIsProfileOpen(false)}
                    >
                      <User className="w-4 h-4" />
                      Profile
                    </Link>
                    {canAccessSettings && (
                      <Link 
                        to="/settings" 
                        className="flex items-center gap-2 px-4 py-2 text-sm text-on-surface hover:bg-surface-container-highest hover:text-white transition-colors"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </Link>
                    )}
                    <div className="border-t border-outline-variant/20 my-1"></div>
                    <button 
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-error hover:bg-error/10 transition-colors"
                      onClick={async () => {
                        setIsProfileOpen(false);
                        await logout();
                      }}
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      <KeyboardShortcutsModal
        open={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
      <GlobalScanLauncher
        open={isScanLauncherOpen}
        onClose={() => setIsScanLauncherOpen(false)}
      />
    </div>
  );
}

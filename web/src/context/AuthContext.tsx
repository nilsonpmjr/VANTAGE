import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation } from "react-router-dom";
import API_URL from "../config";
import LoginGate from "../components/auth/LoginGate";
import { canAccessPath } from "../lib/access";

export interface AuthUser {
  username: string;
  role: string;
  name?: string;
  email?: string | null;
  preferred_lang?: string;
  is_active?: boolean;
  force_password_reset?: boolean;
  mfa_enabled?: boolean;
  mfa_setup_required?: boolean;
  avatar_base64?: string;
  recovery_email?: string | null;
  password_expires_in_days?: number;
  extra_permissions?: string[];
  notification_center?: {
    read_ids?: string[];
    archived_ids?: string[];
    preferences?: {
      critical?: boolean;
      system?: boolean;
      intelligence?: boolean;
    };
  };
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  mfaPending: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  completeMfaLogin: (user: AuthUser) => void;
  cancelMfa: () => void;
  updateUserContext: (user: AuthUser) => void;
  refreshUser: () => Promise<AuthUser | null>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchCurrentUser() {
  const meRes = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });

  if (meRes.ok) {
    return (await meRes.json()) as AuthUser;
  }

  if (meRes.status === 401) {
    const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (refreshRes.ok) {
      const retryRes = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });
      if (retryRes.ok) {
        return (await retryRes.json()) as AuthUser;
      }
    }
  }

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);
  const nativeFetchRef = useRef<typeof window.fetch | null>(null);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const nextUser = await fetchCurrentUser();
      setUser(nextUser);
      return nextUser;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const nativeFetch = nativeFetchRef.current ?? window.fetch.bind(window);
    refreshInFlightRef.current = (async () => {
      try {
        const refreshRes = await nativeFetch(`${API_URL}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!refreshRes.ok) {
          setUser(null);
          setMfaPending(false);
          return false;
        }

        const meRes = await nativeFetch(`${API_URL}/api/auth/me`, {
          credentials: "include",
        });
        const nextUser = meRes.ok ? ((await meRes.json()) as AuthUser) : null;
        setUser(nextUser);
        return Boolean(nextUser);
      } catch {
        setUser(null);
        setMfaPending(false);
        return false;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    return refreshInFlightRef.current;
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  useEffect(() => {
    if (loading) return undefined;

    const syncSession = () => {
      void refreshUser();
    };
    const intervalId = window.setInterval(syncSession, 5 * 60 * 1000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncSession();
      }
    };

    window.addEventListener("focus", syncSession);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncSession);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loading, refreshUser]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    nativeFetchRef.current = originalFetch;

    function shouldHandleRequest(url: URL) {
      if (url.origin === window.location.origin) {
        return url.pathname.startsWith("/api");
      }
      if (!API_URL) return false;
      return url.href.startsWith(`${API_URL}/api`);
    }

    function isExcludedPath(pathname: string) {
      return (
        pathname === "/api/auth/login" ||
        pathname === "/api/auth/logout" ||
        pathname === "/api/auth/refresh" ||
        pathname === "/api/mfa/verify" ||
        pathname === "/api/auth/forgot-password" ||
        pathname === "/api/auth/reset-password"
      );
    }

    async function handleCredentialPolicyResponse(response: Response) {
      if (response.status !== 403) {
        return response;
      }

      try {
        const cloned = response.clone();
        const data = (await cloned.json()) as { detail?: string };
        if (
          data?.detail === "password_reset_required" ||
          data?.detail === "password_expired"
        ) {
          if (window.location.pathname !== "/profile") {
            window.location.assign("/profile");
          }
        }
      } catch {
        // Some 403 responses do not include JSON details.
      }

      return response;
    }

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url, window.location.origin);

      if (
        !shouldHandleRequest(url) ||
        isExcludedPath(url.pathname) ||
        request.headers.get("x-vantage-skip-auth-refresh") === "true"
      ) {
        const directResponse = await originalFetch(request);
        return handleCredentialPolicyResponse(directResponse);
      }

      let response = await originalFetch(request.clone());
      if (response.status !== 401) {
        return handleCredentialPolicyResponse(response);
      }

      const refreshed = await refreshSession();
      if (!refreshed) {
        return response;
      }

      response = await originalFetch(request.clone());
      return handleCredentialPolicyResponse(response);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [refreshSession]);

  const login = useCallback(async (username: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });

    if (!response.ok) {
      if (response.status === 423) {
        const errData = await response.json().catch(() => ({}));
        const error = new Error("account_locked") as Error & {
          code?: string;
          locked_until?: string | null;
        };
        error.code = "account_locked";
        error.locked_until = errData?.detail?.locked_until ?? null;
        throw error;
      }
      throw new Error("invalid_credentials");
    }

    const data = await response.json();
    if (data.mfa_required) {
      setMfaPending(true);
      return false;
    }

    setUser(data.user as AuthUser);
    return true;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Session cleanup should not block local logout state.
    }
    setUser(null);
    setMfaPending(false);
  }, []);

  const completeMfaLogin = useCallback((nextUser: AuthUser) => {
    setMfaPending(false);
    setUser(nextUser);
  }, []);

  const cancelMfa = useCallback(() => {
    setMfaPending(false);
  }, []);

  const updateUserContext = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      mfaPending,
      login,
      logout,
      completeMfaLogin,
      cancelMfa,
      updateUserContext,
      refreshUser,
      refreshSession,
    }),
    [user, loading, mfaPending, login, logout, completeMfaLogin, cancelMfa, updateUserContext, refreshUser, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-surface-container-lowest shadow-sm rounded-sm px-6 py-5 text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
          Initializing session
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginGate />;
  }

  if ((user.force_password_reset || user.password_expires_in_days === 0) && location.pathname !== "/profile") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-lg rounded-sm bg-surface-container-lowest shadow-sm border border-outline-variant/15 p-8 space-y-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Credential Update Required</div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface">Your session needs a password update</h1>
          <p className="text-sm text-on-surface-variant">
            Continue to your profile to rotate credentials and restore access to protected workflows.
          </p>
          <Link to="/profile" className="btn btn-primary inline-flex">
            Open Profile
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function RequireRole({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles: string[];
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-surface-container-lowest shadow-sm rounded-sm px-6 py-5 text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
          Verifying access policy
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginGate />;
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="page-frame">
        <div className="max-w-3xl rounded-sm border border-outline-variant/15 bg-surface-container-lowest p-8 shadow-sm space-y-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-outline">Access Policy</div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface">This area is restricted</h1>
          <p className="text-sm text-on-surface-variant">
            Your current role does not have permission to open this administrative area.
          </p>
          <Link to="/" className="btn btn-outline inline-flex">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function RequirePathAccess({
  children,
  path,
}: {
  children: ReactNode;
  path: string;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-surface-container-lowest shadow-sm rounded-sm px-6 py-5 text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
          Verifying route access
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginGate />;
  }

  if (!canAccessPath(user, path)) {
    return (
      <div className="page-frame">
        <div className="max-w-3xl rounded-sm border border-outline-variant/15 bg-surface-container-lowest p-8 shadow-sm space-y-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-outline">Route Access</div>
          <h1 className="text-2xl font-black tracking-tight text-on-surface">This route is not available for your role</h1>
          <p className="text-sm text-on-surface-variant">
            This access profile does not include the selected section.
          </p>
          <Link to="/" className="btn btn-outline inline-flex">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

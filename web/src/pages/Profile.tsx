import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Camera,
  History,
  ShieldCheck,
  Key,
  Monitor,
  Smartphone,
  Laptop,
  Filter,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Copy,
  RefreshCw,
  Trash2,
  Eye,
} from "lucide-react";
import API_URL from "../config";
import ModalShell from "../components/modal/ModalShell";
import { PageHeader, PageMetricPill, PageToolbar, PageToolbarGroup } from "../components/page/PageChrome";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { RowActionsMenu, RowPrimaryAction, type RowActionItem } from "../components/RowActions";

type ProfileTab = "identity" | "preferences" | "external_api_keys" | "audit_logs";

interface AuditItem {
  timestamp: string;
  user: string;
  action: string;
  target?: string;
  result?: string;
  ip?: string;
  detail?: string;
}

interface SessionItem {
  session_id: string;
  ip: string;
  device: string;
  user_agent: string;
  created_at: string;
  expires_at: string;
  is_current: boolean;
}

interface ApiKeyItem {
  key_id: string;
  name: string;
  prefix: string;
  created_at: string;
  expires_at?: string | null;
  last_used_at?: string | null;
  revoked: boolean;
  scopes: string[];
  key?: string;
}

interface ThirdPartyConfigStatus {
  configured: boolean;
}

type ThirdPartyStatusMap = Record<string, ThirdPartyConfigStatus>;

const THIRD_PARTY_SERVICES = [
  { id: "ip2location", label: "IP2Location", icon: "place", note: "Primary IP geolocation baseline with city, region, ASN, and ISP enrichment." },
  { id: "virustotal", label: "VirusTotal", icon: "security", note: "File and URL analysis integration for automated malware sandboxing." },
  { id: "shodan", label: "Shodan.io", icon: "language", note: "Internet-connected device discovery and port scanning metadata." },
  { id: "alienvault", label: "AlienVault OTX", icon: "public", note: "Open threat exchange pulses and indicator aggregation." },
  { id: "greynoise", label: "GreyNoise", icon: "radar", note: "Contextual noise and scanning classification for internet activity." },
  { id: "urlscan", label: "URLScan", icon: "travel_explore", note: "Web capture and rendered-page intelligence for suspect URLs." },
  { id: "abuseipdb", label: "AbuseIPDB", icon: "gpp_bad", note: "Reputation and abuse confidence scoring for IP infrastructure." },
];

const API_KEY_SCOPE_OPTIONS = [
  { id: "analyze", label: "Analyze" },
  { id: "recon", label: "Recon" },
  { id: "batch", label: "Batch" },
  { id: "stats", label: "Stats" },
] as const;

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function relativeTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Active now";
  if (diffMin < 60) return `${diffMin} minute(s) ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour(s) ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day(s) ago`;
}

function deviceIcon(device: string) {
  const normalized = device.toLowerCase();
  if (normalized.includes("iphone") || normalized.includes("android") || normalized.includes("mobile")) {
    return Smartphone;
  }
  if (normalized.includes("macbook") || normalized.includes("laptop") || normalized.includes("notebook")) {
    return Laptop;
  }
  return Monitor;
}

export default function Profile() {
  const { user, updateUserContext } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = (searchParams.get("tab") as ProfileTab | null) || "identity";
  const onboardingSource = searchParams.get("source") === "onboarding";
  const [activeTab, setActiveTab] = useState<ProfileTab>(
    requestedTab === "preferences" ||
      requestedTab === "external_api_keys" ||
      requestedTab === "audit_logs"
      ? requestedTab
      : "identity",
  );
  const [showAuditFilters, setShowAuditFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [creatingApiKey, setCreatingApiKey] = useState(false);
  const [isCreateApiKeyOpen, setIsCreateApiKeyOpen] = useState(false);
  const [createApiKeyError, setCreateApiKeyError] = useState("");
  const [revokingKeyId, setRevokingKeyId] = useState("");
  const [sessionAction, setSessionAction] = useState("");
  const [thirdPartySaving, setThirdPartySaving] = useState("");

  const [recoveryEmail, setRecoveryEmail] = useState(user?.recovery_email || "");
  const [avatarDraft, setAvatarDraft] = useState(user?.avatar_base64 || "");
  const [avatarFit, setAvatarFit] = useState<"cover" | "contain">(user?.avatar_fit || "cover");
  const [pendingAvatarData, setPendingAvatarData] = useState("");
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [bio, setBio] = useState(user?.bio || "");
  const [preferredLang, setPreferredLang] = useState(user?.preferred_lang || "pt");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [criticalAlerts, setCriticalAlerts] = useState(true);
  const [dailySummary, setDailySummary] = useState(true);
  const [moduleUpdates, setModuleUpdates] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [identityDirty, setIdentityDirty] = useState(false);
  const [preferencesDirty, setPreferencesDirty] = useState(false);

  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [freshKey, setFreshKey] = useState<ApiKeyItem | null>(null);
  const [newApiKeyName, setNewApiKeyName] = useState(
    `platform_key_${new Date().toISOString().slice(0, 10)}`,
  );
  const [newApiKeyExpiresDays, setNewApiKeyExpiresDays] = useState("30");
  const [newApiKeyScopes, setNewApiKeyScopes] = useState<string[]>([
    "analyze",
    "recon",
    "batch",
    "stats",
  ]);
  const [thirdPartyStatus, setThirdPartyStatus] = useState<ThirdPartyStatusMap>({});
  const [thirdPartyDrafts, setThirdPartyDrafts] = useState<Record<string, string>>({});
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [auditEventFilter, setAuditEventFilter] = useState("all");
  const [auditResultFilter, setAuditResultFilter] = useState("all");
  const [selectedAuditItem, setSelectedAuditItem] = useState<AuditItem | null>(null);
  const providerInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (
      requestedTab === "identity" ||
      requestedTab === "preferences" ||
      requestedTab === "external_api_keys" ||
      requestedTab === "audit_logs"
    ) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  useEffect(() => {
    if (!user) return;
    if (!identityDirty) {
      setAvatarDraft(user.avatar_base64 || "");
      setAvatarFit(user.avatar_fit || "cover");
      setRecoveryEmail(user.recovery_email || "");
      setBio(user.bio || "");
    }
    if (!preferencesDirty) {
      setPreferredLang(user.preferred_lang || "pt");
      setCriticalAlerts(user.notification_center?.preferences?.critical !== false);
      setDailySummary(user.notification_center?.preferences?.intelligence !== false);
      setModuleUpdates(user.notification_center?.preferences?.system !== false);
    }
  }, [identityDirty, preferencesDirty, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfileRuntime() {
      setLoading(true);
      setPageError("");
      try {
        const [apiKeysRes, thirdPartyRes, sessionsRes, auditRes] = await Promise.all([
          fetch(`${API_URL}/api/api-keys/me`, { credentials: "include" }),
          fetch(`${API_URL}/api/users/me/third-party-keys`, { credentials: "include" }),
          fetch(`${API_URL}/api/auth/sessions`, { credentials: "include" }),
          fetch(`${API_URL}/api/users/me/audit-logs?limit=50`, { credentials: "include" }),
        ]);

        if (!apiKeysRes.ok || !thirdPartyRes.ok || !sessionsRes.ok || !auditRes.ok) {
          throw new Error("profile_runtime_failed");
        }

        const [apiKeysData, thirdPartyData, sessionsData, auditData] = await Promise.all([
          apiKeysRes.json(),
          thirdPartyRes.json(),
          sessionsRes.json(),
          auditRes.json(),
        ]);

        if (!cancelled) {
          setApiKeys(apiKeysData as ApiKeyItem[]);
          setThirdPartyStatus(thirdPartyData as ThirdPartyStatusMap);
          setSessions(sessionsData as SessionItem[]);
          setAuditItems(auditData as AuditItem[]);
        }
      } catch {
        if (!cancelled) {
          setPageError("Não foi possível carregar o cockpit pessoal do operador.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfileRuntime();
    return () => {
      cancelled = true;
    };
  }, []);

  const configuredServiceCount = useMemo(
    () =>
      Object.values(thirdPartyStatus as Record<string, ThirdPartyConfigStatus>).filter(
        (item) => item?.configured,
      ).length,
    [thirdPartyStatus],
  );

  const firstPendingServiceId = useMemo(
    () =>
      THIRD_PARTY_SERVICES.find((service) => !thirdPartyStatus[service.id]?.configured)?.id ||
      THIRD_PARTY_SERVICES[0]?.id,
    [thirdPartyStatus],
  );

  const filteredAuditItems = useMemo(() => {
    return auditItems.filter((item) => {
      const matchesEvent =
        auditEventFilter === "all" ||
        item.action.toLowerCase().includes(auditEventFilter.toLowerCase());
      const matchesResult =
        auditResultFilter === "all" ||
        (item.result || "unknown").toLowerCase() === auditResultFilter.toLowerCase();
      return matchesEvent && matchesResult;
    });
  }, [auditEventFilter, auditItems, auditResultFilter]);

  const oldestActiveKeyAge = useMemo(() => {
    const activeKeys = apiKeys.filter((item) => !item.revoked);
    if (!activeKeys.length) return null;
    const oldest = activeKeys.reduce((left, right) =>
      new Date(left.created_at).getTime() < new Date(right.created_at).getTime() ? left : right,
    );
    return Math.max(
      0,
      Math.round((Date.now() - new Date(oldest.created_at).getTime()) / (1000 * 60 * 60 * 24)),
    );
  }, [apiKeys]);
  const activeApiKeysCount = useMemo(() => apiKeys.filter((item) => !item.revoked).length, [apiKeys]);

  const currentSession = sessions.find((item) => item.is_current);
  const profileSectionMeta = useMemo(() => {
    if (activeTab === "preferences") {
      return {
        eyebrow: "Operator Profile",
        title: "Regional Preferences & Security",
        subheading:
          "Adjust language, notifications, password posture, and active session controls without fragmenting the operator workflow.",
        toolbarLabel: "Preference actions",
      };
    }
    if (activeTab === "external_api_keys") {
      return {
        eyebrow: "Operator Profile",
        title: "Platform & Provider Credentials",
        subheading:
          "Manage VANTAGE keys and external provider credentials from a single operator-scoped security surface.",
        toolbarLabel: "Credential actions",
      };
    }
    if (activeTab === "audit_logs") {
      return {
        eyebrow: "Operator Profile",
        title: "Audit Registry",
        subheading:
          "Review your security-relevant activity, export evidence, and keep operational traceability close to the profile itself.",
        toolbarLabel: "Audit actions",
      };
    }
    return {
      eyebrow: "Operator Profile",
      title: "Personal Identity Settings",
      subheading:
        "Manage your administrative identity, recovery channels, and operator-facing profile data from a single control surface.",
      toolbarLabel: "Profile actions",
    };
  }, [activeTab]);
  const profileHeaderMetrics = useMemo(() => {
    if (activeTab === "preferences") {
      return (
        <>
          <PageMetricPill
            label={`${configuredServiceCount}/${THIRD_PARTY_SERVICES.length} Providers`}
            dotClassName={configuredServiceCount > 0 ? "bg-emerald-500" : "bg-outline"}
            tone={configuredServiceCount > 0 ? "success" : "muted"}
          />
          <PageMetricPill
            label={`${sessions.length} Active Sessions`}
            dotClassName="bg-primary"
            tone="primary"
          />
        </>
      );
    }
    if (activeTab === "external_api_keys") {
      return (
        <>
          <PageMetricPill
            label={`${activeApiKeysCount} Active Keys`}
            dotClassName={activeApiKeysCount > 0 ? "bg-emerald-500" : "bg-outline"}
            tone={activeApiKeysCount > 0 ? "success" : "muted"}
          />
          <PageMetricPill
            label={oldestActiveKeyAge !== null ? `${oldestActiveKeyAge}d Oldest Active` : "No active keys"}
            dotClassName={oldestActiveKeyAge !== null ? "bg-amber-500" : "bg-outline"}
            tone={oldestActiveKeyAge !== null ? "warning" : "muted"}
          />
        </>
      );
    }
    if (activeTab === "audit_logs") {
      return (
        <>
          <PageMetricPill
            label={`${filteredAuditItems.length} Visible Events`}
            dotClassName="bg-primary"
            tone="primary"
          />
          <PageMetricPill
            label={`${auditItems.length} Total Logged`}
            dotClassName="bg-secondary"
          />
        </>
      );
    }
    return (
      <>
        <PageMetricPill
          label={user?.role ? String(user.role).toUpperCase() : "OPERATOR"}
          dotClassName="bg-primary"
          tone="primary"
        />
        <PageMetricPill
          label={`${sessions.length} Active Sessions`}
          dotClassName="bg-emerald-500"
          tone="success"
        />
      </>
    );
  }, [
    activeApiKeysCount,
    activeTab,
    auditItems.length,
    configuredServiceCount,
    filteredAuditItems.length,
    oldestActiveKeyAge,
    sessions.length,
    user?.role,
  ]);

  const avatarSrc =
    avatarDraft ||
    user?.avatar_base64 ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
      user?.username || "operator",
    )}`;
  const avatarObjectClass = avatarFit === "contain" ? "object-contain" : "object-cover";
  const notificationCenterDraft = {
    read_ids: user?.notification_center?.read_ids || [],
    archived_ids: user?.notification_center?.archived_ids || [],
    preferences: {
      critical: criticalAlerts,
      system: moduleUpdates,
      intelligence: dailySummary,
    },
  };
  const hasPreferenceChanges =
    preferredLang !== (user?.preferred_lang || "pt") ||
    criticalAlerts !== (user?.notification_center?.preferences?.critical !== false) ||
    moduleUpdates !== (user?.notification_center?.preferences?.system !== false) ||
    dailySummary !== (user?.notification_center?.preferences?.intelligence !== false);

  useEffect(() => {
    if (!onboardingSource || activeTab !== "external_api_keys") return;
    const targetService = firstPendingServiceId;
    if (!targetService) return;
    const input = providerInputRefs.current[targetService];
    if (!input) return;
    window.setTimeout(() => input.focus(), 120);
  }, [activeTab, firstPendingServiceId, onboardingSource]);

  async function refreshRuntime() {
    setLoading(true);
    setNotice("");
    setPageError("");
    try {
      const [apiKeysRes, thirdPartyRes, sessionsRes, auditRes] = await Promise.all([
        fetch(`${API_URL}/api/api-keys/me`, { credentials: "include" }),
        fetch(`${API_URL}/api/users/me/third-party-keys`, { credentials: "include" }),
        fetch(`${API_URL}/api/auth/sessions`, { credentials: "include" }),
        fetch(`${API_URL}/api/users/me/audit-logs?limit=50`, { credentials: "include" }),
      ]);
      if (!apiKeysRes.ok || !thirdPartyRes.ok || !sessionsRes.ok || !auditRes.ok) {
        throw new Error("refresh_failed");
      }
      const [apiKeysData, thirdPartyData, sessionsData, auditData] = await Promise.all([
        apiKeysRes.json(),
        thirdPartyRes.json(),
        sessionsRes.json(),
        auditRes.json(),
      ]);
      setApiKeys(apiKeysData as ApiKeyItem[]);
      setThirdPartyStatus(thirdPartyData as ThirdPartyStatusMap);
      setSessions(sessionsData as SessionItem[]);
      setAuditItems(auditData as AuditItem[]);
    } catch {
      setPageError("Falha ao atualizar os dados pessoais do operador.");
    } finally {
      setLoading(false);
    }
  }

  async function saveIdentityProfile() {
    setSavingIdentity(true);
    setPageError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recovery_email: recoveryEmail || null,
          avatar_base64: avatarDraft || null,
          avatar_fit: avatarFit,
          bio,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.detail || "identity_update_failed");
      }
      if (user) {
        updateUserContext({
          ...user,
          recovery_email: recoveryEmail || null,
          avatar_base64: avatarDraft || null,
          avatar_fit: avatarFit,
          bio,
        });
      }
      setIdentityDirty(false);
      setNotice("Identity profile synchronized with the backend.");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setPageError(
        detail === "Email already in use"
          ? "O e-mail de recuperação já está em uso por outro operador."
          : "Não foi possível salvar o perfil de identidade.",
      );
    } finally {
      setSavingIdentity(false);
    }
  }

  async function savePreferences() {
    setSavingPreferences(true);
    setPageError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferred_lang: preferredLang,
          notification_center: notificationCenterDraft,
        }),
      });
      if (!response.ok) {
        throw new Error("prefs_update_failed");
      }
      if (user) {
        updateUserContext({
          ...user,
          preferred_lang: preferredLang,
          notification_center: notificationCenterDraft,
        });
      }
      setPreferencesDirty(false);
      setLanguage(preferredLang as "pt" | "en" | "es");
      setNotice(t("profile.preferences.saved", "Regional preferences updated."));
    } catch {
      setPageError("Não foi possível salvar as preferências pessoais.");
    } finally {
      setSavingPreferences(false);
    }
  }

  function handleAvatarFileChange(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) return;
      setPendingAvatarData(result);
      setAvatarEditorOpen(true);
      setNotice("");
    };
    reader.readAsDataURL(file);
  }

  function confirmAvatarSelection() {
    if (!pendingAvatarData) return;
    setIdentityDirty(true);
    setAvatarDraft(pendingAvatarData);
    setAvatarEditorOpen(false);
    setPendingAvatarData("");
    setNotice("Avatar preparado para salvar.");
  }

  async function updatePassword() {
    if (!newPassword || newPassword !== confirmPassword) {
      setPageError("A nova senha precisa ser confirmada corretamente.");
      return;
    }
    setSavingPassword(true);
    setPageError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/users/me`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.detail || "password_update_failed");
      }
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Administrative credential updated.");
      await refreshRuntime();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setPageError(
        detail === "password_reuse_denied"
          ? "A nova senha já foi utilizada recentemente."
          : "Não foi possível atualizar a senha do operador.",
      );
    } finally {
      setSavingPassword(false);
    }
  }

  async function revokeSession(sessionId: string) {
    setSessionAction(sessionId);
    setPageError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/auth/sessions/${sessionId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("session_revoke_failed");
      }
      setNotice("Sessão revogada.");
      await refreshRuntime();
    } catch {
      setPageError("Não foi possível revogar a sessão selecionada.");
    } finally {
      setSessionAction("");
    }
  }

  async function revokeOtherSessions() {
    setSessionAction("others");
    setPageError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/auth/sessions/others`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("session_revoke_others_failed");
      }
      setNotice("Sessões paralelas revogadas.");
      await refreshRuntime();
    } catch {
      setPageError("Não foi possível revogar as outras sessões.");
    } finally {
      setSessionAction("");
    }
  }

  async function createApiKey() {
    const normalizedName = newApiKeyName.trim();
    const expiresDays =
      newApiKeyExpiresDays === "never" ? null : Number.parseInt(newApiKeyExpiresDays, 10);

    if (!normalizedName) {
      setCreateApiKeyError("Informe um nome para a nova API key.");
      return;
    }

    if (!newApiKeyScopes.length) {
      setCreateApiKeyError("Selecione pelo menos um escopo para a API key.");
      return;
    }

    setCreatingApiKey(true);
    setPageError("");
    setNotice("");
    setCreateApiKeyError("");
    setFreshKey(null);
    try {
      const response = await fetch(`${API_URL}/api/api-keys`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          expires_days: expiresDays,
          scopes: newApiKeyScopes,
        }),
      });
      if (!response.ok) {
        throw new Error("api_key_create_failed");
      }
      const created = (await response.json()) as ApiKeyItem;
      setFreshKey(created);
      setNotice("Nova chave VANTAGE emitida. O valor bruto é exibido apenas uma vez.");
      setIsCreateApiKeyOpen(false);
      setNewApiKeyName(`platform_key_${new Date().toISOString().slice(0, 10)}`);
      setNewApiKeyExpiresDays("30");
      setNewApiKeyScopes(["analyze", "recon", "batch", "stats"]);
      await refreshRuntime();
    } catch {
      setPageError("Não foi possível emitir a nova chave VANTAGE.");
    } finally {
      setCreatingApiKey(false);
    }
  }

  async function revokeApiKey(keyId: string) {
    setRevokingKeyId(keyId);
    setPageError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/api-keys/${keyId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("api_key_revoke_failed");
      }
      setNotice("Chave revogada com sucesso.");
      await refreshRuntime();
    } catch {
      setPageError("Não foi possível revogar a chave selecionada.");
    } finally {
      setRevokingKeyId("");
    }
  }

  async function saveThirdPartyKey(service: string) {
    const value = thirdPartyDrafts[service] ?? "";
    if (!value.trim()) {
      setPageError("Informe a credencial antes de sincronizar.");
      return;
    }
    setThirdPartySaving(service);
    setPageError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/users/me/third-party-keys`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keys: {
            [service]: value,
          },
        }),
      });
      if (!response.ok) {
        throw new Error("third_party_update_failed");
      }
      setThirdPartyDrafts((current) => ({ ...current, [service]: "" }));
      setNotice(`Credencial ${service} ${t("profile.onboarding.synced", "synchronized with your personal vault and registered in the Audit Registry.")}`);
      await refreshRuntime();
    } catch {
      setPageError("Não foi possível atualizar a credencial de terceiro.");
    } finally {
      setThirdPartySaving("");
    }
  }

  async function copyFreshKey() {
    if (!freshKey?.key) return;
    try {
      await navigator.clipboard.writeText(freshKey.key);
      setNotice("Chave copiada para a área de transferência.");
    } catch {
      setPageError("Não foi possível copiar a chave.");
    }
  }

  function exportAuditCsv() {
    const rows = [
      ["timestamp", "user", "action", "target", "result", "ip", "detail"],
      ...filteredAuditItems.map((item) => [
        item.timestamp,
        item.user,
        item.action,
        item.target || "",
        item.result || "",
        item.ip || "",
        item.detail || "",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "profile-audit-log.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page-frame profile-page-frame">
      <PageHeader
        eyebrow={profileSectionMeta.eyebrow}
        title={profileSectionMeta.title}
        description={profileSectionMeta.subheading}
        metrics={profileHeaderMetrics}
      />

      <PageToolbar className="mb-8" label={profileSectionMeta.toolbarLabel}>
        <PageToolbarGroup className="ml-auto">
          <button className="btn btn-outline" onClick={refreshRuntime}>
            <RefreshCw className="w-4 h-4" />
            Refresh data
          </button>
        </PageToolbarGroup>
      </PageToolbar>

      {(pageError || notice || user?.force_password_reset) && (
        <div className="mb-6 space-y-3">
          {user?.force_password_reset && (
            <div className="rounded bg-error/10 px-4 py-3 text-sm text-error">
              Esta conta foi marcada para troca imediata de senha. Faça isso na aba de
              preferências antes de continuar a operação.
            </div>
          )}
          {pageError && <div className="rounded bg-error/10 px-4 py-3 text-sm text-error">{pageError}</div>}
          {notice && <div className="rounded bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div>}
        </div>
      )}

      <div className="page-with-side-rail">
        <aside className="page-side-rail-right">
          <div className="card overflow-hidden">
            <div className="h-24 bg-primary relative">
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
                  backgroundSize: "20px 20px",
                }}
              ></div>
            </div>
            <div className="px-6 pb-6 text-center">
              <div className="relative inline-block -mt-12 mb-4">
                <img
                  src={avatarSrc}
                  alt={user?.username || "User"}
                  className={`w-24 h-24 rounded-full border-4 border-white shadow-lg bg-surface-container-lowest ${avatarObjectClass}`}
                />
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleAvatarFileChange(event.target.files?.[0] || null)}
                />
                <button
                  className="absolute bottom-0 right-0 bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center shadow-md hover:bg-primary-dim transition-colors"
                  title="Atualizar avatar"
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
              <h2 className="text-lg font-bold text-on-surface">
                {user?.name || user?.username || "Operator"}
              </h2>
              <p className="text-xs text-on-surface-variant font-medium tracking-tight">
                {(user?.role || "tech").toUpperCase()} | Tier 3
              </p>
              <div className="mt-4 pt-4 border-t border-outline-variant/10 flex justify-around">
                <div className="text-center">
                  <span className="block text-xs font-bold text-primary">{auditItems.length}</span>
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-semibold">
                    Events
                  </span>
                </div>
                <div className="text-center">
                  <span className="block text-xs font-bold text-primary">{sessions.length}</span>
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-semibold">
                    Nodes
                  </span>
                </div>
                <div className="text-center">
                  <span className="block text-xs font-bold text-primary">
                    {configuredServiceCount}
                  </span>
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-semibold">
                    Links
                  </span>
                </div>
              </div>
            </div>
          </div>

          <section className="surface-section overflow-hidden">
            <div className="surface-section-header">
              <div>
                <h3 className="surface-section-title">Section Context</h3>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                  Navigation now lives in the fixed sidebar shell
                </p>
              </div>
            </div>
            <div className="p-4 space-y-2 text-sm text-on-surface-variant">
              {activeTab === "identity" ? (
                <>
                  <ContextNote title="Personal Information" body="Core identity data synchronized from the operator record." />
                  <ContextNote title="Email Preferences" body="Recovery email and delivery endpoints for operator continuity." />
                  <ContextNote title="Security & Keys" body="Credential posture remains visible from the preference and key sections." />
                </>
              ) : activeTab === "preferences" ? (
                <>
                  <ContextNote title="Regional Protocols" body="Language and interface conventions applied to the operator session." />
                  <ContextNote title="Security & Sessions" body="Password, MFA and session controls share the same surface." />
                  <ContextNote title="Alert Configuration" body="Notification toggles remain local until full server persistence is expanded." />
                </>
              ) : activeTab === "external_api_keys" ? (
                <>
                  <ContextNote title="Platform Credentials" body="Keys for VANTAGE automation and external provider integrations." />
                  <ContextNote title="Integrations" body="Third-party access is configured per operator and masked by default." />
                  <ContextNote title="Usage Analytics" body="This area should show actionable credential context, not decorative cards." />
                </>
              ) : (
                <>
                  <ContextNote title="Activity Stream" body="Recent operator events and outcome-based filtering for audit review." />
                  <ContextNote title="Security Events" body="Authentication and governance signals remain traceable from the same log surface." />
                  <ContextNote title="Data Exports" body="CSV export should stay close to the audit table it acts upon." />
                </>
              )}
            </div>
          </section>
        </aside>

        <div className="page-main-pane">
          {loading ? (
            <div className="card p-8 text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
              Loading profile
            </div>
          ) : (
            <>
              {activeTab === "identity" && (
                <div className="card overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                  <div className="card-header">
                    <h3 className="card-title">Administrative Identity</h3>
                    <span className="badge badge-primary">LOCKED SYNC</span>
                  </div>
                  <div className="p-8 space-y-8">
                    <div className="grid grid-cols-2 gap-6">
                      <Field
                        label="Operational Handle"
                        value={user?.username || "—"}
                        readOnly
                      />
                      <Field label="System Role" value={user?.role || "—"} readOnly />
                      <Field
                        className="col-span-2"
                        label="Primary Communication Endpoint (Email)"
                        value={user?.email || "—"}
                        readOnly
                      />
                      <EditableField
                        className="col-span-2"
                        label="Recovery Channel (Email)"
                        value={recoveryEmail}
                        onChange={(value) => {
                          setIdentityDirty(true);
                          setRecoveryEmail(value);
                        }}
                        placeholder="fallback@vantage.local"
                        type="email"
                      />
                      <EditableField
                        className="col-span-2"
                        label="Bio / Operator Notes"
                        value={bio}
                        onChange={(value) => {
                          setIdentityDirty(true);
                          setBio(value);
                        }}
                        placeholder="Notas do operador, função, contexto regional ou observações úteis..."
                        multiline
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          setAvatarDraft(user?.avatar_base64 || "");
                          setAvatarFit(user?.avatar_fit || "cover");
                          setRecoveryEmail(user?.recovery_email || "");
                          setBio(user?.bio || "");
                          setIdentityDirty(false);
                        }}
                      >
                        Discard Changes
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={saveIdentityProfile}
                        disabled={savingIdentity}
                      >
                        {savingIdentity ? "Saving..." : "Save Identity Profile"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "preferences" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                  <div className="card overflow-hidden">
                    <div className="card-header">
                      <h3 className="card-title">Regional Interface</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="max-w-xs space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                          Interface Language
                        </label>
                        <select
                          value={preferredLang}
                          onChange={(event) => {
                            setPreferencesDirty(true);
                            setPreferredLang(event.target.value);
                          }}
                          className="w-full bg-surface-container-low border-b-2 border-outline focus:border-primary px-0 py-2 text-sm font-medium transition-all appearance-none cursor-pointer outline-none focus:ring-0 border-t-0 border-x-0"
                        >
                          <option value="en">Inglês (United States)</option>
                          <option value="pt">Português (Brasil)</option>
                          <option value="es">Espanhol (España)</option>
                        </select>
                        <p className="text-[10px] text-on-surface-variant mt-1">
                          Affects all operational logs and system labels.
                        </p>
                        <div className="pt-2">
                          <button
                            className="btn btn-primary"
                            onClick={savePreferences}
                            disabled={savingPreferences || !hasPreferenceChanges}
                          >
                            {savingPreferences ? "Saving..." : "Save Preferences"}
                          </button>
                        </div>
                      </div>

                      <div className="max-w-xs space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                          Interface Theme
                        </label>
                        <div className="nav-pills mt-2 inline-flex w-full">
                          <button
                            className={`flex-1 nav-pill-item ${theme === "light" ? "nav-pill-item-active" : "nav-pill-item-inactive"}`}
                            onClick={() => setTheme("light")}
                          >
                            Light
                          </button>
                          <button
                            className={`flex-1 nav-pill-item ${theme === "dark" ? "nav-pill-item-active" : "nav-pill-item-inactive"}`}
                            onClick={() => setTheme("dark")}
                          >
                            Dark
                          </button>
                          <button
                            className={`flex-1 nav-pill-item ${theme === "system" ? "nav-pill-item-active" : "nav-pill-item-inactive"}`}
                            onClick={() => setTheme("system")}
                          >
                            System
                          </button>
                        </div>
                        <p className="text-[10px] text-on-surface-variant mt-2 hidden md:block">
                          Instantly repaints local panels.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="card overflow-hidden">
                    <div className="card-header">
                      <h3 className="card-title">Security Configuration</h3>
                    </div>
                    <div className="p-8 space-y-10">
                      <section className="space-y-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Key className="w-4 h-4 text-primary" />
                          <h4 className="text-xs font-bold uppercase tracking-widest">
                            Update Administrative Password
                          </h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1 col-span-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                              Current Password
                            </label>
                            <input
                              className="w-full bg-surface-container-highest border-b-2 border-outline-variant px-0 py-2 text-sm font-medium text-on-surface-variant cursor-not-allowed border-t-0 border-x-0 focus:ring-0 outline-none"
                              placeholder="Managed by secure session context"
                              type="password"
                              disabled
                            />
                          </div>
                          <EditableField
                            label="New Password"
                            value={newPassword}
                            onChange={setNewPassword}
                            type="password"
                          />
                          <EditableField
                            label="Confirm New Password"
                            value={confirmPassword}
                            onChange={setConfirmPassword}
                            type="password"
                          />
                        </div>
                        <div className="flex justify-start">
                          <button
                            className="btn btn-secondary"
                            onClick={updatePassword}
                            disabled={savingPassword}
                          >
                            {savingPassword ? "Updating..." : "Update Password"}
                          </button>
                        </div>
                      </section>
                      <hr className="border-outline-variant/20" />
                      <section className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-primary" />
                            <h4 className="text-xs font-bold uppercase tracking-widest">
                              Multi-Factor Authentication (MFA)
                            </h4>
                          </div>
                          <span className="badge badge-primary">Active</span>
                        </div>
                        <div className="p-4 bg-surface-container-low rounded border border-outline-variant/20 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold">Authenticator App</p>
                            <p className="text-xs text-on-surface-variant">
                              Primary verification method using time-based codes.
                            </p>
                          </div>
                          <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-primary">
                            <span className="inline-block h-4 w-4 translate-x-6 transform rounded-full bg-white transition shadow-sm"></span>
                          </div>
                        </div>
                      </section>
                    </div>
                  </div>

                  <div className="card overflow-hidden">
                    <div className="card-header">
                      <h3 className="card-title">Notification Routing Preferences</h3>
                    </div>
                    <div className="p-6 space-y-4">
                      <ToggleCard
                        checked={criticalAlerts}
                        onChange={(value) => {
                          setPreferencesDirty(true);
                          setCriticalAlerts(value);
                        }}
                        title="Critical Incident Routing"
                        description="Escalations and high-risk findings shown in the operator queue."
                      />
                      <ToggleCard
                        checked={moduleUpdates}
                        onChange={(value) => {
                          setPreferencesDirty(true);
                          setModuleUpdates(value);
                        }}
                        title="System Notices"
                        description="Control-plane and service-state updates relevant to the operator."
                      />
                      <ToggleCard
                        checked={dailySummary}
                        onChange={(value) => {
                          setPreferencesDirty(true);
                          setDailySummary(value);
                        }}
                        title="Intelligence Feed Items"
                        description="Feed-derived signals and editorial intelligence surfaced in notifications."
                      />
                    </div>
                  </div>

                  <div className="card overflow-hidden">
                    <div className="card-header flex justify-between items-center">
                      <h3 className="card-title">Active Operational Sessions</h3>
                      <button
                        className="text-[9px] font-black text-error hover:underline uppercase tracking-widest"
                        onClick={revokeOtherSessions}
                        disabled={sessionAction === "others"}
                      >
                        {sessionAction === "others"
                          ? "Revoking..."
                          : "Revoke All Other Sessions"}
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-surface-container-low border-b border-outline-variant/20">
                          <tr>
                            <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-outline">
                              Device
                            </th>
                            <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-outline">
                              IP Address
                            </th>
                            <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-outline">
                              Last Activity
                            </th>
                            <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-outline text-right">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/10">
                          {sessions.map((session) => {
                            const SessionIcon = deviceIcon(session.device);
                            return (
                              <tr
                                key={session.session_id}
                                className="hover:bg-surface-container-low/50 transition-colors"
                              >
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <SessionIcon className="w-4 h-4 text-on-surface-variant" />
                                    <span className="text-xs font-bold">
                                      {session.device}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 font-mono text-[11px] text-on-surface-variant">
                                  {session.ip} {session.is_current ? "[Current]" : ""}
                                </td>
                                <td className="px-6 py-4 text-[11px] text-on-surface-variant">
                                  {session.is_current
                                    ? "Active Now"
                                    : relativeTime(session.created_at)}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {session.is_current ? (
                                    <span className="text-[10px] font-bold text-primary uppercase">
                                      Current
                                    </span>
                                  ) : (
                                    <div className="flex justify-end gap-2">
                                      <RowPrimaryAction
                                        label="Review"
                                        icon={<Eye className="h-3.5 w-3.5" />}
                                        onClick={() =>
                                          setNotice(
                                            `Session ${session.device} / ${session.ip} expires ${formatTimestamp(session.expires_at)}`,
                                          )
                                        }
                                      />
                                      <RowActionsMenu
                                        items={[
                                          {
                                            key: "review",
                                            label: "Review session context",
                                            icon: <Eye className="h-3.5 w-3.5" />,
                                            onSelect: () =>
                                              setNotice(
                                                `Session ${session.device} / ${session.ip} expires ${formatTimestamp(session.expires_at)}`,
                                              ),
                                          },
                                          {
                                            key: "revoke",
                                            label: "Revoke session",
                                            icon: <Trash2 className="h-3.5 w-3.5" />,
                                            onSelect: () => revokeSession(session.session_id),
                                            tone: "danger",
                                            dividerBefore: true,
                                            disabled: sessionAction === session.session_id,
                                          },
                                        ]}
                                      />
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-4 pt-4">
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                          setPreferredLang(user?.preferred_lang || "pt");
                          setNewPassword("");
                          setConfirmPassword("");
                          setCriticalAlerts(user?.notification_center?.preferences?.critical !== false);
                          setDailySummary(user?.notification_center?.preferences?.intelligence !== false);
                          setModuleUpdates(user?.notification_center?.preferences?.system !== false);
                          setPreferencesDirty(false);
                        }}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "external_api_keys" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                  {onboardingSource && (
                    <div className="rounded-sm border border-primary/20 bg-primary/10 px-5 py-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                            {t("profile.onboarding.eyebrow", "Provider onboarding")}
                          </div>
                          <h4 className="mt-2 text-sm font-bold text-on-surface">
                            {t("profile.onboarding.title", "Connect external providers with operator-level traceability")}
                          </h4>
                          <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">
                            {t(
                              "profile.onboarding.body",
                              "Credentials stored here stay scoped to your operator account, are masked at rest, and every update is registered in the Audit Registry. Start with the first pending provider, then return here whenever you need to rotate or revoke access.",
                            )}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                              const targetService = firstPendingServiceId;
                              if (!targetService) return;
                              providerInputRefs.current[targetService]?.focus();
                            }}
                          >
                            {t("profile.onboarding.focusFirst", "Focus first pending provider")}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setSearchParams({ tab: "external_api_keys" }, { replace: true })}
                          >
                            {t("profile.onboarding.dismiss", "Dismiss guide")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-on-surface-variant text-sm max-w-2xl">
                        Manage credentials for the VANTAGE core platform and configure
                        integrations with third-party intelligence providers. API activity
                        is logged in the Audit Registry.
                      </p>
                    </div>
                    <button
                      className="btn btn-primary flex items-center gap-2"
                      onClick={() => {
                        setCreateApiKeyError("");
                        setIsCreateApiKeyOpen(true);
                      }}
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      Generate Platform Key
                    </button>
                  </div>

                  {freshKey?.key && (
                    <div className="card p-4 bg-primary/5 border border-primary/20">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                            Newly issued key
                          </div>
                          <div className="mt-2 font-mono text-sm break-all">{freshKey.key}</div>
                        </div>
                        <button className="btn btn-secondary flex items-center gap-2" onClick={copyFreshKey}>
                          <Copy className="w-4 h-4" />
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  <section className="card p-0 overflow-hidden">
                    <div className="card-header flex items-center gap-3">
                      <h4 className="font-bold text-xs uppercase tracking-[0.2em] text-on-surface-variant">
                        Core Platform Credentials
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-surface-container-high">
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Key Alias
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Created
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Last Used
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Scope
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Status
                            </th>
                            <th className="px-6 py-3 text-right"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container-low">
                          {apiKeys.map((key) => (
                            <tr
                              key={key.key_id}
                              className="hover:bg-surface-container-low transition-colors group"
                            >
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-on-surface">
                                    {key.name}
                                  </span>
                                  <span className="text-[10px] font-mono text-outline uppercase">
                                    {key.prefix}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="text-xs text-on-surface">
                                    {formatTimestamp(key.created_at)}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-xs text-on-surface font-medium">
                                  {relativeTime(key.last_used_at)}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-secondary-container text-on-secondary-container uppercase">
                                  {key.scopes.length > 1 ? "Full Access" : key.scopes[0] || "none"}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      key.revoked ? "bg-error" : "bg-emerald-500"
                                    }`}
                                  ></div>
                                  <span className="text-[11px] font-bold text-on-surface uppercase tracking-tighter">
                                    {key.revoked ? "Revoked" : "Active"}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <RowPrimaryAction
                                    label="Review"
                                    icon={<Eye className="h-3.5 w-3.5" />}
                                    onClick={() =>
                                      setNotice(
                                        `${key.name} - scope: ${key.scopes.join(", ") || "none"} / created ${formatTimestamp(key.created_at)}`,
                                      )
                                    }
                                  />
                                  <RowActionsMenu
                                    items={[
                                      {
                                        key: "review",
                                        label: "Review credential context",
                                        icon: <Eye className="h-3.5 w-3.5" />,
                                        onSelect: () =>
                                          setNotice(
                                            `${key.name} - scope: ${key.scopes.join(", ") || "none"} / created ${formatTimestamp(key.created_at)}`,
                                          ),
                                      },
                                      {
                                        key: "revoke",
                                        label: key.revoked ? "Credential already revoked" : "Revoke credential",
                                        icon: <Trash2 className="h-3.5 w-3.5" />,
                                        onSelect: () => revokeApiKey(key.key_id),
                                        tone: "danger",
                                        dividerBefore: true,
                                        disabled: key.revoked || revokingKeyId === key.key_id,
                                      },
                                    ]}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="surface-section overflow-hidden">
                    <div className="surface-section-header">
                      <div className="flex items-center gap-3">
                        <h4 className="surface-section-title uppercase tracking-[0.2em] text-on-surface-variant">
                          Threat Intelligence Integrations
                        </h4>
                      </div>
                      <div className="text-[11px] font-bold text-on-surface-variant">
                        ACTIVE: {configuredServiceCount} / TOTAL: {THIRD_PARTY_SERVICES.length}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[56rem] text-left border-collapse">
                        <thead className="bg-surface-container-high">
                          <tr>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Provider
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Coverage
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Status
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Credential
                            </th>
                            <th className="px-6 py-3 text-right text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container-low">
                          {THIRD_PARTY_SERVICES.map((service) => {
                            const configured = Boolean(thirdPartyStatus[service.id]?.configured);
                            return (
                              <tr
                                key={service.id}
                                className="hover:bg-surface-container-low transition-colors"
                              >
                                <td className="px-6 py-4 align-top">
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-low">
                                      <span className="material-symbols-outlined text-primary">
                                        {service.icon}
                                      </span>
                                    </div>
                                    <div>
                                      <div className="text-sm font-bold text-on-surface">
                                        {service.label}
                                      </div>
                                      <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                                        {service.id}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <p className="max-w-[22rem] text-xs leading-relaxed text-on-surface-variant">
                                    {service.note}
                                  </p>
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <span
                                    className={`badge ${configured ? "badge-success" : "badge-primary"}`}
                                  >
                                    {configured ? "Connected" : "Pending Setup"}
                                  </span>
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <input
                                    ref={(node) => {
                                      providerInputRefs.current[service.id] = node;
                                    }}
                                    value={thirdPartyDrafts[service.id] || ""}
                                    onChange={(event) =>
                                      setThirdPartyDrafts((current) => ({
                                        ...current,
                                        [service.id]: event.target.value,
                                      }))
                                    }
                                    placeholder={configured ? "Rotate credential" : "Paste API key"}
                                    className="w-full min-w-[16rem] bg-surface-container-low border-b-2 border-outline px-0 py-2 text-xs font-medium transition-all outline-none focus:border-primary focus:ring-0 border-x-0 border-t-0"
                                  />
                                </td>
                                <td className="px-6 py-4 text-right align-top">
                                  <button
                                    className="btn btn-outline whitespace-nowrap"
                                    onClick={() => saveThirdPartyKey(service.id)}
                                    disabled={thirdPartySaving === service.id}
                                  >
                                    {thirdPartySaving === service.id ? "Syncing..." : "Configure Link"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-3 bg-inverse-surface text-white p-6 rounded flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-8">
                        <div>
                          <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-outline-variant mb-1">
                            Key Utilization Forecast
                          </h5>
                          <p className="text-sm font-bold">
                            Projected monthly quota consumption across all linked intelligence nodes.
                          </p>
                        </div>
                        <span className="material-symbols-outlined text-primary">monitoring</span>
                      </div>
                      <div className="h-24 w-full flex items-end gap-1">
                        {THIRD_PARTY_SERVICES.map((service, index) => (
                          <div
                            key={service.id}
                            className={`flex-1 ${
                              thirdPartyStatus[service.id]?.configured ? "bg-primary/80" : "bg-primary/20"
                            } transition-colors`}
                            style={{ height: `${40 + index * 7}%` }}
                          ></div>
                        ))}
                      </div>
                      <div className="mt-4 flex justify-between text-[9px] font-bold text-outline-variant uppercase tracking-widest">
                        <span>01 NOV</span>
                        <span>15 NOV</span>
                        <span>CURRENT</span>
                      </div>
                    </div>
                    <div className="bg-primary text-on-primary p-6 rounded flex flex-col justify-between">
                      <h5 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
                        Security Notice
                      </h5>
                      <p className="text-xs font-bold leading-tight">
                        {oldestActiveKeyAge
                          ? `Your oldest active API key was issued ${oldestActiveKeyAge} days ago. System recommends timely rotation.`
                          : "No active API keys detected. Generate one when automation is required."}
                      </p>
                      <button
                        className="mt-4 bg-white/10 hover:bg-white/20 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded"
                        onClick={() => {
                          setCreateApiKeyError("");
                          setIsCreateApiKeyOpen(true);
                        }}
                      >
                        Rotate Now
                      </button>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "audit_logs" && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-on-surface-variant text-sm mt-1">
                        Personal activity log tracking your interactions, security updates, and
                        profile changes.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className={`btn ${
                          showAuditFilters
                            ? "btn-primary"
                            : "btn-ghost border border-outline-variant/30"
                        } flex items-center gap-2`}
                        onClick={() => setShowAuditFilters(!showAuditFilters)}
                      >
                        <Filter className="w-4 h-4" />
                        Filter
                      </button>
                      <button className="btn btn-primary flex items-center gap-2" onClick={exportAuditCsv}>
                        <Download className="w-4 h-4" />
                        Export CSV
                      </button>
                    </div>
                  </div>

                  {showAuditFilters && (
                    <div className="card p-4 bg-surface-container-low border border-outline-variant/20 animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">
                          Filter Audit Logs
                        </h3>
                        <button
                          onClick={() => setShowAuditFilters(false)}
                          className="text-outline hover:text-on-surface"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                            Event Type
                          </label>
                          <select
                            value={auditEventFilter}
                            onChange={(event) => setAuditEventFilter(event.target.value)}
                            className="w-full bg-surface-container-high border-none border-b-2 border-outline focus:border-primary text-xs font-semibold p-2 outline-none"
                          >
                            <option value="all">All Events</option>
                            <option value="login">System Login</option>
                            <option value="profile">Profile Update</option>
                            <option value="search">Search Executed</option>
                            <option value="api">API Key Rotation</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                            Status
                          </label>
                          <select
                            value={auditResultFilter}
                            onChange={(event) => setAuditResultFilter(event.target.value)}
                            className="w-full bg-surface-container-high border-none border-b-2 border-outline focus:border-primary text-xs font-semibold p-2 outline-none"
                          >
                            <option value="all">All Statuses</option>
                            <option value="success">Success</option>
                            <option value="denied">Denied</option>
                            <option value="failed">Failed</option>
                          </select>
                        </div>
                        <div className="md:col-span-2 flex items-end gap-2">
                          <button
                            className="btn btn-ghost"
                            onClick={() => {
                              setAuditEventFilter("all");
                              setAuditResultFilter("all");
                            }}
                          >
                            Reset
                          </button>
                          <div className="text-[11px] font-semibold text-on-surface-variant">
                            {filteredAuditItems.length} visible event(s)
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="card p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-surface-container-high">
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Time
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Event
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Target
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              Result
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant text-right">
                              Details
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container-low">
                          {filteredAuditItems.map((item, index) => (
                            <tr key={`${item.timestamp}-${index}`} className="hover:bg-surface-container-low transition-colors">
                              <td className="px-6 py-4 text-[11px] font-mono text-on-surface-variant">
                                {formatTimestamp(item.timestamp)}
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-xs font-bold text-on-surface uppercase">
                                  {item.action}
                                </div>
                                <div className="text-[10px] text-on-surface-variant">
                                  {item.user}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-xs text-on-surface">
                                {item.target || "—"}
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  className={`badge ${
                                    (item.result || "").toLowerCase() === "success"
                                      ? "badge-primary"
                                      : "badge-error"
                                  }`}
                                >
                                  {item.result || "unknown"}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  className="inline-flex items-center gap-1 text-primary text-[11px] font-bold hover:underline"
                                  title={item.detail || "No extra detail"}
                                  type="button"
                                  onClick={() => setSelectedAuditItem(item)}
                                >
                                  Detail
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between border-t border-outline-variant/20 px-6 py-3">
                      <div className="text-[11px] text-on-surface-variant">
                        Showing {filteredAuditItems.length} audit event(s)
                      </div>
                      <div className="flex items-center gap-2 text-on-surface-variant">
                        <ChevronLeft className="w-4 h-4 opacity-40" />
                        <span className="text-xs font-bold text-on-surface">Page 1</span>
                        <ChevronRight className="w-4 h-4 opacity-40" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {isCreateApiKeyOpen && (
        <ModalShell
          title="Create API Key"
          description="Define alias, expiration policy and access scope before issuing a new operator-scoped platform key."
          icon="Platform Credentials"
          variant="editor"
          onClose={() => {
            setIsCreateApiKeyOpen(false);
            setCreateApiKeyError("");
          }}
          ariaLabel="Close create API key modal"
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setIsCreateApiKeyOpen(false);
                  setCreateApiKeyError("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={createApiKey}
                disabled={creatingApiKey}
              >
                {creatingApiKey ? "Generating..." : "Issue API Key"}
              </button>
            </>
          }
        >
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                      Key Alias
                    </label>
                    <input
                      type="text"
                      value={newApiKeyName}
                      onChange={(event) => setNewApiKeyName(event.target.value)}
                      placeholder="platform_key_finops"
                      className="w-full rounded-sm bg-surface-container-low px-4 py-3 text-sm font-medium text-on-surface outline-none ring-1 ring-outline-variant/20 transition focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-on-surface-variant">
                      Use a human-readable alias so the operator can identify this
                      key later in audits, review and rotation.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                      Expiration Policy
                    </label>
                    <select
                      value={newApiKeyExpiresDays}
                      onChange={(event) => setNewApiKeyExpiresDays(event.target.value)}
                      className="w-full rounded-sm bg-surface-container-low px-4 py-3 text-sm font-medium text-on-surface outline-none ring-1 ring-outline-variant/20 transition focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="180">180 days</option>
                      <option value="365">365 days</option>
                      <option value="never">No automatic expiration</option>
                    </select>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                        Allowed Scopes
                      </label>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        Choose only the capabilities this key actually needs.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {API_KEY_SCOPE_OPTIONS.map((scope) => {
                        const checked = newApiKeyScopes.includes(scope.id);
                        return (
                          <label
                            key={scope.id}
                            className="flex items-center gap-3 rounded-sm border border-outline-variant/15 bg-surface-container-low px-4 py-3 text-sm text-on-surface"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                setNewApiKeyScopes((current) =>
                                  event.target.checked
                                    ? [...current, scope.id]
                                    : current.filter((item) => item !== scope.id),
                                );
                              }}
                              className="h-4 w-4"
                            />
                            <span className="font-medium">{scope.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {createApiKeyError && (
                    <div className="rounded-sm bg-error/10 px-4 py-3 text-sm text-error">
                      {createApiKeyError}
                    </div>
                  )}
                </div>

                <aside className="space-y-4">
                  <div className="surface-section overflow-hidden">
                    <div className="surface-section-header">
                      <h4 className="surface-section-title">Issuance Summary</h4>
                    </div>
                    <div className="space-y-4 p-4 text-sm text-on-surface-variant">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface">
                          Alias
                        </div>
                        <div className="mt-1 break-words text-sm font-semibold text-on-surface">
                          {newApiKeyName.trim() || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface">
                          Expiration
                        </div>
                        <div className="mt-1 text-sm font-semibold text-on-surface">
                          {newApiKeyExpiresDays === "never"
                            ? "No automatic expiration"
                            : `${newApiKeyExpiresDays} days`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface">
                          Scope Set
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {newApiKeyScopes.length ? (
                            newApiKeyScopes.map((scope) => (
                              <span key={scope} className="badge badge-primary">
                                {scope}
                              </span>
                            ))
                          ) : (
                            <span className="badge badge-error">No scope selected</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed">
                        The raw credential will be shown only once after issuance and
                        the operation will be written to the Audit Registry.
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
        </ModalShell>
      )}

      {selectedAuditItem && (
        <ModalShell
          title={selectedAuditItem.action}
          description="Event detail captured from the operator audit registry."
          icon="Audit Detail"
          onClose={() => setSelectedAuditItem(null)}
          ariaLabel="Close audit detail"
          variant="dialog"
        >
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Field label="Timestamp" value={formatTimestamp(selectedAuditItem.timestamp)} readOnly />
                <Field label="User" value={selectedAuditItem.user || "—"} readOnly />
                <Field label="Result" value={selectedAuditItem.result || "unknown"} readOnly />
                <Field label="IP Address" value={selectedAuditItem.ip || "—"} readOnly />
                <Field className="md:col-span-2" label="Target" value={selectedAuditItem.target || "—"} readOnly />
                <Field
                  className="md:col-span-2"
                  label="Detail"
                  value={selectedAuditItem.detail || "No extra detail available for this event."}
                  multiline
                  readOnly
                />
              </div>
        </ModalShell>
      )}

      {avatarEditorOpen && (
        <ModalShell
          title="Ajustar foto de perfil"
          description="Revise como a foto será exibida no avatar antes de salvar."
          icon="Avatar Editor"
          onClose={() => {
            setAvatarEditorOpen(false);
            setPendingAvatarData("");
          }}
          ariaLabel="Close avatar editor"
          variant="dialog"
          bodyClassName="space-y-6"
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setAvatarEditorOpen(false);
                  setPendingAvatarData("");
                }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={confirmAvatarSelection}
              >
                Usar foto
              </button>
            </>
          }
        >
              <div className="flex justify-center">
                <div className="flex h-56 w-56 items-center justify-center rounded-full border-4 border-white bg-surface-container-low shadow-lg">
                  <img
                    src={pendingAvatarData}
                    alt="Avatar preview"
                    className={`h-full w-full rounded-full ${avatarFit === "contain" ? "object-contain" : "object-cover"}`}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                  Ajuste da imagem
                </label>
                <div className="nav-pills mt-2 inline-flex w-full">
                  <button
                    className={`flex-1 nav-pill-item ${avatarFit === "cover" ? "nav-pill-item-active" : "nav-pill-item-inactive"}`}
                    onClick={() => setAvatarFit("cover")}
                  >
                    Preencher
                  </button>
                  <button
                    className={`flex-1 nav-pill-item ${avatarFit === "contain" ? "nav-pill-item-active" : "nav-pill-item-inactive"}`}
                    onClick={() => setAvatarFit("contain")}
                  >
                    Ajustar
                  </button>
                </div>
              </div>
        </ModalShell>
      )}
    </div>
  );
}

function ContextNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-sm bg-surface-container-low p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface">
        {title}
      </div>
      <div className="mt-1 text-xs leading-relaxed text-on-surface-variant">{body}</div>
    </div>
  );
}

function Field({
  label,
  value,
  readOnly,
  className = "",
  multiline = false,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
  className?: string;
  multiline?: boolean;
}) {
  return multiline ? (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
        {label}
      </label>
      <textarea
        rows={3}
        value={value}
        readOnly={readOnly}
        className="w-full bg-surface-container-highest border-b-2 border-outline-variant px-0 py-2 text-sm font-medium text-on-surface-variant cursor-not-allowed border-t-0 border-x-0 focus:ring-0 outline-none resize-none"
      ></textarea>
    </div>
  ) : (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
        {label}
      </label>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        className="w-full bg-surface-container-highest border-b-2 border-outline-variant px-0 py-2 text-sm font-medium text-on-surface-variant cursor-not-allowed border-t-0 border-x-0 focus:ring-0 outline-none"
      />
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  multiline?: boolean;
}) {
  if (multiline) {
    return (
      <div className={`space-y-1 ${className}`}>
        <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
          {label}
        </label>
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
          className="w-full resize-none bg-surface-container-low border-b-2 border-outline focus:border-primary border-t-0 border-x-0 px-0 py-2 text-sm font-medium transition-all focus:ring-0 outline-none"
        />
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-surface-container-low border-b-2 border-outline focus:border-primary border-t-0 border-x-0 px-0 py-2 text-sm font-medium transition-all focus:ring-0 outline-none"
      />
    </div>
  );
}

function ToggleCard({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex items-center gap-3 p-3 bg-surface-container-low rounded border border-outline-variant/20 cursor-pointer hover:bg-surface-container transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="w-4 h-4 text-primary bg-surface-container-lowest border-outline rounded focus:ring-primary/20"
      />
      <div>
        <div className="text-xs font-bold text-on-surface">{title}</div>
        <div className="text-[10px] text-on-surface-variant">{description}</div>
      </div>
    </label>
  );
}

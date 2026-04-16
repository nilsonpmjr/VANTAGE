import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import {
  Camera,
  History,
  ShieldCheck,
  ShieldAlert,
  Key,
  Globe,
  MapPinned,
  Monitor,
  Smartphone,
  Laptop,
  Radar,
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

const THIRD_PARTY_SERVICE_DEFS = [
  { id: "ip2location", label: "IP2Location", icon: MapPinned, noteKey: "profile.thirdParty.services.ip2locationNote" as const },
  { id: "virustotal", label: "VirusTotal", icon: ShieldCheck, noteKey: "profile.thirdParty.services.virustotalNote" as const },
  { id: "shodan", label: "Shodan.io", icon: Globe, noteKey: "profile.thirdParty.services.shodanNote" as const },
  { id: "alienvault", label: "AlienVault OTX", icon: Eye, noteKey: "profile.thirdParty.services.alienvaultNote" as const },
  { id: "greynoise", label: "GreyNoise", icon: Radar, noteKey: "profile.thirdParty.services.greynoiseNote" as const },
  { id: "urlscan", label: "URLScan", icon: ExternalLink, noteKey: "profile.thirdParty.services.urlscanNote" as const },
  { id: "abuseipdb", label: "AbuseIPDB", icon: ShieldAlert, noteKey: "profile.thirdParty.services.abuseipdbNote" as const },
];

const API_KEY_SCOPE_OPTIONS = [
  { id: "analyze", label: "Analyze" },
  { id: "recon", label: "Recon" },
  { id: "batch", label: "Batch" },
  { id: "stats", label: "Stats" },
] as const;

function formatTimestamp(value?: string | null, locale = "pt-BR") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
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

function createImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = src;
  });
}

async function getCroppedAvatar(src: string, crop: Area) {
  const image = await createImage(src);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("avatar_canvas_unavailable");
  }

  const size = Math.max(crop.width, crop.height);
  canvas.width = size;
  canvas.height = size;

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    size,
    size,
  );

  return canvas.toDataURL("image/png");
}

const LOCALE_MAP: Record<string, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };

export default function Profile() {
  const { user, updateUserContext } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  const THIRD_PARTY_SERVICES = useMemo(
    () =>
      THIRD_PARTY_SERVICE_DEFS.map((svc) => ({
        ...svc,
        note: t(svc.noteKey),
      })),
    [t],
  );

  const locale = LOCALE_MAP[language] ?? "pt-BR";

  function relativeTime(value?: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return t("profile.sessions.activeNow");
    if (diffMin < 60) return `${diffMin} ${t("profile.messages.minutesAgo")}`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr} ${t("profile.messages.hoursAgo")}`;
    const diffDay = Math.round(diffHr / 24);
    return `${diffDay} ${t("profile.messages.daysAgo")}`;
  }
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
  const [avatarCrop, setAvatarCrop] = useState({ x: 0, y: 0 });
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarCropPixels, setAvatarCropPixels] = useState<Area | null>(null);
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
          setPageError(t("profile.notices.identityUpdateFailed"));
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
        eyebrow: t("profile.page.eyebrow"),
        title: t("profile.page.preferencesTitle"),
        subheading: t("profile.page.preferencesSubtitle"),
        toolbarLabel: t("profile.toolbar.preferences"),
      };
    }
    if (activeTab === "external_api_keys") {
      return {
        eyebrow: t("profile.page.eyebrow"),
        title: t("profile.page.apiKeysTitle"),
        subheading: t("profile.page.apiKeysSubtitle"),
        toolbarLabel: t("profile.toolbar.credentials"),
      };
    }
    if (activeTab === "audit_logs") {
      return {
        eyebrow: t("profile.page.eyebrow"),
        title: t("profile.page.auditTitle"),
        subheading: t("profile.page.auditSubtitle"),
        toolbarLabel: t("profile.toolbar.audit"),
      };
    }
    return {
      eyebrow: t("profile.page.eyebrow"),
      title: t("profile.page.identityTitle"),
      subheading: t("profile.page.identitySubtitle"),
      toolbarLabel: t("profile.toolbar.identity"),
    };
  }, [activeTab, t]);
  const profileHeaderMetrics = useMemo(() => {
    if (activeTab === "preferences") {
      return (
        <>
          <PageMetricPill
            label={`${configuredServiceCount}/${THIRD_PARTY_SERVICES.length} ${t("profile.metrics.providers")}`}
            dotClassName={configuredServiceCount > 0 ? "bg-emerald-500" : "bg-outline"}
            tone={configuredServiceCount > 0 ? "success" : "muted"}
          />
          <PageMetricPill
            label={`${sessions.length} ${t("profile.metrics.activeSessions")}`}
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
            label={`${activeApiKeysCount} ${t("profile.metrics.activeKeys")}`}
            dotClassName={activeApiKeysCount > 0 ? "bg-emerald-500" : "bg-outline"}
            tone={activeApiKeysCount > 0 ? "success" : "muted"}
          />
          <PageMetricPill
            label={oldestActiveKeyAge !== null ? `${oldestActiveKeyAge}d ${t("profile.metrics.oldestActive")}` : t("profile.metrics.noActiveKeys")}
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
            label={`${filteredAuditItems.length} ${t("profile.metrics.visibleEvents")}`}
            dotClassName="bg-primary"
            tone="primary"
          />
          <PageMetricPill
            label={`${auditItems.length} ${t("profile.metrics.totalLogged")}`}
            dotClassName="bg-secondary"
          />
        </>
      );
    }
    return (
      <>
        <PageMetricPill
          label={user?.role ? String(user.role).toUpperCase() : t("profile.metrics.defaultRole")}
          dotClassName="bg-primary"
          tone="primary"
        />
        <PageMetricPill
          label={`${sessions.length} ${t("profile.metrics.activeSessions")}`}
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
      setPageError(t("profile.notices.identityUpdateFailed"));
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
      setNotice(t("profile.notices.identitySaved"));
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setPageError(
        detail === "Email already in use"
          ? t("profile.notices.emailRecoveryInUse")
          : t("profile.notices.identitySaveFailed"),
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
      setPageError(t("profile.notices.preferencesSaveFailed"));
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
      openAvatarEditor(result);
    };
    reader.readAsDataURL(file);
  }

  const openAvatarEditor = useCallback((source: string) => {
    setPendingAvatarData(source);
    setAvatarCrop({ x: 0, y: 0 });
    setAvatarZoom(1);
    setAvatarCropPixels(null);
    setAvatarEditorOpen(true);
    setNotice("");
  }, []);

  async function confirmAvatarSelection() {
    if (!pendingAvatarData) return;
    if (!avatarCropPixels) return;
    const croppedAvatar = await getCroppedAvatar(pendingAvatarData, avatarCropPixels);
    setIdentityDirty(true);
    setAvatarDraft(croppedAvatar);
    setAvatarFit("cover");
    setAvatarEditorOpen(false);
    setPendingAvatarData("");
    setNotice(t("profile.avatar.readyToSave"));
  }

  function removeAvatarSelection() {
    setIdentityDirty(true);
    setAvatarDraft("");
    setPendingAvatarData("");
    setAvatarFit("cover");
    setAvatarEditorOpen(false);
    setNotice(t("profile.avatar.removed"));
  }

  async function updatePassword() {
    if (!newPassword || newPassword !== confirmPassword) {
      setPageError(t("profile.notices.passwordMismatch"));
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
      setNotice(t("profile.notices.passwordUpdated"));
      await refreshRuntime();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setPageError(
        detail === "password_reuse_denied"
          ? t("profile.notices.passwordReuseDenied")
          : t("profile.notices.passwordUpdateFailed"),
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
      setNotice(t("profile.notices.sessionRevoked"));
      await refreshRuntime();
    } catch {
      setPageError(t("profile.notices.sessionRevokeFailed"));
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
      setNotice(t("profile.notices.sessionsRevoked"));
      await refreshRuntime();
    } catch {
      setPageError(t("profile.notices.sessionsRevokeFailed"));
    } finally {
      setSessionAction("");
    }
  }

  async function createApiKey() {
    const normalizedName = newApiKeyName.trim();
    const expiresDays =
      newApiKeyExpiresDays === "never" ? null : Number.parseInt(newApiKeyExpiresDays, 10);

    if (!normalizedName) {
      setCreateApiKeyError(t("profile.notices.apiKeyNameRequired"));
      return;
    }

    if (!newApiKeyScopes.length) {
      setCreateApiKeyError(t("profile.notices.apiKeyScopeRequired"));
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
      setNotice(t("profile.notices.apiKeyIssued"));
      setIsCreateApiKeyOpen(false);
      setNewApiKeyName(`platform_key_${new Date().toISOString().slice(0, 10)}`);
      setNewApiKeyExpiresDays("30");
      setNewApiKeyScopes(["analyze", "recon", "batch", "stats"]);
      await refreshRuntime();
    } catch {
      setPageError(t("profile.notices.apiKeyIssueFailed"));
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
      setNotice(t("profile.notices.apiKeyRevoked"));
      await refreshRuntime();
    } catch {
      setPageError(t("profile.notices.apiKeyRevokeFailed"));
    } finally {
      setRevokingKeyId("");
    }
  }

  async function saveThirdPartyKey(service: string) {
    const value = thirdPartyDrafts[service] ?? "";
    if (!value.trim()) {
      setPageError(t("profile.notices.credentialRequired"));
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
      setPageError(t("profile.notices.credentialUpdateFailed"));
    } finally {
      setThirdPartySaving("");
    }
  }

  async function copyFreshKey() {
    if (!freshKey?.key) return;
    try {
      await navigator.clipboard.writeText(freshKey.key);
      setNotice(t("profile.notices.keyCopied"));
    } catch {
      setPageError(t("profile.notices.keyCopyFailed"));
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
            {t("profile.toolbar.refreshData")}
          </button>
        </PageToolbarGroup>
      </PageToolbar>

      {(pageError || notice || user?.force_password_reset) && (
        <div className="mb-6 space-y-3">
          {user?.force_password_reset && (
            <div className="rounded bg-error/10 px-4 py-3 text-sm text-error">
              {t("profile.notices.forcePasswordReset")}
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
                  onClick={() => {
                    if (avatarDraft || user?.avatar_base64) {
                      openAvatarEditor(avatarDraft || user?.avatar_base64 || "");
                    }
                  }}
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
                  title={avatarDraft || user?.avatar_base64 ? t("profile.avatar.edit") : t("profile.avatar.update")}
                  type="button"
                  onClick={() => {
                    if (avatarDraft || user?.avatar_base64) {
                      openAvatarEditor(avatarDraft || user?.avatar_base64 || "");
                      return;
                    }
                    avatarInputRef.current?.click();
                  }}
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
                <h3 className="surface-section-title">{t("profile.sectionContext.title")}</h3>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                  {t("profile.sectionContext.subtitle")}
                </p>
              </div>
            </div>
            <div className="p-4 space-y-2 text-sm text-on-surface-variant">
              {activeTab === "identity" ? (
                <>
                  <ContextNote title={t("profile.identity.context.personalTitle")} body={t("profile.identity.context.personalBody")} />
                  <ContextNote title={t("profile.identity.context.emailTitle")} body={t("profile.identity.context.emailBody")} />
                  <ContextNote title={t("profile.identity.context.securityTitle")} body={t("profile.identity.context.securityBody")} />
                </>
              ) : activeTab === "preferences" ? (
                <>
                  <ContextNote title={t("profile.preferences.context.regionalTitle")} body={t("profile.preferences.context.regionalBody")} />
                  <ContextNote title={t("profile.preferences.context.securityTitle")} body={t("profile.preferences.context.securityBody")} />
                  <ContextNote title={t("profile.preferences.context.alertTitle")} body={t("profile.preferences.context.alertBody")} />
                </>
              ) : activeTab === "external_api_keys" ? (
                <>
                  <ContextNote title={t("profile.apiKeys.context.platformTitle")} body={t("profile.apiKeys.context.platformBody")} />
                  <ContextNote title={t("profile.apiKeys.context.integrationsTitle")} body={t("profile.apiKeys.context.integrationsBody")} />
                  <ContextNote title={t("profile.apiKeys.context.analyticsTitle")} body={t("profile.apiKeys.context.analyticsBody")} />
                </>
              ) : (
                <>
                  <ContextNote title={t("profile.audit.context.activityTitle")} body={t("profile.audit.context.activityBody")} />
                  <ContextNote title={t("profile.audit.context.securityTitle")} body={t("profile.audit.context.securityBody")} />
                  <ContextNote title={t("profile.audit.context.exportsTitle")} body={t("profile.audit.context.exportsBody")} />
                </>
              )}
            </div>
          </section>
        </aside>

        <div className="page-main-pane">
          {loading ? (
            <div className="card p-8 text-[11px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
              {t("profile.identity.loading")}
            </div>
          ) : (
            <>
              {activeTab === "identity" && (
                <div className="card overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                  <div className="card-header">
                    <h3 className="card-title">{t("profile.identity.title")}</h3>
                    <span className="badge badge-primary">{t("profile.identity.lockedSync")}</span>
                  </div>
                  <div className="p-8 space-y-8">
                    <div className="grid grid-cols-2 gap-6">
                      <Field
                        label={t("profile.identity.fields.username")}
                        value={user?.username || "—"}
                        readOnly
                      />
                      <Field label={t("profile.identity.fields.role")} value={user?.role || "—"} readOnly />
                      <Field
                        className="col-span-2"
                        label={t("profile.identity.fields.email")}
                        value={user?.email || "—"}
                        readOnly
                      />
                      <EditableField
                        className="col-span-2"
                        label={t("profile.identity.fields.recovery")}
                        value={recoveryEmail}
                        onChange={(value) => {
                          setIdentityDirty(true);
                          setRecoveryEmail(value);
                        }}
                        placeholder={t("profile.identity.fields.recoveryPlaceholder")}
                        type="email"
                      />
                      <EditableField
                        className="col-span-2"
                        label={t("profile.identity.fields.bio")}
                        value={bio}
                        onChange={(value) => {
                          setIdentityDirty(true);
                          setBio(value);
                        }}
                        placeholder={t("profile.identity.fields.bioPlaceholder")}
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
                        {t("profile.buttons.discardChanges")}
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={saveIdentityProfile}
                        disabled={savingIdentity}
                      >
                        {savingIdentity ? t("profile.buttons.savingIdentity") : t("profile.buttons.saveIdentity")}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "preferences" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                  <div className="card overflow-hidden">
                    <div className="card-header">
                      <h3 className="card-title">{t("profile.preferences.regional.title")}</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="max-w-xs space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                          {t("profile.preferences.regional.languageLabel")}
                        </label>
                        <select
                          value={preferredLang}
                          onChange={(event) => {
                            setPreferencesDirty(true);
                            setPreferredLang(event.target.value);
                          }}
                          className="w-full bg-surface-container-low border-b-2 border-outline focus:border-primary px-0 py-2 text-sm font-medium transition-all appearance-none cursor-pointer outline-none focus:ring-0 border-t-0 border-x-0"
                        >
                          <option value="en">{t("profile.preferences.regional.english")}</option>
                          <option value="pt">{t("profile.preferences.regional.portuguese")}</option>
                          <option value="es">{t("profile.preferences.regional.spanish")}</option>
                        </select>
                        <p className="text-[10px] text-on-surface-variant mt-1">
                          {t("profile.preferences.regional.hint")}
                        </p>
                        <div className="pt-2">
                          <button
                            className="btn btn-primary"
                            onClick={savePreferences}
                            disabled={savingPreferences || !hasPreferenceChanges}
                          >
                            {savingPreferences ? t("profile.buttons.savingPreferences") : t("profile.buttons.savePreferences")}
                          </button>
                        </div>
                      </div>

                      <div className="max-w-xs space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                          {t("profile.preferences.theme.label")}
                        </label>
                        <div className="nav-pills mt-2 inline-flex w-full">
                          <button
                            className={`flex-1 nav-pill-item ${theme === "light" ? "nav-pill-item-active" : "nav-pill-item-inactive"}`}
                            onClick={() => setTheme("light")}
                          >
                            {t("profile.preferences.theme.light")}
                          </button>
                          <button
                            className={`flex-1 nav-pill-item ${theme === "dark" ? "nav-pill-item-active" : "nav-pill-item-inactive"}`}
                            onClick={() => setTheme("dark")}
                          >
                            {t("profile.preferences.theme.dark")}
                          </button>
                          <button
                            className={`flex-1 nav-pill-item ${theme === "system" ? "nav-pill-item-active" : "nav-pill-item-inactive"}`}
                            onClick={() => setTheme("system")}
                          >
                            {t("profile.preferences.theme.system")}
                          </button>
                        </div>
                        <p className="text-[10px] text-on-surface-variant mt-2 hidden md:block">
                          {t("profile.preferences.theme.hint")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="card overflow-hidden">
                    <div className="card-header">
                      <h3 className="card-title">{t("profile.security.title")}</h3>
                    </div>
                    <div className="p-8 space-y-10">
                      <section className="space-y-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Key className="w-4 h-4 text-primary" />
                          <h4 className="text-xs font-bold uppercase tracking-widest">
                            {t("profile.security.password.title")}
                          </h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1 col-span-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                              {t("profile.security.password.currentLabel")}
                            </label>
                            <input
                              className="w-full bg-surface-container-highest border-b-2 border-outline-variant px-0 py-2 text-sm font-medium text-on-surface-variant cursor-not-allowed border-t-0 border-x-0 focus:ring-0 outline-none"
                              placeholder={t("profile.security.password.currentPlaceholder")}
                              type="password"
                              disabled
                            />
                          </div>
                          <EditableField
                            label={t("profile.security.password.new")}
                            value={newPassword}
                            onChange={setNewPassword}
                            type="password"
                          />
                          <EditableField
                            label={t("profile.security.password.confirm")}
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
                            {savingPassword ? t("profile.buttons.updatingPassword") : t("profile.buttons.updatePassword")}
                          </button>
                        </div>
                      </section>
                      <hr className="border-outline-variant/20" />
                      <section className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-primary" />
                            <h4 className="text-xs font-bold uppercase tracking-widest">
                              {t("profile.security.mfa.title")}
                            </h4>
                          </div>
                          <span className="badge badge-primary">{t("profile.security.mfa.active")}</span>
                        </div>
                        <div className="p-4 bg-surface-container-low rounded border border-outline-variant/20 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold">{t("profile.security.mfa.authenticatorTitle")}</p>
                            <p className="text-xs text-on-surface-variant">
                              {t("profile.security.mfa.description")}
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
                      <h3 className="card-title">{t("profile.notifications.title")}</h3>
                    </div>
                    <div className="p-6 space-y-4">
                      <ToggleCard
                        checked={criticalAlerts}
                        onChange={(value) => {
                          setPreferencesDirty(true);
                          setCriticalAlerts(value);
                        }}
                        title={t("profile.notifications.critical.title")}
                        description={t("profile.notifications.critical.description")}
                      />
                      <ToggleCard
                        checked={moduleUpdates}
                        onChange={(value) => {
                          setPreferencesDirty(true);
                          setModuleUpdates(value);
                        }}
                        title={t("profile.notifications.system.title")}
                        description={t("profile.notifications.system.description")}
                      />
                      <ToggleCard
                        checked={dailySummary}
                        onChange={(value) => {
                          setPreferencesDirty(true);
                          setDailySummary(value);
                        }}
                        title={t("profile.notifications.feed.title")}
                        description={t("profile.notifications.feed.description")}
                      />
                    </div>
                  </div>

                  <div className="card overflow-hidden">
                    <div className="card-header flex justify-between items-center">
                      <h3 className="card-title">{t("profile.sessions.title")}</h3>
                      <button
                        className="text-[9px] font-black text-error hover:underline uppercase tracking-widest"
                        onClick={revokeOtherSessions}
                        disabled={sessionAction === "others"}
                      >
                        {sessionAction === "others"
                          ? t("profile.buttons.revoking")
                          : t("profile.buttons.revokeOtherSessions")}
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-surface-container-low border-b border-outline-variant/20">
                          <tr>
                            <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-outline">
                              {t("profile.sessions.headers.device")}
                            </th>
                            <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-outline">
                              {t("profile.sessions.headers.ip")}
                            </th>
                            <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-outline">
                              {t("profile.sessions.headers.lastActivity")}
                            </th>
                            <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-wider text-outline text-right">
                              {t("profile.sessions.headers.action")}
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
                                  {session.ip} {session.is_current ? t("profile.sessions.current") : ""}
                                </td>
                                <td className="px-6 py-4 text-[11px] text-on-surface-variant">
                                  {session.is_current
                                    ? t("profile.sessions.activeNow")
                                    : relativeTime(session.created_at)}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {session.is_current ? (
                                    <span className="text-[10px] font-bold text-primary uppercase">
                                      {t("profile.sessions.statusCurrent")}
                                    </span>
                                  ) : (
                                    <div className="flex justify-end gap-2">
                                      <RowPrimaryAction
                                        label={t("profile.buttons.review")}
                                        icon={<Eye className="h-3.5 w-3.5" />}
                                        onClick={() =>
                                          setNotice(
                                            t("profile.messages.sessionDetail")
                                              .replace("{device}", session.device)
                                              .replace("{ip}", session.ip)
                                              .replace("{date}", formatTimestamp(session.expires_at, locale)),
                                          )
                                        }
                                      />
                                      <RowActionsMenu
                                        items={[
                                          {
                                            key: "review",
                                            label: t("profile.sessions.reviewContext"),
                                            icon: <Eye className="h-3.5 w-3.5" />,
                                            onSelect: () =>
                                              setNotice(
                                                t("profile.messages.sessionDetail")
                                                  .replace("{device}", session.device)
                                                  .replace("{ip}", session.ip)
                                                  .replace("{date}", formatTimestamp(session.expires_at, locale)),
                                              ),
                                          },
                                          {
                                            key: "revoke",
                                            label: t("profile.sessions.revoke"),
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
                      {t("profile.buttons.discard")}
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
                        {t("profile.apiKeys.description")}
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
                      {t("profile.buttons.generatePlatformKey")}
                    </button>
                  </div>

                  {freshKey?.key && (
                    <div className="card p-4 bg-primary/5 border border-primary/20">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                            {t("profile.apiKeys.newlyIssued")}
                          </div>
                          <div className="mt-2 font-mono text-sm break-all">{freshKey.key}</div>
                        </div>
                        <button className="btn btn-secondary flex items-center gap-2" onClick={copyFreshKey}>
                          <Copy className="w-4 h-4" />
                          {t("profile.buttons.copy")}
                        </button>
                      </div>
                    </div>
                  )}

                  <section className="card p-0 overflow-hidden">
                    <div className="card-header flex items-center gap-3">
                      <h4 className="font-bold text-xs uppercase tracking-[0.2em] text-on-surface-variant">
                        {t("profile.apiKeys.corePlatformTitle")}
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-surface-container-high">
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              {t("profile.apiKeys.headers.alias")}
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              {t("profile.apiKeys.headers.created")}
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              {t("profile.apiKeys.headers.lastUsed")}
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              {t("profile.apiKeys.headers.scope")}
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              {t("profile.apiKeys.headers.status")}
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
                                  {key.scopes.length > 1 ? t("profile.apiKeys.scopes.fullAccess") : key.scopes[0] || t("profile.apiKeys.scopes.none")}
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
                                    {key.revoked ? t("profile.apiKeys.status.revoked") : t("profile.apiKeys.status.active")}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <RowPrimaryAction
                                    label={t("profile.buttons.review")}
                                    icon={<Eye className="h-3.5 w-3.5" />}
                                    onClick={() =>
                                      setNotice(
                                        `${key.name} - scope: ${key.scopes.join(", ") || t("profile.apiKeys.scopes.none")} / created ${formatTimestamp(key.created_at, locale)}`,
                                      )
                                    }
                                  />
                                  <RowActionsMenu
                                    items={[
                                      {
                                        key: "review",
                                        label: t("profile.apiKeys.reviewContext"),
                                        icon: <Eye className="h-3.5 w-3.5" />,
                                        onSelect: () =>
                                          setNotice(
                                            `${key.name} - scope: ${key.scopes.join(", ") || t("profile.apiKeys.scopes.none")} / created ${formatTimestamp(key.created_at, locale)}`,
                                          ),
                                      },
                                      {
                                        key: "revoke",
                                        label: key.revoked ? t("profile.apiKeys.alreadyRevoked") : t("profile.apiKeys.revoke"),
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
                          {t("profile.thirdParty.title")}
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
                              {t("profile.thirdParty.headers.provider")}
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              {t("profile.thirdParty.headers.coverage")}
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              {t("profile.thirdParty.headers.status")}
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              {t("profile.thirdParty.headers.credential")}
                            </th>
                            <th className="px-6 py-3 text-right text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              {t("profile.thirdParty.headers.action")}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container-low">
                          {THIRD_PARTY_SERVICES.map((service) => {
                            const configured = Boolean(thirdPartyStatus[service.id]?.configured);
                            const ServiceIcon = service.icon;
                            return (
                              <tr
                                key={service.id}
                                className="hover:bg-surface-container-low transition-colors"
                              >
                                <td className="px-6 py-4 align-top">
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-low">
                                      <ServiceIcon className="h-5 w-5 text-primary" />
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
                                    {configured ? t("profile.thirdParty.status.connected") : t("profile.thirdParty.status.pending")}
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
                                    placeholder={configured ? t("profile.thirdParty.placeholderRotate") : t("profile.thirdParty.placeholderPaste")}
                                    className="w-full min-w-[16rem] bg-surface-container-low border-b-2 border-outline px-0 py-2 text-xs font-medium transition-all outline-none focus:border-primary focus:ring-0 border-x-0 border-t-0"
                                  />
                                </td>
                                <td className="px-6 py-4 text-right align-top">
                                  <button
                                    className="btn btn-outline whitespace-nowrap"
                                    onClick={() => saveThirdPartyKey(service.id)}
                                    disabled={thirdPartySaving === service.id}
                                  >
                                    {thirdPartySaving === service.id ? t("profile.buttons.configuring") : t("profile.buttons.configureLink")}
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
                            {t("profile.forecast.title")}
                          </h5>
                          <p className="text-sm font-bold">
                            {t("profile.forecast.description")}
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
                        <span>{t("profile.forecast.current")}</span>
                      </div>
                    </div>
                    <div className="bg-primary text-on-primary p-6 rounded flex flex-col justify-between">
                      <h5 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
                        {t("profile.securityNotice.title")}
                      </h5>
                      <p className="text-xs font-bold leading-tight">
                        {oldestActiveKeyAge
                          ? t("profile.securityNotice.oldKey").replace("{days}", String(oldestActiveKeyAge))
                          : t("profile.securityNotice.noKeys")}
                      </p>
                      <button
                        className="mt-4 bg-white/10 hover:bg-white/20 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded"
                        onClick={() => {
                          setCreateApiKeyError("");
                          setIsCreateApiKeyOpen(true);
                        }}
                      >
                        {t("profile.buttons.rotateNow")}
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
                        {t("profile.audit.description")}
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
                        {t("profile.buttons.filter")}
                      </button>
                      <button className="btn btn-primary flex items-center gap-2" onClick={exportAuditCsv}>
                        <Download className="w-4 h-4" />
                        {t("profile.buttons.exportCsv")}
                      </button>
                    </div>
                  </div>

                  {showAuditFilters && (
                    <div className="card p-4 bg-surface-container-low border border-outline-variant/20 animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">
                          {t("profile.audit.filterTitle")}
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
                            {t("profile.audit.filters.eventTypeLabel")}
                          </label>
                          <select
                            value={auditEventFilter}
                            onChange={(event) => setAuditEventFilter(event.target.value)}
                            className="w-full bg-surface-container-high border-none border-b-2 border-outline focus:border-primary text-xs font-semibold p-2 outline-none"
                          >
                            <option value="all">{t("profile.audit.filters.allEvents")}</option>
                            <option value="login">{t("profile.audit.filters.login")}</option>
                            <option value="profile">{t("profile.audit.filters.profileUpdate")}</option>
                            <option value="search">{t("profile.audit.filters.search")}</option>
                            <option value="api">{t("profile.audit.filters.apiKeyRotation")}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-outline uppercase tracking-wider mb-1">
                            {t("profile.audit.filters.statusLabel")}
                          </label>
                          <select
                            value={auditResultFilter}
                            onChange={(event) => setAuditResultFilter(event.target.value)}
                            className="w-full bg-surface-container-high border-none border-b-2 border-outline focus:border-primary text-xs font-semibold p-2 outline-none"
                          >
                            <option value="all">{t("profile.audit.filters.allStatuses")}</option>
                            <option value="success">{t("profile.audit.filters.success")}</option>
                            <option value="denied">{t("profile.audit.filters.denied")}</option>
                            <option value="failed">{t("profile.audit.filters.failed")}</option>
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
                            {t("profile.buttons.reset")}
                          </button>
                          <div className="text-[11px] font-semibold text-on-surface-variant">
                            {filteredAuditItems.length} {t("profile.metrics.visibleEvents").toLowerCase()}
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
                              {t("profile.audit.headers.time")}
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              {t("profile.audit.headers.event")}
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              {t("profile.audit.headers.target")}
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant">
                              {t("profile.audit.headers.result")}
                            </th>
                            <th className="px-6 py-3 text-[11px] font-black uppercase tracking-widest text-on-surface-variant text-right">
                              {t("profile.audit.headers.details")}
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
                                  title={item.detail || t("profile.modals.auditDetail.noDetail")}
                                  type="button"
                                  onClick={() => setSelectedAuditItem(item)}
                                >
                                  {t("profile.buttons.detail")}
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
                        {t("profile.audit.showing").replace("{n}", String(filteredAuditItems.length))}
                      </div>
                      <div className="flex items-center gap-2 text-on-surface-variant">
                        <ChevronLeft className="w-4 h-4 opacity-40" />
                        <span className="text-xs font-bold text-on-surface">{t("profile.audit.page").replace("{n}", "1")}</span>
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
          title={t("profile.modals.createApiKey.title")}
          description={t("profile.modals.createApiKey.description")}
          icon={t("profile.modals.createApiKey.icon")}
          variant="editor"
          onClose={() => {
            setIsCreateApiKeyOpen(false);
            setCreateApiKeyError("");
          }}
          ariaLabel={t("profile.modals.createApiKey.closeLabel")}
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
                {t("profile.buttons.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={createApiKey}
                disabled={creatingApiKey}
              >
                {creatingApiKey ? t("profile.buttons.issuing") : t("profile.buttons.issueApiKey")}
              </button>
            </>
          }
        >
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                      {t("profile.modals.createApiKey.fields.aliasLabel")}
                    </label>
                    <input
                      type="text"
                      value={newApiKeyName}
                      onChange={(event) => setNewApiKeyName(event.target.value)}
                      placeholder={t("profile.modals.createApiKey.fields.aliasPlaceholder")}
                      className="w-full rounded-sm bg-surface-container-low px-4 py-3 text-sm font-medium text-on-surface outline-none ring-1 ring-outline-variant/20 transition focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-on-surface-variant">
                      {t("profile.modals.createApiKey.fields.aliasHint")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                      {t("profile.modals.createApiKey.fields.expirationLabel")}
                    </label>
                    <select
                      value={newApiKeyExpiresDays}
                      onChange={(event) => setNewApiKeyExpiresDays(event.target.value)}
                      className="w-full rounded-sm bg-surface-container-low px-4 py-3 text-sm font-medium text-on-surface outline-none ring-1 ring-outline-variant/20 transition focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="30">{t("profile.modals.createApiKey.fields.days30")}</option>
                      <option value="90">{t("profile.modals.createApiKey.fields.days90")}</option>
                      <option value="180">{t("profile.modals.createApiKey.fields.days180")}</option>
                      <option value="365">{t("profile.modals.createApiKey.fields.days365")}</option>
                      <option value="never">{t("profile.modals.createApiKey.fields.noExpiration")}</option>
                    </select>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
                        {t("profile.modals.createApiKey.fields.scopesLabel")}
                      </label>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {t("profile.modals.createApiKey.fields.scopesHint")}
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
                      <h4 className="surface-section-title">{t("profile.modals.createApiKey.summary")}</h4>
                    </div>
                    <div className="space-y-4 p-4 text-sm text-on-surface-variant">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface">
                          {t("profile.modals.createApiKey.summaryAlias")}
                        </div>
                        <div className="mt-1 break-words text-sm font-semibold text-on-surface">
                          {newApiKeyName.trim() || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface">
                          {t("profile.modals.createApiKey.summaryExpiration")}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-on-surface">
                          {newApiKeyExpiresDays === "never"
                            ? t("profile.modals.createApiKey.summaryNoExpiration")
                            : `${newApiKeyExpiresDays} ${t("profile.messages.days")}`}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface">
                          {t("profile.modals.createApiKey.summaryScope")}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {newApiKeyScopes.length ? (
                            newApiKeyScopes.map((scope) => (
                              <span key={scope} className="badge badge-primary">
                                {scope}
                              </span>
                            ))
                          ) : (
                            <span className="badge badge-error">{t("profile.modals.createApiKey.summaryNoScope")}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed">
                        {t("profile.modals.createApiKey.disclaimer")}
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
          description={t("profile.modals.auditDetail.description")}
          icon={t("profile.modals.auditDetail.icon")}
          onClose={() => setSelectedAuditItem(null)}
          ariaLabel={t("profile.modals.auditDetail.closeLabel")}
          variant="dialog"
        >
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Field label={t("profile.modals.auditDetail.fields.timestamp")} value={formatTimestamp(selectedAuditItem.timestamp, locale)} readOnly />
                <Field label={t("profile.modals.auditDetail.fields.user")} value={selectedAuditItem.user || "—"} readOnly />
                <Field label={t("profile.modals.auditDetail.fields.result")} value={selectedAuditItem.result || "unknown"} readOnly />
                <Field label={t("profile.modals.auditDetail.fields.ip")} value={selectedAuditItem.ip || "—"} readOnly />
                <Field className="md:col-span-2" label={t("profile.modals.auditDetail.fields.target")} value={selectedAuditItem.target || "—"} readOnly />
                <Field
                  className="md:col-span-2"
                  label={t("profile.modals.auditDetail.fields.detail")}
                  value={selectedAuditItem.detail || t("profile.modals.auditDetail.noDetail")}
                  multiline
                  readOnly
                />
              </div>
        </ModalShell>
      )}

      {avatarEditorOpen && (
        <ModalShell
          title={t("profile.avatar.editor.title")}
          description={t("profile.avatar.editor.description")}
          icon={t("profile.avatar.editor.icon")}
          onClose={() => {
            setAvatarEditorOpen(false);
            setPendingAvatarData("");
          }}
          ariaLabel={t("profile.avatar.editor.closeLabel")}
          variant="dialog"
          bodyClassName="space-y-6"
          footer={
            <>
              <button
                className="btn btn-outline text-error border-error/30 hover:bg-error/10"
                onClick={removeAvatarSelection}
                disabled={!avatarDraft && !user?.avatar_base64}
              >
                {t("profile.buttons.removeAvatar")}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setAvatarEditorOpen(false);
                  setPendingAvatarData("");
                }}
              >
                {t("profile.buttons.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void confirmAvatarSelection()}
              >
                {t("profile.buttons.usePhoto")}
              </button>
            </>
          }
        >
          <div className="flex items-center justify-between gap-3 rounded-sm border border-outline-variant/15 bg-surface-container-low px-4 py-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                {t("profile.avatar.editor.imageSource")}
              </div>
              <div className="mt-1 text-sm text-on-surface-variant">
                {t("profile.avatar.editor.hint")}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline whitespace-nowrap"
              onClick={() => avatarInputRef.current?.click()}
            >
              <Camera className="w-4 h-4" />
              {t("profile.buttons.chooseImage")}
            </button>
          </div>

          <div className="relative h-72 overflow-hidden rounded-sm bg-surface-container-low">
            <Cropper
              image={pendingAvatarData}
              crop={avatarCrop}
              zoom={avatarZoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setAvatarCrop}
              onZoomChange={setAvatarZoom}
              onCropComplete={(_, croppedAreaPixels) => setAvatarCropPixels(croppedAreaPixels)}
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-outline">
              {t("profile.avatar.editor.zoom")}
            </label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={avatarZoom}
              onChange={(event) => setAvatarZoom(Number(event.target.value))}
              className="w-full accent-primary"
            />
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

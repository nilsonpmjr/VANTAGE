import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Filter,
  Download,
  Upload,
  UserPlus,
  Edit,
  Eye,
  Ban,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  LockKeyhole,
  Monitor,
  Smartphone,
  Copy,
} from "lucide-react";
import API_URL from "../config";
import ModalShell from "../components/modal/ModalShell";
import { PageHeader, PageMetricPill, PageToolbar, PageToolbarGroup } from "../components/page/PageChrome";
import { RowActionsMenu, RowPrimaryAction, type RowActionItem } from "../components/RowActions";
import { useLanguage } from "../context/LanguageContext";

type UserItem = {
  username: string;
  name: string;
  role: string;
  email?: string | null;
  preferred_lang?: string;
  is_active?: boolean;
  mfa_enabled?: boolean;
  force_password_reset?: boolean;
  locked_until?: string | null;
  extra_permissions?: string[];
  suspension_reason?: string | null;
  suspended_at?: string | null;
  suspended_by?: string | null;
};

type AdminStats = {
  total_users: number;
  active_users: number;
  suspended_users: number;
  locked_accounts: number;
  users_with_mfa: number;
  active_sessions: number;
  failed_logins_24h: number;
  active_api_keys: number;
};

type PermissionPayload = {
  permissions: string[];
};

type ImportedCredential = {
  username: string;
  temporary_password: string;
  email?: string | null;
};

type ImportResult = {
  created: number;
  skipped: number;
  errors: Array<{ row: number; reason: string; username?: string }>;
  temporary_credentials: ImportedCredential[];
};

type AdminSession = {
  session_id: string;
  ip: string;
  device: string;
  user_agent: string;
  created_at: string;
  expires_at: string;
  is_current?: boolean;
};

type EditorMode = "create" | "edit" | null;
type CreateMode = "standard" | "invite";
type RoleBlueprint = {
  tier: string;
  summary: string;
  operationalScope: string;
};

const PAGE_SIZE = 10;
const MFA_REQUIRED_ROLES = new Set(["admin", "manager"]);
const ROLE_RANK: Record<string, number> = {
  tech: 1,
  manager: 2,
  admin: 3,
};
const ROLE_PROFILES: Record<string, RoleBlueprint> = {
  tech: {
    tier: "Analyst",
    summary: "Focused on analyst areas, personal identity settings and day-to-day investigation flows.",
    operationalScope: "No control-plane access unless additive permissions are granted.",
  },
  manager: {
    tier: "Supervisor",
    summary: "Elevated visibility into observability, reporting and selected operational review surfaces.",
    operationalScope: "Still does not inherit full control-plane write access.",
  },
  admin: {
    tier: "Control Plane",
    summary: "Full platform administration with implicit access to every fine-grained permission.",
    operationalScope: "Can operate governance, services, user lifecycle and runtime control surfaces.",
  },
};

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length: 16 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function currentStatus(user: UserItem) {
  const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;
  if (lockedUntil && lockedUntil > new Date()) {
    return { label: "Locked", dot: "bg-error", tone: "text-error" };
  }
  if (user.is_active === false) {
    return { label: "Deactivated", dot: "bg-error", tone: "text-on-surface" };
  }
  if (!user.mfa_enabled) {
    return { label: "Pending MFA", dot: "bg-amber-500", tone: "text-on-surface" };
  }
  return { label: "Active", dot: "bg-emerald-500", tone: "text-on-surface" };
}

function roleTone(role: string) {
  switch (role) {
    case "admin":
      return "bg-primary-container text-on-primary-container";
    case "manager":
      return "bg-secondary-container text-on-secondary-container";
    default:
      return "bg-surface-variant text-on-surface-variant";
  }
}

function isSensitiveRoleDowngrade(oldRole?: string | null, newRole?: string | null) {
  if (!oldRole || !newRole || oldRole === newRole) return false;
  if (!["admin", "manager"].includes(oldRole)) return false;
  return (ROLE_RANK[newRole] || 0) < (ROLE_RANK[oldRole] || 0);
}

function buildUserActions({
  user,
  statusLabel,
  onEdit,
  onInspectSessions,
  onToggleState,
  onUnlock,
}: {
  user: UserItem;
  statusLabel: string;
  onEdit: () => void;
  onInspectSessions: () => void;
  onToggleState: () => void;
  onUnlock: () => void;
}): RowActionItem[] {
  return [
    {
      key: "edit",
      label: "Edit operator",
      icon: <Edit className="h-3.5 w-3.5" />,
      onSelect: onEdit,
    },
    {
      key: "sessions",
      label: "Inspect active sessions",
      icon: <Monitor className="h-3.5 w-3.5" />,
      onSelect: onInspectSessions,
    },
    ...(statusLabel === "Locked"
      ? [
          {
            key: "unlock",
            label: "Unlock account",
            icon: <LockKeyhole className="h-3.5 w-3.5" />,
            onSelect: onUnlock,
          } satisfies RowActionItem,
        ]
      : []),
    {
      key: "toggle-state",
      label: user.is_active === false ? "Reactivate operator" : "Deactivate operator",
      icon:
        user.is_active === false ? (
          <RotateCcw className="h-3.5 w-3.5" />
        ) : (
          <Ban className="h-3.5 w-3.5" />
        ),
      onSelect: onToggleState,
      tone: user.is_active === false ? "default" : "danger",
      dividerBefore: statusLabel === "Locked",
    },
  ];
}

export default function UsersRoles() {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [createMode, setCreateMode] = useState<CreateMode>("standard");
  const [editorUsername, setEditorUsername] = useState("");
  const [selectedUsername, setSelectedUsername] = useState("");
  const [selectedUserForSessions, setSelectedUserForSessions] = useState<UserItem | null>(null);
  const [selectedUserSessions, setSelectedUserSessions] = useState<AdminSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [invitedCredential, setInvitedCredential] = useState<ImportedCredential | null>(null);
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);
  const [bulkPermissions, setBulkPermissions] = useState<string[]>([]);
  const [form, setForm] = useState({
    username: "",
    name: "",
    email: "",
    role: "tech",
    password: "",
    is_active: true,
    suspension_reason: "",
    force_password_reset: false,
    preferred_lang: "pt",
    extra_permissions: [] as string[],
  });

  async function loadRuntime() {
    setLoading(true);
    setError("");
    try {
      const [usersRes, statsRes, permissionsRes] = await Promise.all([
        fetch(`${API_URL}/api/users`, { credentials: "include" }),
        fetch(`${API_URL}/api/admin/stats`, { credentials: "include" }),
        fetch(`${API_URL}/api/admin/permissions`, { credentials: "include" }),
      ]);

      if (!usersRes.ok || !statsRes.ok || !permissionsRes.ok) {
        throw new Error("users_roles_load_failed");
      }

      const [usersData, statsData, permissionsData] = await Promise.all([
        usersRes.json(),
        statsRes.json(),
        permissionsRes.json(),
      ]);

      setUsers(usersData as UserItem[]);
      setStats(statsData as AdminStats);
      setAvailablePermissions((permissionsData as PermissionPayload).permissions || []);
      const loadedUsers = usersData as UserItem[];
      setSelectedUsername((current) => current || loadedUsers[0]?.username || "");
    } catch {
      setError("Não foi possível carregar o diretório de usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRuntime();
  }, []);

  const editingUser = useMemo(
    () => (editorMode === "edit" ? users.find((user) => user.username === editorUsername) ?? null : null),
    [editorMode, editorUsername, users],
  );

  const selectedRoleBlueprint = ROLE_PROFILES[form.role] || ROLE_PROFILES.tech;
  const roleRequiresMfa = MFA_REQUIRED_ROLES.has(form.role);
  const roleDowngradeRevokesSessions = isSensitiveRoleDowngrade(editingUser?.role, form.role);
  const redundantPermissions = form.role === "admin" ? form.extra_permissions : [];
  const additivePermissions = form.role === "admin" ? [] : form.extra_permissions;

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const status = currentStatus(user).label.toLowerCase();
      const matchesQuery =
        !query ||
        user.name.toLowerCase().includes(query) ||
        user.username.toLowerCase().includes(query) ||
        String(user.email || "").toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || status === statusFilter.toLowerCase();
      return matchesQuery && matchesStatus;
    });
  }, [search, statusFilter, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedUsers = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    setSelectedUsernames((current) =>
      current.filter((username) => users.some((user) => user.username === username)),
    );
  }, [users]);

  useEffect(() => {
    setSelectedUsername((current) => {
      if (users.length === 0) return "";
      if (current && users.some((user) => user.username === current)) return current;
      return users[0].username;
    });
  }, [users]);

  const allVisibleSelected =
    pagedUsers.length > 0 && pagedUsers.every((user) => selectedUsernames.includes(user.username));
  const selectedUser = users.find((user) => user.username === selectedUsername) || null;

  function toggleSelectedUser(username: string) {
    setSelectedUsernames((current) =>
      current.includes(username)
        ? current.filter((item) => item !== username)
        : [...current, username],
    );
  }

  function toggleAllVisibleUsers() {
    setSelectedUsernames((current) => {
      if (allVisibleSelected) {
        return current.filter((username) => !pagedUsers.some((user) => user.username === username));
      }
      return [...new Set([...current, ...pagedUsers.map((user) => user.username)])];
    });
  }

  function resetForm() {
    setForm({
      username: "",
      name: "",
      email: "",
      role: "tech",
      password: "",
      is_active: true,
      suspension_reason: "",
      force_password_reset: false,
      preferred_lang: "pt",
      extra_permissions: [],
    });
    setEditorUsername("");
    setEditorMode(null);
    setCreateMode("standard");
  }

  function openCreate() {
    resetForm();
    setInvitedCredential(null);
    setCreateMode("standard");
    setEditorMode("create");
  }

  function openInvite() {
    resetForm();
    setInvitedCredential(null);
    setCreateMode("invite");
    setEditorMode("create");
    setForm((current) => ({
      ...current,
      password: generateTemporaryPassword(),
      force_password_reset: true,
    }));
  }

  function openEdit(user: UserItem) {
    setSelectedUsername(user.username);
    setCreateMode("standard");
    setEditorMode("edit");
    setEditorUsername(user.username);
    setForm({
      username: user.username,
      name: user.name,
      email: user.email || "",
      role: user.role,
      password: "",
      is_active: user.is_active !== false,
      suspension_reason: user.suspension_reason || "",
      force_password_reset: Boolean(user.force_password_reset),
      preferred_lang: user.preferred_lang || "pt",
      extra_permissions: user.extra_permissions || [],
    });
  }

  function openSuspend(user: UserItem) {
    openEdit(user);
    setForm((current) => ({
      ...current,
      is_active: false,
      suspension_reason: user.suspension_reason || "",
    }));
  }

  async function saveUser() {
    setBusy("save-user");
    setError("");
    setNotice("");
    try {
      if (editorMode === "create") {
        const createRes = await fetch(`${API_URL}/api/users`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: form.username,
            password: form.password,
            role: form.role,
            name: form.name,
            email: form.email || undefined,
          }),
        });
        if (!createRes.ok) throw new Error("create_user_failed");
        if (form.extra_permissions.length > 0) {
          await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(form.username)}/permissions`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ extra_permissions: form.extra_permissions }),
          });
        }
        if (createMode === "invite") {
          setInvitedCredential({
            username: form.username,
            temporary_password: form.password,
            email: form.email || null,
          });
        }
        setNotice(`Usuário ${form.username} criado.`);
      }

      if (editorMode === "edit") {
        const updateRes = await fetch(`${API_URL}/api/users/${encodeURIComponent(editorUsername)}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            role: form.role,
            email: form.email || null,
            is_active: form.is_active,
            suspension_reason: form.is_active ? null : form.suspension_reason || null,
            force_password_reset: form.force_password_reset,
            preferred_lang: form.preferred_lang,
            password: form.password || undefined,
          }),
        });
        if (!updateRes.ok) throw new Error("update_user_failed");
        const permissionsRes = await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(editorUsername)}/permissions`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ extra_permissions: form.extra_permissions }),
        });
        if (!permissionsRes.ok) throw new Error("permissions_update_failed");
        setNotice(`Usuário ${editorUsername} atualizado.`);
      }

      resetForm();
      await loadRuntime();
    } catch {
      setError("Falha ao persistir a configuração do usuário.");
    } finally {
      setBusy("");
    }
  }

  async function toggleUserState(user: UserItem) {
    setBusy(user.username);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(user.username)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_active: !(user.is_active !== false),
        }),
      });
      if (!response.ok) throw new Error("toggle_user_failed");
      setNotice(
        user.is_active === false
          ? `Usuário ${user.username} reativado.`
          : `Usuário ${user.username} suspenso.`,
      );
      await loadRuntime();
    } catch {
      setError("Falha ao alterar o estado do usuário.");
    } finally {
      setBusy("");
    }
  }

  async function unlockUser(username: string) {
    setBusy(`unlock-${username}`);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(username)}/unlock`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("unlock_failed");
      setNotice(`Conta ${username} desbloqueada.`);
      await loadRuntime();
    } catch {
      setError("Falha ao desbloquear a conta.");
    } finally {
      setBusy("");
    }
  }

  async function importUsers(file: File) {
    setBusy("import");
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_URL}/api/admin/users/import`, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!response.ok) throw new Error("import_failed");
      const payload = (await response.json()) as ImportResult;
      setImportResult(payload);
      setNotice(
        `Importação concluída: ${payload.created} criado(s), ${payload.skipped} ignorado(s), ${payload.errors?.length || 0} erro(s).`,
      );
      await loadRuntime();
    } catch {
      setError("Falha ao importar usuários.");
    } finally {
      setBusy("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function exportUsers() {
    window.open(`${API_URL}/api/admin/users/export?format=csv`, "_blank", "noopener");
  }

  async function loadUserSessions(user: UserItem) {
    setSelectedUsername(user.username);
    setSelectedUserForSessions(user);
    setSessionsLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/api/auth/sessions/admin/${encodeURIComponent(user.username)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("user_sessions_load_failed");
      const payload = (await response.json()) as AdminSession[];
      setSelectedUserSessions(payload);
    } catch {
      setSelectedUserSessions([]);
      setError("Falha ao carregar as sessões ativas do usuário selecionado.");
    } finally {
      setSessionsLoading(false);
    }
  }

  function exportTemporaryCredentials() {
    if (!importResult?.temporary_credentials?.length) return;
    const header = "username,temporary_password,email";
    const rows = importResult.temporary_credentials.map((item) =>
      [item.username, item.temporary_password, item.email || ""].join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `temporary_credentials_${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyTemporaryCredentials() {
    if (!importResult?.temporary_credentials?.length) return;
    const text = importResult.temporary_credentials
      .map(
        (item) =>
          `${item.username} | ${item.temporary_password} | ${item.email || "no-email"}`,
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Credenciais temporárias copiadas.");
    } catch {
      setNotice(text);
    }
  }

  async function applyBulkPermissions() {
    if (selectedUsernames.length === 0) return;
    setBusy("bulk-permissions");
    setError("");
    setNotice("");
    try {
      for (const username of selectedUsernames) {
        const response = await fetch(
          `${API_URL}/api/admin/users/${encodeURIComponent(username)}/permissions`,
          {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ extra_permissions: bulkPermissions }),
          },
        );
        if (!response.ok) {
          throw new Error("bulk_permissions_failed");
        }
      }
      setNotice(`Permissões aplicadas em ${selectedUsernames.length} usuário(s).`);
      setSelectedUsernames([]);
      await loadRuntime();
    } catch {
      setError("Falha ao aplicar permissões em massa.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page-frame">
      <PageHeader
        eyebrow={t("admin.eyebrow", "Administration")}
        title={t("settingsPages.usersRolesTitle", "Users & Roles")}
        description={t("settingsPages.usersRolesSubtitle", "Gerencie diretório, autenticação pendente e operações de importação em uma superfície administrativa única.")}
        metrics={
          <>
            <PageMetricPill
              label={`${stats?.active_users || 0} Active Users`}
              dotClassName="bg-emerald-500"
              tone="success"
            />
            <PageMetricPill
              label={`${(stats?.total_users || 0) - (stats?.users_with_mfa || 0)} Pending Auth`}
              dotClassName="bg-amber-500"
              tone="warning"
            />
          </>
        }
      />

      <PageToolbar label={t("settingsPages.usersRolesActions", "Directory actions")}>
        <PageToolbarGroup className="ml-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void importUsers(file);
              }
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary"
          >
            <Upload className="w-3 h-3" />
            {busy === "import" ? t("settingsPages.importing", "Importing...") : t("settingsPages.import", "Import")}
          </button>
          <button
            onClick={exportUsers}
            className="btn btn-outline"
          >
            <Download className="w-3 h-3" />
            {t("settingsPages.export", "Export")}
          </button>
          <button
            onClick={() => void loadRuntime()}
            className="btn btn-outline"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {t("admin.refresh", "Refresh")}
          </button>
        </PageToolbarGroup>
        <PageToolbarGroup>
          <button
            onClick={openInvite}
            className="btn btn-primary"
          >
            <UserPlus className="w-3 h-3" />
            {t("settingsPages.inviteOperator", "Invite Operator")}
          </button>
          <button
            onClick={openCreate}
            className="btn btn-outline"
          >
            <Edit className="w-3 h-3" />
            {t("settingsPages.addUser", "Add User")}
          </button>
        </PageToolbarGroup>
      </PageToolbar>

      {(error || notice) && (
        <div className="space-y-3">
          {error && <div className="rounded-sm bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}
          {notice && <div className="rounded-sm bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div>}
        </div>
      )}

      <div className="page-with-side-rail">
        <div className="page-main-pane">
          <section className="bg-surface-container-lowest border border-outline-variant/15 rounded-sm shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-surface-container-high flex items-center justify-between border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-sm tracking-tight text-on-surface mr-4">User Directory</h2>
                <div className="flex gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 border border-outline-variant/30 text-[11px] uppercase tracking-widest font-bold text-on-surface rounded-sm bg-surface-container-low">
                    <Filter className="w-3 h-3" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Filter"
                      className="bg-transparent outline-none w-28"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="px-3 py-1.5 border border-outline-variant/30 text-[11px] uppercase tracking-widest font-bold text-on-surface rounded-sm bg-surface-container-low"
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="pending mfa">Pending MFA</option>
                    <option value="locked">Locked</option>
                    <option value="deactivated">Deactivated</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/10">
                    <th className="px-4 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisibleUsers}
                        className="h-3.5 w-3.5 accent-primary"
                        aria-label="Select visible users"
                      />
                    </th>
                    <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-sm text-on-surface-variant">
                        Carregando usuários...
                      </td>
                    </tr>
                  ) : pagedUsers.length > 0 ? (
                    pagedUsers.map((user) => {
                      const status = currentStatus(user);
                      const isInspected =
                        selectedUsername === user.username ||
                        selectedUserForSessions?.username === user.username;
                      return (
                        <tr
                          key={user.username}
                          className={`h-[40px] transition-colors ${
                            isInspected ? "bg-primary/5" : "hover:bg-surface-container-low"
                          }`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedUsernames.includes(user.username)}
                              onChange={() => toggleSelectedUser(user.username)}
                              className="h-3.5 w-3.5 accent-primary"
                              aria-label={`Select ${user.username}`}
                            />
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 bg-surface-container-highest rounded-full flex items-center justify-center text-[10px] font-black text-primary">
                                {initials(user.name || user.username)}
                              </div>
                              <div>
                                <span className="text-sm font-semibold text-on-surface">{user.name || user.username}</span>
                                <div className="text-[10px] font-mono text-on-surface-variant">{user.username}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-sm text-on-surface-variant">{user.email || "—"}</td>
                          <td className="px-6 py-3">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-sm uppercase tracking-tighter ${roleTone(user.role)}`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                              <div className="flex flex-col">
                                <span className={`text-xs ${status.tone}`}>{status.label}</span>
                                {status.label === "Deactivated" && user.suspension_reason ? (
                                  <span className="text-[10px] text-on-surface-variant">
                                    {user.suspension_reason}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right space-x-2">
                            <div className="flex justify-end gap-2">
                              <RowPrimaryAction
                                label="Inspect"
                                icon={<Eye className="h-3.5 w-3.5" />}
                                onClick={() => setSelectedUsername(user.username)}
                              />
                              <RowActionsMenu
                                items={buildUserActions({
                                  user,
                                  statusLabel: status.label,
                                  onEdit: () => openEdit(user),
                                  onInspectSessions: () => void loadUserSessions(user),
                                  onToggleState: () =>
                                    user.is_active === false
                                      ? void toggleUserState(user)
                                      : openSuspend(user),
                                  onUnlock: () => void unlockUser(user.username),
                                })}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-sm text-on-surface-variant">
                        Nenhum usuário encontrado para os filtros atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="px-6 py-3 bg-surface-container-low border-t border-outline-variant/10 flex items-center justify-between">
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Showing {filteredUsers.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}-{Math.min(filteredUsers.length, currentPage * PAGE_SIZE)} of {filteredUsers.length} users
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    className="p-1 text-outline hover:text-on-surface transition-colors disabled:opacity-40"
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 5).map((value) => (
                    <button
                      key={value}
                      onClick={() => setPage(value)}
                      className={value === currentPage ? "p-1 text-on-surface font-bold text-xs underline underline-offset-4 px-2" : "p-1 text-on-surface-variant font-medium text-xs hover:text-on-surface px-2 transition-colors"}
                    >
                      {value}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                    className="p-1 text-outline hover:text-on-surface transition-colors disabled:opacity-40"
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="page-side-rail-right">
          <section className="surface-section overflow-hidden">
            <div className="surface-section-header">
              <div>
                <h3 className="surface-section-title">Selected Operator</h3>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                  Directory context for the inspected operator
                </p>
              </div>
            </div>
            {selectedUser ? (
              <div className="space-y-4 p-6">
                <div className="rounded-sm bg-surface-container-low p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-on-surface">
                        {selectedUser.name || selectedUser.username}
                      </div>
                      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-on-surface-variant">
                        {selectedUser.username}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-sm uppercase tracking-tighter ${roleTone(selectedUser.role)}`}>
                      {selectedUser.role}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${currentStatus(selectedUser).dot}`}></span>
                    <span className="text-xs text-on-surface">{currentStatus(selectedUser).label}</span>
                  </div>
                  {selectedUser.suspension_reason ? (
                    <div className="mt-3 rounded-sm bg-surface-container-high p-3 text-xs text-on-surface-variant">
                      Suspension rationale on file: {selectedUser.suspension_reason}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3">
                  <CompactMetric label="Email" value={selectedUser.email || "—"} />
                  <CompactMetric label="Language" value={(selectedUser.preferred_lang || "pt").toUpperCase()} />
                  <CompactMetric label="MFA" value={selectedUser.mfa_enabled ? "Enabled" : "Pending"} />
                  <CompactMetric
                    label="Recovery Posture"
                    value={selectedUser.force_password_reset ? "Password reset queued" : "Stable"}
                  />
                </div>

                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(selectedUser)}
                    className="btn btn-primary"
                  >
                    <Edit className="w-3 h-3" />
                    Edit Operator
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadUserSessions(selectedUser)}
                    className="btn btn-outline"
                  >
                    <Monitor className="w-3 h-3" />
                    Inspect Active Sessions
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6">
                <div className="rounded-sm border border-dashed border-outline-variant/30 bg-surface-container-low p-4 text-sm text-on-surface-variant">
                  Select a row to keep operator context visible while you review the directory.
                </div>
              </div>
            )}
          </section>

          <section className="surface-section overflow-hidden">
            <div className="surface-section-header">
              <div>
                <h3 className="surface-section-title">Directory Health</h3>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                  Identity and access summary
                </p>
              </div>
            </div>
            <div className="grid gap-3 p-6">
              <CompactMetric label="Total Operators" value={String(stats?.total_users ?? 0)} />
              <CompactMetric label="Active Sessions" value={String(stats?.active_sessions ?? 0)} />
              <CompactMetric label="Locked Accounts" value={String(stats?.locked_accounts ?? 0)} />
              <CompactMetric label="MFA Coverage" value={`${stats?.total_users ? Math.round(((stats.users_with_mfa || 0) / stats.total_users) * 100) : 0}%`} />
            </div>
          </section>

          <section className="surface-section overflow-hidden">
            <div className="surface-section-header">
              <div>
                <h3 className="surface-section-title">Session Inspection</h3>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                  Active sessions for the selected operator
                </p>
              </div>
              {selectedUserForSessions ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUserForSessions(null);
                    setSelectedUserSessions([]);
                  }}
                  className="btn btn-outline"
                >
                  Close
                </button>
              ) : null}
            </div>
            {selectedUserForSessions ? (
              <div className="space-y-4 p-6">
                <div className="rounded-sm bg-surface-container-low p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-on-surface">
                        {selectedUserForSessions.name || selectedUserForSessions.username}
                      </div>
                      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-on-surface-variant">
                        {selectedUserForSessions.username}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-sm uppercase tracking-tighter ${roleTone(selectedUserForSessions.role)}`}>
                      {selectedUserForSessions.role}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${currentStatus(selectedUserForSessions).dot}`}></span>
                    <span className="text-xs text-on-surface">{currentStatus(selectedUserForSessions).label}</span>
                  </div>
                </div>

                <div className="rounded-sm bg-surface-container-low p-4 text-xs text-on-surface-variant">
                  {sessionsLoading
                    ? "Loading active sessions..."
                    : `${selectedUserSessions.length} session(s) returned for this operator.`}
                </div>

                <div className="space-y-3">
                  {sessionsLoading ? null : selectedUserSessions.length > 0 ? (
                    selectedUserSessions.map((session) => (
                      <div
                        key={session.session_id}
                        className="rounded-sm border border-outline-variant/15 bg-surface-container-lowest p-4"
                      >
                        <div className="flex items-start gap-3">
                          {/android|iphone|ipad/i.test(session.user_agent) ? (
                            <Smartphone className="mt-0.5 h-4 w-4 text-on-surface-variant" />
                          ) : (
                            <Monitor className="mt-0.5 h-4 w-4 text-on-surface-variant" />
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="text-sm font-medium text-on-surface">{session.device}</div>
                            <div className="font-mono text-[11px] text-on-surface-variant">{session.ip || "—"}</div>
                            <div className="text-[11px] text-on-surface-variant">
                              Created {new Intl.DateTimeFormat("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              }).format(new Date(session.created_at))}
                            </div>
                            <div className="text-[11px] text-on-surface-variant">
                              Expires {new Intl.DateTimeFormat("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              }).format(new Date(session.expires_at))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-sm border border-dashed border-outline-variant/30 bg-surface-container-low p-4 text-sm text-on-surface-variant">
                      No active sessions were returned for this user.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6">
                <div className="rounded-sm border border-dashed border-outline-variant/30 bg-surface-container-low p-4 text-sm text-on-surface-variant">
                  {selectedUser ? (
                    <>
                      Use <span className="font-semibold text-on-surface">Inspect Active Sessions</span> to
                      load live session context for the currently inspected operator.
                    </>
                  ) : (
                    <>
                      Use <span className="font-semibold text-on-surface">Inspect</span> on a row first, then
                      load active sessions without losing the directory table.
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      {selectedUsernames.length > 0 && (
        <section className="surface-section overflow-hidden">
          <div className="surface-section-header">
            <div>
              <h3 className="surface-section-title">Bulk Permission Editing</h3>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                Apply one permission profile to {selectedUsernames.length} selected operator(s)
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedUsernames([])}
                className="btn btn-outline"
              >
                Clear Selection
              </button>
              <button
                type="button"
                onClick={() => void applyBulkPermissions()}
                className="btn btn-primary"
                disabled={busy === "bulk-permissions"}
              >
                {busy === "bulk-permissions" ? "Applying..." : "Apply Permissions"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {availablePermissions.map((permission) => {
                const selected = bulkPermissions.includes(permission);
                return (
                  <button
                    key={permission}
                    type="button"
                    onClick={() =>
                      setBulkPermissions((current) =>
                        selected
                          ? current.filter((item) => item !== permission)
                          : [...current, permission],
                      )
                    }
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-sm border text-left transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-outline-variant/20 bg-surface-container-low text-on-surface-variant"
                    }`}
                  >
                    <span className="text-xs font-medium">{permission}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {selected ? "Granted" : "Off"}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-4">
              <div className="rounded-sm bg-surface-container-low p-4 text-sm text-on-surface-variant">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Selected Operators
                </div>
                <div className="space-y-2">
                  {selectedUsernames.slice(0, 10).map((username) => (
                    <div key={username} className="font-mono text-xs text-on-surface">
                      {username}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-sm bg-surface-container-low p-4 text-xs text-on-surface-variant leading-relaxed">
                Bulk updates reuse the same admin permission endpoint already used for single-user edits.
                This gives the governance surface parity without waiting for a dedicated batch API.
              </div>
            </div>
          </div>
        </section>
      )}

      {editorMode && (
        <ModalShell
          title={
            editorMode === "create"
              ? createMode === "invite"
                ? "Invite New Operator"
                : "Provision New Operator"
              : `Edit Operator ${editorUsername}`
          }
          description="Identity, privileges and recovery posture"
          icon="Operator editor"
          variant="editor"
          onClose={resetForm}
          ariaLabel="Close operator editor"
          bodyClassName="grid flex-1 grid-cols-1 gap-8 lg:grid-cols-2"
          footer={
            <>
              <button
                onClick={resetForm}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveUser()}
                disabled={busy === "save-user"}
                className="btn btn-primary disabled:opacity-60"
              >
                {busy === "save-user"
                  ? "Saving..."
                  : editorMode === "create" && createMode === "invite"
                  ? "Send Invite"
                  : editorMode === "create"
                    ? "Create User"
                    : "Save Changes"}
              </button>
            </>
          }
        >
            <div className="space-y-5">
              <FormField label="Username">
                <input
                  disabled={editorMode === "edit"}
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all disabled:opacity-60"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                />
              </FormField>
              <FormField label="Display Name">
                <input
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </FormField>
              <FormField label="Email">
                <input
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                />
              </FormField>
              <FormField label="Role">
                <select
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                >
                  <option value="tech">tech</option>
                  <option value="manager">manager</option>
                  <option value="admin">admin</option>
                </select>
              </FormField>
              <FormField label={editorMode === "create" ? "Initial Password" : "Reset Password (optional)"}>
                <input
                  type="password"
                  className="w-full bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-2.5 text-sm font-medium outline-none transition-all"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={editorMode === "create" ? "required" : "leave empty to keep current"}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <ToggleField
                  label="Active"
                  value={form.is_active}
                  onToggle={() => setForm((current) => ({ ...current, is_active: !current.is_active }))}
                />
                <ToggleField
                  label="Force Password Reset"
                  value={form.force_password_reset}
                  onToggle={() => setForm((current) => ({ ...current, force_password_reset: !current.force_password_reset }))}
                />
              </div>
              {editorMode === "edit" && !form.is_active ? (
                <>
                  <FormField label="Suspension Reason">
                    <textarea
                      className="w-full min-h-28 bg-surface-container-highest border-b-2 border-outline focus:border-primary px-4 py-3 text-sm font-medium outline-none transition-all resize-y"
                      value={form.suspension_reason}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, suspension_reason: event.target.value }))
                      }
                      placeholder="Document why this operator is being suspended."
                    />
                  </FormField>
                  <div className="rounded-sm bg-error/10 p-4 text-xs text-error leading-relaxed">
                    Suspending this operator revokes active refresh sessions and records the reason in the
                    governance audit trail.
                  </div>
                </>
              ) : null}
            </div>

            <div className="space-y-5">
              <div className="rounded-sm border border-outline-variant/15 bg-surface-container-low p-4 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  {editorMode === "edit" ? "Operator Context" : "Provisioning Context"}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ContextMetric
                    label={editorMode === "edit" ? "Username" : "Mode"}
                    value={editorMode === "edit" ? editorUsername : createMode === "invite" ? "Invite" : "Standard"}
                  />
                  <ContextMetric
                    label="Status"
                    value={editorMode === "edit" ? currentStatus(editingUser || form).label : form.is_active ? "Active" : "Inactive"}
                  />
                  <ContextMetric label="Language" value={(form.preferred_lang || "pt").toUpperCase()} />
                  <ContextMetric label="Role" value={form.role} />
                </div>
                {editorMode === "edit" && editingUser?.suspension_reason ? (
                  <div className="rounded-sm bg-surface-container-high p-3 text-xs text-on-surface-variant">
                    Suspension rationale on file: {editingUser.suspension_reason}
                  </div>
                ) : null}
              </div>
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Extra Permissions
                </p>
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {availablePermissions.length > 0 ? (
                    availablePermissions.map((permission) => {
                      const selected = form.extra_permissions.includes(permission);
                      return (
                        <button
                          key={permission}
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              extra_permissions: selected
                                ? current.extra_permissions.filter((item) => item !== permission)
                                : [...current.extra_permissions, permission],
                            }))
                          }
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-sm border text-left transition-colors ${selected ? "border-primary bg-primary/10 text-primary" : "border-outline-variant/20 bg-surface-container-low text-on-surface-variant"}`}
                        >
                          <span className="text-xs font-medium">{permission}</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest">
                            {selected ? "Granted" : "Off"}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-sm text-on-surface-variant">
                      Nenhuma permissão granular disponível.
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-sm border border-outline-variant/15 bg-surface-container-low p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    Role Impact Preview
                  </p>
                  <h4 className="mt-2 text-sm font-semibold text-on-surface">{selectedRoleBlueprint.tier}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                    {selectedRoleBlueprint.summary}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-sm bg-surface-container-high p-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      MFA Policy
                    </div>
                    <div className="mt-2 text-sm font-semibold text-on-surface">
                      {roleRequiresMfa ? "Mandatory enrollment" : "Optional enrollment"}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                      {roleRequiresMfa
                        ? editingUser?.mfa_enabled
                          ? "The selected operator already satisfies the mandatory MFA policy for this role."
                          : "This role is part of the MFA-required set and will demand enrollment."
                        : "This role can operate without enforced MFA, though enrollment still improves resilience."}
                    </p>
                  </div>
                  <div className="rounded-sm bg-surface-container-high p-3">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      Session Impact
                    </div>
                    <div className="mt-2 text-sm font-semibold text-on-surface">
                      {roleDowngradeRevokesSessions ? "Refresh sessions will be revoked" : "No forced revocation from role change"}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                      {roleDowngradeRevokesSessions
                        ? `Changing ${editingUser?.role || "this operator"} to ${form.role} is treated as a sensitive downgrade and terminates active refresh sessions.`
                        : form.force_password_reset
                          ? "Force Password Reset remains active and will still interrupt the current credential posture on the next sign-in."
                          : "This role transition does not trigger automatic session invalidation by itself."}
                    </p>
                  </div>
                </div>

                <div className="rounded-sm bg-surface-container-high p-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    Permission Resolution
                  </div>
                  <div className="mt-2 text-sm font-semibold text-on-surface">
                    {form.role === "admin"
                      ? "Admin role already implies all fine-grained permissions"
                      : additivePermissions.length > 0
                        ? `${additivePermissions.length} additive permission(s) selected`
                        : "No additive permissions selected"}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                    {selectedRoleBlueprint.operationalScope}
                  </p>
                  {redundantPermissions.length > 0 ? (
                    <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
                      Extra permissions become redundant for admins: {redundantPermissions.join(", ")}.
                    </p>
                  ) : additivePermissions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {additivePermissions.map((permission) => (
                        <span
                          key={permission}
                          className="rounded-sm bg-surface-container-lowest px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-primary"
                        >
                          {permission}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="rounded-sm bg-surface-container-low p-4 text-xs text-on-surface-variant leading-relaxed">
                O backend atual já suporta criação, suspensão, reativação,
                desbloqueio, import/export em CSV e permissões extras por usuário.
              </div>
            </div>
        </ModalShell>
      )}

      {invitedCredential && (
        <section className="surface-section overflow-hidden">
          <div className="surface-section-header">
            <div>
              <h3 className="surface-section-title">Invite Handoff</h3>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                Temporary onboarding credential generated by the guided invite flow
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${invitedCredential.username} | ${invitedCredential.temporary_password} | ${invitedCredential.email || "no-email"}`,
                  );
                  setNotice("Invite handoff copied.");
                } catch {
                  setNotice("Não foi possível copiar o handoff.");
                }
              }}
              className="btn btn-outline"
            >
              <Copy className="w-3 h-3" />
              Copy Handoff
            </button>
          </div>
          <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-sm border border-outline-variant/15 bg-surface-container-low p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Username</div>
                <div className="mt-2 font-mono text-sm text-on-surface">{invitedCredential.username}</div>
              </div>
              <div className="rounded-sm border border-outline-variant/15 bg-surface-container-low p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Temporary Password</div>
                <div className="mt-2 font-mono text-sm text-primary">{invitedCredential.temporary_password}</div>
              </div>
              <div className="rounded-sm border border-outline-variant/15 bg-surface-container-low p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Delivery Channel</div>
                <div className="mt-2 text-sm text-on-surface">{invitedCredential.email || "Manual handoff"}</div>
              </div>
            </div>
            <div className="rounded-sm bg-surface-container-low p-4 text-xs text-on-surface-variant leading-relaxed">
              Guided invites pre-generate a temporary credential and force password reset on first login.
              This closes the onboarding loop even before a dedicated invite API exists.
            </div>
          </div>
        </section>
      )}

      {importResult && (
        <section className="surface-section overflow-hidden">
          <div className="surface-section-header">
            <div>
              <h3 className="surface-section-title">Import Review</h3>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">
                Temporary credentials returned by the admin import flow
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void copyTemporaryCredentials()} className="btn btn-outline">
                <Copy className="w-3 h-3" />
                Copy
              </button>
              <button onClick={exportTemporaryCredentials} className="btn btn-primary">
                <Download className="w-3 h-3" />
                Export Credentials
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-low text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">Temporary Password</th>
                    <th className="px-4 py-3">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {importResult.temporary_credentials.length > 0 ? (
                    importResult.temporary_credentials.map((item) => (
                      <tr key={item.username} className="hover:bg-surface-container-low">
                        <td className="px-4 py-3 text-sm font-semibold text-on-surface">{item.username}</td>
                        <td className="px-4 py-3 font-mono text-sm text-primary">{item.temporary_password}</td>
                        <td className="px-4 py-3 text-sm text-on-surface-variant">{item.email || "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-sm text-on-surface-variant">
                        No temporary credentials were returned for this import.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="space-y-4">
              <div className="rounded-sm bg-surface-container-low p-4 text-sm text-on-surface-variant">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Import Summary
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Created</span>
                    <strong className="text-on-surface">{importResult.created}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Skipped</span>
                    <strong className="text-on-surface">{importResult.skipped}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Errors</span>
                    <strong className="text-on-surface">{importResult.errors.length}</strong>
                  </div>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="rounded-sm bg-error/10 p-4 text-sm text-error">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-widest">
                    Rejected Rows
                  </div>
                  <div className="space-y-2">
                    {importResult.errors.slice(0, 6).map((item) => (
                      <div key={`${item.row}-${item.reason}`}>
                        Row {item.row}: {item.reason}
                        {item.username ? ` (${item.username})` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">
        {label}
      </span>
      {children}
    </label>
  );
}

function ToggleField({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between px-3 py-3 bg-surface-container-low rounded-sm"
    >
      <span className="text-xs font-bold uppercase tracking-widest text-on-surface">{label}</span>
      <div className={`w-10 h-5 relative rounded-full ${value ? "bg-primary" : "bg-surface-container-highest border border-outline-variant"}`}>
        <div className={`absolute top-1 w-3 h-3 rounded-full ${value ? "right-1 bg-white" : "left-1 bg-outline"}`}></div>
      </div>
    </button>
  );
}

function ContextMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-sm bg-surface-container-high p-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-on-surface">{value}</div>
    </div>
  );
}

function CompactMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-sm bg-surface-container-low p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        {label}
      </div>
      <div className="mt-2 text-xl font-black text-on-surface">{value}</div>
    </div>
  );
}

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, User, Terminal, BarChart2, Upload, ClipboardList, Users, KeyRound, Lock, Palette, Mail, Waypoints, DatabaseZap, Blocks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import SettingsShell from '../layout/SettingsShell';
import SettingsOverview from './SettingsOverview';
import DesignSystemPanel from './DesignSystemPanel';
import SMTPControlPanel from './SMTPControlPanel';
import OperationalStatusPanel from './OperationalStatusPanel';
import ThreatIngestionPanel from './ThreatIngestionPanel';
import ExtensionsCatalogPanel from './ExtensionsCatalogPanel';
import PasswordPolicyForm from './PasswordPolicyForm';
import LockoutPolicyForm from './LockoutPolicyForm';
import UserListPanel from './UserListPanel';
import UserFlyout from './UserFlyout';
import UserImportPanel from './UserImportPanel';
import AuditLogPanel from './AuditLogPanel';
import '../../index.css';

// Re-export RoleBadge for backward compat (used in other places if any)
export const RoleBadge = ({ role }) => {
    let icon, color, bg, label;
    if (role === 'admin') { icon = <Shield size={14} />; color = 'var(--primary)'; bg = 'rgba(56,189,248,0.1)'; label = 'Admin'; }
    else if (role === 'manager') { icon = <User size={14} />; color = 'var(--text-primary)'; bg = 'var(--glass-border)'; label = 'Manager'; }
    else { icon = <Terminal size={14} />; color = 'var(--text-secondary)'; bg = 'var(--bg-card)'; label = 'Tech'; }
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: bg, color, padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.8rem', border: `1px solid ${color}` }}>
            {icon} {label}
        </span>
    );
};

export default function Settings() {
    const { user } = useAuth();
    const { t } = useTranslation();

    const [usersList, setUsersList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [adminStats, setAdminStats] = useState(null);
    const [activeKey, setActiveKey] = useState('overview');

    // Flyout state
    const [selectedUser, setSelectedUser] = useState(null); // null=closed, {}=new, user=edit
    const [isNewUser, setIsNewUser] = useState(false);

    // Overview import/export state (kept here to refresh stats after import)
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);

    const isAdmin = user?.role === 'admin';
    const canViewAudit = isAdmin || user?.extra_permissions?.includes('audit_logs:read');

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const r = await fetch(`${API_URL}/api/users`, { credentials: 'include' });
            if (!r.ok) throw new Error(t('settings.err_load'));
            setUsersList(await r.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [t]);

    const fetchStats = useCallback(async () => {
        try {
            const r = await fetch(`${API_URL}/api/admin/stats`, { credentials: 'include' });
            if (r.ok) setAdminStats(await r.json());
        } catch { /* non-critical */ }
    }, []);

    useEffect(() => {
        fetchUsers();
        if (isAdmin || user?.role === 'manager') fetchStats();
    }, [fetchUsers, fetchStats, isAdmin, user?.role]);

    const handleRefresh = () => { fetchUsers(); fetchStats(); };

    const handleExport = async (format) => {
        setExporting(true);
        try {
            const r = await fetch(`${API_URL}/api/admin/users/export?format=${format}`, { credentials: 'include' });
            if (!r.ok) throw new Error('export_failed');
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `users_export.${format}`; a.click();
            URL.revokeObjectURL(url);
        } catch { /* non-critical */ } finally {
            setExporting(false);
        }
    };

    const handleImport = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        setImportResult(null);
        try {
            const form = new FormData();
            form.append('file', file);
            const r = await fetch(`${API_URL}/api/admin/users/import`, {
                method: 'POST', credentials: 'include', body: form,
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.detail || t('settings.import_error'));
            setImportResult(data);
            handleRefresh();
        } catch (err) {
            setImportResult({ error: err.message });
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    // --- Menu & Breadcrumbs ---

    const menuGroups = useMemo(() => {
        const groups = [
            { key: 'overview', icon: <BarChart2 size={16} />, label: t('settings.menu_overview') },
        ];
        if (isAdmin) {
            groups.push({ key: 'design_system', icon: <Palette size={16} />, label: t('settings.menu_design_system') });
        }
        if (isAdmin) {
            groups.push({
                key: 'control_plane_group',
                label: t('settings.menu_control_plane'),
                items: [
                    { key: 'smtp', icon: <Mail size={16} />, label: t('settings.menu_smtp') },
                    { key: 'operational_status', icon: <Waypoints size={16} />, label: t('settings.menu_operational_status') },
                ],
            });
        }
        if (isAdmin) {
            groups.push({
                key: 'intelligence_group',
                label: t('settings.menu_intelligence'),
                items: [
                    { key: 'threat_ingestion', icon: <DatabaseZap size={16} />, label: t('settings.menu_threat_ingestion') },
                ],
            });
        }
        if (isAdmin) {
            groups.push({
                key: 'extensions_group',
                label: t('settings.menu_extensions'),
                items: [
                    { key: 'extensions_catalog', icon: <Blocks size={16} />, label: t('settings.menu_extensions_catalog') },
                ],
            });
        }
        if (isAdmin) {
            groups.push({
                key: 'security_group',
                label: t('settings.menu_security'),
                items: [
                    { key: 'password_policy', icon: <KeyRound size={16} />, label: t('settings.menu_password_policy') },
                    { key: 'lockout_policy', icon: <Lock size={16} />, label: t('settings.menu_lockout_policy') },
                ],
            });
        }
        const usersItems = [
            { key: 'users', icon: <Users size={16} />, label: t('settings.menu_manage') },
        ];
        if (isAdmin) usersItems.push({ key: 'import', icon: <Upload size={16} />, label: t('settings.menu_import') });
        groups.push({ key: 'users_group', label: t('settings.menu_users'), items: usersItems });
        if (canViewAudit) {
            groups.push({ key: 'audit_group', label: t('settings.menu_audit'), items: [{ key: 'audit', icon: <ClipboardList size={16} />, label: t('settings.menu_logs') }] });
        }
        return groups;
    }, [t, isAdmin, canViewAudit]);

    const breadcrumbs = useMemo(() => {
        const map = {
            overview: {},
            design_system: { label: t('settings.menu_design_system') },
            smtp: { parent: t('settings.menu_control_plane'), label: t('settings.menu_smtp') },
            operational_status: { parent: t('settings.menu_control_plane'), label: t('settings.menu_operational_status') },
            threat_ingestion: { parent: t('settings.menu_intelligence'), label: t('settings.menu_threat_ingestion') },
            extensions_catalog: { parent: t('settings.menu_extensions'), label: t('settings.menu_extensions_catalog') },
            password_policy: { parent: t('settings.menu_security'), label: t('settings.menu_password_policy') },
            lockout_policy: { parent: t('settings.menu_security'), label: t('settings.menu_lockout_policy') },
            users: { parent: t('settings.menu_users'), label: t('settings.menu_manage') },
            import: { parent: t('settings.menu_users'), label: t('settings.menu_import') },
            audit: { parent: t('settings.menu_audit'), label: t('settings.menu_logs') },
        };
        const crumbs = [{ label: t('settings.title'), onClick: () => setActiveKey('overview') }];
        const info = map[activeKey] || {};
        if (info.parent) crumbs.push({ label: info.parent });
        crumbs.push({ label: info.label || t('settings.menu_overview') });
        return crumbs;
    }, [activeKey, t]);

    const handleSelectUser = (u) => { setSelectedUser(u); setIsNewUser(false); };
    const handleNewUser = () => { setSelectedUser({}); setIsNewUser(true); };
    const handleCloseFlyout = () => { setSelectedUser(null); setIsNewUser(false); };

    return (
        <>
            <SettingsShell groups={menuGroups} activeKey={activeKey} onSelect={setActiveKey} breadcrumbs={breadcrumbs}>

                {error && (
                    <div className="alert-banner error wide" style={{ marginBottom: '2rem' }}>
                        {error}
                    </div>
                )}

                {activeKey === 'overview' && (
                    <SettingsOverview
                        adminStats={adminStats}
                        onExport={handleExport}
                        exporting={exporting}
                        onImport={handleImport}
                        importing={importing}
                        importResult={importResult}
                        isAdmin={isAdmin}
                    />
                )}

                {activeKey === 'design_system' && isAdmin && <DesignSystemPanel />}

                {activeKey === 'smtp' && isAdmin && <SMTPControlPanel />}

                {activeKey === 'operational_status' && isAdmin && <OperationalStatusPanel />}

                {activeKey === 'threat_ingestion' && isAdmin && <ThreatIngestionPanel />}

                {activeKey === 'extensions_catalog' && isAdmin && <ExtensionsCatalogPanel />}

                {activeKey === 'password_policy' && isAdmin && <PasswordPolicyForm />}

                {activeKey === 'lockout_policy' && isAdmin && <LockoutPolicyForm />}

                {activeKey === 'users' && (
                    <UserListPanel
                        usersList={usersList}
                        loading={loading}
                        adminStats={adminStats}
                        selectedUsername={selectedUser?.username}
                        onSelectUser={handleSelectUser}
                        onNewUser={handleNewUser}
                    />
                )}

                {activeKey === 'import' && isAdmin && (
                    <UserImportPanel onImportDone={handleRefresh} />
                )}

                {activeKey === 'audit' && canViewAudit && <AuditLogPanel />}

            </SettingsShell>

            {/* Flyout renders outside the shell so it overlays correctly */}
            {(selectedUser !== null) && (
                <UserFlyout
                    selectedUser={isNewUser ? null : selectedUser}
                    currentUser={user}
                    isNew={isNewUser}
                    onClose={handleCloseFlyout}
                    onRefresh={handleRefresh}
                />
            )}
        </>
    );
}

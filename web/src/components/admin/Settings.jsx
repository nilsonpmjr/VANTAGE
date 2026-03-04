import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserPlus, Loader, Shield, User, Terminal, Settings as SettingsIcon, Search, Edit2, X, Power, LockOpen, KeyRound, Trash2, Users, UserCheck, UserX, Lock, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import AuditLogTable from './AuditLogTable';
import '../../index.css';

export const RoleBadge = ({ role }) => {
    let icon, color, bg, label;
    if (role === 'admin') {
        icon = <Shield size={14} />; color = 'var(--primary)'; bg = 'rgba(56, 189, 248, 0.1)'; label = 'Admin';
    } else if (role === 'manager') {
        icon = <User size={14} />; color = 'var(--text-primary)'; bg = 'var(--glass-border)'; label = 'Manager';
    } else {
        icon = <Terminal size={14} />; color = 'var(--text-secondary)'; bg = 'var(--bg-card)'; label = 'Tech';
    }

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: bg, color: color, padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.8rem', border: `1px solid ${color}` }}>
            {icon} {label}
        </span>
    );
};

export default function Settings() {
    const { user } = useAuth();
    const [usersList, setUsersList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const { t } = useTranslation();

    // Create User Form State
    const [isCreating, setIsCreating] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newName, setNewName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('tech');

    // Edit & Search State
    const [editingUser, setEditingUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [forceReset, setForceReset] = useState(false);

    // IAM Stats State
    const [adminStats, setAdminStats] = useState(null);

    // Tab State
    const [activeTab, setActiveTab] = useState('users');

    // Password Policy State
    const [policy, setPolicy] = useState(null);
    const [policyLoading, setPolicyLoading] = useState(false);
    const [policySaving, setPolicySaving] = useState(false);
    const [policyMsg, setPolicyMsg] = useState('');

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_URL}/api/users`, {
                credentials: 'include',
            });
            if (!response.ok) throw new Error(t('settings.err_load'));
            const data = await response.json();
            setUsersList(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const resp = await fetch(`${API_URL}/api/admin/stats`, { credentials: 'include' });
            if (resp.ok) setAdminStats(await resp.json());
        } catch (_) { /* non-critical */ }
    };

    const fetchPolicy = async () => {
        setPolicyLoading(true);
        try {
            const resp = await fetch(`${API_URL}/api/admin/password-policy`, { credentials: 'include' });
            if (resp.ok) setPolicy(await resp.json());
        } finally {
            setPolicyLoading(false);
        }
    };

    const savePolicy = async (e) => {
        e.preventDefault();
        setPolicySaving(true);
        setPolicyMsg('');
        try {
            const resp = await fetch(`${API_URL}/api/admin/password-policy`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(policy),
            });
            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.detail || 'Error saving policy');
            }
            const updated = await resp.json();
            setPolicy(updated);
            setPolicyMsg(t('settings.policy_saved'));
        } catch (err) {
            setPolicyMsg(err.message);
        } finally {
            setPolicySaving(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        if (user?.role === 'admin' || user?.role === 'manager') fetchStats();
        if (user?.role === 'admin') fetchPolicy();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsCreating(true);
        try {
            const url = editingUser ? `${API_URL}/api/users/${newUsername}` : `${API_URL}/api/users`;
            const method = editingUser ? 'PUT' : 'POST';

            const payload = {
                name: newName,
                role: newRole
            };

            if (!editingUser) {
                payload.username = newUsername;
                payload.password = newPassword;
            } else {
                if (newPassword) payload.password = newPassword;
                payload.force_password_reset = forceReset;
            }

            const response = await fetch(url, {
                method: method,
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || t('settings.err_save'));
            }

            // Reset form and reload list
            cancelEdit();
            fetchUsers();
        } catch (err) {
            alert(err.message);
        } finally {
            setIsCreating(false);
        }
    };

    const startEdit = (userToEdit) => {
        setEditingUser(userToEdit.username);
        setNewUsername(userToEdit.username);
        setNewName(userToEdit.name);
        setNewRole(userToEdit.role);
        setNewPassword('');
        setForceReset(userToEdit.force_password_reset || false);
    };

    const cancelEdit = () => {
        setEditingUser(null);
        setNewUsername('');
        setNewName('');
        setNewPassword('');
        setNewRole('tech');
        setForceReset(false);
    };

    const handleDeleteUser = async (userToDelete) => {
        if (userToDelete.username === user.username) {
            alert(t('settings.deny_self'));
            return;
        }
        if (!window.confirm(t('settings.confirm_delete', { user: userToDelete.username }))) return;
        try {
            const response = await fetch(`${API_URL}/api/users/${userToDelete.username}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || t('settings.err_action'));
            }
            fetchUsers();
            fetchStats();
        } catch (err) {
            alert(err.message);
        }
    };

    const formatLastLogin = (raw) => {
        if (!raw) return t('settings.never');
        const d = new Date(raw);
        if (isNaN(d.getTime())) return t('settings.never');
        return d.toLocaleString();
    };

    const isLocked = (u) => {
        if (!u.locked_until) return false;
        const d = new Date(u.locked_until);
        return !isNaN(d.getTime()) && d > new Date();
    };

    const handleUnlock = async (userToUnlock) => {
        if (!window.confirm(t('settings.confirm_unlock', { user: userToUnlock.username }))) return;
        try {
            const response = await fetch(`${API_URL}/api/admin/users/${userToUnlock.username}/unlock`, {
                method: 'POST',
                credentials: 'include',
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || t('settings.err_action'));
            }
            fetchUsers();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleToggleActive = async (userToToggle) => {
        if (userToToggle.username === user.username) {
            alert(t('settings.deny_self'));
            return;
        }

        const newStatus = userToToggle.is_active !== false ? false : true;

        let confirmMsg = newStatus
            ? t('settings.confirm_activate', { user: userToToggle.username })
            : t('settings.confirm_suspend', { user: userToToggle.username });

        if (!window.confirm(confirmMsg)) {
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/users/${userToToggle.username}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: newStatus })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || t('settings.err_action'));
            }

            fetchUsers();
        } catch (err) {
            alert(err.message);
        }
    };

    // RoleBadge removed from here

    const filteredUsers = Array.isArray(usersList) ? usersList.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username.toLowerCase().includes(searchTerm.toLowerCase())
    ) : [];

    return (
        <div className="fade-in" style={{ padding: '0 2rem', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
            <header style={{ marginBottom: '3rem', marginTop: '3rem' }}>
                <h2 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <SettingsIcon size={28} color="var(--primary)" />
                    {t('settings.title')}
                </h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0, marginLeft: 'calc(28px + 0.75rem)' }}>{t('settings.subtitle')}</p>
            </header>

            {/* TAB NAVIGATION */}
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--glass-border)', marginBottom: '2rem' }}>
                {[
                    { key: 'users', icon: <Users size={16} />, label: t('settings.tab_users') },
                    ...(user?.role === 'admin' ? [{ key: 'audit', icon: <ClipboardList size={16} />, label: t('settings.tab_audit') }] : []),
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.6rem 1.25rem', border: 'none', borderBottom: '2px solid',
                            borderBottomColor: activeTab === tab.key ? 'var(--primary)' : 'transparent',
                            background: 'transparent', cursor: 'pointer',
                            color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
                            fontSize: '0.9rem', fontWeight: activeTab === tab.key ? 600 : 400,
                            transition: 'all 0.2s',
                        }}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>
                    {error}
                </div>
            )}

            {/* AUDIT LOG TAB */}
            {activeTab === 'audit' && (
                <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ClipboardList size={20} color="var(--primary)" />
                        {t('settings.tab_audit')}
                    </h3>
                    <AuditLogTable />
                </div>
            )}

            {/* USERS TAB */}
            {activeTab === 'users' && <>

            {/* IAM STATS CARDS */}
            {adminStats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    {[
                        { icon: <Users size={20} />, label: t('settings.stats_total'), value: adminStats.total_users, color: 'var(--primary)' },
                        { icon: <UserCheck size={20} />, label: t('settings.stats_active'), value: adminStats.active_users, color: 'var(--green)' },
                        { icon: <UserX size={20} />, label: t('settings.stats_suspended'), value: adminStats.suspended_users, color: 'var(--red)' },
                        { icon: <Lock size={20} />, label: t('settings.stats_locked'), value: adminStats.locked_accounts, color: '#fb923c' },
                        { icon: <Shield size={20} />, label: t('settings.stats_mfa'), value: adminStats.users_with_mfa, color: 'var(--primary)' },
                        { icon: <X size={20} />, label: t('settings.stats_failed_24h'), value: adminStats.failed_logins_24h, color: 'var(--red)' },
                    ].map(({ icon, label, value, color }) => (
                        <div key={label} className="glass-panel" style={{ padding: '1rem 1.25rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <span style={{ color, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600 }}>{icon} {label}</span>
                            <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</span>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem', alignItems: 'start' }}>

                {/* CREATE/EDIT USER FORM */}
                <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {editingUser ? <Edit2 size={20} color="var(--primary)" /> : <UserPlus size={20} color="var(--primary)" />}
                            {editingUser ? t('settings.edit') : t('settings.new_user')}
                        </span>
                        {editingUser && (
                            <button onClick={cancelEdit} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }} title={t('settings.cancel_edit')}>
                                <X size={20} />
                            </button>
                        )}
                    </h3>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('settings.name')}</label>
                            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} placeholder="Ex: João Silva" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('settings.user')}</label>
                            <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required disabled={!!editingUser} className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)', opacity: editingUser ? 0.5 : 1, cursor: editingUser ? 'not-allowed' : 'text' }} placeholder="joao.silva" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{editingUser ? t('settings.pass_placeholder') : t('settings.pass_new')}</label>
                            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required={!editingUser} minLength={6} className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} placeholder="••••••••" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('settings.role')}</label>
                            <select value={newRole} onChange={e => setNewRole(e.target.value)} className="lang-select" style={{ width: '100%', padding: '0.6rem' }}>
                                <option value="tech">{t('settings.tech')}</option>
                                <option value="manager">{t('settings.manager')}</option>
                                <option value="admin">{t('settings.admin')}</option>
                            </select>
                        </div>

                        {editingUser && editingUser !== user?.username && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.75rem', background: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                                <input
                                    type="checkbox"
                                    id="force_reset_check"
                                    checked={forceReset}
                                    onChange={e => setForceReset(e.target.checked)}
                                    style={{ marginTop: '0.15rem', accentColor: 'var(--primary)', cursor: 'pointer' }}
                                />
                                <div>
                                    <label htmlFor="force_reset_check" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer', display: 'block' }}>{t('settings.force_reset')}</label>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>{t('settings.force_reset_tip')}</p>
                                </div>
                            </div>
                        )}

                        <button type="submit" disabled={isCreating} className="btn-primary" style={{ marginTop: '0.5rem' }}>
                            {isCreating ? <Loader className="spin" size={18} /> : (editingUser ? t('settings.edit') : t('settings.save'))}
                        </button>
                    </form>
                </div>

                {/* USERS LIST TABLE */}
                <div className="glass-panel" style={{ padding: '0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {t('settings.users')}
                            {loading && <Loader className="spin" size={18} color="var(--primary)" />}
                        </h3>

                        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
                            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder={t('settings.search')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="search-input"
                                style={{ width: '100%', padding: '0.5rem 1rem 0.5rem 2.5rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-main)', fontSize: '0.85rem' }}
                            />
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead style={{ background: 'var(--bg-main)' }}>
                                <tr>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('settings.name').toUpperCase()}</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('settings.user').toUpperCase()}</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('settings.role').toUpperCase()}</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('settings.last_login').toUpperCase()}</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem', textAlign: 'right' }}>{t('settings.actions').toUpperCase()}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length === 0 && !loading && (
                                    <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('settings.no_users_found')}</td></tr>
                                )}
                                {filteredUsers.map((u, idx) => (
                                    <tr key={u.username} style={{ borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none', transition: 'background 0.2s' }}>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-primary)', opacity: u.is_active === false ? 0.5 : 1 }}>
                                            {u.name}
                                            {u.is_active === false && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{t('settings.suspended')}</span>}
                                            {isLocked(u) && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', background: 'rgba(251, 146, 60, 0.15)', color: '#fb923c', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{t('settings.locked')}</span>}
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontFamily: 'monospace', opacity: u.is_active === false ? 0.5 : 1 }}>{u.username}</td>
                                        <td style={{ padding: '1rem 1.5rem', opacity: u.is_active === false ? 0.5 : 1 }}><RoleBadge role={u.role} /></td>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap', opacity: u.is_active === false ? 0.5 : 1 }}>{formatLastLogin(u.last_login_at)}</td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <button
                                                onClick={() => startEdit(u)}
                                                disabled={u.is_active === false}
                                                style={{
                                                    background: 'transparent', border: 'none', cursor: u.is_active === false ? 'not-allowed' : 'pointer',
                                                    color: u.is_active === false ? 'var(--glass-border)' : 'var(--text-secondary)',
                                                    padding: '0.4rem', borderRadius: '4px', marginRight: '0.5rem'
                                                }}
                                                title={u.is_active === false ? t('settings.restore_to_edit') : t('settings.edit_user')}
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            {isLocked(u) && (
                                                <button
                                                    onClick={() => handleUnlock(u)}
                                                    style={{
                                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                                        color: '#fb923c',
                                                        padding: '0.4rem', borderRadius: '4px', marginRight: '0.5rem'
                                                    }}
                                                    title={t('settings.unlock')}
                                                >
                                                    <LockOpen size={18} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleToggleActive(u)}
                                                disabled={u.username === user.username}
                                                style={{
                                                    background: 'transparent', border: 'none', cursor: u.username === user.username ? 'not-allowed' : 'pointer',
                                                    color: u.username === user.username ? 'var(--glass-border)' : (u.is_active === false ? 'var(--green)' : 'var(--red)'),
                                                    padding: '0.4rem', borderRadius: '4px'
                                                }}
                                                title={u.username === user.username ? t('settings.deny_self_title') : (u.is_active === false ? t('settings.reactivate') : t('settings.suspend'))}
                                            >
                                                <Power size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(u)}
                                                disabled={u.username === user.username}
                                                style={{
                                                    background: 'transparent', border: 'none', cursor: u.username === user.username ? 'not-allowed' : 'pointer',
                                                    color: u.username === user.username ? 'var(--glass-border)' : 'var(--red)',
                                                    padding: '0.4rem', borderRadius: '4px', marginLeft: '0.25rem',
                                                    opacity: u.username === user.username ? 0.4 : 0.7,
                                                }}
                                                title={u.username === user.username ? t('settings.deny_self_title') : t('settings.delete')}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

            </> /* end users tab */}

            {/* PASSWORD POLICY PANEL */}
            {user?.role === 'admin' && activeTab === 'users' && (
                <div className="glass-panel" style={{ marginTop: '2rem', padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <KeyRound size={20} color="var(--primary)" />
                        {t('settings.policy_title')}
                        {policyLoading && <Loader className="spin" size={18} color="var(--primary)" />}
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 0, marginBottom: '1.5rem' }}>{t('settings.policy_subtitle')}</p>

                    {policy && (
                        <form onSubmit={savePolicy} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('settings.policy_min_length')}</label>
                                <input type="number" min={6} max={128} value={policy.min_length} onChange={e => setPolicy(p => ({ ...p, min_length: Number(e.target.value) }))} className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('settings.policy_history')}</label>
                                <input type="number" min={0} max={24} value={policy.history_count} onChange={e => setPolicy(p => ({ ...p, history_count: Number(e.target.value) }))} className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('settings.policy_expiry')}</label>
                                <input type="number" min={0} max={3650} value={policy.expiry_days} onChange={e => setPolicy(p => ({ ...p, expiry_days: Number(e.target.value) }))} className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('settings.policy_warning')}</label>
                                <input type="number" min={1} max={90} value={policy.expiry_warning_days} onChange={e => setPolicy(p => ({ ...p, expiry_warning_days: Number(e.target.value) }))} className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} />
                            </div>

                            {[
                                ['require_uppercase', 'policy_uppercase'],
                                ['require_numbers', 'policy_numbers'],
                                ['require_symbols', 'policy_symbols'],
                            ].map(([key, labelKey]) => (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem', background: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                                    <input type="checkbox" id={key} checked={policy[key]} onChange={e => setPolicy(p => ({ ...p, [key]: e.target.checked }))} style={{ accentColor: 'var(--primary)', cursor: 'pointer' }} />
                                    <label htmlFor={key} style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>{t(`settings.${labelKey}`)}</label>
                                </div>
                            ))}

                            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                                <button type="submit" disabled={policySaving} className="btn-primary" style={{ minWidth: '160px' }}>
                                    {policySaving ? <Loader className="spin" size={18} /> : t('settings.policy_save')}
                                </button>
                                {policyMsg && <span style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>{policyMsg}</span>}
                            </div>
                        </form>
                    )}
                </div>
            )}

        </div>
    );
}

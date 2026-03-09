import React, { useState, useEffect } from 'react';
import { X, Edit2, Save, Loader, Shield, UserPlus, Power, Trash2, LockOpen, ShieldOff, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import FlyoutPanel from '../shared/FlyoutPanel';
import ConfirmModal from '../shared/ConfirmModal';

const ALL_PERMISSIONS = [
    { key: 'audit_logs:read', label: 'Visualizar Audit Log' },
    { key: 'users:export',    label: 'Exportar Usuários' },
    { key: 'apikeys:manage',  label: 'Gerenciar API Keys' },
    { key: 'stats:export',    label: 'Exportar Estatísticas' },
];

const isLocked = (u) => {
    if (!u?.locked_until) return false;
    const d = new Date(u.locked_until);
    return !isNaN(d.getTime()) && d > new Date();
};

// Flyout for both creating (isNew=true) and editing existing users
export default function UserFlyout({ selectedUser, currentUser, isNew, onClose, onRefresh }) {
    const { t } = useTranslation();

    // Form state
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('tech');
    const [email, setEmail] = useState('');
    const [forceReset, setForceReset] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Permissions
    const [permsOpen, setPermsOpen] = useState(false);
    const [editPerms, setEditPerms] = useState([]);
    const [permSaving, setPermSaving] = useState(false);
    const [permMsg, setPermMsg] = useState('');

    // Action feedback
    const [actionMsg, setActionMsg] = useState('');
    const [actionErr, setActionErr] = useState('');

    // ConfirmModal state
    const [confirmState, setConfirmState] = useState(null); // { title, message, onConfirm, danger }

    useEffect(() => {
        if (isNew) {
            setName(''); setUsername(''); setPassword(''); setRole('tech');
            setEmail(''); setForceReset(false); setIsEditing(true);
        } else if (selectedUser) {
            setName(selectedUser.name || '');
            setUsername(selectedUser.username || '');
            setRole(selectedUser.role || 'tech');
            setEmail(selectedUser.email || '');
            setForceReset(selectedUser.force_password_reset || false);
            setPassword('');
            setIsEditing(false);
            setEditPerms(selectedUser.extra_permissions || []);
            setPermMsg('');
            setActionMsg('');
            setActionErr('');
            setPermsOpen(false);
        }
    }, [selectedUser, isNew]);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setActionErr('');
        try {
            const url = isNew ? `${API_URL}/api/users` : `${API_URL}/api/users/${username}`;
            const method = isNew ? 'POST' : 'PUT';
            const payload = { name, role, email: email || null };
            if (isNew) {
                payload.username = username;
                payload.password = password;
            } else {
                if (password) payload.password = password;
                payload.force_password_reset = forceReset;
            }
            const resp = await fetch(url, {
                method,
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.detail || t('settings.err_save'));
            }
            onRefresh();
            if (isNew) onClose();
            else setIsEditing(false);
        } catch (err) {
            setActionErr(err.message);
        } finally {
            setSaving(false);
        }
    };

    const doAction = async (fn) => {
        setActionMsg('');
        setActionErr('');
        try {
            await fn();
            onRefresh();
        } catch (err) {
            setActionErr(err.message);
        }
    };

    const handleUnlock = () => {
        setConfirmState({
            title: t('settings.unlock'),
            message: t('settings.confirm_unlock', { user: username }),
            danger: false,
            onConfirm: () => doAction(async () => {
                const r = await fetch(`${API_URL}/api/admin/users/${username}/unlock`, { method: 'POST', credentials: 'include' });
                if (!r.ok) { const e = await r.json(); throw new Error(e.detail); }
                setActionMsg(t('settings.unlock'));
            }),
        });
    };

    const handleRevokeMfa = () => {
        setConfirmState({
            title: t('settings.revoke_mfa'),
            message: t('settings.confirm_revoke_mfa', { user: username }),
            danger: true,
            onConfirm: () => doAction(async () => {
                const r = await fetch(`${API_URL}/api/mfa/${username}`, { method: 'DELETE', credentials: 'include' });
                if (!r.ok) { const e = await r.json(); throw new Error(e.detail); }
            }),
        });
    };

    const handleToggleActive = () => {
        const newStatus = selectedUser.is_active !== false ? false : true;
        setConfirmState({
            title: newStatus ? t('settings.activate') : t('settings.suspend'),
            message: newStatus
                ? t('settings.confirm_activate', { user: username })
                : t('settings.confirm_suspend', { user: username }),
            danger: !newStatus,
            onConfirm: () => doAction(async () => {
                const r = await fetch(`${API_URL}/api/users/${username}`, {
                    method: 'PUT', credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_active: newStatus }),
                });
                if (!r.ok) { const e = await r.json(); throw new Error(e.detail); }
            }),
        });
    };

    const handleDelete = () => {
        if (username === currentUser?.username) { setActionErr(t('settings.deny_self')); return; }
        setConfirmState({
            title: t('settings.delete'),
            message: t('settings.confirm_delete', { user: username }),
            danger: true,
            onConfirm: () => doAction(async () => {
                const r = await fetch(`${API_URL}/api/users/${username}`, { method: 'DELETE', credentials: 'include' });
                if (!r.ok) { const e = await r.json(); throw new Error(e.detail); }
                onClose();
            }),
        });
    };

    const handleSavePerms = async () => {
        setPermSaving(true);
        setPermMsg('');
        try {
            const r = await fetch(`${API_URL}/api/admin/users/${username}/permissions`, {
                method: 'PUT', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ extra_permissions: editPerms }),
            });
            if (!r.ok) { const e = await r.json(); throw new Error(e.detail); }
            setPermMsg(t('permissions.saved'));
            onRefresh();
        } catch (err) {
            setPermMsg(err.message);
        } finally {
            setPermSaving(false);
        }
    };

    const isSelf = selectedUser?.username === currentUser?.username;

    const title = isNew ? t('settings.new_user') : (isEditing ? `${t('settings.edit')} — ${username}` : username);

    return (
        <FlyoutPanel open title={title} onClose={onClose}>

            {/* Confirmation Modal (UX-11) */}
            {confirmState && (
                <ConfirmModal
                    title={confirmState.title}
                    message={confirmState.message}
                    danger={confirmState.danger}
                    onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }}
                    onCancel={() => setConfirmState(null)}
                />
            )}

            {/* Feedback */}
            {actionErr && (
                <div style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', padding: '0.6rem 0.85rem', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '1rem' }}>
                    {actionErr}
                </div>
            )}
            {actionMsg && (
                <div style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)', padding: '0.6rem 0.85rem', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '1rem' }}>
                    {actionMsg}
                </div>
            )}

            {/* === VIEW MODE === */}
            {!isNew && !isEditing && selectedUser && (
                <>
                    {/* User info */}
                    <div className="flyout-section">
                        <div className="flyout-row">
                            <span className="flyout-row-key">{t('settings.name')}</span>
                            <span className="flyout-row-val">{selectedUser.name}</span>
                        </div>
                        <div className="flyout-row">
                            <span className="flyout-row-key">{t('settings.role')}</span>
                            <span className="flyout-row-val">{selectedUser.role}</span>
                        </div>
                        {selectedUser.email && (
                            <div className="flyout-row">
                                <span className="flyout-row-key">{t('settings.email')}</span>
                                <span className="flyout-row-val" style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{selectedUser.email}</span>
                            </div>
                        )}
                        <div className="flyout-row">
                            <span className="flyout-row-key">MFA</span>
                            <span className="flyout-row-val" style={{ color: selectedUser.mfa_enabled ? 'var(--green)' : 'var(--text-muted)' }}>
                                {selectedUser.mfa_enabled ? '● Ativo' : '○ Inativo'}
                            </span>
                        </div>
                        <div className="flyout-row">
                            <span className="flyout-row-key">{t('settings.status')}</span>
                            <span className="flyout-row-val">
                                {selectedUser.is_active === false
                                    ? <span style={{ color: 'var(--red)' }}>{t('settings.suspended')}</span>
                                    : isLocked(selectedUser)
                                        ? <span style={{ color: '#fb923c' }}>{t('settings.locked')}</span>
                                        : <span style={{ color: 'var(--green)' }}>{t('settings.active')}</span>
                                }
                            </span>
                        </div>
                    </div>

                    {/* Primary actions */}
                    <div className="flyout-actions">
                        <button className="btn-action" onClick={() => setIsEditing(true)}>
                            <Edit2 size={15} /> {t('settings.edit')}
                        </button>
                        {isLocked(selectedUser) && (
                            <button className="btn-action" onClick={handleUnlock}>
                                <LockOpen size={15} /> {t('settings.unlock')}
                            </button>
                        )}
                        {selectedUser.mfa_enabled && currentUser?.role === 'admin' && (
                            <button className="btn-action" onClick={handleRevokeMfa}>
                                <ShieldOff size={15} /> {t('settings.revoke_mfa')}
                            </button>
                        )}
                        {!isSelf && (
                            <button className="btn-action" onClick={handleToggleActive}>
                                <Power size={15} />
                                {selectedUser.is_active === false ? t('settings.activate') : t('settings.suspend')}
                            </button>
                        )}
                        {!isSelf && (
                            <button className="btn-action danger" onClick={handleDelete}>
                                <Trash2 size={15} /> {t('settings.delete')}
                            </button>
                        )}
                    </div>

                    {/* Permissions accordion */}
                    {role !== 'admin' && (
                        <div style={{ marginTop: '0.5rem' }}>
                            <button
                                onClick={() => setPermsOpen(o => !o)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600, padding: '0.5rem 0', width: '100%' }}
                            >
                                {permsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <Shield size={14} /> {t('permissions.section_title')}
                            </button>
                            {permsOpen && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
                                    {ALL_PERMISSIONS.map(({ key, label }) => (
                                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.4rem 0.6rem', borderRadius: '6px', background: 'var(--glass-bg)' }}>
                                            <input
                                                type="checkbox"
                                                checked={editPerms.includes(key)}
                                                onChange={() => setEditPerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])}
                                                style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                                            />
                                            {label}
                                        </label>
                                    ))}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                                        <button onClick={handleSavePerms} disabled={permSaving} className="btn-action" style={{ fontSize: '0.78rem' }}>
                                            {permSaving ? <Loader className="spin" size={13} /> : <Shield size={13} />}
                                            {t('permissions.save')}
                                        </button>
                                        {permMsg && <span style={{ fontSize: '0.78rem', color: permMsg === t('permissions.saved') ? 'var(--green)' : 'var(--red)' }}>{permMsg}</span>}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* === EDIT / CREATE MODE === */}
            {(isNew || isEditing) && (
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-field">
                        <label className="form-label">{t('settings.name')}</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} required className="form-input" placeholder="Ex: João Silva" />
                    </div>
                    {isNew && (
                        <div className="form-field">
                            <label className="form-label">{t('settings.user')}</label>
                            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required className="form-input" placeholder="joao.silva" />
                        </div>
                    )}
                    <div className="form-field">
                        <label className="form-label">{isNew ? t('settings.pass_new') : t('settings.pass_placeholder')}</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required={isNew} minLength={6} className="form-input" placeholder="••••••••" />
                    </div>
                    <div className="form-field">
                        <label className="form-label">{t('settings.email')}</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="form-input" placeholder="user@example.com" />
                    </div>
                    <div className="form-field">
                        <label className="form-label">{t('settings.role')}</label>
                        <select value={role} onChange={e => setRole(e.target.value)} className="form-select">
                            <option value="tech">{t('settings.tech')}</option>
                            <option value="manager">{t('settings.manager')}</option>
                            <option value="admin">{t('settings.admin')}</option>
                        </select>
                    </div>
                    {!isNew && !isSelf && (
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                            <input type="checkbox" checked={forceReset} onChange={e => setForceReset(e.target.checked)} style={{ accentColor: 'var(--primary)', marginTop: '0.15rem' }} />
                            {t('settings.force_reset')}
                        </label>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button type="submit" disabled={saving} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                            {saving ? <Loader className="spin" size={16} /> : <Save size={16} />}
                            {isNew ? t('settings.save') : t('settings.edit')}
                        </button>
                        {!isNew && (
                            <button type="button" onClick={() => setIsEditing(false)} className="btn-secondary">
                                {t('settings.cancel')}
                            </button>
                        )}
                    </div>
                </form>
            )}
        </FlyoutPanel>
    );
}

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Trash2, Loader, Shield, User, Terminal, Settings as SettingsIcon, Search, Edit2, X, Power } from 'lucide-react';
import { t } from '../utils/translations';
import '../index.css';

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
    const lang = user?.preferred_lang || 'pt';

    // Create User Form State
    const [isCreating, setIsCreating] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newName, setNewName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('tech');

    // Edit & Search State
    const [editingUser, setEditingUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:8000/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(t('settings.err_load', lang));
            const data = await response.json();
            setUsersList(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsCreating(true);
        try {
            const token = localStorage.getItem('token');
            const url = editingUser ? `http://localhost:8000/api/users/${newUsername}` : 'http://localhost:8000/api/users';
            const method = editingUser ? 'PUT' : 'POST';

            const payload = {
                name: newName,
                role: newRole
            };

            if (!editingUser) {
                payload.username = newUsername;
                payload.password = newPassword;
            } else if (newPassword) {
                payload.password = newPassword; // Only send password if editing and it's filled
            }

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || t('settings.err_save', lang));
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
        setNewPassword(''); // Password is left blank when editing unless changing
    };

    const cancelEdit = () => {
        setEditingUser(null);
        setNewUsername('');
        setNewName('');
        setNewPassword('');
        setNewRole('tech');
    };

    const handleToggleActive = async (userToToggle) => {
        if (userToToggle.username === user.username) {
            alert(t('settings.deny_self', lang));
            return;
        }

        const newStatus = userToToggle.is_active !== false ? false : true;

        let confirmMsg = newStatus
            ? t('settings.confirm_activate', lang).replace('{{user}}', userToToggle.username)
            : t('settings.confirm_suspend', lang).replace('{{user}}', userToToggle.username);

        if (!window.confirm(confirmMsg)) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:8000/api/users/${userToToggle.username}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ is_active: newStatus })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || t('settings.err_action', lang));
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
                    {t('settings.title', lang)}
                </h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0, marginLeft: 'calc(28px + 0.75rem)' }}>{t('settings.subtitle', lang)}</p>
            </header>

            {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>
                    {error}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem', alignItems: 'start' }}>

                {/* CREATE/EDIT USER FORM */}
                <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {editingUser ? <Edit2 size={20} color="var(--primary)" /> : <UserPlus size={20} color="var(--primary)" />}
                            {editingUser ? t('settings.edit', lang) : t('settings.new_user', lang)}
                        </span>
                        {editingUser && (
                            <button onClick={cancelEdit} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }} title="Cancelar Edição">
                                <X size={20} />
                            </button>
                        )}
                    </h3>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('settings.name', lang)}</label>
                            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} placeholder="Ex: João Silva" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('settings.user', lang)}</label>
                            <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required disabled={!!editingUser} className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)', opacity: editingUser ? 0.5 : 1, cursor: editingUser ? 'not-allowed' : 'text' }} placeholder="joao.silva" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{editingUser ? t('settings.pass_placeholder', lang) : 'Senha de Acesso'}</label>
                            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required={!editingUser} minLength={6} className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} placeholder="••••••••" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('settings.role', lang)}</label>
                            <select value={newRole} onChange={e => setNewRole(e.target.value)} className="lang-select" style={{ width: '100%', padding: '0.6rem' }}>
                                <option value="tech">{t('settings.tech', lang)}</option>
                                <option value="manager">{t('settings.manager', lang)}</option>
                                <option value="admin">{t('settings.admin', lang)}</option>
                            </select>
                        </div>

                        <button type="submit" disabled={isCreating} className="btn-primary" style={{ marginTop: '0.5rem' }}>
                            {isCreating ? <Loader className="spin" size={18} /> : (editingUser ? t('settings.edit', lang) : t('settings.save', lang))}
                        </button>
                    </form>
                </div>

                {/* USERS LIST TABLE */}
                <div className="glass-panel" style={{ padding: '0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {t('settings.users', lang)}
                            {loading && <Loader className="spin" size={18} color="var(--primary)" />}
                        </h3>

                        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
                            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder={t('settings.search', lang)}
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
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('settings.name', lang).toUpperCase()}</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('settings.user', lang).toUpperCase()}</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('settings.role', lang).toUpperCase()}</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem', textAlign: 'right' }}>{t('settings.actions', lang).toUpperCase()}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length === 0 && !loading && (
                                    <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum usuário encontrado.</td></tr>
                                )}
                                {filteredUsers.map((u, idx) => (
                                    <tr key={u.username} style={{ borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none', transition: 'background 0.2s' }}>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-primary)', opacity: u.is_active === false ? 0.5 : 1 }}>
                                            {u.name}
                                            {u.is_active === false && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>{t('settings.suspended', lang)}</span>}
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontFamily: 'monospace', opacity: u.is_active === false ? 0.5 : 1 }}>{u.username}</td>
                                        <td style={{ padding: '1rem 1.5rem', opacity: u.is_active === false ? 0.5 : 1 }}><RoleBadge role={u.role} /></td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <button
                                                onClick={() => startEdit(u)}
                                                disabled={u.is_active === false}
                                                style={{
                                                    background: 'transparent', border: 'none', cursor: u.is_active === false ? 'not-allowed' : 'pointer',
                                                    color: u.is_active === false ? 'var(--glass-border)' : 'var(--text-secondary)',
                                                    padding: '0.4rem', borderRadius: '4px', marginRight: '0.5rem'
                                                }}
                                                title={u.is_active === false ? "Restaure o usuário para editar" : "Editar Usuário"}
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleToggleActive(u)}
                                                disabled={u.username === user.username}
                                                style={{
                                                    background: 'transparent', border: 'none', cursor: u.username === user.username ? 'not-allowed' : 'pointer',
                                                    color: u.username === user.username ? 'var(--glass-border)' : (u.is_active === false ? 'var(--green)' : 'var(--red)'),
                                                    padding: '0.4rem', borderRadius: '4px'
                                                }}
                                                title={u.username === user.username ? 'Você não pode suspender a si próprio' : (u.is_active === false ? 'Reativar Usuário' : 'Suspender Usuário')}
                                            >
                                                <Power size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}

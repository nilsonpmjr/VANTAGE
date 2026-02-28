import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Trash2, Loader, Shield, User, Terminal, Settings as SettingsIcon } from 'lucide-react';
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

    // Create User Form State
    const [isCreating, setIsCreating] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newName, setNewName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('tech');

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:8000/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Falha ao carregar usuários.');
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

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setIsCreating(true);
        try {
            const token = localStorage.getItem('token');
            const payload = {
                username: newUsername,
                name: newName,
                password: newPassword,
                role: newRole
            };

            const response = await fetch('http://localhost:8000/api/users', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Erro ao criar usuário');
            }

            // Reset form and reload list
            setNewUsername('');
            setNewName('');
            setNewPassword('');
            setNewRole('tech');
            fetchUsers();
        } catch (err) {
            alert(err.message);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteUser = async (username) => {
        if (username === user.username) {
            alert("Ação Negada: Você não pode deletar a si mesmo enquanto estiver logado.");
            return;
        }

        if (!window.confirm(`Tem certeza que deseja Revogar o acesso do usuário '${username}'?`)) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`http://localhost:8000/api/users/${username}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error('Erro ao deletar usuário');
            }

            fetchUsers();
        } catch (err) {
            alert(err.message);
        }
    };

    // RoleBadge removed from here

    return (
        <div className="fade-in" style={{ padding: '0 2rem', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
            <header style={{ marginBottom: '2rem', marginTop: '1rem' }}>
                <h2 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <SettingsIcon size={28} color="var(--primary)" />
                    Painel de Configurações
                </h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Gerenciamento de Identidade e Acessos do iT.eam SOC.</p>
            </header>

            {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>
                    {error}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem', alignItems: 'start' }}>

                {/* CREATE USER FORM */}
                <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <UserPlus size={20} color="var(--primary)" />
                        Novo Usuário
                    </h3>

                    <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Nome Completo</label>
                            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} placeholder="Ex: João Silva" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Username (Login)</label>
                            <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} placeholder="joao.silva" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Senha de Acesso</label>
                            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} placeholder="••••••••" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Perfil de Acesso (RBAC)</label>
                            <select value={newRole} onChange={e => setNewRole(e.target.value)} className="lang-select" style={{ width: '100%', padding: '0.6rem' }}>
                                <option value="tech">Técnico (Apenas Scanner)</option>
                                <option value="manager">Gerente (Scanner + Dashboard)</option>
                                <option value="admin">Administrador (Total)</option>
                            </select>
                        </div>

                        <button type="submit" disabled={isCreating} className="search-button" style={{ marginTop: '0.5rem', padding: '0.75rem', display: 'flex', justifyContent: 'center' }}>
                            {isCreating ? <Loader className="spin" size={18} /> : 'Conceder Acesso'}
                        </button>
                    </form>
                </div>

                {/* USERS LIST TABLE */}
                <div className="glass-panel" style={{ padding: '0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Usuários Ativos SOC</h3>
                        {loading && <Loader className="spin" size={18} color="var(--primary)" />}
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead style={{ background: 'var(--bg-main)' }}>
                                <tr>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>NOME</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>USERNAME</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>PERFIL</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem', textAlign: 'right' }}>AÇÕES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(!Array.isArray(usersList) || usersList.length === 0) && !loading && (
                                    <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum usuário encontrado.</td></tr>
                                )}
                                {Array.isArray(usersList) && usersList.map((u, idx) => (
                                    <tr key={u.username} style={{ borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none', transition: 'background 0.2s' }}>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-primary)' }}>{u.name}</td>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{u.username}</td>
                                        <td style={{ padding: '1rem 1.5rem' }}><RoleBadge role={u.role} /></td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <button
                                                onClick={() => handleDeleteUser(u.username)}
                                                disabled={u.username === user.username}
                                                style={{
                                                    background: 'transparent', border: 'none', cursor: u.username === user.username ? 'not-allowed' : 'pointer',
                                                    color: u.username === user.username ? 'var(--glass-border)' : 'var(--red)',
                                                    padding: '0.4rem', borderRadius: '4px'
                                                }}
                                                title={u.username === user.username ? 'Você não pode revogar a si próprio' : 'Revogar Acesso'}
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
        </div>
    );
}

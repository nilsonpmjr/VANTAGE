import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Trash2, Loader, Shield, User, Terminal, Settings as SettingsIcon, Search, Edit2, X } from 'lucide-react';
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
                throw new Error(errData.detail || 'Erro ao salvar usuário');
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

    const filteredUsers = Array.isArray(usersList) ? usersList.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username.toLowerCase().includes(searchTerm.toLowerCase())
    ) : [];

    return (
        <div className="fade-in" style={{ padding: '0 2rem', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
            <header className="glass-panel" style={{ marginBottom: '2rem', marginTop: '1rem', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', borderRadius: '12px' }}>
                <h2 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center' }}>
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

                {/* CREATE/EDIT USER FORM */}
                <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {editingUser ? <Edit2 size={20} color="var(--primary)" /> : <UserPlus size={20} color="var(--primary)" />}
                            {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
                        </span>
                        {editingUser && (
                            <button onClick={cancelEdit} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }} title="Cancelar Edição">
                                <X size={20} />
                            </button>
                        )}
                    </h3>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Nome Completo</label>
                            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} placeholder="Ex: João Silva" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Username (Login)</label>
                            <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required disabled={!!editingUser} className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)', opacity: editingUser ? 0.5 : 1, cursor: editingUser ? 'not-allowed' : 'text' }} placeholder="joao.silva" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{editingUser ? 'Nova Senha (Opcional)' : 'Senha de Acesso'}</label>
                            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required={!editingUser} minLength={6} className="search-input" style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }} placeholder="••••••••" />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Perfil de Acesso (RBAC)</label>
                            <select value={newRole} onChange={e => setNewRole(e.target.value)} className="lang-select" style={{ width: '100%', padding: '0.6rem' }}>
                                <option value="tech">Técnico (Apenas Scanner)</option>
                                <option value="manager">Gerente (Scanner + Dashboard)</option>
                                <option value="admin">Administrador (Total)</option>
                            </select>
                        </div>

                        <button type="submit" disabled={isCreating} className="btn-primary" style={{ marginTop: '0.5rem' }}>
                            {isCreating ? <Loader className="spin" size={18} /> : (editingUser ? 'Salvar Alterações' : 'Conceder Acesso')}
                        </button>
                    </form>
                </div>

                {/* USERS LIST TABLE */}
                <div className="glass-panel" style={{ padding: '0', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            Usuários Ativos SOC
                            {loading && <Loader className="spin" size={18} color="var(--primary)" />}
                        </h3>

                        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
                            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder="Buscar usuários..."
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
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>NOME</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>USERNAME</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>PERFIL</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem', textAlign: 'right' }}>AÇÕES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.length === 0 && !loading && (
                                    <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum usuário encontrado.</td></tr>
                                )}
                                {filteredUsers.map((u, idx) => (
                                    <tr key={u.username} style={{ borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none', transition: 'background 0.2s' }}>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-primary)' }}>{u.name}</td>
                                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{u.username}</td>
                                        <td style={{ padding: '1rem 1.5rem' }}><RoleBadge role={u.role} /></td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <button
                                                onClick={() => startEdit(u)}
                                                style={{
                                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                                    color: 'var(--text-secondary)',
                                                    padding: '0.4rem', borderRadius: '4px', marginRight: '0.5rem'
                                                }}
                                                title="Editar Usuário"
                                            >
                                                <Edit2 size={18} />
                                            </button>
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

import React from 'react';
import { Search, LayoutDashboard, Settings, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ currentView, setCurrentView }) {
    const { user, logout } = useAuth();

    if (!user) return null;

    const NAV_ITEMS = [
        { id: 'scanner', label: 'Scanner', icon: Search, roles: ['admin', 'manager', 'tech'] },
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'manager'] },
        { id: 'settings', label: 'Configurações', icon: Settings, roles: ['admin'] }
    ];

    const filteredNav = NAV_ITEMS.filter(item => item.roles.includes(user.role));

    return (
        <aside style={{
            width: '260px',
            background: 'var(--bg-card)',
            borderRight: '1px solid var(--glass-border)',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem 1rem',
            minHeight: '100vh',
            boxShadow: '2px 0 10px rgba(0,0,0,0.2)'
        }}>
            <div style={{ padding: '0 0.5rem 2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <img
                    src="/logo.svg"
                    alt="iT.eam Logo"
                    style={{ width: '130px', height: 'auto' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                />
            </div>

            <nav style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {filteredNav.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentView === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setCurrentView(item.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                width: '100%', padding: '0.875rem 1rem',
                                background: isActive ? 'var(--accent-glow)' : 'transparent',
                                border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent',
                                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                textAlign: 'left',
                                fontWeight: isActive ? 500 : 400
                            }}
                            onMouseOver={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                    e.currentTarget.style.color = 'var(--text-primary)';
                                }
                            }}
                            onMouseOut={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--text-secondary)';
                                }
                            }}
                        >
                            <Icon size={20} color={isActive ? "var(--primary)" : "currentColor"} />
                            {item.label}
                        </button>
                    )
                })}
            </nav>

            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem', marginTop: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ background: 'var(--glass-bg)', padding: '0.5rem', borderRadius: '50%', border: '1px solid var(--primary)' }}>
                        <ShieldCheck size={18} color="var(--primary)" />
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>{user.name || user.username}</p>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{user.role}</p>
                    </div>
                </div>
                <button
                    onClick={logout}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        width: '100%', padding: '0.875rem 1rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: 'var(--red)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'left'
                    }}
                    onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'rgba(239, 68, 68, 0.2)' })}
                    onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'rgba(239, 68, 68, 0.1)' })}
                >
                    <LogOut size={20} />
                    Sair do Sistema
                </button>
            </div>
        </aside>
    );
}

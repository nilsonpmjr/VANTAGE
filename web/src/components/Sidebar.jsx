import React, { useState, useEffect } from 'react';
import { Search, LayoutDashboard, Settings, LogOut, ShieldCheck, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { t } from '../utils/translations';

export default function Sidebar({ currentView, setCurrentView }) {
    const { user, logout } = useAuth();

    const [isCollapsed, setIsCollapsed] = useState(true);
    const [profileImg, setProfileImg] = useState(user?.avatar_base64 || '');

    useEffect(() => {
        const handleProfileUpdate = () => {
            try {
                const updatedUser = JSON.parse(localStorage.getItem('user'));
                if (updatedUser && updatedUser.avatar_base64) {
                    setProfileImg(updatedUser.avatar_base64);
                }
            } catch (e) {
                console.error(e);
            }
        };
        window.addEventListener('userProfileUpdated', handleProfileUpdate);
        return () => window.removeEventListener('userProfileUpdated', handleProfileUpdate);
    }, []);

    if (!user) return null;

    const NAV_ITEMS = [
        { id: 'home', label: t('sidebar.home', user.preferred_lang), icon: Search, roles: ['admin', 'manager', 'tech'] },
        { id: 'dashboard', label: t('sidebar.dashboard', user.preferred_lang), icon: LayoutDashboard, roles: ['admin', 'manager'] },
        { id: 'settings', label: t('sidebar.settings', user.preferred_lang), icon: Settings, roles: ['admin'] }
    ];

    const filteredNav = NAV_ITEMS.filter(item => item.roles.includes(user.role));

    return (
        <aside style={{
            width: isCollapsed ? '80px' : '260px',
            background: 'var(--bg-card)',
            borderRight: '1px solid var(--glass-border)',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem 0.75rem',
            minHeight: '100vh',
            boxShadow: '2px 0 10px rgba(0,0,0,0.2)',
            transition: 'width 0.3s ease',
            overflow: 'hidden',
            flexShrink: 0
        }}>
            <div style={{ padding: '0.5rem', display: 'flex', justifyContent: isCollapsed ? 'center' : 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                {!isCollapsed && <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.2rem', letterSpacing: '0.5px' }}>{t('sidebar.menu', user.preferred_lang)}</span>}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
                    title="Toggle Menu"
                >
                    <Menu size={24} />
                </button>
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
                                fontWeight: isActive ? 500 : 400,
                                justifyContent: isCollapsed ? 'center' : 'flex-start'
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
                            <Icon size={20} style={{ flexShrink: 0 }} />
                            {!isCollapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
                        </button>
                    )
                })}
            </nav>

            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem', marginTop: 'auto' }}>
                <div
                    onClick={() => setCurrentView('profile')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', gap: '0.75rem', padding: '0.5rem', marginBottom: '1rem', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s' }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    title="Meu Perfil"
                >
                    <div style={{ width: '36px', height: '36px', background: 'var(--glass-bg)', borderRadius: '50%', border: '1px solid var(--primary)', flexShrink: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {profileImg ? (
                            <img src={profileImg} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <ShieldCheck size={18} color="var(--primary)" />
                        )}
                    </div>
                    {!isCollapsed && (
                        <div style={{ overflow: 'hidden' }}>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user.name || user.username}</p>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{user.role}</p>
                        </div>
                    )}
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
                        textAlign: 'left',
                        justifyContent: isCollapsed ? 'center' : 'flex-start'
                    }}
                    onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'rgba(239, 68, 68, 0.2)' })}
                    onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'rgba(239, 68, 68, 0.1)' })}
                >
                    <LogOut size={20} style={{ flexShrink: 0 }} />
                    {!isCollapsed && <span style={{ whiteSpace: 'nowrap' }}>{t('sidebar.logout', user.preferred_lang)}</span>}
                </button>
            </div>
        </aside>
    );
}

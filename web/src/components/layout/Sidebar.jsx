import React, { useState, useEffect } from 'react';
import { Search, LayoutDashboard, Settings, LogOut, ShieldCheck, Menu, Radar, Eye, Rss, Fingerprint } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTour } from '../../context/TourContext';
import { useTranslation } from 'react-i18next';

export default function Sidebar({ currentView, setCurrentView, onMobileClose }) {
    const { t } = useTranslation();
    const { user, logout } = useAuth();
    const { isTourActive, currentStep } = useTour();

    const [isCollapsed, setIsCollapsed] = useState(true);
    const profileImg = user?.avatar_base64 || '';

    // Auto-expand sidebar when tour requires it
    useEffect(() => {
        if (isTourActive && currentStep?.sidebarMustOpen && isCollapsed) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsCollapsed(false);
        }
    }, [isTourActive, currentStep, isCollapsed]);

    if (!user) return null;

    const NAV_ITEMS = [
        { id: 'home', label: t('sidebar.home'), icon: Search, roles: ['admin', 'manager', 'tech'] },
        { id: 'feed', label: t('sidebar.feed'), icon: Rss, roles: ['admin', 'manager', 'tech'] },
        { id: 'hunting', label: t('sidebar.hunting'), icon: Fingerprint, roles: ['admin', 'manager', 'tech'] },
        { id: 'recon', label: t('sidebar.recon'), icon: Radar, roles: ['admin', 'manager', 'tech'] },
        { id: 'watchlist', label: t('sidebar.watchlist'), icon: Eye, roles: ['admin', 'manager', 'tech'] },
        { id: 'dashboard', label: t('sidebar.dashboard'), icon: LayoutDashboard, roles: ['admin', 'manager', 'tech'] },
        { id: 'settings', label: t('sidebar.settings'), icon: Settings, roles: ['admin'] }
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
            flexShrink: 0,
            willChange: 'width'
        }}>
            <div style={{ padding: '0.5rem', display: 'flex', justifyContent: isCollapsed ? 'center' : 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                {!isCollapsed && <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1.2rem', letterSpacing: '0.5px' }}>{t('sidebar.menu')}</span>}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
                    aria-label={isCollapsed ? t('sidebar.expand_menu') : t('sidebar.collapse_menu')}
                    data-tour="sidebar-toggle"
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
                            data-tour={`sidebar-${item.id}`}
                            onClick={() => { setCurrentView(item.id); onMobileClose?.(); }}
                            className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start' }}
                        >
                            <Icon size={20} style={{ flexShrink: 0 }} />
                            {!isCollapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
                        </button>
                    )
                })}
            </nav>

            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem', marginTop: 'auto' }}>
                <div
                    onClick={() => { setCurrentView('profile'); onMobileClose?.(); }}
                    data-tour="sidebar-profile"
                    className="sidebar-profile-btn"
                    style={{ justifyContent: isCollapsed ? 'center' : 'flex-start' }}
                    title={t('sidebar.profile')}
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
                    aria-label={t('sidebar.logout')}
                    className="sidebar-logout-btn"
                    style={{ justifyContent: isCollapsed ? 'center' : 'flex-start' }}
                >
                    <LogOut size={20} style={{ flexShrink: 0 }} />
                    {!isCollapsed && <span style={{ whiteSpace: 'nowrap' }}>{t('sidebar.logout')}</span>}
                </button>
            </div>
        </aside>
    );
}

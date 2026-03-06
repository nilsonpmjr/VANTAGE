import React, { useState } from 'react';
import { Users, UserPlus, Search, Loader, Shield, User, Terminal, AlignJustify, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fmtBRT } from '../../utils/dateFormat';
import SectionHeader from '../shared/SectionHeader';

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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: bg, color, padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.8rem', border: `1px solid ${color}` }}>
            {icon} {label}
        </span>
    );
};

const isLocked = (u) => {
    if (!u.locked_until) return false;
    const d = new Date(u.locked_until);
    return !isNaN(d.getTime()) && d > new Date();
};

export default function UserListPanel({ usersList, loading, adminStats, selectedUsername, onSelectUser, onNewUser }) {
    const { t } = useTranslation();
    const [searchTerm, setSearchTerm] = useState('');
    const [compact, setCompact] = useState(false);

    const formatLastLogin = (raw) => {
        if (!raw) return t('settings.never');
        const result = fmtBRT(raw);
        return result === '—' ? t('settings.never') : result;
    };

    const filtered = Array.isArray(usersList) ? usersList.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username.toLowerCase().includes(searchTerm.toLowerCase())
    ) : [];

    return (
        <div className="fade-in">
            <SectionHeader
                icon={<Users size={22} color="var(--primary)" />}
                title={t('settings.users')}
                subtitle={t('settings.subtitle')}
                actions={
                    <button className="btn-primary" onClick={onNewUser} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                        <UserPlus size={16} />
                        {t('settings.new_user')}
                    </button>
                }
            />

            {/* Mini stats */}
            {adminStats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.6rem', marginBottom: '1.5rem' }}>
                    {[
                        { label: t('settings.stats_total'), value: adminStats.total_users, color: 'var(--primary)' },
                        { label: t('settings.stats_active'), value: adminStats.active_users, color: 'var(--green)' },
                        { label: t('settings.stats_suspended'), value: adminStats.suspended_users, color: 'var(--red)' },
                        { label: t('settings.stats_locked'), value: adminStats.locked_accounts, color: '#fb923c' },
                        { label: t('settings.stats_mfa'), value: adminStats.users_with_mfa, color: 'var(--primary)' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="glass-panel" style={{ padding: '0.6rem 0.85rem', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.68rem', color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{value}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="glass-panel" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                {/* Toolbar */}
                <div className="data-table-toolbar">
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {loading
                            ? <Loader className="spin" size={16} color="var(--primary)" />
                            : `${filtered.length} ${t('settings.users').toLowerCase()}`}
                    </span>
                    <div style={{ flex: 1, position: 'relative', maxWidth: '280px' }}>
                        <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        <input
                            type="text"
                            placeholder={t('settings.search')}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="data-table-search"
                            style={{ paddingLeft: '2rem' }}
                            aria-label={t('settings.search')}
                        />
                    </div>
                    <button
                        className="density-toggle"
                        onClick={() => setCompact(c => !c)}
                        title={compact ? t('settings.density_comfortable') : t('settings.density_compact')}
                        aria-label={compact ? t('settings.density_comfortable') : t('settings.density_compact')}
                    >
                        {compact ? <AlignJustify size={14} /> : <List size={14} />}
                    </button>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                    <table className={`data-table${compact ? ' compact' : ''}`} aria-label={t('settings.users')}>
                        <thead>
                            <tr>
                                <th>{t('settings.name').toUpperCase()}</th>
                                <th>{t('settings.user').toUpperCase()}</th>
                                <th>{t('settings.role').toUpperCase()}</th>
                                <th>{t('settings.status').toUpperCase()}</th>
                                <th>{t('settings.last_login').toUpperCase()}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && !loading && (
                                <tr style={{ cursor: 'default' }}>
                                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem' }}>
                                        {t('settings.no_users_found')}
                                    </td>
                                </tr>
                            )}
                            {filtered.map(u => (
                                <tr
                                    key={u.username}
                                    className={selectedUsername === u.username ? 'selected' : ''}
                                    onClick={() => onSelectUser(u)}
                                    title={t('settings.click_to_view')}
                                >
                                    <td style={{ opacity: u.is_active === false ? 0.55 : 1 }}>
                                        <span style={{ fontWeight: 500 }}>{u.name}</span>
                                    </td>
                                    <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-secondary)', opacity: u.is_active === false ? 0.55 : 1 }}>
                                        {u.username}
                                    </td>
                                    <td><RoleBadge role={u.role} /></td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                            {u.is_active === false && (
                                                <span className="badge-risk" style={{ fontSize: '0.72rem' }}>{t('settings.suspended')}</span>
                                            )}
                                            {isLocked(u) && (
                                                <span style={{ fontSize: '0.72rem', background: 'rgba(251,146,60,0.15)', color: '#fb923c', padding: '0.1rem 0.45rem', borderRadius: '0.8rem', fontWeight: 600 }}>{t('settings.locked')}</span>
                                            )}
                                            {u.is_active !== false && !isLocked(u) && (
                                                <span className="badge-safe" style={{ fontSize: '0.72rem' }}>{t('settings.active')}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                        {formatLastLogin(u.last_login_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, Smartphone, Loader, LogOut, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import { fmtBRT } from '../../utils/dateFormat';
import ConfirmModal from './ConfirmModal';

/**
 * Active sessions panel — embed in Profile.
 * Fetches GET /api/auth/sessions, lists active sessions,
 * allows revoking individual sessions or all other sessions.
 */
export default function SessionsTable() {
    const { t } = useTranslation();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(null); // session_id being acted on
    const [confirmState, setConfirmState] = useState(null); // { title, message, onConfirm }

    const fetchSessions = useCallback(async () => {
        setLoading(true);
        try {
            const resp = await fetch(`${API_URL}/api/auth/sessions`, { credentials: 'include' });
            if (resp.ok) setSessions(await resp.json());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchSessions(); }, [fetchSessions]);

    const handleRevoke = (sessionId) => {
        setConfirmState({
            title: t('sessions.revoke'),
            message: t('sessions.confirm_revoke'),
            onConfirm: async () => {
                setActionLoading(sessionId);
                try {
                    const resp = await fetch(`${API_URL}/api/auth/sessions/${sessionId}`, {
                        method: 'DELETE', credentials: 'include',
                    });
                    if (resp.ok) fetchSessions();
                } finally {
                    setActionLoading(null);
                }
            },
        });
    };

    const handleRevokeOthers = () => {
        setConfirmState({
            title: t('sessions.revoke_others', { count: sessions.filter(s => !s.is_current).length }),
            message: t('sessions.confirm_revoke_others'),
            onConfirm: async () => {
                setActionLoading('others');
                try {
                    const resp = await fetch(`${API_URL}/api/auth/sessions/others`, {
                        method: 'DELETE', credentials: 'include',
                    });
                    if (resp.ok) fetchSessions();
                } finally {
                    setActionLoading(null);
                }
            },
        });
    };

    const isMobile = (ua = '') => /android|iphone|ipad/i.test(ua);

    const fmtDate = (iso) => fmtBRT(iso);

    const otherCount = sessions.filter(s => !s.is_current).length;

    return (
        <div>
            {confirmState && (
                <ConfirmModal
                    title={confirmState.title}
                    message={confirmState.message}
                    danger
                    onConfirm={() => { confirmState.onConfirm(); setConfirmState(null); }}
                    onCancel={() => setConfirmState(null)}
                />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {t('sessions.subtitle')}
                    {loading && <Loader className="spin" size={14} style={{ marginLeft: '0.5rem', display: 'inline' }} />}
                </p>
                {otherCount > 0 && (
                    <button
                        onClick={handleRevokeOthers}
                        disabled={actionLoading === 'others'}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.4rem 0.9rem', borderRadius: '6px',
                            background: 'transparent', border: '1px solid var(--red)',
                            color: 'var(--red)', cursor: 'pointer', fontSize: '0.8rem',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {actionLoading === 'others'
                            ? <Loader className="spin" size={14} />
                            : <ShieldAlert size={14} />}
                        {t('sessions.revoke_others', { count: otherCount })}
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {!loading && sessions.length === 0 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
                        {t('sessions.no_sessions')}
                    </p>
                )}
                {sessions.map(s => (
                    <div
                        key={s.session_id}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.75rem 1rem',
                            background: s.is_current ? 'rgba(56,189,248,0.06)' : 'var(--bg-main)',
                            border: `1px solid ${s.is_current ? 'var(--primary)' : 'var(--glass-border)'}`,
                            borderRadius: '8px',
                            gap: '1rem',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                            <div style={{ flexShrink: 0, color: s.is_current ? 'var(--primary)' : 'var(--text-muted)' }}>
                                {isMobile(s.user_agent)
                                    ? <Smartphone size={20} />
                                    : <Monitor size={20} />}
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {s.device}
                                    </span>
                                    {s.is_current && (
                                        <span style={{
                                            fontSize: '0.7rem', padding: '0.1rem 0.45rem',
                                            background: 'rgba(56,189,248,0.15)', color: 'var(--primary)',
                                            borderRadius: '99px', fontWeight: 600,
                                        }}>
                                            {t('sessions.current')}
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                    {s.ip !== '—' && <span style={{ marginRight: '0.75rem' }}>{s.ip}</span>}
                                    <span>{t('sessions.login_at')} {fmtDate(s.created_at)}</span>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                    {t('sessions.expires_at')} {fmtDate(s.expires_at)}
                                </div>
                            </div>
                        </div>

                        {!s.is_current && (
                            <button
                                onClick={() => handleRevoke(s.session_id)}
                                disabled={actionLoading === s.session_id}
                                style={{
                                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.3rem',
                                    padding: '0.35rem 0.75rem', borderRadius: '6px',
                                    background: 'transparent', border: '1px solid var(--glass-border)',
                                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem',
                                }}
                                title={t('sessions.revoke')}
                            >
                                {actionLoading === s.session_id
                                    ? <Loader className="spin" size={13} />
                                    : <LogOut size={13} />}
                                {t('sessions.revoke')}
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

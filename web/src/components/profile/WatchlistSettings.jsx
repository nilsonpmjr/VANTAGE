import React, { useState, useEffect, useCallback } from 'react';
import { Eye, Plus, Trash2, Bell, BellOff, Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SectionHeader from '../shared/SectionHeader';
import API_URL from '../../config';

function verdictColor(v) {
    if (!v) return 'var(--text-muted)';
    switch (v.toUpperCase()) {
        case 'SAFE': return 'var(--status-safe)';
        case 'SUSPICIOUS': return 'var(--status-suspicious)';
        case 'HIGH RISK': return 'var(--status-risk)';
        default: return 'var(--text-muted)';
    }
}

export default function WatchlistSettings() {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [limit, setLimit] = useState(50);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [target, setTarget] = useState('');
    const [error, setError] = useState(null);
    const [smtpOk, setSmtpOk] = useState(false);

    const fetchItems = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/watchlist/`, { credentials: 'include' });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setItems(data.items || []);
            setLimit(data.limit || 50);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchItems();
        // Check SMTP status
        fetch(`${API_URL}/api/watchlist/smtp-status`, { credentials: 'include' })
            .then(r => r.json())
            .then(d => setSmtpOk(d.smtp_configured))
            .catch(() => {});
    }, [fetchItems]);

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!target.trim() || adding) return;
        setAdding(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/api/watchlist/`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: target.trim(), notify_on_change: true }),
            });
            if (res.status === 409) {
                setError(t('watchlist.err_duplicate'));
                return;
            }
            if (res.status === 422) {
                setError(t('watchlist.limit_reached', { limit }));
                return;
            }
            if (!res.ok) throw new Error();
            setTarget('');
            await fetchItems();
        } catch {
            setError(t('watchlist.err_add'));
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (id) => {
        try {
            await fetch(`${API_URL}/api/watchlist/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            setItems(prev => prev.filter(i => i.id !== id));
        } catch { /* ignore */ }
    };

    const handleToggleNotify = async (item) => {
        const newVal = !item.notify_on_change;
        try {
            await fetch(`${API_URL}/api/watchlist/${item.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notify_on_change: newVal }),
            });
            setItems(prev => prev.map(i =>
                i.id === item.id ? { ...i, notify_on_change: newVal } : i
            ));
        } catch { /* ignore */ }
    };

    return (
        <div className="fade-in">
            <SectionHeader
                icon={<Eye size={22} color="var(--primary)" />}
                title={t('watchlist.title')}
                subtitle={t('watchlist.subtitle')}
            />

            <div className="v-section--bordered">
                {/* Add form */}
                <form onSubmit={handleAdd} className="v-zone-filters" style={{ marginBottom: 0 }}>
                    <input
                        type="text"
                        className="form-input"
                        placeholder={t('watchlist.add_placeholder')}
                        value={target}
                        onChange={e => { setTarget(e.target.value); setError(null); }}
                        disabled={adding}
                        autoComplete="off"
                        spellCheck="false"
                        style={{ flex: 1, padding: '0.55rem 0.9rem', fontSize: '0.88rem', height: 'auto' }}
                    />
                    <button
                        type="submit"
                        className="btn-secondary"
                        disabled={!target.trim() || adding}
                    >
                        {adding ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                        {t('watchlist.add_btn')}
                    </button>
                </form>

                {error && (
                    <p className="alert-banner error compact" style={{ margin: '0.75rem 0 0' }}>{error}</p>
                )}

                {/* Counter */}
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.75rem 0' }}>
                    {items.length} / {limit}
                </p>

                {/* Loading */}
                {loading && (
                    <div className="v-empty-state">
                        <Loader2 size={20} className="spin" color="var(--primary)" />
                    </div>
                )}

                {/* Empty */}
                {!loading && items.length === 0 && (
                    <div className="v-empty-state">
                        <Eye size={32} className="v-empty-state__icon" />
                        <p className="v-empty-state__text">{t('watchlist.empty')}</p>
                    </div>
                )}

                {/* Items list */}
                {!loading && items.length > 0 && (
                    <div className="v-zone-body" style={{ gap: '0.4rem' }}>
                        {items.map(item => (
                            <div
                                key={item.id}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.6rem 0.85rem',
                                    background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                    borderRadius: 'var(--radius-sm)',
                                }}
                            >
                                {/* Target */}
                                <span className="mono" style={{
                                    flex: 1, fontSize: '0.88rem', color: 'var(--primary)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }} title={item.target}>
                                    {item.target}
                                </span>

                                {/* Type badge */}
                                <span style={{
                                    fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em',
                                    color: 'var(--text-muted)', textTransform: 'uppercase',
                                }}>
                                    {item.target_type}
                                </span>

                                {/* Last verdict */}
                                {item.last_verdict && (
                                    <span style={{
                                        fontSize: '0.72rem', fontWeight: 600,
                                        color: verdictColor(item.last_verdict),
                                        padding: '0.1rem 0.5rem',
                                        border: `1px solid ${verdictColor(item.last_verdict)}`,
                                        borderRadius: '1rem',
                                    }}>
                                        {item.last_verdict}
                                    </span>
                                )}

                                {/* Last scan */}
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                    {item.last_scan_at && item.last_scan_at !== 'None' && item.last_scan_at !== ''
                                        ? new Date(item.last_scan_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                                        : t('watchlist.never_scanned')
                                    }
                                </span>

                                {/* Notify toggle */}
                                <button
                                    onClick={() => handleToggleNotify(item)}
                                    title={t('watchlist.notify_toggle')}
                                    style={{
                                        background: 'transparent', border: 'none',
                                        color: item.notify_on_change ? 'var(--primary)' : 'var(--text-muted)',
                                        cursor: 'pointer', padding: '0.2rem', display: 'flex',
                                        opacity: smtpOk ? 1 : 0.4,
                                    }}
                                    disabled={!smtpOk}
                                >
                                    {item.notify_on_change ? <Bell size={14} /> : <BellOff size={14} />}
                                </button>

                                {/* Remove */}
                                <button
                                    className="hover-danger"
                                    onClick={() => handleRemove(item.id)}
                                    title={t('watchlist.remove')}
                                    style={{
                                        background: 'transparent', border: 'none',
                                        color: 'var(--text-muted)', cursor: 'pointer',
                                        padding: '0.2rem', display: 'flex',
                                    }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

import React, { useCallback, useEffect, useState } from 'react';
import { Rss, ShieldAlert, Clock, ExternalLink, Filter, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Badge from '../ui/Badge';
import Pagination from '../shared/Pagination';
import SectionHeader from '../shared/SectionHeader';
import API_URL from '../../config';

const SEVERITY_VARIANT = {
    critical: 'danger',
    high: 'danger',
    medium: 'warning',
    low: 'neutral',
    info: 'neutral',
    unknown: 'neutral',
};

const SEVERITY_ACCENT = {
    critical: 'var(--status-risk)',
    high: 'var(--status-risk)',
    medium: '#fb923c',
    low: 'var(--primary)',
    info: 'var(--primary)',
    unknown: 'var(--glass-border)',
};

const SEVERITY_OPTIONS = ['all', 'critical', 'high', 'medium', 'low', 'info'];
const SOURCE_OPTIONS = ['all', 'rss', 'misp'];
const PAGE_SIZE = 18;

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
}

function FeedItemCard({ item }) {
    const severity = item.severity || 'unknown';
    const accent = SEVERITY_ACCENT[severity] || SEVERITY_ACCENT.unknown;

    return (
        <article
            className="glass-panel feed-card"
            style={{
                padding: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                transition: 'border-color 0.2s, transform 0.2s',
                cursor: item.data?.link ? 'pointer' : 'default',
            }}
            onClick={() => item.data?.link && window.open(item.data.link, '_blank', 'noopener')}
            onMouseOver={(e) => {
                e.currentTarget.style.borderColor = accent;
                e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
                e.currentTarget.style.borderColor = '';
                e.currentTarget.style.transform = '';
            }}
        >
            {/* Severity accent strip */}
            <div style={{ height: '3px', background: accent, flexShrink: 0 }} />

            {/* Card body */}
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                {/* Top row: badge + source + time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Badge variant={SEVERITY_VARIANT[severity] || 'neutral'}>
                        {severity.toUpperCase()}
                    </Badge>
                    {item.source_type && (
                        <span style={{
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            fontWeight: 600,
                            background: 'rgba(255,255,255,0.04)',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                        }}>
                            {item.source_type}
                        </span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
                        <Clock size={11} />
                        {formatDate(item.published_at)}
                    </span>
                </div>

                {/* Title */}
                <h4 style={{
                    margin: 0,
                    fontSize: '0.92rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}>
                    {item.title}
                </h4>

                {/* Summary */}
                {item.summary && (
                    <p style={{
                        margin: 0,
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.55,
                        display: '-webkit-box',
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}>
                        {item.summary}
                    </p>
                )}

                {/* Footer: tags + link indicator */}
                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
                    {item.tags?.length > 0 && item.tags.slice(0, 4).map((tag) => (
                        <span
                            key={tag}
                            style={{
                                fontSize: '0.68rem',
                                color: 'var(--primary)',
                                background: 'var(--accent-glow)',
                                padding: '0.12rem 0.45rem',
                                borderRadius: '4px',
                                fontWeight: 500,
                            }}
                        >
                            {tag}
                        </span>
                    ))}
                    {item.tags?.length > 4 && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>+{item.tags.length - 4}</span>
                    )}
                    {item.data?.link && (
                        <ExternalLink size={12} style={{ marginLeft: 'auto', color: 'var(--text-muted)', flexShrink: 0 }} />
                    )}
                </div>
            </div>
        </article>
    );
}

export default function FeedPage() {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [severity, setSeverity] = useState('all');
    const [sourceType, setSourceType] = useState('all');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchItems = useCallback(async (pg, sev, src, isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const params = new URLSearchParams({ limit: PAGE_SIZE, offset: (pg - 1) * PAGE_SIZE });
            if (sev !== 'all') params.set('severity', sev);
            if (src !== 'all') params.set('source_type', src);

            const res = await fetch(`${API_URL}/api/feed?${params}`, { credentials: 'include' });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setItems(data.items || []);
            setTotal(data.total || 0);
        } catch {
            setItems([]);
            setTotal(0);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchItems(page, severity, sourceType);
    }, [page, severity, sourceType, fetchItems]);

    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

    const handleSeverityChange = (val) => {
        setSeverity(val);
        setPage(1);
    };

    const handleSourceChange = (val) => {
        setSourceType(val);
        setPage(1);
    };

    const selectStyle = {
        background: 'var(--bg-card)',
        border: '1px solid var(--glass-border)',
        color: 'var(--text-primary)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.4rem 0.6rem',
        fontSize: '0.82rem',
        cursor: 'pointer',
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
            <SectionHeader
                title={t('feed.page_title')}
                description={t('feed.page_description')}
                icon={<ShieldAlert size={22} />}
            />

            {/* Filters bar */}
            <div style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'center',
                flexWrap: 'wrap',
                marginBottom: '1.5rem',
                padding: '0.75rem 1rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-md)',
            }}>
                <Filter size={16} style={{ color: 'var(--text-muted)' }} />

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {t('feed.filter_severity')}
                    <select value={severity} onChange={(e) => handleSeverityChange(e.target.value)} style={selectStyle}>
                        {SEVERITY_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s === 'all' ? t('feed.all') : s.toUpperCase()}</option>
                        ))}
                    </select>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {t('feed.filter_source')}
                    <select value={sourceType} onChange={(e) => handleSourceChange(e.target.value)} style={selectStyle}>
                        {SOURCE_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s === 'all' ? t('feed.all') : s.toUpperCase()}</option>
                        ))}
                    </select>
                </label>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {t('feed.total_items', { count: total })}
                    </span>
                    <button
                        onClick={() => fetchItems(page, severity, sourceType, true)}
                        disabled={refreshing}
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--glass-border)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)',
                            cursor: refreshing ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.3rem 0.6rem',
                            fontSize: '0.8rem',
                            transition: 'all 0.2s',
                        }}
                        onMouseOver={(e) => { if (!refreshing) e.currentTarget.style.borderColor = 'var(--primary)'; }}
                        onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--glass-border)'}
                        title={t('feed.refresh')}
                    >
                        <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Items grid */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <span className="loader-pulse" style={{ width: 36, height: 36, background: 'var(--accent-glow)', borderRadius: '50%', display: 'inline-block' }} />
                </div>
            ) : items.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem' }}>
                    <Rss size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                        {t('feed.no_items')}
                    </p>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '1rem',
                }}>
                    {items.map((item) => (
                        <FeedItemCard key={item._id} item={item} />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
                <div style={{ marginTop: '2rem' }}>
                    <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
            )}
        </div>
    );
}

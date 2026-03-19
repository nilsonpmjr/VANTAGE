import React, { useEffect, useState } from 'react';
import { Rss, ArrowRight, ShieldAlert, Clock, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Badge from '../ui/Badge';
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

function timeAgo(dateStr, t) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return t('feed.minutes_ago', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('feed.hours_ago', { count: hours });
    const days = Math.floor(hours / 24);
    return t('feed.days_ago', { count: days });
}

function FeedCard({ item, t }) {
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
                        {timeAgo(item.published_at, t)}
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
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}>
                        {item.summary}
                    </p>
                )}

                {/* Footer: tags + link indicator */}
                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {item.tags?.length > 0 && item.tags.slice(0, 3).map((tag) => (
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
                    {item.tags?.length > 3 && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>+{item.tags.length - 3}</span>
                    )}
                    {item.data?.link && (
                        <ExternalLink size={12} style={{ marginLeft: 'auto', color: 'var(--text-muted)', flexShrink: 0 }} />
                    )}
                </div>
            </div>
        </article>
    );
}

export default function FeedPreview({ onViewAll }) {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${API_URL}/api/feed?limit=6`, { credentials: 'include' });
                if (!res.ok) throw new Error();
                const data = await res.json();
                if (!cancelled) {
                    setItems(data.items || []);
                    setTotal(data.total || 0);
                }
            } catch {
                if (!cancelled) setItems([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <span className="loader-pulse" style={{ width: 28, height: 28, background: 'var(--accent-glow)', borderRadius: '50%', display: 'inline-block' }} />
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <section style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 600 }}>
                        <ShieldAlert size={20} style={{ color: 'var(--primary)' }} />
                        {t('feed.latest_threats')}
                    </h3>
                </div>
                <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
                    <Rss size={28} style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                        {t('feed.empty_preview')}
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section>
            {/* Section header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 600 }}>
                    <ShieldAlert size={20} style={{ color: 'var(--primary)' }} />
                    {t('feed.latest_threats')}
                </h3>
                <button
                    onClick={onViewAll}
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--primary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        padding: '0.4rem 0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        transition: 'all 0.2s',
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.background = 'var(--accent-glow)';
                        e.currentTarget.style.borderColor = 'var(--accent-border)';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'var(--glass-border)';
                    }}
                >
                    {t('feed.view_all')} ({total})
                    <ArrowRight size={14} />
                </button>
            </div>

            {/* Cards grid — responsive: 1col mobile, 2col tablet, 3col desktop */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '1rem',
            }}>
                {items.map((item) => (
                    <FeedCard key={item._id} item={item} t={t} />
                ))}
            </div>
        </section>
    );
}

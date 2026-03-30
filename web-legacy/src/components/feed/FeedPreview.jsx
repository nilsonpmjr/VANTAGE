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
    medium: 'var(--alert-warning)',
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
            className="feed-card hover-lift"
            style={{
                '--hover-accent': accent,
                background: 'var(--bg-card)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.8rem',
                cursor: item.data?.link ? 'pointer' : 'default',
                height: '100%',
                transition: 'all 0.2s ease',
                position: 'relative',
                overflow: 'hidden'
            }}
            onClick={() => item.data?.link && window.open(item.data.link, '_blank', 'noopener')}
        >
            {/* Top accent line */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: accent }} />

            {/* Top row: Source + Date + Badge if critical */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {item.source_type && (
                        <span style={{
                            fontSize: '0.72rem',
                            color: 'var(--primary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            fontWeight: 600,
                        }}>
                            {item.source_type}
                        </span>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>•</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {timeAgo(item.published_at, t)}
                    </span>
                </div>
                {severity !== 'unknown' && severity !== 'info' && (
                    <Badge variant={SEVERITY_VARIANT[severity] || 'neutral'}>
                        {severity.toUpperCase()}
                    </Badge>
                )}
            </div>

            {/* Title */}
            <h4 style={{
                margin: 0,
                fontSize: '1rem',
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
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    flex: 1,
                }}>
                    {item.summary}
                </p>
            )}

            {/* Read more link indicator */}
            {item.data?.link && (
                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--primary)', fontSize: '0.78rem', fontWeight: 500, paddingTop: '0.5rem' }}>
                    Ler artigo original
                    <ExternalLink size={13} />
                </div>
            )}
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
                const res = await fetch(`${API_URL}/api/feed?limit=6&days=7`, { credentials: 'include' });
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '-1.25rem' }}>
                    <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 600 }}>
                        <Rss size={18} style={{ color: 'var(--primary)' }} />
                        {t('feed.latest_threats')}
                    </h1>
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
        <section style={{ maxWidth: '1080px', margin: '0 auto', width: '100%' }}>
            {/* Section header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 600 }}>
                    <Rss size={20} style={{ color: 'var(--primary)' }} />
                    {t('feed.latest_threats')}
                </h3>
                <button
                    onClick={onViewAll}
                    className="btn-secondary"
                    style={{ padding: '0.4rem 0.75rem', color: 'var(--primary)' }}
                >
                    {t('feed.view_all')} ({total})
                    <ArrowRight size={14} />
                </button>
            </div>

            {/* Cards grid — automatically creates smaller cards and flows cleanly */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '1.25rem',
            }}>
                {items.map((item) => (
                    <FeedCard key={item._id} item={item} t={t} />
                ))}
            </div>
        </section>
    );
}

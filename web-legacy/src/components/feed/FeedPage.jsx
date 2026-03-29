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
    medium: 'var(--alert-warning)',
    low: 'var(--primary)',
    info: 'var(--primary)',
    unknown: 'var(--glass-border)',
};

const SEVERITY_OPTIONS = ['all', 'critical', 'high', 'medium', 'low', 'info'];
const SOURCE_OPTIONS = ['all', 'rss', 'misp'];
const TLP_OPTIONS = ['all', 'white', 'green', 'amber', 'red'];
const PAGE_SIZE = 18;

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
}

function TlpBadge({ tlp }) {
    if (!tlp) return null;
    const normalized = tlp.toLowerCase();
    return (
        <span className={`tlp-badge tlp-badge--${normalized}`}>
            TLP:{normalized.toUpperCase()}
        </span>
    );
}

function FeedItemCard({ item, featured = false }) {
    const severity = item.severity || 'unknown';
    const accent = SEVERITY_ACCENT[severity] || SEVERITY_ACCENT.unknown;
    const sourceName = item.source_name || item.source_type || '';
    const hasLink = Boolean(item.data?.link);

    return (
        <article
            className="feed-card"
            style={{ '--hover-accent': accent }}
            data-clickable={hasLink ? 'true' : 'false'}
            onClick={() => hasLink && window.open(item.data.link, '_blank', 'noopener')}
        >
            {/* Severity accent strip */}
            <div className="feed-card__accent" style={{ background: accent }} />

            {/* Card body */}
            <div className="feed-card__body">
                {/* Header: source name + TLP + severity badge */}
                <div className="feed-card__header">
                    {sourceName && (
                        <span className="feed-card__source">{sourceName}</span>
                    )}
                    <TlpBadge tlp={item.tlp} />
                    <Badge variant={SEVERITY_VARIANT[severity] || 'neutral'}>
                        {severity.toUpperCase()}
                    </Badge>
                    <span className="feed-card__time">
                        <Clock size={11} />
                        {formatDate(item.published_at)}
                    </span>
                </div>

                {/* Title */}
                <h4 className="feed-card__title">{item.title}</h4>

                {/* Summary */}
                {item.summary && (
                    <p className="feed-card__summary">{item.summary}</p>
                )}

                {/* Footer: sectors + tags + link indicator */}
                <div className="feed-card__footer">
                    {/* Sectors */}
                    {item.sector?.length > 0 && (
                        <div className="feed-card__sectors">
                            {item.sector.slice(0, featured ? 5 : 3).map((s) => (
                                <span key={s} className="feed-card__sector">{s}</span>
                            ))}
                        </div>
                    )}
                    {/* Tags */}
                    {item.tags?.length > 0 && item.tags.slice(0, featured ? 6 : 4).map((tag) => (
                        <span key={tag} className="feed-card__tag">{tag}</span>
                    ))}
                    {item.tags?.length > (featured ? 6 : 4) && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            +{item.tags.length - (featured ? 6 : 4)}
                        </span>
                    )}
                    {hasLink && (
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
    const [tlpFilter, setTlpFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchItems = useCallback(async (pg, sev, src, tlp, isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const params = new URLSearchParams({ limit: PAGE_SIZE, offset: (pg - 1) * PAGE_SIZE });
            if (sev !== 'all') params.set('severity', sev);
            if (src !== 'all') params.set('source_type', src);
            if (tlp !== 'all') params.set('tlp', tlp);

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
        fetchItems(page, severity, sourceType, tlpFilter);
    }, [page, severity, sourceType, tlpFilter, fetchItems]);

    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

    const handleFilterChange = (setter) => (val) => {
        setter(val);
        setPage(1);
    };

    // Find featured item: first critical or high severity item
    const featuredIndex = items.findIndex((item) =>
        item.severity === 'critical' || item.severity === 'high'
    );
    const featuredItem = featuredIndex >= 0 ? items[featuredIndex] : null;
    const remainingItems = featuredItem
        ? items.filter((_, i) => i !== featuredIndex)
        : items;

    const offsetStart = (page - 1) * PAGE_SIZE + 1;
    const offsetEnd = Math.min(page * PAGE_SIZE, total);

    return (
        <div className="v-arch-catalog">
            <SectionHeader
                title={t('feed.page_title')}
                description={t('feed.page_description')}
                icon={<ShieldAlert size={22} />}
            />

            {/* Filters bar */}
            <div className="v-zone-filters">
                <Filter size={16} style={{ color: 'var(--text-muted)' }} />

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {t('feed.filter_severity')}
                    <select value={severity} onChange={(e) => handleFilterChange(setSeverity)(e.target.value)} className="form-select" style={{ fontSize: '0.82rem', padding: '0.4rem 0.6rem' }}>
                        {SEVERITY_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s === 'all' ? t('feed.all') : s.toUpperCase()}</option>
                        ))}
                    </select>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {t('feed.filter_source')}
                    <select value={sourceType} onChange={(e) => handleFilterChange(setSourceType)(e.target.value)} className="form-select" style={{ fontSize: '0.82rem', padding: '0.4rem 0.6rem' }}>
                        {SOURCE_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s === 'all' ? t('feed.all') : s.toUpperCase()}</option>
                        ))}
                    </select>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    TLP:
                    <select value={tlpFilter} onChange={(e) => handleFilterChange(setTlpFilter)(e.target.value)} className="form-select" style={{ fontSize: '0.82rem', padding: '0.4rem 0.6rem' }}>
                        {TLP_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s === 'all' ? t('feed.all') : `TLP:${s.toUpperCase()}`}</option>
                        ))}
                    </select>
                </label>

                <div className="v-page-actions">
                    <button
                        onClick={() => fetchItems(page, severity, sourceType, tlpFilter, true)}
                        disabled={refreshing}
                        className="btn-secondary hover-border"
                        style={{ '--hover-accent': 'var(--primary)', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                        title={t('feed.refresh')}
                    >
                        <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="v-empty-state">
                    <span className="loader-pulse" style={{ width: 36, height: 36, background: 'var(--accent-glow)', borderRadius: '50%', display: 'inline-block' }} />
                </div>
            ) : items.length === 0 ? (
                <div className="v-empty-state">
                    <Rss size={32} className="v-empty-state__icon" />
                    <p className="v-empty-state__text">{t('feed.no_items')}</p>
                </div>
            ) : (
                <div className="feed-grid">
                    {/* Featured item */}
                    {featuredItem && (
                        <div className="feed-featured">
                            <FeedItemCard item={featuredItem} featured />
                        </div>
                    )}

                    {/* Remaining items in 2-col grid */}
                    {remainingItems.map((item) => (
                        <FeedItemCard key={item._id} item={item} />
                    ))}
                </div>
            )}

            {/* Footer: count + pagination */}
            {!loading && total > 0 && (
                <div className="v-zone-footer" style={{ flexDirection: 'column', gap: '0.75rem' }}>
                    <span className="feed-footer-summary">
                        {t('feed.showing_range', {
                            start: offsetStart,
                            end: offsetEnd,
                            total,
                            defaultValue: `Exibindo ${offsetStart}–${offsetEnd} de ${total}`,
                        })}
                    </span>
                    {totalPages > 1 && (
                        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                    )}
                </div>
            )}
        </div>
    );
}

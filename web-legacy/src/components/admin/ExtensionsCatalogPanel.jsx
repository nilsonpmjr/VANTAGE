import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Blocks, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Panel from '../ui/Panel';
import Pagination from '../shared/Pagination';

function statusVariant(status) {
    return {
        enabled: 'success',
        detected: 'neutral',
        disabled: 'neutral',
        incompatible: 'warning',
        invalid: 'danger',
    }[status] || 'neutral';
}

function humanizeList(values) {
    if (!values || values.length === 0) return '—';
    return values.join(', ');
}

function compactValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return humanizeList(value);
    if (typeof value === 'boolean') return String(value);
    return String(value);
}

function formatCount(value) {
    return typeof value === 'number' ? String(value) : '0';
}

function humanizeSearchRoots(roots) {
    if (!roots || roots.length === 0) return '—';
    return roots.map((root) => `${root.label} (${root.scope}/${root.repository_visibility})`).join(', ');
}

export default function ExtensionsCatalogPanel() {
    const { t } = useTranslation();
    const [catalog, setCatalog] = useState({ items: [], core_version: '', search_roots: [] });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [tierFilter, setTierFilter] = useState('all');
    const [page, setPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    const loadCatalog = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError('');

        try {
            const response = await fetch(`${API_URL}/api/admin/extensions${isRefresh ? '?refresh=true' : ''}`, {
                credentials: 'include',
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || t('settings.extensions_catalog_load_error'));
            }
            setCatalog({
                items: data.items || [],
                core_version: data.core_version || '',
                search_roots: data.search_roots || [],
            });
        } catch (err) {
            setError(err.message);
        } finally {
            if (isRefresh) setRefreshing(false);
            else setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadCatalog();
    }, [loadCatalog]);

    const summary = useMemo(() => {
        const items = catalog.items || [];
        return {
            total: items.length,
            enabled: items.filter((item) => item.status === 'enabled').length,
            incompatible: items.filter((item) => item.status === 'incompatible').length,
            invalid: items.filter((item) => item.status === 'invalid').length,
        };
    }, [catalog.items]);

    const filteredItems = useMemo(() => {
        const items = catalog.items || [];
        if (tierFilter === 'all') return items;
        return items.filter((item) => item.distributionTier === tierFilter);
    }, [catalog.items, tierFilter]);

    return (
        <div className="v-page-stack fade-in">
            <SectionHeader
                icon={<Blocks size={22} color="var(--primary)" />}
                title={t('settings.extensions_catalog_title')}
                subtitle={t('settings.extensions_catalog_subtitle')}
                actions={(
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => loadCatalog(true)}
                        loading={refreshing}
                        iconLeading={<RefreshCw size={14} />}
                    >
                        {t('settings.extensions_catalog_refresh')}
                    </Button>
                )}
            />

            {loading ? (
                <div className="v-empty-state">
                    <RefreshCw className="spin" size={24} color="var(--primary)" />
                </div>
            ) : (
                <>
                    {error ? <div className="alert-banner error">{error}</div> : null}

                    {/* Mini stats inspired by UserListPanel */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.6rem', marginBottom: '1.5rem' }}>
                        {[
                            { label: t('settings.extensions_catalog_summary_total'), value: summary.total, color: 'var(--primary)' },
                            { label: t('settings.extensions_catalog_summary_enabled'), value: summary.enabled, color: 'var(--status-safe)' },
                            { label: t('settings.extensions_catalog_summary_incompatible'), value: summary.incompatible, color: 'var(--status-suspicious)' },
                            { label: t('settings.extensions_catalog_summary_invalid'), value: summary.invalid, color: 'var(--status-risk)' },
                            { label: t('settings.extensions_catalog_core_version'), value: catalog.core_version || '—', color: 'var(--text-secondary)' },
                        ].map(({ label, value, color }) => (
                            <div key={label} className="glass-panel" style={{ padding: '0.6rem 0.85rem', borderRadius: '8px' }}>
                                <div style={{ fontSize: '0.68rem', color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{label}</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{value}</div>
                            </div>
                        ))}
                    </div>
                        <div className="glass-panel" style={{ padding: '0.6rem 0.85rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('settings.extensions_catalog_search_roots')}</div>
                            <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.2 }}>{humanizeSearchRoots(catalog.search_roots)}</div>
                        </div>

                    {(catalog.items || []).length > 0 ? (
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            {['all', 'core', 'local', 'premium'].map((filterKey) => (
                                <button
                                    key={filterKey}
                                    onClick={() => { setTierFilter(filterKey); setPage(1); }}
                                    style={{
                                        background: tierFilter === filterKey ? 'var(--primary)' : 'var(--glass-bg)',
                                        color: tierFilter === filterKey ? '#fff' : 'var(--text-primary)',
                                        border: `1px solid ${tierFilter === filterKey ? 'var(--primary)' : 'var(--glass-border)'}`,
                                        padding: '0.4rem 1rem',
                                        borderRadius: '2rem',
                                        fontSize: '0.85rem',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {t(`settings.extensions_catalog_filter_${filterKey}`)}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {(catalog.items || []).length === 0 ? (
                        <div className="v-empty-state">
                            <Blocks size={32} className="v-empty-state__icon" />
                            <strong>{t('settings.extensions_catalog_empty_title')}</strong>
                            <p className="v-empty-state__text">{t('settings.extensions_catalog_empty_body')}</p>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="v-empty-state">
                            <Blocks size={32} className="v-empty-state__icon" />
                            <strong>{t('settings.extensions_catalog_filtered_empty_title')}</strong>
                            <p className="v-empty-state__text">{t('settings.extensions_catalog_filtered_empty_body')}</p>
                        </div>
                    ) : (
                    <div className="glass-panel" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                        <div className="data-table-toolbar">
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {filteredItems.length} {t('settings.extensions_catalog_list_title').toLowerCase()}
                            </span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>Extensão</th>
                                        <th>Tier</th>
                                        <th>Versão / Autor</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
                                        const displayedItems = filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
                                        
                                        return displayedItems.map((item, idx) => (
                                            <tr key={item.key}>
                                                <td style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', border: '1px solid var(--glass-border)' }}>
                                                        <Blocks size={16} />
                                                    </div>
                                                    <div>
                                                        <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>{item.name}</div>
                                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'monospace' }}>{item.key} ({item.kind})</div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span style={{ background: 'var(--bg-card)', padding: '0.2rem 0.6rem', borderRadius: '1rem', border: '1px solid var(--glass-border)', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>{compactValue(item.distributionTier)}</span>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 500 }}>v{compactValue(item.version)}</div>
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{compactValue(item.author)}</div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                                                        <span style={{ background: `var(--status-${statusVariant(item.status)}-bg)`, color: `var(--status-${statusVariant(item.status)})`, padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 600, border: `1px solid var(--status-${statusVariant(item.status)})` }}>
                                                            {t(`settings.extensions_catalog_status_${item.status}`)}
                                                        </span>
                                                        {item.errors?.length > 0 && (
                                                            <div style={{ color: 'var(--alert-warning)', fontSize: '0.75rem', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.errors.join(', ')}>
                                                                ⚠ {item.errors[0]}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ));
                                    })()}
                                </tbody>
                            </table>
                        </div>
                        {Math.ceil(filteredItems.length / ITEMS_PER_PAGE) > 1 && (
                            <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                                <Pagination 
                                    page={page} 
                                    totalPages={Math.ceil(filteredItems.length / ITEMS_PER_PAGE)} 
                                    onPageChange={setPage} 
                                />
                            </div>
                        )}
                    </div>
                    )}
                </>
            )}
        </div>
    );
}

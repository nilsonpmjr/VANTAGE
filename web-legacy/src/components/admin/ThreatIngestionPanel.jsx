import React, { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, RefreshCw, Rss, ShieldCheck, Plus, Search, Trash2, ToggleLeft, ToggleRight, AlignJustify, List, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

function formatTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

function statusVariant(status) {
    return {
        success: 'success',
        error: 'danger',
        skipped: 'neutral',
        disabled: 'neutral',
        unsupported: 'warning',
        never_run: 'neutral',
        not_configured: 'warning',
    }[status] || 'neutral';
}

function sourceKindIcon(sourceType) {
    return sourceType === 'misp' ? <ShieldCheck size={14} /> : <Rss size={14} />;
}

export default function ThreatIngestionPanel() {
    const { t } = useTranslation();
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [compact, setCompact] = useState(false);

    // Add form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [addForm, setAddForm] = useState({ title: '', feed_url: '', family: 'custom', poll_interval_minutes: 60 });
    const [addError, setAddError] = useState('');
    const [addLoading, setAddLoading] = useState(false);

    const loadSources = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError('');

        try {
            const response = await fetch(`${API_URL}/api/admin/threat-sources`, {
                credentials: 'include',
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || t('settings.threat_ingestion_load_error'));
            }
            setSources(data.sources || []);
        } catch (err) {
            setError(err.message);
        } finally {
            if (isRefresh) setRefreshing(false);
            else setLoading(false);
        }
    };

    useEffect(() => {
        loadSources();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const summary = useMemo(() => {
        const total = sources.length;
        const enabled = sources.filter((s) => s.enabled).length;
        const withErrors = sources.filter((s) => s.sync_status?.status === 'error').length;
        const core = sources.filter((s) => s.origin !== 'manual').length;
        const manual = sources.filter((s) => s.origin === 'manual').length;
        return { total, enabled, withErrors, core, manual };
    }, [sources]);

    const filtered = sources.filter((s) =>
        s.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.family.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.source_id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleAddSource = async (e) => {
        e.preventDefault();
        setAddError('');
        setAddLoading(true);

        try {
            const response = await fetch(`${API_URL}/api/admin/threat-sources/custom`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(addForm),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || t('settings.threat_ingestion_add_error'));
            }
            setShowAddForm(false);
            setAddForm({ title: '', feed_url: '', family: 'custom', poll_interval_minutes: 60 });
            await loadSources(true);
        } catch (err) {
            setAddError(err.message);
        } finally {
            setAddLoading(false);
        }
    };

    const handleToggleSource = async (source) => {
        if (source.origin !== 'manual') return;
        try {
            const response = await fetch(`${API_URL}/api/admin/threat-sources/custom/${source.source_id}`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !source.enabled }),
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to toggle source');
            }
            await loadSources(true);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDeleteSource = async (source) => {
        if (source.origin !== 'manual') return;
        if (!window.confirm(t('settings.threat_ingestion_delete_confirm', { name: source.display_name }))) return;

        try {
            const response = await fetch(`${API_URL}/api/admin/threat-sources/custom/${source.source_id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to delete source');
            }
            await loadSources(true);
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="v-page-stack fade-in v-density-compact">
            <SectionHeader
                icon={<DatabaseZap size={22} color="var(--primary)" />}
                title={t('settings.threat_ingestion_title')}
                subtitle={t('settings.threat_ingestion_subtitle')}
                actions={(
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => loadSources(true)}
                            loading={refreshing}
                            iconLeading={<RefreshCw size={14} />}
                        >
                            {t('settings.threat_ingestion_refresh')}
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setShowAddForm(!showAddForm)}
                            iconLeading={<Plus size={14} />}
                        >
                            {t('settings.threat_ingestion_add_source')}
                        </Button>
                    </div>
                )}
            />

            {loading ? (
                <div className="v-empty-state">
                    <RefreshCw className="spin" size={24} color="var(--primary)" />
                </div>
            ) : (
                <>
                    {error ? <div className="alert-banner error">{error}</div> : null}

                    {/* Mini stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.6rem', marginBottom: '1.5rem' }}>
                        {[
                            { label: t('settings.threat_ingestion_summary_total'), value: summary.total, color: 'var(--primary)' },
                            { label: t('settings.threat_ingestion_summary_enabled'), value: summary.enabled, color: 'var(--green)' },
                            { label: t('settings.threat_ingestion_summary_errors'), value: summary.withErrors, color: 'var(--red)' },
                            { label: t('settings.threat_ingestion_summary_core'), value: summary.core, color: 'var(--text-secondary)' },
                            { label: t('settings.threat_ingestion_summary_manual'), value: summary.manual, color: 'var(--alert-warning)' },
                        ].map(({ label, value, color }) => (
                            <div key={label} className="glass-panel" style={{ padding: '0.6rem 0.85rem', borderRadius: '8px' }}>
                                <div style={{ fontSize: '0.68rem', color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Add form */}
                    {showAddForm && (
                        <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '12px', marginBottom: '1rem' }}>
                            <h4 style={{ margin: '0 0 1rem', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
                                {t('settings.threat_ingestion_add_title')}
                            </h4>
                            {addError && <div className="alert-banner error" style={{ marginBottom: '0.75rem' }}>{addError}</div>}
                            <form onSubmit={handleAddSource} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-field__label">{t('settings.threat_ingestion_field_name')}</label>
                                    <input
                                        className="form-input"
                                        type="text"
                                        required
                                        maxLength={200}
                                        value={addForm.title}
                                        onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                                        placeholder={t('settings.threat_ingestion_field_name_placeholder')}
                                    />
                                </div>
                                <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-field__label">{t('settings.threat_ingestion_field_url')}</label>
                                    <input
                                        className="form-input"
                                        type="url"
                                        required
                                        value={addForm.feed_url}
                                        onChange={(e) => setAddForm({ ...addForm, feed_url: e.target.value })}
                                        placeholder="https://example.com/feed.xml"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="form-field__label">{t('settings.threat_ingestion_field_family')}</label>
                                    <input
                                        className="form-input"
                                        type="text"
                                        maxLength={50}
                                        value={addForm.family}
                                        onChange={(e) => setAddForm({ ...addForm, family: e.target.value })}
                                        placeholder="custom"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="form-field__label">{t('settings.threat_ingestion_field_interval')}</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        min={1}
                                        max={1440}
                                        value={addForm.poll_interval_minutes}
                                        onChange={(e) => setAddForm({ ...addForm, poll_interval_minutes: parseInt(e.target.value, 10) || 60 })}
                                    />
                                </div>
                                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <Button variant="secondary" size="sm" type="button" onClick={() => setShowAddForm(false)}>
                                        {t('settings.threat_ingestion_cancel')}
                                    </Button>
                                    <Button variant="primary" size="sm" type="submit" loading={addLoading}>
                                        {t('settings.threat_ingestion_save')}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Data table */}
                    <div className="glass-panel" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                        {/* Toolbar */}
                        <div className="data-table-toolbar">
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {`${filtered.length} ${t('settings.threat_ingestion_sources_count')}`}
                            </span>
                            <div style={{ flex: 1, position: 'relative', maxWidth: '280px' }}>
                                <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                                <input
                                    type="text"
                                    placeholder={t('settings.search')}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="data-table-search"
                                    style={{ paddingLeft: '2rem' }}
                                    aria-label={t('settings.search')}
                                />
                            </div>
                            <button
                                className="density-toggle"
                                onClick={() => setCompact((c) => !c)}
                                title={compact ? t('settings.density_comfortable') : t('settings.density_compact')}
                                aria-label={compact ? t('settings.density_comfortable') : t('settings.density_compact')}
                            >
                                {compact ? <AlignJustify size={14} /> : <List size={14} />}
                            </button>
                        </div>

                        {/* Table */}
                        <div style={{ overflowX: 'auto' }}>
                            <table className={`data-table${compact ? ' compact' : ''}`} aria-label={t('settings.threat_ingestion_title')}>
                                <thead>
                                    <tr>
                                        <th>{t('settings.threat_ingestion_col_name').toUpperCase()}</th>
                                        <th>{t('settings.threat_ingestion_col_type').toUpperCase()}</th>
                                        <th>{t('settings.threat_ingestion_col_family').toUpperCase()}</th>
                                        <th>{t('settings.threat_ingestion_col_origin').toUpperCase()}</th>
                                        <th>{t('settings.threat_ingestion_col_status').toUpperCase()}</th>
                                        <th>{t('settings.threat_ingestion_col_items').toUpperCase()}</th>
                                        <th>{t('settings.threat_ingestion_col_last_sync').toUpperCase()}</th>
                                        <th>{t('settings.threat_ingestion_col_actions').toUpperCase()}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length === 0 && (
                                        <tr style={{ cursor: 'default' }}>
                                            <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem' }}>
                                                {t('settings.threat_ingestion_no_sources')}
                                            </td>
                                        </tr>
                                    )}
                                    {filtered.map((source) => (
                                        <tr key={source.source_id}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    {sourceKindIcon(source.source_type)}
                                                    <span style={{ fontWeight: 500 }}>{source.display_name}</span>
                                                </div>
                                            </td>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                                {source.source_type}
                                            </td>
                                            <td>
                                                <Badge variant="neutral">{source.family}</Badge>
                                            </td>
                                            <td>
                                                <Badge variant={source.origin === 'manual' ? 'warning' : 'primary'}>
                                                    {source.origin === 'manual'
                                                        ? t('settings.threat_ingestion_origin_manual')
                                                        : t('settings.threat_ingestion_origin_core')}
                                                </Badge>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                    <Badge variant={source.enabled ? 'success' : 'neutral'}>
                                                        {source.enabled ? t('settings.threat_ingestion_enabled') : t('settings.threat_ingestion_disabled')}
                                                    </Badge>
                                                    <Badge variant={statusVariant(source.sync_status?.status)}>
                                                        {t(`settings.threat_ingestion_status_${source.sync_status?.status || 'never_run'}`)}
                                                    </Badge>
                                                </div>
                                            </td>
                                            <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                                                {source.sync_status?.items_ingested ?? 0}
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                                {formatTimestamp(source.sync_status?.last_run_at)}
                                            </td>
                                            <td>
                                                {source.origin === 'manual' ? (
                                                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                        <button
                                                            className="btn-icon"
                                                            title={source.enabled ? t('settings.threat_ingestion_disable') : t('settings.threat_ingestion_enable')}
                                                            onClick={() => handleToggleSource(source)}
                                                        >
                                                            {source.enabled ? <ToggleRight size={16} color="var(--green)" /> : <ToggleLeft size={16} color="var(--text-muted)" />}
                                                        </button>
                                                        <button
                                                            className="btn-icon"
                                                            title={t('settings.threat_ingestion_delete')}
                                                            onClick={() => handleDeleteSource(source)}
                                                        >
                                                            <Trash2 size={14} color="var(--red)" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, ExternalLink, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';
import Badge from '../ui/Badge';
import Button from '../ui/Button';

const ASSET_OPTIONS = ['domain', 'subdomain', 'brand_keyword'];
const SCHEDULE_OPTIONS = ['manual', 'daily', 'continuous'];

function recurrenceVariant(status) {
    if (status === 'success') return 'success';
    if (status === 'error') return 'danger';
    if (status === 'running') return 'warning';
    return 'neutral';
}

function severityVariant(severity) {
    if (severity === 'critical' || severity === 'high') return 'danger';
    if (severity === 'medium') return 'warning';
    if (severity === 'low') return 'success';
    return 'neutral';
}

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

export default function PremiumExposurePage() {
    const { t } = useTranslation();
    const [providers, setProviders] = useState([]);
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [scanningId, setScanningId] = useState(null);
    const [error, setError] = useState(null);
    const [form, setForm] = useState({
        assetType: 'domain',
        value: '',
        scheduleMode: 'daily',
    });

    const loadPage = async () => {
        setLoading(true);
        setError(null);
        try {
            const [providersRes, assetsRes] = await Promise.all([
                fetch(`${API_URL}/api/exposure/providers`, { credentials: 'include' }),
                fetch(`${API_URL}/api/exposure/assets`, { credentials: 'include' }),
            ]);
            const providersData = await providersRes.json();
            const assetsData = await assetsRes.json();
            if (!providersRes.ok) throw new Error(providersData.detail || 'exposure.load_failed');
            if (!assetsRes.ok) throw new Error(assetsData.detail || 'exposure.load_failed');
            setProviders(providersData.items || []);
            setAssets(assetsData.items || []);
        } catch (err) {
            setError(err.message || 'exposure.load_failed');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadPage();
    }, []);

    const handleCreateAsset = async (event) => {
        event.preventDefault();
        if (!form.value.trim() || submitting) return;

        setSubmitting(true);
        setError(null);
        try {
            const response = await fetch(`${API_URL}/api/exposure/assets`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asset_type: form.assetType,
                    value: form.value.trim(),
                    schedule_mode: form.scheduleMode,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'exposure.create_failed');
            }
            setAssets((current) => [{ ...data.item, recent_findings: [], incident_count: 0, finding_count: 0 }, ...current]);
            setForm((current) => ({ ...current, value: '' }));
        } catch (err) {
            setError(err.message || 'exposure.create_failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleScan = async (assetId) => {
        if (scanningId) return;
        setScanningId(assetId);
        setError(null);
        try {
            const response = await fetch(`${API_URL}/api/exposure/assets/${assetId}/scan`, {
                method: 'POST',
                credentials: 'include',
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'exposure.scan_failed');
            }
            setAssets((current) =>
                current.map((item) =>
                    item._id === assetId
                        ? {
                            ...item,
                            ...data.asset,
                            recent_findings: data.items || [],
                            finding_count: (data.items || []).length,
                        }
                        : item
                )
            );
        } catch (err) {
            setError(err.message || 'exposure.scan_failed');
        } finally {
            setScanningId(null);
        }
    };

    return (
        <div className="v-page-stack fade-in exposure-page">
            <SectionHeader
                title={t('exposure.page_title')}
                subtitle={t('exposure.page_description')}
                icon={<ShieldAlert size={22} color="var(--primary)" />}
                actions={<Badge variant="warning">{t('exposure.mvp_badge')}</Badge>}
            />

            <section className="exposure-layout">
                <div className="glass-panel exposure-form-panel">
                    <div className="exposure-panel-header">
                        <div>
                            <h3 className="hunting-results__title">{t('exposure.monitored_assets_title')}</h3>
                            <p className="hunting-results__subtitle">{t('exposure.monitored_assets_subtitle')}</p>
                        </div>
                        <Badge variant="primary">{t('exposure.providers_count', { count: providers.length })}</Badge>
                    </div>

                    <form onSubmit={handleCreateAsset} className="hunting-form">
                        <div className="form-grid">
                            <label className="form-field">
                                <span className="form-field__label">{t('exposure.field_asset_type')}</span>
                                <select
                                    className="form-input"
                                    value={form.assetType}
                                    onChange={(event) => setForm((current) => ({ ...current, assetType: event.target.value }))}
                                >
                                    {ASSET_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {t(`exposure.asset_${option}`)}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="form-field">
                                <span className="form-field__label">{t('exposure.field_value')}</span>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={form.value}
                                    onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                                    placeholder={t('exposure.value_placeholder')}
                                />
                            </label>

                            <label className="form-field">
                                <span className="form-field__label">{t('exposure.field_schedule')}</span>
                                <select
                                    className="form-input"
                                    value={form.scheduleMode}
                                    onChange={(event) => setForm((current) => ({ ...current, scheduleMode: event.target.value }))}
                                >
                                    {SCHEDULE_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {t(`exposure.schedule_${option}`)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="hunting-form__actions">
                            <Button
                                type="submit"
                                variant="primary"
                                loading={submitting}
                                disabled={!form.value.trim()}
                                iconLeading={<Plus size={16} />}
                            >
                                {submitting ? t('exposure.creating') : t('exposure.create_cta')}
                            </Button>
                            <span className="hunting-form__tip">{t('exposure.form_tip')}</span>
                        </div>
                    </form>

                    <div className="exposure-provider-list">
                        {providers.map((provider) => (
                            <div key={provider.key} className="exposure-provider-chip">
                                <strong>{provider.name}</strong>
                                <span>{(provider.exposureAssetTypes || provider.assetTypes || []).join(', ')}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="glass-panel exposure-summary-panel">
                    <div className="exposure-panel-header">
                        <div>
                            <h3 className="hunting-results__title">{t('exposure.summary_title')}</h3>
                            <p className="hunting-results__subtitle">{t('exposure.summary_subtitle')}</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => void loadPage()} iconLeading={<RefreshCw size={14} />}>
                            {t('exposure.refresh')}
                        </Button>
                    </div>
                    <div className="exposure-summary-grid">
                        <div className="exposure-summary-card">
                            <span>{t('exposure.summary_assets')}</span>
                            <strong>{assets.length}</strong>
                        </div>
                        <div className="exposure-summary-card">
                            <span>{t('exposure.summary_findings')}</span>
                            <strong>{assets.reduce((total, item) => total + (item.finding_count || 0), 0)}</strong>
                        </div>
                        <div className="exposure-summary-card">
                            <span>{t('exposure.summary_incidents')}</span>
                            <strong>{assets.reduce((total, item) => total + (item.incident_count || 0), 0)}</strong>
                        </div>
                    </div>
                </div>
            </section>

            {error && (
                <div className="control-plane-alert error">
                    <AlertTriangle size={16} />
                    <span>{error}</span>
                </div>
            )}

            <section>
                <div className="hunting-results__header">
                    <div>
                        <h3 className="hunting-results__title">{t('exposure.assets_list_title')}</h3>
                        <p className="hunting-results__subtitle">{t('exposure.assets_list_subtitle')}</p>
                    </div>
                </div>

                {!loading && assets.length === 0 && (
                    <div className="glass-panel hunting-empty-state">
                        <ShieldAlert size={32} className="hunting-empty-state__icon" />
                        <p>{t('exposure.empty_state')}</p>
                    </div>
                )}

                {loading && (
                    <div className="glass-panel hunting-empty-state">
                        <span className="loader-pulse hunting-loader" />
                        <p>{t('exposure.loading')}</p>
                    </div>
                )}

                {assets.length > 0 && (
                    <div className="exposure-assets-grid">
                        {assets.map((asset) => (
                            <article key={asset._id} className="glass-panel exposure-asset-card">
                                <div className="exposure-asset-card__header">
                                    <div>
                                        <div className="exposure-asset-card__title-row">
                                            <strong className="hunting-result-card__title">{asset.value}</strong>
                                            <Badge variant="neutral">{t(`exposure.asset_${asset.asset_type}`)}</Badge>
                                        </div>
                                        <p className="hunting-results__subtitle">
                                            {t('exposure.asset_meta', {
                                                schedule: t(`exposure.schedule_${asset.recurrence?.mode || 'manual'}`),
                                                findings: asset.finding_count || 0,
                                                incidents: asset.incident_count || 0,
                                            })}
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        loading={scanningId === asset._id}
                                        onClick={() => void handleScan(asset._id)}
                                        iconLeading={<RefreshCw size={14} />}
                                    >
                                        {scanningId === asset._id ? t('exposure.scanning') : t('exposure.scan_cta')}
                                    </Button>
                                </div>

                                <div className="exposure-asset-card__meta">
                                    <Badge variant={recurrenceVariant(asset.recurrence?.last_status)}>
                                        {t(`exposure.recurrence_status_${asset.recurrence?.last_status || 'never_run'}`)}
                                    </Badge>
                                    <span className="exposure-meta-inline">
                                        <Clock3 size={14} />
                                        {t('exposure.next_run_label')}: {formatDate(asset.recurrence?.next_run_at)}
                                    </span>
                                    <span className="exposure-meta-inline">
                                        {t('exposure.last_run_label')}: {formatDate(asset.recurrence?.last_run_at)}
                                    </span>
                                </div>

                                <div className="exposure-findings-list">
                                    {asset.recent_findings?.length > 0 ? asset.recent_findings.map((finding) => (
                                        <div key={finding._id || `${asset._id}-${finding.title}`} className="exposure-finding-row">
                                            <div className="exposure-finding-row__content">
                                                <div className="exposure-finding-row__title">
                                                    <strong>{finding.title}</strong>
                                                    <Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge>
                                                </div>
                                                <p>{finding.summary}</p>
                                            </div>
                                            {finding.external_ref && (
                                                <a
                                                    href={finding.external_ref}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="hunting-result-card__link"
                                                >
                                                    <ExternalLink size={14} />
                                                    {t('exposure.open_reference')}
                                                </a>
                                            )}
                                        </div>
                                    )) : (
                                        <div className="exposure-finding-row exposure-finding-row--empty">
                                            <p>{t('exposure.asset_empty_state')}</p>
                                        </div>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

import React, { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, RefreshCw, Rss, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Panel from '../ui/Panel';

const CONFIG_ALLOWLIST = {
    rss: ['feed_url', 'poll_interval_minutes', 'severity_floor', 'category'],
    misp: ['base_url', 'api_key_configured', 'verify_tls', 'poll_interval_minutes'],
};

function formatTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

function humanizeKey(key) {
    return key.replaceAll('_', ' ');
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
    return sourceType === 'misp' ? <ShieldCheck size={16} /> : <Rss size={16} />;
}

function getRenderableConfigEntries(source) {
    const allowedKeys = CONFIG_ALLOWLIST[source.source_type] || [];
    return allowedKeys
        .filter((key) => key in (source.config || {}))
        .map((key) => [key, source.config[key]]);
}

export default function ThreatIngestionPanel() {
    const { t } = useTranslation();
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

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
        const enabled = sources.filter((source) => source.enabled).length;
        const withErrors = sources.filter((source) => source.sync_status?.status === 'error').length;
        return { total, enabled, withErrors };
    }, [sources]);

    return (
        <div className="v-page-stack fade-in">
            <SectionHeader
                icon={<DatabaseZap size={22} color="var(--primary)" />}
                title={t('settings.threat_ingestion_title')}
                subtitle={t('settings.threat_ingestion_subtitle')}
                actions={(
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => loadSources(true)}
                        loading={refreshing}
                        iconLeading={<RefreshCw size={14} />}
                    >
                        {t('settings.threat_ingestion_refresh')}
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

                    <div className="control-plane-kpi-grid">
                        <Panel
                            title={t('settings.threat_ingestion_summary_total')}
                            eyebrow={t('settings.threat_ingestion_summary')}
                        >
                            <div className="control-plane-kpi">{summary.total}</div>
                        </Panel>
                        <Panel
                            title={t('settings.threat_ingestion_summary_enabled')}
                            eyebrow={t('settings.threat_ingestion_summary')}
                        >
                            <div className="control-plane-kpi success">{summary.enabled}</div>
                        </Panel>
                        <Panel
                            title={t('settings.threat_ingestion_summary_errors')}
                            eyebrow={t('settings.threat_ingestion_summary')}
                        >
                            <div className="control-plane-kpi danger">{summary.withErrors}</div>
                        </Panel>
                    </div>

                    <Panel
                        title={t('settings.threat_ingestion_snapshot_title')}
                        description={t('settings.threat_ingestion_snapshot_body')}
                    >
                        <div className="control-plane-note">
                            <Badge variant="neutral">{t('settings.threat_ingestion_snapshot_note')}</Badge>
                            <span>{t('settings.threat_ingestion_snapshot_hint')}</span>
                        </div>
                    </Panel>

                    <div className="v-zone-grid">
                        {sources.map((source) => (
                            <Panel
                                key={source.source_id}
                                title={source.display_name}
                                eyebrow={source.family}
                                actions={(
                                    <div className="v-inline-row">
                                        <Badge variant={source.enabled ? 'success' : 'neutral'}>
                                            {source.enabled ? t('settings.threat_ingestion_enabled') : t('settings.threat_ingestion_disabled')}
                                        </Badge>
                                        <Badge variant={statusVariant(source.sync_status?.status)}>
                                            {t(`settings.threat_ingestion_status_${source.sync_status?.status || 'never_run'}`)}
                                        </Badge>
                                    </div>
                                )}
                            >
                                <div className="service-status-card">
                                    <div className="service-status-headline">
                                        <div className="service-status-icon">
                                            {sourceKindIcon(source.source_type)}
                                        </div>
                                        <div>
                                            <strong>{t('settings.threat_ingestion_last_sync')}</strong>
                                            <span>{formatTimestamp(source.sync_status?.last_run_at)}</span>
                                        </div>
                                    </div>

                                    {source.sync_status?.last_error ? (
                                        <div className="alert-banner warning compact">{source.sync_status.last_error}</div>
                                    ) : null}

                                    <div className="service-status-columns">
                                        <div>
                                            <h4>{t('settings.threat_ingestion_config')}</h4>
                                            <ul className="service-status-list">
                                                <li>
                                                    <span>{t('settings.threat_ingestion_field_type')}</span>
                                                    <strong>{source.source_type}</strong>
                                                </li>
                                                {getRenderableConfigEntries(source).map(([key, value]) => (
                                                    <li key={key}>
                                                        <span>{humanizeKey(key)}</span>
                                                        <strong>{typeof value === 'boolean' ? String(value) : String(value || '—')}</strong>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div>
                                            <h4>{t('settings.threat_ingestion_runtime')}</h4>
                                            <ul className="service-status-list">
                                                <li>
                                                    <span>{t('settings.threat_ingestion_items_ingested')}</span>
                                                    <strong>{source.sync_status?.items_ingested ?? 0}</strong>
                                                </li>
                                                <li>
                                                    <span>{t('settings.threat_ingestion_field_id')}</span>
                                                    <strong>{source.source_id}</strong>
                                                </li>
                                                <li>
                                                    <span>{t('settings.threat_ingestion_field_family')}</span>
                                                    <strong>{source.family}</strong>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </Panel>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

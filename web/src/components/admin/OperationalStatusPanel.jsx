import React, { useEffect, useState } from 'react';
import { Activity, Database, Mail, RefreshCw, Server, TimerReset, Waypoints } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Panel from '../ui/Panel';

const SERVICE_ICONS = {
    backend: Server,
    mongodb: Database,
    scheduler: TimerReset,
    worker: Activity,
    mailer: Mail,
};

function StatusBadge({ status, t }) {
    const variant = {
        healthy: 'success',
        degraded: 'warning',
        error: 'danger',
    }[status] || 'neutral';

    return <Badge variant={variant}>{t(`settings.operational_status_state_${status}`)}</Badge>;
}

function formatTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString();
}

function humanizeKey(key) {
    return key.replaceAll('_', ' ');
}

export default function OperationalStatusPanel() {
    const { t } = useTranslation();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const loadStatus = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_URL}/api/admin/operational-status`, {
                credentials: 'include',
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || t('settings.operational_status_load_error'));
            }
            setStatus(data);
        } catch (err) {
            setError(err.message);
        } finally {
            if (isRefresh) setRefreshing(false);
            else setLoading(false);
        }
    };

    useEffect(() => {
        loadStatus();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="v-page-stack fade-in">
            <SectionHeader
                icon={<Waypoints size={22} color="var(--primary)" />}
                title={t('settings.operational_status_title')}
                subtitle={t('settings.operational_status_subtitle')}
                actions={(
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => loadStatus(true)}
                        loading={refreshing}
                        iconLeading={<RefreshCw size={14} />}
                    >
                        {t('settings.operational_status_refresh')}
                    </Button>
                )}
            />

            {loading ? (
                <div className="control-plane-loading">
                    <RefreshCw className="spin" size={24} color="var(--primary)" />
                </div>
            ) : (
                <>
                    {error ? <div className="control-plane-alert error">{error}</div> : null}

                    {status ? (
                        <>
                            <div className="control-plane-kpi-grid">
                                <Panel
                                    title={t('settings.operational_status_summary_healthy')}
                                    eyebrow={t('settings.operational_status_summary')}
                                >
                                    <div className="control-plane-kpi success">{status.summary?.healthy ?? 0}</div>
                                </Panel>
                                <Panel
                                    title={t('settings.operational_status_summary_degraded')}
                                    eyebrow={t('settings.operational_status_summary')}
                                >
                                    <div className="control-plane-kpi warning">{status.summary?.degraded ?? 0}</div>
                                </Panel>
                                <Panel
                                    title={t('settings.operational_status_summary_error')}
                                    eyebrow={t('settings.operational_status_summary')}
                                >
                                    <div className="control-plane-kpi danger">{status.summary?.error ?? 0}</div>
                                </Panel>
                            </div>

                            <Panel
                                title={t('settings.operational_status_snapshot_title')}
                                description={t('settings.operational_status_snapshot_body')}
                            >
                                <div className="control-plane-note">
                                    <Badge variant="neutral">{t('settings.operational_status_checked_at')}</Badge>
                                    <span>{formatTimestamp(status.checked_at)}</span>
                                </div>
                            </Panel>

                            <div className="service-status-grid">
                                {Object.entries(status.services || {}).map(([serviceKey, service]) => {
                                    const Icon = SERVICE_ICONS[serviceKey] || Activity;
                                    return (
                                        <Panel
                                            key={serviceKey}
                                            title={t(`settings.operational_status_service_${serviceKey}`)}
                                            eyebrow={t('settings.operational_status_service')}
                                            actions={<StatusBadge status={service.status} t={t} />}
                                        >
                                            <div className="service-status-card">
                                                <div className="service-status-headline">
                                                    <div className="service-status-icon">
                                                        <Icon size={16} />
                                                    </div>
                                                    <div>
                                                        <strong>{t('settings.operational_status_last_checked')}</strong>
                                                        <span>{formatTimestamp(service.last_checked)}</span>
                                                    </div>
                                                </div>

                                                {service.error ? (
                                                    <div className="control-plane-alert warning">{service.error}</div>
                                                ) : null}

                                                <div className="service-status-columns">
                                                    <div>
                                                        <h4>{t('settings.operational_status_details')}</h4>
                                                        <ul className="service-status-list">
                                                            {Object.entries(service.details || {}).map(([key, value]) => (
                                                                <li key={key}>
                                                                    <span>{humanizeKey(key)}</span>
                                                                    <strong>{String(value)}</strong>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>

                                                    <div>
                                                        <h4>{t('settings.operational_status_consumption')}</h4>
                                                        <ul className="service-status-list">
                                                            {Object.entries(service.consumption || {}).map(([key, value]) => (
                                                                <li key={key}>
                                                                    <span>{humanizeKey(key)}</span>
                                                                    <strong>{String(value)}</strong>
                                                                </li>
                                                            ))}
                                                            {!Object.keys(service.consumption || {}).length ? (
                                                                <li>
                                                                    <span>{t('settings.operational_status_empty')}</span>
                                                                    <strong>—</strong>
                                                                </li>
                                                            ) : null}
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>
                                        </Panel>
                                    );
                                })}
                            </div>
                        </>
                    ) : null}
                </>
            )}
        </div>
    );
}

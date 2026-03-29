import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, CheckCircle, Database, Mail, RefreshCw, RotateCw, Server, TimerReset, Waypoints, XCircle, X } from 'lucide-react';
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

const RESTARTABLE_SERVICES = new Set(['scheduler', 'worker', 'recon', 'threat_ingestion']);

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
    const [restartingService, setRestartingService] = useState(null);
    const [confirmRestart, setConfirmRestart] = useState(null);
    const [restartResult, setRestartResult] = useState(null);

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

    const handleRestart = async (serviceName) => {
        setConfirmRestart(null);
        setRestartingService(serviceName);
        setRestartResult(null);

        try {
            const response = await fetch(`${API_URL}/api/admin/services/${serviceName}/restart`, {
                method: 'POST',
                credentials: 'include',
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || t('settings.service_restart_error'));
            }
            setRestartResult({ type: 'success', message: data.message });
            await loadStatus(true);
        } catch (err) {
            setRestartResult({ type: 'error', message: err.message });
        } finally {
            setRestartingService(null);
        }
    };

    // Auto-dismiss toast after 6 seconds
    useEffect(() => {
        if (!restartResult) return;
        const timer = setTimeout(() => setRestartResult(null), 6000);
        return () => clearTimeout(timer);
    }, [restartResult]);

    useEffect(() => {
        loadStatus();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="v-page-stack fade-in">
            {/* Toast notification for restart result — rendered via portal at body level */}
            {restartResult && createPortal(
                <div className={`restart-toast restart-toast--${restartResult.type}`}>
                    <div className="restart-toast__icon">
                        {restartResult.type === 'success'
                            ? <CheckCircle size={18} />
                            : <XCircle size={18} />
                        }
                    </div>
                    <span className="restart-toast__message">{restartResult.message}</span>
                    <button className="restart-toast__close" onClick={() => setRestartResult(null)}>
                        <X size={14} />
                    </button>
                </div>,
                document.body,
            )}

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

                    {/* Confirmation modal */}
                    {confirmRestart && (
                        <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '12px', marginBottom: '1rem', border: '1px solid var(--alert-warning)' }}>
                            <h4 style={{ margin: '0 0 0.75rem', color: 'var(--alert-warning)', fontSize: '0.95rem', fontWeight: 600 }}>
                                {t('settings.service_restart_confirm_title')}
                            </h4>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 1rem' }}>
                                {t('settings.service_restart_confirm_body', {
                                    service: t(`settings.operational_status_service_${confirmRestart}`) || confirmRestart,
                                })}
                            </p>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <Button variant="secondary" size="sm" onClick={() => setConfirmRestart(null)}>
                                    {t('settings.service_restart_cancel')}
                                </Button>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => handleRestart(confirmRestart)}
                                    loading={restartingService === confirmRestart}
                                >
                                    {t('settings.service_restart_confirm')}
                                </Button>
                            </div>
                        </div>
                    )}

                    {status ? (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', marginBottom: '1.5rem' }}>
                                {[
                                    { label: t('settings.operational_status_summary_healthy'), value: status.summary?.healthy ?? 0, color: 'var(--status-safe)' },
                                    { label: t('settings.operational_status_summary_degraded'), value: status.summary?.degraded ?? 0, color: 'var(--status-suspicious)' },
                                    { label: t('settings.operational_status_summary_error'), value: status.summary?.error ?? 0, color: 'var(--status-risk)' },
                                    { label: t('settings.operational_status_checked_at'), value: formatTimestamp(status.checked_at), color: 'var(--text-primary)' },
                                ].map(({ label, value, color }) => (
                                    <div key={label} className="glass-panel" style={{ padding: '0.6rem 0.85rem', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '0.68rem', color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{label}</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>{value}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="glass-panel" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                                <div className="data-table-toolbar">
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {Object.keys(status.services || {}).length} {t('settings.operational_status_services_title', 'Serviços').toLowerCase()}
                                    </span>
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="data-table" style={{ width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th>{t('settings.operational_status_service', 'Serviço').toUpperCase()}</th>
                                                <th>{t('settings.status', 'STATUS').toUpperCase()}</th>
                                                <th>{t('settings.operational_status_details', 'Detalhes').toUpperCase()}</th>
                                                <th>{t('settings.operational_status_last_checked', 'Última Checagem').toUpperCase()}</th>
                                                <th style={{ textAlign: 'right' }}>Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(status.services || {}).map(([serviceKey, service]) => {
                                                const Icon = SERVICE_ICONS[serviceKey] || Activity;
                                                const canRestart = RESTARTABLE_SERVICES.has(serviceKey);
                                                const detailsStr = Object.entries(service.details || {}).map(([k, v]) => `${humanizeKey(k)}: ${v}`).join(' | ');
                                                const consumptionStr = Object.entries(service.consumption || {}).map(([k, v]) => `${humanizeKey(k)}: ${v}`).join(' | ');
                                                const combinedMetrics = [detailsStr, consumptionStr].filter(Boolean).join(' • ') || '—';

                                                return (
                                                    <tr key={serviceKey}>
                                                        <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                            <div style={{ background: 'var(--bg-main)', padding: '0.35rem', borderRadius: '6px', border: '1px solid var(--glass-border)' }}>
                                                                <Icon size={16} color="var(--primary)" />
                                                            </div>
                                                            {t(`settings.operational_status_service_${serviceKey}`)}
                                                        </td>
                                                        <td>
                                                            <StatusBadge status={service.status} t={t} />
                                                        </td>
                                                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {service.error ? <span style={{ color: 'var(--alert-warning)' }}>{service.error}</span> : combinedMetrics}
                                                        </td>
                                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                                            {formatTimestamp(service.last_checked)}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            {canRestart && (
                                                                <button
                                                                    className="btn-icon"
                                                                    title={t('settings.service_restart_btn')}
                                                                    onClick={() => setConfirmRestart(serviceKey)}
                                                                    disabled={restartingService === serviceKey}
                                                                >
                                                                    {restartingService === serviceKey
                                                                        ? <RefreshCw className="spin" size={16} color="var(--primary)" />
                                                                        : <RotateCw size={16} color="var(--text-secondary)" />
                                                                    }
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : null}
                </>
            )}
        </div>
    );
}

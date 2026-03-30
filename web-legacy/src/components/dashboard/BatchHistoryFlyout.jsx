import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Layers, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FlyoutPanel from '../shared/FlyoutPanel';
import API_URL from '../../config';

export default function BatchHistoryFlyout({ open, onClose, onLoad }) {
    const { t } = useTranslation();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingJobId, setLoadingJobId] = useState(null);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        fetch(`${API_URL}/api/analyze/batch/history`, { credentials: 'include' })
            .then((r) => {
                if (!r.ok) throw new Error();
                return r.json();
            })
            .then((data) => setJobs(data.jobs || []))
            .catch(() => setJobs([]))
            .finally(() => setLoading(false));
    }, [open]);

    const handleLoad = useCallback(
        async (job) => {
            setLoadingJobId(job.job_id);
            try {
                const res = await fetch(`${API_URL}/api/analyze/batch/${job.job_id}`, {
                    credentials: 'include',
                });
                if (!res.ok) throw new Error();
                const fullJob = await res.json();
                onLoad(fullJob);
            } catch {
                // silently ignore
            } finally {
                setLoadingJobId(null);
            }
        },
        [onLoad],
    );

    return (
        <FlyoutPanel
            open={open}
            onClose={onClose}
            title={t('batch.history_title')}
            titleIcon={<Clock size={16} style={{ marginRight: '0.35rem', color: 'var(--primary)' }} />}
        >
            {loading && (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Loader2 size={20} className="spin" color="var(--primary)" />
                </div>
            )}

            {!loading && jobs.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    <Layers size={24} style={{ opacity: 0.2, marginBottom: '0.5rem' }} />
                    <p style={{ margin: 0 }}>{t('batch.history_empty')}</p>
                </div>
            )}

            {!loading && jobs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {jobs.map((job) => {
                        const date = new Date(job.created_at);
                        const dateStr = date.toLocaleDateString('pt-BR', {
                            day: '2-digit', month: '2-digit', year: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                        });
                        const hasThreat = job.threat_count > 0;

                        return (
                            <div
                                key={job.job_id}
                                className="hover-border"
                                onClick={() => handleLoad(job)}
                                style={{
                                    padding: '0.75rem 1rem',
                                    background: 'var(--glass-bg)',
                                    border: '1px solid var(--glass-border)',
                                    borderRadius: 'var(--radius-sm)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '0.75rem',
                                    '--hover-accent': 'var(--primary)',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        {dateStr}
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                            {t('batch.history_targets', { count: job.target_count })}
                                        </span>
                                        {hasThreat && (
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                                fontSize: '0.72rem', color: 'var(--status-risk)', fontWeight: 600,
                                            }}>
                                                <AlertTriangle size={11} />
                                                {t('batch.history_threats', { count: job.threat_count })}
                                            </span>
                                        )}
                                        <span style={{
                                            fontSize: '0.68rem',
                                            color: job.status === 'done' ? 'var(--status-safe)' : 'var(--text-muted)',
                                            textTransform: 'uppercase',
                                            fontWeight: 700,
                                            letterSpacing: '0.04em',
                                        }}>
                                            {job.status}
                                        </span>
                                    </div>
                                </div>

                                {loadingJobId === job.job_id ? (
                                    <Loader2 size={14} className="spin" color="var(--primary)" />
                                ) : (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                        {t('batch.history_load')}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </FlyoutPanel>
    );
}

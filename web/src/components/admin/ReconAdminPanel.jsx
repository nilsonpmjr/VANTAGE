import React, { useState, useEffect, useCallback } from 'react';
import { Radar, Loader2, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SectionHeader from '../shared/SectionHeader';
import API_URL from '../../config';

function StatusBadge({ status }) {
    const colors = {
        done: { bg: 'var(--status-safe-bg)', border: 'var(--status-safe)', color: 'var(--status-safe)' },
        running: { bg: 'rgba(56,189,248,0.08)', border: 'var(--primary)', color: 'var(--primary)' },
        pending: { bg: 'var(--glass-bg)', border: 'var(--glass-border)', color: 'var(--text-muted)' },
        error: { bg: 'var(--status-risk-bg)', border: 'var(--status-risk)', color: 'var(--status-risk)' },
    };
    const s = colors[status] || colors.pending;
    return (
        <span style={{
            display: 'inline-block',
            fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.04em',
            padding: '0.1rem 0.5rem',
            borderRadius: '1rem',
            background: s.bg, border: `1px solid ${s.border}`, color: s.color,
        }}>
            {status}
        </span>
    );
}

export default function ReconAdminPanel({ onRecon }) {
    const { t } = useTranslation();
    const [jobs, setJobs] = useState([]);
    const [analysts, setAnalysts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterAnalyst, setFilterAnalyst] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const fetchJobs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterAnalyst) params.set('analyst', filterAnalyst);
            if (filterStatus) params.set('status', filterStatus);
            const res = await fetch(`${API_URL}/api/recon/admin/jobs?${params}`, { credentials: 'include' });
            if (!res.ok) throw new Error();
            const data = await res.json();
            setJobs(data.jobs || []);
            setAnalysts(data.analysts || []);
        } catch {
            setJobs([]);
        } finally {
            setLoading(false);
        }
    }, [filterAnalyst, filterStatus]);

    useEffect(() => { fetchJobs(); }, [fetchJobs]);

    return (
        <div className="fade-in">
            <SectionHeader
                icon={<Radar size={22} color="var(--primary)" />}
                title={t('settings.recon_jobs')}
                subtitle={t('settings.recon_all_analysts')}
            />

            <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '12px' }}>
                {/* Filters */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <Filter size={14} color="var(--text-muted)" />
                    <select
                        value={filterAnalyst}
                        onChange={e => setFilterAnalyst(e.target.value)}
                        style={{
                            background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
                            color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
                            padding: '0.35rem 0.6rem', fontSize: '0.82rem',
                        }}
                    >
                        <option value="">{t('settings.recon_filter_analyst')}</option>
                        {analysts.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        style={{
                            background: 'var(--bg-card)', border: '1px solid var(--glass-border)',
                            color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
                            padding: '0.35rem 0.6rem', fontSize: '0.82rem',
                        }}
                    >
                        <option value="">{t('settings.recon_filter_status')}</option>
                        <option value="done">Done</option>
                        <option value="running">Running</option>
                        <option value="pending">Pending</option>
                        <option value="error">Error</option>
                    </select>
                    {(filterAnalyst || filterStatus) && (
                        <button
                            onClick={() => { setFilterAnalyst(''); setFilterStatus(''); }}
                            style={{
                                fontSize: '0.72rem', color: 'var(--primary)',
                                background: 'transparent', border: 'none',
                                cursor: 'pointer', textDecoration: 'underline', padding: 0,
                            }}
                        >
                            {t('batch.filter_clear')}
                        </button>
                    )}
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {jobs.length} {t('settings.recon_jobs_count')}
                    </span>
                </div>

                {/* Loading */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        <Loader2 size={20} className="spin" color="var(--primary)" />
                    </div>
                )}

                {/* Empty */}
                {!loading && jobs.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        <Radar size={32} style={{ opacity: 0.15, marginBottom: '0.5rem' }} />
                        <p style={{ margin: 0 }}>{t('settings.recon_no_jobs')}</p>
                    </div>
                )}

                {/* Table */}
                {!loading && jobs.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th scope="col">{t('settings.recon_col_target')}</th>
                                    <th scope="col">{t('settings.recon_col_analyst')}</th>
                                    <th scope="col">{t('settings.recon_col_modules')}</th>
                                    <th scope="col">{t('settings.recon_col_status')}</th>
                                    <th scope="col">{t('settings.recon_col_date')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {jobs.map(job => (
                                    <tr
                                        key={job.job_id}
                                        style={{ cursor: onRecon ? 'pointer' : 'default' }}
                                        onClick={() => onRecon && onRecon(job.target)}
                                        title={onRecon ? t('settings.recon_click_hint') : ''}
                                    >
                                        <td>
                                            <span className="mono" style={{
                                                color: 'var(--primary)', fontSize: '0.88rem',
                                                maxWidth: '200px', display: 'inline-block',
                                                overflow: 'hidden', textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap', verticalAlign: 'middle',
                                            }}>
                                                {job.target}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                            {job.analyst}
                                        </td>
                                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {(job.modules || []).length}
                                        </td>
                                        <td><StatusBadge status={job.status} /></td>
                                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            {job.created_at
                                                ? new Date(job.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                                                : '-'
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

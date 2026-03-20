import React, { useState, useEffect } from 'react';
import { X, History, Loader2, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';

function fmt(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

export default function ReconHistory({ target, onLoad, onClose }) {
    const { t } = useTranslation();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!target) return;
        fetch(`${API_URL}/api/recon/history/${encodeURIComponent(target)}`, { credentials: 'include' })
            .then(r => {
                if (!r.ok) throw new Error('Failed to load history');
                return r.json();
            })
            .then(data => setJobs(data.jobs || []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [target]);

    return (
        <div
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1rem',
            }}
            onClick={onClose}
        >
            <div
                className="glass-panel"
                style={{ width: '100%', maxWidth: '640px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '80vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontSize: '1rem' }}>
                        <History size={16} color="var(--primary)" />
                        {t('recon.history_title', 'Histórico')}
                        <code style={{ fontSize: '0.8rem', color: 'var(--primary)', background: 'var(--glass-bg)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{target}</code>
                    </h3>
                    <button
                        onClick={onClose}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '0.25rem' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ overflowY: 'auto', flexGrow: 1 }}>
                    {loading && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                            <Loader2 size={22} className="spin" style={{ color: 'var(--primary)' }} />
                        </div>
                    )}

                    {error && (
                        <p style={{ color: 'var(--red)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>{error}</p>
                    )}

                    {!loading && !error && jobs.length === 0 && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
                            {t('recon.no_history', 'Nenhum scan anterior encontrado.')}
                        </p>
                    )}

                    {!loading && jobs.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                    <th style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'left' }}>{t('dashboard.datetime')}</th>
                                    <th style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'left' }}>{t('recon.modules_label')}</th>
                                    <th style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'left' }}>{t('dashboard.analyst')}</th>
                                    <th style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'right' }}>Status</th>
                                    <th style={{ width: '32px' }} />
                                </tr>
                            </thead>
                            <tbody>
                                {jobs.map((job, idx) => (
                                    <tr
                                        key={job.job_id}
                                        style={{
                                            borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none',
                                            cursor: onLoad ? 'pointer' : 'default',
                                            transition: 'background 0.15s',
                                        }}
                                        onClick={() => onLoad && onLoad(job)}
                                        onMouseOver={e => { if (onLoad) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            {fmt(job.created_at)}
                                        </td>
                                        <td style={{ padding: '0.75rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {job.modules?.join(', ') || '—'}
                                        </td>
                                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
                                            {job.analyst || '—'}
                                        </td>
                                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                                            <span style={{
                                                fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '1rem',
                                                color: job.status === 'done' ? 'var(--green)' : job.status === 'error' ? 'var(--red)' : 'var(--primary)',
                                                border: `1px solid ${job.status === 'done' ? 'var(--green)' : job.status === 'error' ? 'var(--red)' : 'var(--primary)'}`,
                                            }}>
                                                {job.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            {onLoad && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

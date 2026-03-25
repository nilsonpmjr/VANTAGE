import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Layers, CheckCircle, XCircle, AlertTriangle, Shield,
    ShieldAlert, Skull, Activity, Download, Database, Clock, Filter, Mail,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import FlyoutPanel from '../shared/FlyoutPanel';
import VerdictPanel from './VerdictPanel';
import ServiceCard from './ServiceCard';
import BatchHistoryFlyout from './BatchHistoryFlyout';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import API_URL from '../../config';

// ── verdict helpers (mirrors Dashboard / VerdictPanel colours) ───────────────
function verdictColor(verdict) {
    if (!verdict) return 'var(--text-muted)';
    switch (verdict.toUpperCase()) {
        case 'SAFE':      return 'var(--status-safe)';
        case 'SUSPICIOUS': return 'var(--status-suspicious)';
        case 'HIGH RISK': return 'var(--status-risk)';
        case 'ERROR':     return 'var(--text-muted)';
        default:          return 'var(--primary)';
    }
}

function verdictBg(verdict) {
    if (!verdict) return 'transparent';
    switch (verdict.toUpperCase()) {
        case 'SAFE':      return 'var(--status-safe-bg)';
        case 'SUSPICIOUS': return 'var(--status-suspicious-bg)';
        case 'HIGH RISK': return 'var(--status-risk-bg)';
        default:          return 'var(--glass-bg)';
    }
}

function VerdictIcon({ verdict, size = 14 }) {
    switch ((verdict || '').toUpperCase()) {
        case 'SAFE':      return <Shield size={size} />;
        case 'SUSPICIOUS': return <ShieldAlert size={size} />;
        case 'HIGH RISK': return <Skull size={size} />;
        case 'ERROR':     return <XCircle size={size} />;
        default:          return <Activity size={size} />;
    }
}

// ── filter pill component ───────────────────────────────────────────────────
function FilterPill({ label, active, onClick, color }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.2rem 0.6rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                borderRadius: '1rem',
                cursor: 'pointer',
                transition: 'all 0.15s',
                border: `1px solid ${active ? (color || 'var(--primary)') : 'var(--glass-border)'}`,
                background: active ? (color ? `${color}15` : 'var(--accent-glow)') : 'transparent',
                color: active ? (color || 'var(--primary)') : 'var(--text-muted)',
            }}
        >
            {label}
        </button>
    );
}

// ── pre-flight modal ─────────────────────────────────────────────────────────
function PreflightModal({ estimate, onConfirm, onCancel, t, notifyEmail, onNotifyChange, smtpOk }) {
    const { total, cache_hits, external_calls, estimated_seconds, services_impacted } = estimate;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={onCancel}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="preflight-title"
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--primary)',
                    borderRadius: '14px',
                    padding: '2rem',
                    maxWidth: '460px',
                    width: '90%',
                    animation: 'fadeIn 0.2s ease',
                }}
            >
                <h3
                    id="preflight-title"
                    style={{
                        margin: '0 0 1.25rem',
                        color: 'var(--primary)',
                        fontSize: '1.1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}
                >
                    <Layers size={20} />
                    {t('batch.preflight.title')}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        {t('batch.preflight.total', { count: total })}
                    </p>

                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <div
                            style={{
                                flex: 1, minWidth: '120px',
                                background: 'var(--status-safe-bg)',
                                border: '1px solid var(--status-safe)',
                                borderRadius: '8px', padding: '0.75rem 1rem',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--status-safe)', fontWeight: 700, fontSize: '1.4rem' }}>
                                <CheckCircle size={18} /> {cache_hits}
                            </div>
                            <p style={{ margin: '0.25rem 0 0', color: 'var(--status-safe)', fontSize: '0.78rem' }}>
                                {t('batch.preflight.cache_hits')}
                            </p>
                        </div>

                        <div
                            style={{
                                flex: 1, minWidth: '120px',
                                background: external_calls > 0 ? 'var(--alert-error-bg)' : 'var(--glass-bg)',
                                border: `1px solid ${external_calls > 0 ? 'var(--status-risk)' : 'var(--glass-border)'}`,
                                borderRadius: '8px', padding: '0.75rem 1rem',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: external_calls > 0 ? 'var(--status-risk)' : 'var(--text-muted)', fontWeight: 700, fontSize: '1.4rem' }}>
                                <AlertTriangle size={18} /> {external_calls}
                            </div>
                            <p style={{ margin: '0.25rem 0 0', color: external_calls > 0 ? 'var(--status-risk)' : 'var(--text-muted)', fontSize: '0.78rem' }}>
                                {t('batch.preflight.external_calls')}
                            </p>
                        </div>
                    </div>

                    {external_calls > 0 && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <span>
                                <strong style={{ color: 'var(--text-secondary)' }}>{t('batch.preflight.estimated')}:</strong>{' '}
                                ~{estimated_seconds}s
                            </span>
                            {services_impacted.length > 0 && (
                                <span>
                                    <strong style={{ color: 'var(--text-secondary)' }}>{t('batch.preflight.services')}:</strong>{' '}
                                    {services_impacted.join(' · ')}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <label
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        fontSize: '0.85rem', color: smtpOk ? 'var(--text-secondary)' : 'var(--text-muted)',
                        cursor: smtpOk ? 'pointer' : 'not-allowed',
                        marginBottom: '1rem', opacity: smtpOk ? 1 : 0.5,
                    }}
                    title={smtpOk ? '' : t('batch.notify_no_smtp')}
                >
                    <input
                        type="checkbox"
                        checked={notifyEmail}
                        onChange={(e) => onNotifyChange(e.target.checked)}
                        disabled={!smtpOk}
                        style={{ accentColor: 'var(--primary)' }}
                    />
                    <Mail size={14} />
                    {t('batch.notify_email')}
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <Button variant="secondary" onClick={onCancel}>
                        {t('batch.preflight.cancel')}
                    </Button>
                    <Button variant="primary" onClick={onConfirm}>
                        {t('batch.preflight.confirm')}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ── export helpers ───────────────────────────────────────────────────────────
function exportCSV(results) {
    const header = 'target,type,verdict,risk_score,from_cache,status';
    const rows = results.map((r) =>
        [r.target, r.target_type, r.verdict, r.risk_score, r.from_cache, r.status].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportJSON(results) {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── verdict/type constants for filter pills ─────────────────────────────────
const VERDICT_PILLS = [
    { value: 'HIGH RISK', color: 'var(--status-risk)' },
    { value: 'SUSPICIOUS', color: 'var(--status-suspicious)' },
    { value: 'SAFE', color: 'var(--status-safe)' },
    { value: 'UNKNOWN', color: 'var(--text-muted)' },
];
const TYPE_PILLS = ['IP', 'DOMAIN', 'HASH', 'URL'];

// ── main component ───────────────────────────────────────────────────────────
export default function BatchResultsPanel({ targets, lang, onReset }) {
    const { t } = useTranslation();

    const [phase, setPhase] = useState('estimating'); // estimating | preflight | running | done | error
    const [estimate, setEstimate] = useState(null);
    const [results, setResults] = useState([]);
    const [progress, setProgress] = useState({ done: 0, total: targets.length });
    const [errMsg, setErrMsg] = useState(null);
    const [flyout, setFlyout] = useState(null); // { target, data } | null
    const [flyoutLoading, setFlyoutLoading] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [notifyEmail, setNotifyEmail] = useState(false);
    const [smtpOk, setSmtpOk] = useState(false);

    // Filter state
    const [filterVerdicts, setFilterVerdicts] = useState([]);
    const [filterTypes, setFilterTypes] = useState([]);
    const [filterMisses, setFilterMisses] = useState(false);

    const esRef = useRef(null);

    const hasFilters = filterVerdicts.length > 0 || filterTypes.length > 0 || filterMisses;

    // Apply filters
    const filteredResults = useMemo(() => {
        if (!hasFilters) return results;
        return results.filter((row) => {
            if (filterVerdicts.length > 0 && !filterVerdicts.includes((row.verdict || '').toUpperCase())) return false;
            if (filterTypes.length > 0 && !filterTypes.includes((row.target_type || '').toUpperCase())) return false;
            if (filterMisses && row.from_cache) return false;
            return true;
        });
    }, [results, filterVerdicts, filterTypes, filterMisses, hasFilters]);

    const toggleFilter = useCallback((arr, setArr, value) => {
        setArr((prev) =>
            prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
        );
    }, []);

    const clearFilters = useCallback(() => {
        setFilterVerdicts([]);
        setFilterTypes([]);
        setFilterMisses(false);
    }, []);

    // ── check SMTP on mount ─────────────────────────────────────────────────
    useEffect(() => {
        fetch(`${API_URL}/api/watchlist/smtp-status`, { credentials: 'include' })
            .then(r => r.json())
            .then(d => setSmtpOk(d.smtp_configured))
            .catch(() => {});
    }, []);

    // ── estimate on mount ────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${API_URL}/api/analyze/batch/estimate`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targets, lang }),
                });
                if (!res.ok) throw new Error(t('batch.errors.estimate_failed'));
                const data = await res.json();
                if (cancelled) return;
                setEstimate(data);
                // Skip preflight if everything is cached
                if (data.external_calls === 0) {
                    startBatch();
                } else {
                    setPhase('preflight');
                }
            } catch (e) {
                if (!cancelled) { setErrMsg(e.message); setPhase('error'); }
            }
        })();
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── start the batch job + open SSE ──────────────────────────────────────
    const startBatch = useCallback(async () => {
        setPhase('running');
        try {
            const res = await fetch(`${API_URL}/api/analyze/batch`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targets, lang, notify_email: notifyEmail }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail || t('batch.errors.submit_failed'));
            }
            const { job_id, total } = await res.json();
            setProgress({ done: 0, total });
            openSSE(job_id);
        } catch (e) {
            setErrMsg(e.message);
            setPhase('error');
        }
    }, [targets, lang, notifyEmail]); // eslint-disable-line react-hooks/exhaustive-deps

    const pollFallback = useCallback(async (job_id) => {
        try {
            const res = await fetch(`${API_URL}/api/analyze/batch/${job_id}`, {
                credentials: 'include',
            });
            if (!res.ok) throw new Error();
            const job = await res.json();
            if (job.results) setResults(job.results);
            setProgress(job.progress);
            if (job.status === 'done') setPhase('done');
            else if (job.status === 'failed') {
                setErrMsg(job.error || t('batch.errors.worker_error'));
                setPhase('error');
            }
        } catch {
            setErrMsg(t('batch.errors.sse_lost'));
            setPhase('error');
        }
    }, [t]);

    // ── SSE listener ─────────────────────────────────────────────────────────
    const openSSE = useCallback((job_id) => {
        if (esRef.current) esRef.current.close();
        const es = new EventSource(
            `${API_URL}/api/analyze/batch/${job_id}/stream`,
            { withCredentials: true }
        );
        esRef.current = es;

        es.onmessage = (e) => {
            try {
                const event = JSON.parse(e.data);
                if (event.type === 'progress') {
                    const { type: _t, done, total, ...row } = event;
                    setResults((prev) => [...prev, row]);
                    setProgress({ done, total });
                } else if (event.type === 'done') {
                    es.close();
                    setPhase('done');
                } else if (event.type === 'error') {
                    es.close();
                    setErrMsg(event.message || t('batch.errors.worker_error'));
                    setPhase('error');
                }
            } catch {
                // ignore malformed heartbeat lines
            }
        };

        es.onerror = () => {
            es.close();
            // Attempt a single fallback poll
            pollFallback(job_id);
        };
    }, [pollFallback, t]);

    // ── cleanup SSE on unmount ───────────────────────────────────────────────
    useEffect(() => () => esRef.current?.close(), []);

    // ── drill-down: fetch full result from cache ──────────────────────────────
    const openDrilldown = useCallback(async (row) => {
        setFlyoutLoading(true);
        setFlyout({ target: row.target, data: null });
        try {
            const res = await fetch(
                `${API_URL}/api/analyze?target=${encodeURIComponent(row.target)}&lang=${lang}`,
                { credentials: 'include' }
            );
            if (!res.ok) throw new Error();
            const data = await res.json();
            setFlyout({ target: row.target, data });
        } catch {
            setFlyout(null);
        } finally {
            setFlyoutLoading(false);
        }
    }, [lang]);

    // ── load historical job ──────────────────────────────────────────────────
    const loadHistoricalJob = useCallback(async (job) => {
        setShowHistory(false);
        if (job.results) {
            setResults(job.results);
            setProgress(job.progress || { done: job.results.length, total: job.results.length });
            setPhase('done');
        }
    }, []);

    // ── render ────────────────────────────────────────────────────────────────
    const isDone = phase === 'done';
    const displayResults = hasFilters ? filteredResults : results;

    return (
        <>
            {phase === 'preflight' && estimate && (
                <PreflightModal
                    estimate={estimate}
                    onConfirm={startBatch}
                    onCancel={onReset}
                    t={t}
                    notifyEmail={notifyEmail}
                    onNotifyChange={setNotifyEmail}
                    smtpOk={smtpOk}
                />
            )}

            <div className="glass-panel fade-in" style={{ marginTop: '2rem', overflow: 'hidden' }}>
                {/* header */}
                <div className="data-table-toolbar" style={{ flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                        <Layers size={18} color="var(--primary)" />
                        {t('batch.results.title')}
                    </h3>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {/* progress */}
                        {phase === 'running' || (isDone && results.length > 0) ? (
                            <span
                                style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}
                                aria-live="polite"
                                aria-atomic="true"
                            >
                                {t('batch.results.progress', {
                                    done: progress.done,
                                    total: progress.total,
                                })}
                            </span>
                        ) : null}

                        {/* history button */}
                        {isDone && (
                            <Button variant="secondary" size="sm" onClick={() => setShowHistory(true)} title={t('batch.history_title')} iconLeading={<Clock size={14} />} />
                        )}

                        {/* export buttons — only when done */}
                        {isDone && results.length > 0 && (
                            <>
                                <Button variant="secondary" size="sm" onClick={() => exportCSV(hasFilters ? filteredResults : results)} iconLeading={<Download size={14} />}>
                                    CSV
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => exportJSON(hasFilters ? filteredResults : results)} iconLeading={<Download size={14} />}>
                                    JSON
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* filter bar — visible when done with results */}
                {isDone && results.length > 0 && (
                    <div
                        style={{
                            padding: '0.65rem 1.5rem',
                            borderBottom: '1px solid var(--glass-border)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            flexWrap: 'wrap',
                            background: 'var(--glass-bg)',
                        }}
                    >
                        <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

                        {/* Verdict pills */}
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.15rem' }}>
                                {t('batch.filter_verdict')}
                            </span>
                            {VERDICT_PILLS.map(({ value, color }) => (
                                <FilterPill
                                    key={value}
                                    label={value}
                                    color={color}
                                    active={filterVerdicts.includes(value)}
                                    onClick={() => toggleFilter(filterVerdicts, setFilterVerdicts, value)}
                                />
                            ))}
                        </div>

                        <span style={{ color: 'var(--glass-border)' }}>|</span>

                        {/* Type pills */}
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.15rem' }}>
                                {t('batch.filter_type')}
                            </span>
                            {TYPE_PILLS.map((tp) => (
                                <FilterPill
                                    key={tp}
                                    label={tp}
                                    active={filterTypes.includes(tp)}
                                    onClick={() => toggleFilter(filterTypes, setFilterTypes, tp)}
                                />
                            ))}
                        </div>

                        <span style={{ color: 'var(--glass-border)' }}>|</span>

                        {/* Misses toggle */}
                        <FilterPill
                            label={t('batch.filter_misses')}
                            active={filterMisses}
                            onClick={() => setFilterMisses((p) => !p)}
                        />

                        {hasFilters && (
                            <button
                                onClick={clearFilters}
                                style={{
                                    fontSize: '0.72rem',
                                    color: 'var(--primary)',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    padding: 0,
                                }}
                            >
                                {t('batch.filter_clear')}
                            </button>
                        )}

                        {hasFilters && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                {filteredResults.length}/{results.length}
                            </span>
                        )}
                    </div>
                )}

                {/* progress bar */}
                {(phase === 'running' || phase === 'estimating') && (
                    <div
                        style={{
                            height: '3px',
                            background: 'var(--glass-border)',
                        }}
                    >
                        <div
                            style={{
                                height: '100%',
                                width: `${progress.total > 0
                                    ? Math.round((progress.done / progress.total) * 100)
                                    : 0}%`,
                                background: 'linear-gradient(90deg, var(--primary), #2563eb)',
                                transition: 'width 0.4s ease',
                            }}
                            role="progressbar"
                            aria-valuenow={progress.done}
                            aria-valuemin={0}
                            aria-valuemax={progress.total}
                        />
                    </div>
                )}

                {/* estimating spinner */}
                {phase === 'estimating' && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        <Activity size={20} className="spin" color="var(--primary)" style={{ marginBottom: '0.5rem' }} />
                        <p style={{ margin: 0 }}>{t('batch.estimating')}</p>
                    </div>
                )}

                {/* error state */}
                {phase === 'error' && (
                    <div style={{ padding: '1.5rem', color: 'var(--status-risk)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <XCircle size={18} /> {errMsg || t('batch.errors.generic')}
                    </div>
                )}

                {/* results table */}
                {displayResults.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <caption className="sr-only">{t('batch.results.title')}</caption>
                            <thead>
                                <tr>
                                    <th scope="col">{t('batch.results.col_target')}</th>
                                    <th scope="col">{t('batch.results.col_type')}</th>
                                    <th scope="col">{t('batch.results.col_verdict')}</th>
                                    <th scope="col">{t('batch.results.col_risk')}</th>
                                    <th scope="col">{t('batch.results.col_cache')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayResults.map((row, idx) => (
                                    <tr
                                        key={idx}
                                        onClick={() => openDrilldown(row)}
                                        title={t('batch.results.row_hint')}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <td>
                                            <span
                                                className="mono"
                                                style={{
                                                    color: 'var(--primary)',
                                                    fontSize: '0.88rem',
                                                    maxWidth: '220px',
                                                    display: 'inline-block',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    verticalAlign: 'middle',
                                                }}
                                                title={row.target}
                                            >
                                                {row.target}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                style={{
                                                    textTransform: 'uppercase',
                                                    fontSize: '0.72rem',
                                                    letterSpacing: '0.06em',
                                                    color: 'var(--text-muted)',
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {row.target_type}
                                            </span>
                                        </td>
                                        <td>
                                            <Badge variant={
                                                { 'SAFE': 'success', 'SUSPICIOUS': 'warning', 'HIGH RISK': 'danger', 'ERROR': 'neutral' }[(row.verdict || '').toUpperCase()] || 'neutral'
                                            }>
                                                <VerdictIcon verdict={row.verdict} size={12} />
                                                {row.verdict}
                                            </Badge>
                                        </td>
                                        <td>
                                            <span style={{ color: verdictColor(row.verdict), fontWeight: 600 }}>
                                                {row.risk_score}
                                            </span>
                                        </td>
                                        <td>
                                            {row.from_cache ? (
                                                <span
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '0.3rem',
                                                        color: 'var(--status-safe)',
                                                        fontSize: '0.78rem',
                                                    }}
                                                >
                                                    <Database size={12} /> {t('batch.results.cached')}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                                    {t('batch.results.live')}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}

                                {/* pending rows while running */}
                                {phase === 'running' && !hasFilters &&
                                    Array.from({
                                        length: progress.total - results.length,
                                    }).map((_, i) => (
                                        <tr key={`pending-${i}`} style={{ opacity: 0.35 }}>
                                            <td colSpan={5} style={{ padding: '0.7rem 1rem' }}>
                                                <div
                                                    style={{
                                                        height: '14px',
                                                        borderRadius: '4px',
                                                        background: 'var(--glass-border)',
                                                        animation: 'pulse 1.5s infinite',
                                                    }}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* no filter matches */}
                {isDone && hasFilters && filteredResults.length === 0 && results.length > 0 && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        <Filter size={18} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
                        <p style={{ margin: 0 }}>{t('batch.filter_clear')}</p>
                    </div>
                )}

                {/* empty running state (first item still loading) */}
                {phase === 'running' && results.length === 0 && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        <Activity size={18} className="spin" color="var(--primary)" />
                        <p style={{ margin: '0.5rem 0 0' }}>{t('batch.running')}</p>
                    </div>
                )}
            </div>

            {/* drill-down flyout */}
            <FlyoutPanel
                open={!!flyout}
                onClose={() => setFlyout(null)}
                title={flyout?.target || ''}
                titleIcon={<Layers size={16} style={{ marginRight: '0.35rem', color: 'var(--primary)' }} />}
            >
                {flyoutLoading && (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Activity size={24} className="spin" color="var(--primary)" />
                    </div>
                )}

                {!flyoutLoading && flyout?.data && (() => {
                    const d = flyout.data;
                    const successEntries = Object.entries(d.results || {}).filter(
                        ([, v]) => !v._meta_error
                    );
                    const correctedSummary = {
                        ...d.summary,
                        total_sources: successEntries.length,
                    };
                    return (
                        <>
                            <VerdictPanel
                                target={d.target}
                                type={d.type}
                                summary={correctedSummary}
                            />
                            <div className="grid-dashboard" style={{ marginTop: '1.5rem' }}>
                                {successEntries.map(([svc, svcData]) => (
                                    <ServiceCard
                                        key={svc}
                                        name={svc}
                                        data={svcData}
                                        lang={lang}
                                        target={{ value: d.target, type: d.type }}
                                    />
                                ))}
                            </div>
                            {d.analysis_reports && (
                                <div
                                    className="glass-panel"
                                    style={{ marginTop: '1.5rem', padding: '1.5rem', borderTop: '4px solid var(--accent-border)' }}
                                >
                                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.95rem' }}>
                                        <ReactMarkdown>{d.analysis_reports[lang]}</ReactMarkdown>
                                    </div>
                                </div>
                            )}
                        </>
                    );
                })()}
            </FlyoutPanel>

            {/* batch history flyout */}
            <BatchHistoryFlyout
                open={showHistory}
                onClose={() => setShowHistory(false)}
                onLoad={loadHistoricalJob}
            />
        </>
    );
}

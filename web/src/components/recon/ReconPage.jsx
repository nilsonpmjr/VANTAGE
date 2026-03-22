import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Radar, Play, RotateCcw, Download, History, Printer, CalendarClock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import ModuleSidebar from './ModuleSidebar';
import ModuleResultCard from './ModuleResultCard';
import ReconHistory from './ReconHistory';
import AttackSurface from './AttackSurface';
import ReconReportView from './ReconReportView';
import Button from '../ui/Button';

function exportAllJSON(jobId, target, results) {
    const payload = {
        meta: { scan_id: jobId, target, generated_at: new Date().toISOString() },
        modules: results,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recon_${target}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}


export default function ReconPage({ initialTarget, initialShowHistory }) {
    const { t } = useTranslation();

    const [target, setTarget] = useState(initialTarget || '');
    const [modules, setModules] = useState([]);    // available modules from server
    const [selected, setSelected] = useState([]);  // module names toggled ON
    const [scanning, setScanning] = useState(false);
    const [jobId, setJobId] = useState(null);
    const [results, setResults] = useState({});    // module name → {status, data, duration_ms, from_cache}
    const [progress, setProgress] = useState({});  // module name → {status}
    const [activeModule, setActiveModule] = useState(null);
    const [activeView, setActiveView] = useState('idle'); // 'idle' | 'module' | 'surface'
    const [error, setError] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);
    const [scheduleAt, setScheduleAt] = useState('');
    const [scheduledItems, setScheduledItems] = useState([]);
    const [scheduling, setScheduling] = useState(false);

    const eventSourceRef = useRef(null);

    // Sync when initialTarget changes (e.g. navigated from Dashboard)
    useEffect(() => {
        if (initialTarget) {
            setTarget(initialTarget);
            if (initialShowHistory) setShowHistory(true);
        }
    }, [initialTarget, initialShowHistory]);

    // Load available modules on mount
    useEffect(() => {
        fetch(`${API_URL}/api/recon/modules`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                setModules(data.modules || []);
                setSelected((data.modules || []).map(m => m.name));
            })
            .catch(() => {/* modules stay empty — handled gracefully */});
    }, []);

    const toggleModule = useCallback((name) => {
        setSelected(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    }, []);

    // Fetch user's scheduled scans
    const fetchScheduled = useCallback(() => {
        fetch(`${API_URL}/api/recon/scheduled/mine`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => setScheduledItems(data.items || []))
            .catch(() => {});
    }, []);

    useEffect(() => { fetchScheduled(); }, [fetchScheduled]);

    const handleSchedule = async () => {
        if (!target.trim() || !scheduleAt || scheduling) return;
        setScheduling(true);
        try {
            const res = await fetch(`${API_URL}/api/recon/scheduled`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target: target.trim(),
                    modules: selected,
                    run_at: new Date(scheduleAt).toISOString(),
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                setError(err.detail || t('recon.error_generic'));
                return;
            }
            setShowSchedule(false);
            setScheduleAt('');
            fetchScheduled();
        } catch {
            setError(t('recon.error_generic'));
        } finally {
            setScheduling(false);
        }
    };

    const handleCancelScheduled = async (id) => {
        try {
            await fetch(`${API_URL}/api/recon/scheduled/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            setScheduledItems(prev => prev.filter(i => i.id !== id));
        } catch { /* ignore */ }
    };

    const handleScan = async () => {
        if (!target.trim() || selected.length === 0 || scanning) return;
        setError(null);
        setResults({});
        setProgress({});
        setJobId(null);
        setActiveView('idle');
        setScanning(true);

        // Mark selected as pending
        const pendingProgress = {};
        selected.forEach(name => { pendingProgress[name] = { status: 'pending' }; });
        setProgress(pendingProgress);

        try {
            const res = await fetch(`${API_URL}/api/recon/scan`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: target.trim(), modules: selected }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Scan request failed');
            }

            const { job_id, modules: runningModules } = await res.json();
            setJobId(job_id);

            // Update progress to running for first module
            const running = {};
            runningModules.forEach(m => { running[m] = { status: 'pending' }; });
            setProgress(running);

            // Open SSE stream
            const es = new EventSource(`${API_URL}/api/recon/stream/${job_id}`, { withCredentials: true });
            eventSourceRef.current = es;

            es.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'module_done') {
                        const { module: modName, status, data: modData, duration_ms, from_cache } = data;
                        setProgress(prev => ({ ...prev, [modName]: { status } }));
                        setResults(prev => ({ ...prev, [modName]: { status, data: modData, duration_ms, from_cache } }));
                        // Auto-select first completed module
                        setActiveModule(prev => prev || modName);
                        setActiveView(prev => prev === 'idle' ? 'module' : prev);
                    }

                    if (data.type === 'done' || data.type === 'error') {
                        es.close();
                        setScanning(false);
                        if (data.type === 'error') {
                            setError(data.message || t('recon.error_generic'));
                        }
                    }
                } catch {/* ignore parse errors */}
            };

            es.onerror = () => {
                es.close();
                setScanning(false);
            };

        } catch (err) {
            setError(err.message);
            setScanning(false);
        }
    };

    const handleReset = () => {
        eventSourceRef.current?.close();
        setTarget('');
        setResults({});
        setProgress({});
        setJobId(null);
        setScanning(false);
        setActiveView('idle');
        setActiveModule(null);
        setError(null);
    };

    const doneCount = Object.values(progress).filter(p => p.status === 'done' || p.status === 'error').length;
    const attackSurfaceReady = doneCount >= 2;
    const hasResults = Object.keys(results).length > 0;

    const activeModuleMeta = modules.find(m => m.name === activeModule);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, overflow: 'hidden' }}>
            {/* Header — workbench toolbar */}
            <div className="v-zone-toolbar">
                <Radar size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
                <span className="v-page-title" style={{ fontSize: '0.95rem' }}>
                    {t('recon.title')}
                </span>

                <div style={{ flex: 1, maxWidth: '500px' }}>
                    <input
                        type="text"
                        className="form-input"
                        placeholder={t('recon.target_placeholder')}
                        value={target}
                        onChange={e => setTarget(e.target.value)}
                        disabled={scanning}
                        onKeyDown={e => e.key === 'Enter' && handleScan()}
                        autoComplete="off"
                        spellCheck="false"
                        style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', height: 'auto' }}
                    />
                </div>

                <div className="v-page-actions">
                    {target.trim() && (
                        <Button variant="secondary" size="sm" onClick={() => setShowHistory(true)} title={t('recon.history_title', 'Histórico')} iconLeading={<History size={14} />} />
                    )}
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleScan}
                        disabled={!target.trim() || selected.length === 0 || scanning}
                        loading={scanning}
                        iconLeading={scanning ? undefined : <Play size={14} />}
                    >
                        {scanning ? t('recon.scanning') : t('recon.scan')}
                    </Button>
                    {!scanning && target.trim() && selected.length > 0 && (
                        <Button variant="secondary" size="sm" onClick={() => setShowSchedule(p => !p)} title={t('recon.schedule')} iconLeading={<CalendarClock size={14} />} />
                    )}

                    {hasResults && !scanning && (
                        <>
                            <Button variant="secondary" size="sm" onClick={() => exportAllJSON(jobId, target, results)} title={t('recon.export_all')} iconLeading={<Download size={14} />}>
                                JSON
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => window.print()} title={t('recon.print', 'Imprimir')} iconLeading={<Printer size={14} />} />
                            <Button variant="secondary" size="sm" onClick={handleReset} title={t('recon.new_scan')} iconLeading={<RotateCcw size={14} />} />
                        </>
                    )}
                </div>
            </div>

            {/* Schedule picker */}
            {showSchedule && (
                <div className="v-zone-filters" style={{ borderRadius: 0, marginBottom: 0, border: 'none', borderBottom: '1px solid var(--ds-border)' }}>
                    <CalendarClock size={14} color="var(--primary)" />
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {t('recon.schedule')}
                    </span>
                    <input
                        type="datetime-local"
                        className="form-input"
                        value={scheduleAt}
                        onChange={e => setScheduleAt(e.target.value)}
                        min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
                        style={{ width: 'auto', padding: '0.4rem 0.6rem', fontSize: '0.82rem' }}
                    />
                    <Button variant="secondary" size="sm" onClick={handleSchedule} disabled={!scheduleAt || scheduling}>
                        {t('recon.schedule_confirm')}
                    </Button>
                </div>
            )}

            {/* Scheduled scan badges */}
            {scheduledItems.length > 0 && (
                <div style={{
                    padding: '0.5rem 1.5rem',
                    borderBottom: '1px solid var(--glass-border)',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    flexWrap: 'wrap', flexShrink: 0,
                }}>
                    <CalendarClock size={12} color="var(--text-muted)" />
                    {scheduledItems.map(item => (
                        <span
                            key={item.id}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                background: 'rgba(56,189,248,0.08)',
                                border: '1px solid var(--primary)',
                                color: 'var(--primary)',
                                borderRadius: '1rem',
                                padding: '0.15rem 0.55rem',
                                fontSize: '0.72rem', fontWeight: 600,
                            }}
                        >
                            <span className="mono" style={{ fontSize: '0.7rem' }}>{item.target}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                                {new Date(item.run_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <button
                                onClick={() => handleCancelScheduled(item.id)}
                                title={t('recon.schedule_cancel')}
                                style={{
                                    background: 'transparent', border: 'none',
                                    color: 'var(--text-muted)', cursor: 'pointer',
                                    padding: '0', display: 'flex', lineHeight: 1,
                                }}
                            >
                                <X size={10} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* Body: sidebar + content */}
            {showHistory && target.trim() && (
            <ReconHistory
                key={target.trim()}
                target={target.trim()}
                onClose={() => setShowHistory(false)}
                onLoad={(job) => {
                    setShowHistory(false);
                    // Load results from historical job via polling endpoint
                    fetch(`${API_URL}/api/recon/${job.job_id}`, { credentials: 'include' })
                        .then(r => r.json())
                        .then(data => {
                            if (data.results) {
                                const newResults = {};
                                const newProgress = {};
                                Object.entries(data.results).forEach(([name, entry]) => {
                                    newResults[name] = entry;
                                    newProgress[name] = { status: entry.status };
                                });
                                setResults(newResults);
                                setProgress(newProgress);
                                setJobId(job.job_id);
                                const firstModule = Object.keys(newResults)[0];
                                setActiveModule(firstModule || null);
                                setActiveView(firstModule ? 'module' : 'idle');
                            }
                        })
                        .catch(() => {/* silently ignore */});
                }}
            />
        )}

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {modules.length > 0 && (
                    <ModuleSidebar
                        modules={modules}
                        selectedModules={selected}
                        onToggle={toggleModule}
                        progress={progress}
                        scanning={scanning}
                        activeModule={activeModule}
                        onSelectModule={(name) => { setActiveModule(name); setActiveView('module'); }}
                        attackSurfaceReady={attackSurfaceReady}
                        onSelectAttackSurface={() => setActiveView('surface')}
                        activeView={activeView}
                    />
                )}

                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
                    {/* Error banner */}
                    {error && (
                        <div className="alert-banner error">{error}</div>
                    )}

                    {/* Idle empty state */}
                    {activeView === 'idle' && !scanning && (
                        <div className="v-empty-state" style={{ height: '100%' }}>
                            <Radar size={48} className="v-empty-state__icon" />
                            <p className="v-empty-state__text">{t('recon.empty_state')}</p>
                        </div>
                    )}

                    {/* Scanning — show progress for all selected modules */}
                    {scanning && activeView === 'idle' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {selected.map(name => {
                                const modMeta = modules.find(m => m.name === name);
                                const moduleResult = results[name];
                                const p = progress[name];
                                const statusForCard = p?.status === 'done' || p?.status === 'error' ? p.status : 'running';
                                return (
                                    <ModuleResultCard
                                        key={name}
                                        module={modMeta || { name, display_name: name }}
                                        result={moduleResult ? { ...moduleResult, status: statusForCard } : null}
                                        target={target}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {/* Module result view */}
                    {activeView === 'module' && activeModule && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {/* Show active module card expanded */}
                            {activeModuleMeta && results[activeModule] && (
                                <ModuleResultCard
                                    module={activeModuleMeta}
                                    result={{ ...results[activeModule], status: progress[activeModule]?.status || 'done' }}
                                    target={target}
                                />
                            )}
                            {/* Show other completed modules as collapsed summary */}
                            {Object.entries(results)
                                .filter(([name]) => name !== activeModule)
                                .map(([name, result]) => {
                                    const modMeta = modules.find(m => m.name === name);
                                    return (
                                        <div key={name} style={{ cursor: 'pointer' }} onClick={() => setActiveModule(name)}>
                                            <ModuleResultCard
                                                module={modMeta || { name, display_name: name }}
                                                result={{ ...result, status: progress[name]?.status || 'done' }}
                                                target={target}
                                            />
                                        </div>
                                    );
                                })}
                        </div>
                    )}

                    {/* Attack Surface view */}
                    {activeView === 'surface' && (
                        <AttackSurface results={results} />
                    )}
                </div>
            </div>

            {/* Hidden print report — shown only via @media print */}
            {hasResults && (
                <ReconReportView
                    target={target}
                    jobId={jobId}
                    results={results}
                    modules={modules}
                    scanDate={new Date().toLocaleString('pt-BR')}
                />
            )}
        </div>
    );
}

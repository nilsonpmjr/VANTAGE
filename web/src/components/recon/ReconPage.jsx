import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Radar, Play, RotateCcw, Download, History, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import ModuleSidebar from './ModuleSidebar';
import ModuleResultCard from './ModuleResultCard';
import ReconHistory from './ReconHistory';
import AttackSurface from './AttackSurface';
import ReconReportView from './ReconReportView';

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


export default function ReconPage({ initialTarget }) {
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

    const eventSourceRef = useRef(null);

    // Sync when initialTarget changes (e.g. navigated from Dashboard)
    useEffect(() => {
        if (initialTarget) setTarget(initialTarget);
    }, [initialTarget]);

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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--glass-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                flexShrink: 0,
            }}>
                <Radar size={20} color="var(--primary)" style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem', letterSpacing: '0.02em' }}>
                    {t('recon.title')}
                </span>

                <div style={{ flex: 1, maxWidth: '500px', marginLeft: '0.5rem' }}>
                    <input
                        type="text"
                        className="search-input"
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

                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    {target.trim() && (
                        <button
                            onClick={() => setShowHistory(true)}
                            title={t('recon.history_title', 'Histórico')}
                            style={{
                                display: 'flex', alignItems: 'center',
                                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)',
                                padding: '0.5rem 0.75rem', cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                        >
                            <History size={14} />
                        </button>
                    )}
                    <button
                        onClick={handleScan}
                        disabled={!target.trim() || selected.length === 0 || scanning}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            background: 'var(--accent-glow)', border: '1px solid var(--accent-border)',
                            color: 'var(--primary)', borderRadius: 'var(--radius-sm)',
                            padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600,
                            fontSize: '0.85rem', transition: 'all 0.2s',
                            opacity: (!target.trim() || selected.length === 0 || scanning) ? 0.5 : 1,
                        }}
                    >
                        <Play size={14} />
                        {scanning ? t('recon.scanning') : t('recon.scan')}
                    </button>

                    {hasResults && !scanning && (
                        <>
                            <button
                                onClick={() => exportAllJSON(jobId, target, results)}
                                title={t('recon.export_all')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                    color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)',
                                    padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <Download size={14} />
                                JSON
                            </button>
                            <button
                                onClick={() => window.print()}
                                title={t('recon.print', 'Imprimir')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                    color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)',
                                    padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <Printer size={14} />
                            </button>
                            <button
                                onClick={handleReset}
                                title={t('recon.new_scan')}
                                style={{
                                    display: 'flex', alignItems: 'center',
                                    background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                    color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)',
                                    padding: '0.5rem 0.75rem', cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <RotateCcw size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Body: sidebar + content */}
            {showHistory && target.trim() && (
            <ReconHistory
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
                        <div style={{
                            background: 'var(--status-risk-bg)', border: '1px solid var(--status-risk)',
                            color: 'var(--status-risk)', borderRadius: 'var(--radius-md)',
                            padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem',
                        }}>
                            {error}
                        </div>
                    )}

                    {/* Idle empty state */}
                    {activeView === 'idle' && !scanning && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: 'var(--text-muted)' }}>
                            <Radar size={48} style={{ opacity: 0.2 }} />
                            <p style={{ margin: 0, fontSize: '0.95rem' }}>{t('recon.empty_state')}</p>
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

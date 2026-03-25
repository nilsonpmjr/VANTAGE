/**
 * ReconReportView — hidden div rendered inside ReconPage.
 * Visible only in @media print via CSS class `.recon-print-view`.
 *
 * Contains:
 *  - Report header (target, date, modules run)
 *  - Risk indicator summary
 *  - All module results in detail mode
 *  - Attack Surface correlation
 */
import React from 'react';
import AttackSurface from './AttackSurface';

function DetailEntry({ label, value, mono }) {
    if (value === null || value === undefined || value === '') return null;
    const display = Array.isArray(value) ? value.join(', ') : String(value);
    if (!display) return null;
    return (
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem', marginBottom: '0.2rem' }}>
            <span style={{ color: '#64748b', minWidth: '110px', flexShrink: 0 }}>{label}</span>
            <span style={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>{display.slice(0, 400)}</span>
        </div>
    );
}

function ModuleSection({ module, result }) {
    if (!result?.data) return null;
    const { data, duration_ms, from_cache } = result;

    const titleStyle = {
        fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: '#38bdf8', margin: '0 0 0.5rem',
        borderBottom: '1px solid #e2e8f0', paddingBottom: '0.25rem',
    };

    const renderData = () => {
        if (data.error) return <p style={{ color: 'var(--alert-error)' }}>{data.error}</p>;
        if (data.skipped) return <p style={{ color: '#94a3b8' }}>{data.skipped}</p>;

        // DNS
        if (module === 'dns') {
            return Object.entries(data).map(([type, records]) => {
                if (!Array.isArray(records) || !records.length) return null;
                return (
                    <DetailEntry key={type} label={type} value={records} mono />
                );
            });
        }

        // Ports
        if (module === 'ports' && data.ports) {
            return (
                <div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['Porta', 'Proto', 'Serviço', 'Produto'].map(h => (
                                    <th key={h} style={{ padding: '0.3rem 0.5rem', textAlign: 'left', color: '#64748b', fontWeight: 500 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.ports.map((p, i) => (
                                <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '0.3rem 0.5rem', fontFamily: 'monospace' }}>{p.port}</td>
                                    <td style={{ padding: '0.3rem 0.5rem' }}>{p.protocol}</td>
                                    <td style={{ padding: '0.3rem 0.5rem' }}>{p.service || '—'}</td>
                                    <td style={{ padding: '0.3rem 0.5rem', color: '#64748b' }}>{[p.product, p.version].filter(Boolean).join(' ') || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {data.os_guess && <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: '#64748b' }}>OS: {data.os_guess}</p>}
                </div>
            );
        }

        // Subdomains
        if (module === 'subdomains' && data.subdomains) {
            return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    {data.subdomains.slice(0, 200).map((s, i) => (
                        <code key={i} style={{ fontSize: '0.72rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '3px', padding: '0.1rem 0.3rem' }}>{s}</code>
                    ))}
                </div>
            );
        }

        // Passive
        if (module === 'passive') {
            return (
                <div>
                    {data.emails?.length > 0 && <DetailEntry label="Emails" value={data.emails} />}
                    {data.subdomains?.length > 0 && <DetailEntry label="Subdomínios" value={data.subdomains.join(', ')} />}
                    {data.ips?.length > 0 && <DetailEntry label="IPs" value={data.ips} mono />}
                </div>
            );
        }

        // Traceroute
        if (module === 'traceroute' && data.hops) {
            return (
                <div>
                    {data.hops.map((h, i) => (
                        <div key={i} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.78rem', marginBottom: '0.1rem' }}>
                            <span style={{ color: '#94a3b8', minWidth: '20px', textAlign: 'right' }}>{h.hop}</span>
                            <code>{h.ip}</code>
                            {h.rtt_ms != null && <span style={{ color: '#94a3b8' }}>{h.rtt_ms} ms</span>}
                        </div>
                    ))}
                </div>
            );
        }

        // Generic key-value
        return Object.entries(data).map(([k, v]) => {
            if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return null;
            return <DetailEntry key={k} label={k.replace(/_/g, ' ')} value={v} />;
        });
    };

    return (
        <div style={{ breakInside: 'avoid', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <p style={titleStyle}>{module.toUpperCase()}</p>
                {from_cache && <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>cache</span>}
                {duration_ms > 0 && <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{duration_ms < 1000 ? `${duration_ms}ms` : `${(duration_ms / 1000).toFixed(1)}s`}</span>}
            </div>
            {renderData()}
        </div>
    );
}

export default function ReconReportView({ target, jobId, results, modules, scanDate }) {
    if (!results || Object.keys(results).length === 0) return null;

    return (
        <div className="recon-print-view" style={{ display: 'none' }}>
            {/* Cover */}
            <div style={{ marginBottom: '1.5rem', borderBottom: '2px solid #38bdf8', paddingBottom: '1rem' }}>
                <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem', color: '#0f172a' }}>Recon Report</h1>
                <div style={{ display: 'flex', gap: '2rem', fontSize: '0.85rem', color: '#64748b' }}>
                    <span><strong>Alvo:</strong> <code style={{ color: '#0f172a' }}>{target}</code></span>
                    <span><strong>Data:</strong> {scanDate || new Date().toLocaleString('pt-BR')}</span>
                    {jobId && <span><strong>Job:</strong> <code style={{ fontSize: '0.75rem' }}>{jobId}</code></span>}
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                    <strong>Módulos:</strong> {modules?.map(m => m.name).filter(n => results[n]).join(', ')}
                </div>
            </div>

            {/* Modules */}
            <h2 style={{ fontSize: '1rem', color: '#0f172a', margin: '0 0 0.75rem' }}>Resultados por Módulo</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                {Object.entries(results).map(([name, result]) => (
                    <ModuleSection key={name} module={name} result={result} />
                ))}
            </div>

            {/* Attack Surface */}
            <h2 style={{ fontSize: '1rem', color: '#0f172a', margin: '0 0 0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                Superfície de Ataque
            </h2>
            <AttackSurface results={results} />
        </div>
    );
}

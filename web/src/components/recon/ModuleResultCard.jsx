import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function exportJSON(data, target, module) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recon_${target}_${module}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function SummaryView({ module, data }) {
    if (!data || data.error) return null;

    if (module === 'dns') {
        const types = Object.keys(data).filter(k => Array.isArray(data[k]) && data[k].length);
        const total = types.reduce((acc, k) => acc + data[k].length, 0);
        return (
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {total} {total === 1 ? 'registro' : 'registros'} · {types.join(', ')}
            </p>
        );
    }

    if (module === 'whois') {
        return (
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {data.registrar || '—'} · {data.registrant_country || '—'}
                {data.expiration_date && (
                    <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
                        exp. {data.expiration_date.split('T')[0]}
                    </span>
                )}
            </p>
        );
    }

    if (module === 'ssl') {
        const expired = data.is_expired;
        const daysLeft = data.days_until_expiry;
        const color = expired ? 'var(--red)' : daysLeft < 30 ? 'var(--yellow)' : 'var(--green)';
        return (
            <p style={{ margin: 0, fontSize: '0.85rem' }}>
                <span style={{ color }}>{data.subject_cn || '—'}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    {expired ? 'EXPIRADO' : `${daysLeft}d restantes`}
                </span>
                {data.is_self_signed && (
                    <span style={{ marginLeft: '0.5rem', color: 'var(--yellow)', fontSize: '0.75rem' }}>
                        self-signed
                    </span>
                )}
            </p>
        );
    }

    if (module === 'web') {
        return (
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {data.status_code && (
                    <span style={{ color: data.status_code < 400 ? 'var(--green)' : 'var(--red)' }}>
                        {data.status_code}
                    </span>
                )}
                {data.title && <span style={{ marginLeft: '0.5rem' }}>{data.title.slice(0, 60)}</span>}
                {data.technologies?.length > 0 && (
                    <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {data.technologies.slice(0, 3).join(', ')}
                    </span>
                )}
            </p>
        );
    }

    if (module === 'ports') {
        const count = data.open_count ?? data.ports?.length ?? 0;
        return (
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {count} {count === 1 ? 'porta aberta' : 'portas abertas'}
                {data.os_guess && (
                    <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>{data.os_guess}</span>
                )}
            </p>
        );
    }

    return null;
}

function DetailView({ module, data }) {
    if (!data) return null;

    if (data.error) {
        return (
            <p style={{ color: 'var(--red)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
                {data.error}
            </p>
        );
    }

    if (data.skipped) {
        return (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
                {data.skipped}
            </p>
        );
    }

    // DNS
    if (module === 'dns') {
        return (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {Object.entries(data).map(([type, records]) => {
                    if (!Array.isArray(records) || !records.length) return null;
                    return (
                        <div key={type}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{type}</span>
                            <div style={{ marginTop: '0.2rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                {records.map((r, i) => (
                                    <code key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--glass-bg)', padding: '0.1rem 0.4rem', borderRadius: '4px', display: 'block' }}>
                                        {r}
                                    </code>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    // Ports
    if (module === 'ports' && data.ports) {
        return (
            <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                        <tr>
                            <th>Porta</th>
                            <th>Protocolo</th>
                            <th>Serviço</th>
                            <th>Produto/Versão</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.ports.map((p, i) => (
                            <tr key={i}>
                                <td><code>{p.port}</code></td>
                                <td>{p.protocol}</td>
                                <td>{p.service || '—'}</td>
                                <td style={{ color: 'var(--text-muted)' }}>
                                    {[p.product, p.version].filter(Boolean).join(' ') || '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {data.os_guess && (
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        OS: {data.os_guess}
                    </p>
                )}
            </div>
        );
    }

    // SSL
    if (module === 'ssl') {
        const rows = [
            ['Subject CN', data.subject_cn],
            ['Issuer CN', data.issuer_cn],
            ['Válido até', data.not_after?.split('T')[0]],
            ['Dias restantes', data.days_until_expiry],
            ['Protocolo', data.protocol],
            ['Cipher', data.cipher],
            ['Self-signed', data.is_self_signed ? 'Sim' : 'Não'],
            ['SANs', data.sans?.join(', ')],
        ].filter(([, v]) => v != null && v !== '');

        return (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {rows.map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: '110px', flexShrink: 0 }}>{label}</span>
                        <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{String(value)}</span>
                    </div>
                ))}
            </div>
        );
    }

    // Web
    if (module === 'web') {
        const secHeaders = data.security_headers || {};
        const presentHeaders = Object.entries(secHeaders).filter(([, v]) => v);
        const missingHeaders = Object.entries(secHeaders).filter(([, v]) => !v);

        return (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                    ['Status', data.status_code],
                    ['URL Final', data.final_url],
                    ['Título', data.title],
                    ['Server', data.server],
                    ['X-Powered-By', data.x_powered_by],
                    ['Tecnologias', data.technologies?.join(', ')],
                ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: '100px', flexShrink: 0 }}>{k}</span>
                        <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{String(v)}</span>
                    </div>
                ))}

                {secHeaders && (
                    <div>
                        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', margin: '0 0 0.4rem' }}>Security Headers</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                            {presentHeaders.map(([h]) => (
                                <span key={h} style={{ fontSize: '0.72rem', background: 'rgba(16,185,129,0.1)', color: 'var(--green)', border: '1px solid var(--green)', borderRadius: '4px', padding: '0.1rem 0.4rem' }}>{h}</span>
                            ))}
                            {missingHeaders.map(([h]) => (
                                <span key={h} style={{ fontSize: '0.72rem', background: 'rgba(239,68,68,0.08)', color: 'var(--red)', border: '1px solid var(--red)', borderRadius: '4px', padding: '0.1rem 0.4rem', opacity: 0.7 }}>✕ {h}</span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // WHOIS — generic key-value
    return (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {Object.entries(data).map(([k, v]) => {
                if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return null;
                const display = Array.isArray(v) ? v.join(', ') : String(v);
                return (
                    <div key={k} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: '120px', flexShrink: 0, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                        <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{display.slice(0, 300)}</span>
                    </div>
                );
            })}
        </div>
    );
}

export default function ModuleResultCard({ module, result, target }) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const { status, data, duration_ms, from_cache } = result || {};
    const isRunning = status === 'running' || !result;
    const isError = data?.error;

    const copyJSON = () => {
        navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div className="glass-panel" style={{
            padding: '1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
        }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        color: isError ? 'var(--red)' : 'var(--text-primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                    }}>
                        {module.display_name || module.name}
                    </span>

                    {isRunning && (
                        <Loader2 size={13} className="spin" style={{ color: 'var(--primary)' }} />
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {from_cache && (
                        <span style={{
                            fontSize: '0.7rem', color: 'var(--text-muted)',
                            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                            borderRadius: '4px', padding: '0.1rem 0.4rem',
                        }}>
                            cache
                        </span>
                    )}
                    {duration_ms > 0 && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {duration_ms < 1000 ? `${duration_ms}ms` : `${(duration_ms / 1000).toFixed(1)}s`}
                        </span>
                    )}

                    {!isRunning && data && (
                        <>
                            <button onClick={copyJSON} title={t('recon.copy_json')} style={{ background: 'transparent', border: 'none', color: copied ? 'var(--green)' : 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}>
                                <Copy size={13} />
                            </button>
                            <button onClick={() => exportJSON(data, target, module.name)} title={t('recon.export_module')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}>
                                <Download size={13} />
                            </button>
                            <button onClick={() => setExpanded(!expanded)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}>
                                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Summary (always visible when done) */}
            {!isRunning && data && !expanded && (
                <SummaryView module={module.name} data={data} />
            )}

            {/* Detail (expanded) */}
            {!isRunning && expanded && (
                <DetailView module={module.name} data={data} />
            )}
        </div>
    );
}

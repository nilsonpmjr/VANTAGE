import React from 'react';
import { Shield, Globe, Network, Lock, Radio, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SEVERITY_COLOR = {
    critical: 'var(--red)',
    high: '#f97316',
    medium: 'var(--yellow)',
    low: 'var(--text-muted)',
    info: 'var(--primary)',
};

const SEVERITY_BG = {
    critical: 'var(--alert-error-bg)',
    high: 'var(--alert-warning-bg)',
    medium: 'var(--ds-warning-soft)',
    low: 'var(--tint-hover)',
    info: 'var(--ds-brand-soft)',
};

function RiskBadge({ risk }) {
    const color = SEVERITY_COLOR[risk.severity] || 'var(--text-muted)';
    const bg = SEVERITY_BG[risk.severity] || 'var(--tint-hover)';
    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
            background: bg, border: `1px solid ${color}`, borderRadius: '6px',
            padding: '0.4rem 0.75rem', fontSize: '0.8rem',
        }}>
            <AlertTriangle size={13} style={{ color, flexShrink: 0, marginTop: '0.1rem' }} />
            <span style={{ color: 'var(--text-secondary)' }}>{risk.message}</span>
            <span style={{
                marginLeft: 'auto', flexShrink: 0, fontSize: '0.7rem', fontWeight: 700,
                color, textTransform: 'uppercase',
            }}>
                {risk.severity}
            </span>
        </div>
    );
}

function Section({ icon, title, children }) {
    const IconComponent = icon;
    return (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{
                margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
                <IconComponent size={14} color="var(--primary)" />
                {title}
            </h4>
            {children}
        </div>
    );
}

function KV({ label, value, mono, color }) {
    if (!value && value !== 0) return null;
    const display = Array.isArray(value) ? value.join(', ') : String(value);
    if (!display) return null;
    return (
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-muted)', minWidth: '80px', flexShrink: 0 }}>{label}</span>
            <span style={{
                color: color || 'var(--text-secondary)',
                fontFamily: mono ? 'monospace' : undefined,
                wordBreak: 'break-all',
            }}>
                {display.length > 200 ? display.slice(0, 200) + '…' : display}
            </span>
        </div>
    );
}

export default function AttackSurface({ results }) {
    const { t } = useTranslation();

    const get = (module) => {
        const entry = results[module];
        if (!entry || entry.status === 'error') return null;
        const d = entry.data;
        if (!d || d.error || d.skipped) return null;
        return d;
    };

    const dns = get('dns');
    const whois = get('whois');
    const ssl = get('ssl');
    const web = get('web');
    const ports = get('ports');
    const passive = get('passive');
    const subdomains = get('subdomains');
    const traceroute = get('traceroute');

    // Compute risk indicators (mirrors backend correlator.py logic)
    const risks = [];

    if (ssl) {
        if (ssl.is_expired)
            risks.push({ severity: 'critical', message: 'SSL certificate is expired' });
        else if (ssl.days_until_expiry != null && ssl.days_until_expiry < 30)
            risks.push({ severity: 'high', message: `SSL certificate expires in ${ssl.days_until_expiry} days` });
        if (ssl.is_self_signed)
            risks.push({ severity: 'medium', message: 'SSL certificate is self-signed' });
        if (['TLSv1', 'TLSv1.0', 'TLSv1.1', 'SSLv3'].includes(ssl.protocol))
            risks.push({ severity: 'high', message: `Deprecated TLS protocol: ${ssl.protocol}` });
    }

    if (web) {
        const sec = web.security_headers || {};
        if (!sec['Strict-Transport-Security'])
            risks.push({ severity: 'medium', message: 'Missing HSTS header' });
        if (!sec['Content-Security-Policy'])
            risks.push({ severity: 'medium', message: 'Missing Content-Security-Policy header' });
        if (!sec['X-Frame-Options'])
            risks.push({ severity: 'low', message: 'Missing X-Frame-Options header' });
        if (web.x_powered_by)
            risks.push({ severity: 'low', message: `Server technology exposed: ${web.x_powered_by}` });
    }

    if (ports?.ports) {
        const standard = new Set([21, 22, 23, 25, 53, 80, 110, 143, 443, 587, 993, 995, 3306, 5432, 6379, 8080, 8443]);
        for (const p of ports.ports) {
            if (p.port && !standard.has(p.port))
                risks.push({ severity: 'low', message: `Non-standard port open: ${p.port}/${p.protocol || 'tcp'} ${p.service ? `(${p.service})` : ''}` });
        }
    }

    if (passive?.emails?.length)
        risks.push({ severity: 'info', message: `${passive.emails.length} email(s) found — potential phishing targets` });

    const subCount = (subdomains?.subdomains?.length || 0) + (passive?.subdomains?.length || 0);
    if (subCount > 20)
        risks.push({ severity: 'info', message: `Large attack surface: ${subCount} subdomains discovered` });

    const hasContent = [dns, ports, web, ssl, whois, passive, subdomains, traceroute].some(Boolean);

    if (!hasContent) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                {t('recon.surface_empty')}
            </div>
        );
    }

    // Merge all subdomains
    const allSubs = [...new Set([
        ...(subdomains?.subdomains || []),
        ...(passive?.subdomains || []),
    ])].slice(0, 100);

    return (
        <div className="recon-attack-surface" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Risk Indicators */}
            {risks.length > 0 && (
                <Section icon={AlertTriangle} title="Risk Indicators">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {risks
                            .sort((a, b) => {
                                const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
                                return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
                            })
                            .map((r, i) => <RiskBadge key={i} risk={r} />)
                        }
                    </div>
                </Section>
            )}

            {/* Exposed Services */}
            {ports?.ports?.length > 0 && (
                <Section icon={Network} title={t('recon.surface_services')}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {ports.ports.map((p, i) => (
                            <span key={i} style={{
                                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                borderRadius: '6px', padding: '0.2rem 0.6rem', fontSize: '0.8rem',
                                color: 'var(--text-secondary)', fontFamily: 'monospace',
                            }}>
                                {p.port}/{p.protocol}
                                {p.service && <span style={{ color: 'var(--primary)', marginLeft: '0.3rem' }}>{p.service}</span>}
                                {p.product && <span style={{ color: 'var(--text-muted)', marginLeft: '0.2rem', fontSize: '0.72rem' }}>{p.product} {p.version}</span>}
                            </span>
                        ))}
                    </div>
                    {web?.technologies?.length > 0 && (
                        <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {web.technologies.map((tech, i) => (
                                <span key={i} style={{
                                    background: 'var(--ds-brand-soft)', border: '1px solid var(--accent-border)',
                                    borderRadius: '6px', padding: '0.15rem 0.5rem', fontSize: '0.75rem',
                                    color: 'var(--primary)',
                                }}>
                                    {tech}
                                </span>
                            ))}
                        </div>
                    )}
                    {ports.os_guess && (
                        <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            OS: {ports.os_guess}
                        </p>
                    )}
                </Section>
            )}

            {/* Web */}
            {web && (
                <Section icon={Globe} title="Web">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <KV label="URL" value={web.final_url} mono />
                        <KV label="Status" value={web.status_code} color={web.status_code < 400 ? 'var(--green)' : 'var(--red)'} />
                        <KV label="Título" value={web.title} />
                        <KV label="Server" value={web.server} mono />
                        {web.security_headers && (
                            <div style={{ marginTop: '0.5rem' }}>
                                <p style={{ margin: '0 0 0.3rem', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Security Headers</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                    {Object.entries(web.security_headers).map(([h, present]) => (
                                        <span key={h} className={`v-badge v-badge--${present ? 'success' : 'danger'}`} style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', opacity: present ? 1 : 0.7 }}>
                                            {!present && '✕ '}{h}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* Infrastructure */}
            {(dns || whois) && (
                <Section icon={Radio} title={t('recon.surface_infra')}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {dns?.A?.length > 0 && <KV label="A" value={dns.A} mono />}
                        {dns?.AAAA?.length > 0 && <KV label="AAAA" value={dns.AAAA} mono />}
                        {dns?.NS?.length > 0 && <KV label="NS" value={dns.NS} />}
                        {dns?.MX?.length > 0 && <KV label="MX" value={dns.MX} />}
                        {whois?.registrar && <KV label="Registrar" value={whois.registrar} />}
                        {whois?.registrant_country && <KV label="País" value={whois.registrant_country} />}
                        {whois?.creation_date && (
                            <KV label="Criado" value={
                                typeof whois.creation_date === 'string'
                                    ? whois.creation_date.split('T')[0]
                                    : whois.creation_date
                            } />
                        )}
                        {whois?.expiration_date && (
                            <KV label="Expira" value={
                                typeof whois.expiration_date === 'string'
                                    ? whois.expiration_date.split('T')[0]
                                    : whois.expiration_date
                            } />
                        )}
                    </div>
                </Section>
            )}

            {/* Certificates */}
            {ssl && !ssl.error && (
                <Section icon={Lock} title={t('recon.surface_cert')}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <KV label="CN" value={ssl.subject_cn} color={ssl.is_expired ? 'var(--red)' : 'var(--green)'} />
                        <KV label="Issuer" value={ssl.issuer_cn} />
                        {ssl.not_after && (
                            <KV
                                label="Expira"
                                value={`${ssl.not_after.split('T')[0]} (${ssl.is_expired ? 'EXPIRADO' : `${ssl.days_until_expiry}d`})`}
                                color={ssl.is_expired ? 'var(--red)' : ssl.days_until_expiry < 30 ? 'var(--yellow)' : undefined}
                            />
                        )}
                        <KV label="Protocolo" value={ssl.protocol} />
                        {ssl.sans?.length > 0 && <KV label="SANs" value={ssl.sans.slice(0, 10)} />}
                        {ssl.is_self_signed && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--ds-warning)', background: 'var(--ds-warning-soft)', border: '1px solid var(--alert-warning-border)', borderRadius: '4px', padding: '0.15rem 0.4rem', alignSelf: 'flex-start', marginTop: '0.25rem' }}>
                                self-signed
                            </span>
                        )}
                    </div>
                </Section>
            )}

            {/* Subdomains */}
            {allSubs.length > 0 && (
                <Section icon={Globe} title={`Subdomínios (${allSubs.length})`}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {allSubs.map((s, i) => (
                            <code key={i} style={{
                                fontSize: '0.75rem', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                                borderRadius: '4px', padding: '0.1rem 0.4rem', color: 'var(--text-secondary)',
                            }}>
                                {s}
                            </code>
                        ))}
                    </div>
                </Section>
            )}

            {/* Passive — Emails */}
            {passive?.emails?.length > 0 && (
                <Section icon={Info} title={`Emails Encontrados (${passive.emails.length})`}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {passive.emails.map((e, i) => (
                            <code key={i} style={{
                                fontSize: '0.75rem', background: 'var(--alert-error-bg)', border: '1px solid var(--alert-error-border)',
                                borderRadius: '4px', padding: '0.1rem 0.4rem', color: 'var(--text-secondary)',
                            }}>
                                {e}
                            </code>
                        ))}
                    </div>
                </Section>
            )}

            {/* Traceroute */}
            {traceroute?.hops?.length > 0 && (
                <Section icon={Radio} title={`Traceroute (${traceroute.hop_count} hops)`}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {traceroute.hops.map((h, i) => (
                            <div key={i} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem' }}>
                                <span style={{ color: 'var(--text-muted)', minWidth: '24px', textAlign: 'right' }}>{h.hop}</span>
                                <code style={{ color: h.ip === '*' ? 'var(--text-muted)' : 'var(--primary)' }}>{h.ip}</code>
                                {h.rtt_ms != null && (
                                    <span style={{ color: 'var(--text-muted)' }}>{h.rtt_ms} ms</span>
                                )}
                            </div>
                        ))}
                    </div>
                </Section>
            )}
        </div>
    );
}

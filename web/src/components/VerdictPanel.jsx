import React from 'react';
import { Shield, ShieldAlert, Skull, Activity } from 'lucide-react';

export default function VerdictPanel({ target, type, summary, lang = 'pt' }) {
    if (!summary) return null;

    const { verdict, risk_sources, total_sources } = summary;

    const t = {
        pt: { safe: 'SEGURO', risk: 'ALTO RISCO', susp: 'SUSPEITO', flagged: `Negativado por ${risk_sources} de ${total_sources} fontes` },
        en: { safe: 'SAFE', risk: 'HIGH RISK', susp: 'SUSPICIOUS', flagged: `Flagged by ${risk_sources} of ${total_sources} sources` },
        es: { safe: 'SEGURO', risk: 'ALTO RIESGO', susp: 'SOSPECHOSO', flagged: `Marcado por ${risk_sources} de ${total_sources} fuentes` }
    };

    let colorVar = 'var(--status-safe)';
    let bgVar = 'var(--status-safe-bg)';
    let Icon = Shield;
    let text = t[lang].safe;

    if (verdict === 'HIGH RISK') {
        colorVar = 'var(--status-risk)';
        bgVar = 'var(--status-risk-bg)';
        Icon = Skull;
        text = t[lang].risk;
    } else if (verdict === 'SUSPICIOUS') {
        colorVar = 'var(--status-suspicious)';
        bgVar = 'var(--status-suspicious-bg)';
        Icon = ShieldAlert;
        text = t[lang].susp;
    }

    return (
        <div className="glass-panel fade-in" style={{
            marginTop: '2rem',
            padding: '2rem',
            textAlign: 'center',
            borderTop: `4px solid ${colorVar}`
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{
                    background: bgVar,
                    color: colorVar,
                    padding: '1rem',
                    borderRadius: '50%'
                }}>
                    <Icon size={48} />
                </div>
                <div style={{ textAlign: 'left' }}>
                    <h2 style={{ fontSize: '2rem', margin: 0, textTransform: 'uppercase', color: colorVar, textShadow: `0 0 10px ${colorVar}40` }}>
                        {text}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '1.1rem' }}>
                        {t[lang].flagged}
                    </p>
                </div>
            </div>

            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2rem',
                background: 'rgba(0,0,0,0.2)',
                padding: '0.75rem 1.5rem',
                borderRadius: '999px',
                marginTop: '0.5rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={18} color="var(--text-muted)" />
                    <span className="mono" style={{ color: 'var(--text-primary)' }}>{target}</span>
                </div>
                <div style={{ width: '1px', height: '20px', background: 'var(--glass-border)' }}></div>
                <div className="badge badge-neutral">{type}</div>
            </div>
        </div>
    );
}

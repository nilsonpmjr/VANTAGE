import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, TrendingUp, ShieldAlert, Activity, Target, ShieldCheck, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import '../index.css';

export default function Dashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await fetch('http://localhost:8000/api/stats', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    throw new Error('Falha ao obter estatísticas gerenciais.');
                }

                const data = await response.json();
                setStats(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (user && (user.role === 'admin' || user.role === 'manager')) {
            fetchStats();
        }
    }, [user]);

    if (!user || user.role === 'tech') return null;

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Activity className="spin" size={32} color="var(--primary)" />
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <div style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', padding: '1rem', borderRadius: '8px', display: 'inline-block' }}>
                    {error}
                </div>
            </div>
        );
    }

    // Pie Chart Colors
    const COLOR_SAFE = '#10b981'; // green-500
    const COLOR_SUSPICIOUS = '#f59e0b'; // amber-500
    const COLOR_MALICIOUS = '#ef4444'; // red-500

    const getVerdictColor = (verdict) => {
        if (!verdict) return 'var(--text-muted)';
        const v = verdict.toUpperCase();
        if (v === 'SAFE') return COLOR_SAFE;
        if (v === 'SUSPICIOUS') return COLOR_SUSPICIOUS;
        if (v === 'HIGH RISK') return COLOR_MALICIOUS;
        return 'var(--primary)';
    };

    const getVerdictIcon = (verdict) => {
        if (!verdict) return <Activity size={16} />;
        const v = verdict.toUpperCase();
        if (v === 'SAFE') return <ShieldCheck size={16} color={COLOR_SAFE} />;
        if (v === 'SUSPICIOUS') return <AlertTriangle size={16} color={COLOR_SUSPICIOUS} />;
        if (v === 'HIGH RISK') return <ShieldAlert size={16} color={COLOR_MALICIOUS} />;
        return <Activity size={16} />;
    };

    return (
        <div className="fade-in" style={{ padding: '0 2rem', maxWidth: '1200px', margin: '0 auto', width: '100%', paddingBottom: '3rem' }}>
            <header style={{ marginBottom: '2rem', marginTop: '3rem' }}>
                <h2 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <LayoutDashboard size={28} color="var(--primary)" />
                    Dashboard Gerencial
                </h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0, marginLeft: 'calc(28px + 0.75rem)' }}>Métricas de Inteligência e Escaneamentos do SOC.</p>
            </header>

            {/* Top Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '1rem', borderRadius: '12px', color: 'var(--primary)' }}>
                        <Activity size={32} />
                    </div>
                    <div>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Total de Escaneamentos</p>
                        <h3 style={{ margin: '0.5rem 0 0 0', color: 'var(--text-primary)', fontSize: '2rem', fontWeight: 600 }}>{stats?.totalScans || 0}</h3>
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '12px', color: 'var(--red)' }}>
                        <ShieldAlert size={32} />
                    </div>
                    <div>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Ameaças Detectadas</p>
                        <h3 style={{ margin: '0.5rem 0 0 0', color: 'var(--text-primary)', fontSize: '2rem', fontWeight: 600 }}>
                            {stats?.verdictDistribution?.find(v => v.name === 'HIGH RISK')?.value || 0}
                        </h3>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem', alignItems: 'start' }}>
                {/* Distribution Chart */}
                <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                        <TrendingUp size={20} color="var(--primary)" />
                        Proporção de Casos (Veredito)
                    </h3>

                    <div style={{ flexGrow: 1, minHeight: '300px' }}>
                        {stats?.verdictDistribution && stats.verdictDistribution.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.verdictDistribution}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={80}
                                        outerRadius={110}
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {stats.verdictDistribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={getVerdictColor(entry.name)} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                                        itemStyle={{ color: 'var(--text-primary)' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                Sem dados suficientes.
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                        {stats?.verdictDistribution?.map(v => (
                            <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: getVerdictColor(v.name) }}></span>
                                {v.name} ({v.value})
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Targets Table */}
                <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                    <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                            <Target size={20} color="var(--primary)" />
                            Top 5 Artefatos Mais Perigosos/Consultados
                        </h3>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead style={{ background: 'var(--bg-main)' }}>
                                <tr>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>ARTEFATO</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>TIPO</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem', textAlign: 'center' }}>PESQUISAS</th>
                                    <th style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem', textAlign: 'right' }}>ÚLTIMO RISCO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!stats?.topTargets || stats.topTargets.length === 0 ? (
                                    <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum artefato registrado.</td></tr>
                                ) : (
                                    stats.topTargets.map((item, idx) => (
                                        <tr key={item.target} style={{ borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none', transition: 'background 0.2s' }}>
                                            <td style={{ padding: '1rem 1.5rem', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.95rem' }}>{item.target}</td>
                                            <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.8rem' }}>{item.type}</td>
                                            <td style={{ padding: '1rem 1.5rem', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 600 }}>{item.count}</td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                                    color: getVerdictColor(item.verdict),
                                                    fontSize: '0.8rem', fontWeight: 600,
                                                    background: 'var(--glass-bg)', padding: '0.3rem 0.6rem', borderRadius: '1rem', border: `1px solid ${getVerdictColor(item.verdict)}`
                                                }}>
                                                    {getVerdictIcon(item.verdict)} {item.verdict || 'N/A'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

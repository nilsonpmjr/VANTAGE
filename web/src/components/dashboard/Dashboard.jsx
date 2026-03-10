import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard, TrendingUp, ShieldAlert, Activity, Target, ShieldCheck, AlertTriangle, History, Download, AlignLeft, Radar } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import API_URL from '../../config';
import { fmtBRT } from '../../utils/dateFormat';
import '../../index.css';

export default function Dashboard({ onSearch, onRecon }) {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [stats, setStats] = useState(null);
    const [period, setPeriod] = useState('month');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const dashboardRef = useRef(null);

    const handleExportPDF = async () => {
        if (!dashboardRef.current) return;
        setIsExporting(true);
        try {
            const canvas = await html2canvas(dashboardRef.current, {
                scale: 2,
                backgroundColor: '#0f172a',
                useCORS: true,
                windowWidth: dashboardRef.current.scrollWidth,
                windowHeight: dashboardRef.current.scrollHeight
            });
            const imgData = canvas.toDataURL('image/png');

            // A4 format: 210 x 297 mm
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`dashboard-report-${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (err) {
            console.error('Failed to export PDF', err);
        } finally {
            setIsExporting(false);
        }
    };

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            try {
                const response = await fetch(`${API_URL}/api/stats?period=${period}`, {
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error(t('dashboard.err_stats'));
                }

                const data = await response.json();
                setStats(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (user) {
            fetchStats();
        }
    }, [user, period]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!user) return null;

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
        <div className="fade-in" style={{ padding: '0 2rem', maxWidth: '1400px', margin: '0 auto', width: '100%', paddingBottom: '3rem' }}>
            <header style={{ marginBottom: '2rem', marginTop: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <LayoutDashboard size={28} color="var(--primary)" />
                        {t('dashboard.title')}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', margin: 0, marginLeft: 'calc(28px + 0.75rem)' }}>{t('dashboard.subtitle')}</p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        style={{
                            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                            color: 'var(--text-primary)', padding: '0.6rem 1rem', borderRadius: '8px',
                            cursor: 'pointer', outline: 'none', fontWeight: 500
                        }}
                    >
                        <option value="day">{t('dashboard.time_day')}</option>
                        <option value="week">{t('dashboard.time_week')}</option>
                        <option value="month">{t('dashboard.time_month')}</option>
                        <option value="all">{t('dashboard.time_all')}</option>
                    </select>

                    <button
                        onClick={handleExportPDF}
                        disabled={isExporting}
                        className="fade-in"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.2s', opacity: isExporting ? 0.7 : 1 }}
                        title="Export PDF"
                        onMouseOver={(e) => { if (!isExporting) Object.assign(e.currentTarget.style, { background: 'var(--accent-glow)', borderColor: 'var(--accent-border)' }) }}
                        onMouseOut={(e) => { if (!isExporting) Object.assign(e.currentTarget.style, { background: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }) }}
                    >
                        {isExporting ? <Activity size={18} className="spin" /> : <Download size={18} />}
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{isExporting ? t('dashboard.export_active') : t('dashboard.export_idle')}</span>
                    </button>
                </div>
            </header>

            <div ref={dashboardRef} style={{ padding: '10px' }}>
                {/* Top Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '1rem', borderRadius: '12px', color: 'var(--primary)' }}>
                            <Activity size={32} />
                        </div>
                        <div>
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('dashboard.total_scans')}</p>
                            <h3 style={{ margin: '0.5rem 0 0 0', color: 'var(--text-primary)', fontSize: '2rem', fontWeight: 600 }}>{stats?.totalScans || 0}</h3>
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '12px', color: 'var(--red)' }}>
                            <ShieldAlert size={32} />
                        </div>
                        <div>
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('dashboard.threats')}</p>
                            <h3 style={{ margin: '0.5rem 0 0 0', color: 'var(--text-primary)', fontSize: '2rem', fontWeight: 600 }}>
                                {stats?.verdictDistribution?.find(v => v.name === 'HIGH RISK')?.value || 0}
                            </h3>
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ background: 'rgba(56, 189, 248, 0.08)', padding: '1rem', borderRadius: '12px', color: 'var(--primary)' }}>
                            <Radar size={32} />
                        </div>
                        <div>
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('recon.title')}</p>
                            <h3 style={{ margin: '0.5rem 0 0 0', color: 'var(--text-primary)', fontSize: '2rem', fontWeight: 600 }}>{stats?.reconTotal ?? 0}</h3>
                        </div>
                    </div>

                    <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ background: stats?.workerHealth?.status === 'Healthy' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', padding: '1rem', borderRadius: '12px', color: stats?.workerHealth?.status === 'Healthy' ? 'var(--green)' : 'var(--yellow)' }}>
                            <ShieldCheck size={32} />
                        </div>
                        <div>
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('dashboard.worker_mon')}</p>
                            <h3 style={{ margin: '0.2rem 0 0 0', color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 600 }}>
                                {stats?.workerHealth?.status === 'Healthy' ? t('dashboard.healthy') : t('dashboard.offline')}
                            </h3>
                            {stats?.workerHealth?.last_run && (
                                <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                    {t('dashboard.seen_at')}: {fmtBRT(stats.workerHealth.last_run, i18n.language === 'en' ? 'en-US' : (i18n.language === 'es' ? 'es-ES' : 'pt-BR'))}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="dashboard-grid-2col">
                    {/* Distribution Chart */}
                    <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                            <TrendingUp size={20} color="var(--primary)" />
                            {t('dashboard.proportion')}
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
                                    {t('dashboard.no_data')}
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

                    {/* Threat Trends Line Chart */}
                    <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                            <Activity size={20} color="var(--primary)" />
                            {t('dashboard.threat_trends')}
                        </h3>

                        <div style={{ flexGrow: 1, minHeight: '300px' }}>
                            {stats?.threatTrends && stats.threatTrends.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={stats.threatTrends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
                                        <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickMargin={10} />
                                        <YAxis stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                                        <Tooltip
                                            contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                                            itemStyle={{ color: 'var(--text-primary)' }}
                                        />
                                        <Legend iconType="circle" />
                                        <Line type="monotone" name="Total Scans" dataKey="total" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                                        <Line type="monotone" name="Malicious" dataKey="malicious" stroke={COLOR_MALICIOUS} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                    {t('dashboard.no_data')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem', alignItems: 'stretch', marginBottom: '2rem' }}>
                    {/* Top Threat Types Bar Chart */}
                    <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                            <AlignLeft size={20} color="var(--primary)" />
                            {t('dashboard.top_typologies')}
                        </h3>

                        <div style={{ flexGrow: 1, minHeight: '300px' }}>
                            {stats?.topThreatTypes && stats.topThreatTypes.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats.topThreatTypes} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" horizontal={false} />
                                        <XAxis type="number" stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                                        <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={11} width={80} />
                                        <Tooltip
                                            contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        />
                                        <Bar dataKey="value" name="Occurrences" fill="var(--accent-glow)" radius={[0, 4, 4, 0]}>
                                            {stats.topThreatTypes.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={index === 0 ? COLOR_MALICIOUS : 'var(--accent-glow)'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                    {t('dashboard.no_data')}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Critical Incident Feed */}
                    <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                            <h3 style={{ margin: 0, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                <AlertTriangle size={20} color="var(--red)" />
                                {t('dashboard.crit_incident')}
                            </h3>
                        </div>

                        <div style={{ overflowX: 'auto', flexGrow: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <caption className="sr-only">{t('dashboard.crit_incident')}</caption>
                                <thead style={{ background: 'var(--bg-main)' }}>
                                    <tr>
                                        <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('dashboard.datetime')}</th>
                                        <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('dashboard.artifact')}</th>
                                        <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem', textAlign: 'right' }}>{t('dashboard.verdict')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!stats?.criticalIncidents || stats.criticalIncidents.length === 0 ? (
                                        <tr><td colSpan="3" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('dashboard.no_crits')}</td></tr>
                                    ) : (
                                        stats.criticalIncidents.map((scan, idx) => (
                                            <tr key={idx} style={{ borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none', transition: 'background 0.2s' }}>
                                                <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                                    {fmtBRT(scan.timestamp, i18n.language === 'en' ? 'en-US' : (i18n.language === 'es' ? 'es-ES' : 'pt-BR'))}
                                                </td>
                                                <td
                                                    onClick={() => onSearch && onSearch(scan.target)}
                                                    style={{
                                                        padding: '1rem 1.5rem', color: 'var(--red)', fontFamily: 'monospace', fontSize: '0.9rem',
                                                        cursor: 'pointer', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                                    }}
                                                    title={scan.target}
                                                >
                                                    <span style={{ textDecoration: 'underline' }}>{scan.target}</span>
                                                </td>
                                                <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                                        color: getVerdictColor(scan.verdict),
                                                        fontSize: '0.8rem', fontWeight: 600,
                                                        background: 'var(--glass-bg)', padding: '0.3rem 0.6rem', borderRadius: '1rem', border: `1px solid ${getVerdictColor(scan.verdict)}`
                                                    }}>
                                                        {getVerdictIcon(scan.verdict)} {scan.verdict || 'N/A'}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', alignItems: 'start', marginTop: '2rem' }}>
                    {/* Top Targets Table */}
                    <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                            <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                <Target size={20} color="var(--primary)" />
                                {t('dashboard.top_artifacts')}
                            </h3>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <caption className="sr-only">{t('dashboard.top_artifacts')}</caption>
                                <thead style={{ background: 'var(--bg-main)' }}>
                                    <tr>
                                        <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('dashboard.artifact')}</th>
                                        <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('dashboard.type')}</th>
                                        <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem', textAlign: 'center' }}>{t('dashboard.searches')}</th>
                                        <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem', textAlign: 'right' }}>{t('dashboard.last_risk')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!stats?.topTargets || stats.topTargets.length === 0 ? (
                                        <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('dashboard.no_artifacts')}</td></tr>
                                    ) : (
                                        stats.topTargets.map((item, idx) => (
                                            <tr key={item.target} style={{ borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none', transition: 'background 0.2s' }}>
                                                <td
                                                    onClick={() => onSearch && onSearch(item.target)}
                                                    style={{
                                                        padding: '1rem 1.5rem', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '0.95rem',
                                                        cursor: 'pointer', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                                    }}
                                                    title={item.target}
                                                >
                                                    <span style={{ textDecoration: 'underline' }}>{item.target}</span>
                                                </td>
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem', alignItems: 'start', marginTop: '2rem' }}>
                    {/* Recent Scans History Table */}
                    <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                            <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                <History size={20} color="var(--primary)" />
                                {t('dashboard.recent_history')}
                            </h3>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <caption className="sr-only">{t('dashboard.recent_history')}</caption>
                                <thead style={{ background: 'var(--bg-main)' }}>
                                    <tr>
                                        <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('dashboard.analyst')}</th>
                                        <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('dashboard.datetime')}</th>
                                        <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('dashboard.artifact')}</th>
                                        <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem', textAlign: 'right' }}>{t('dashboard.verdict')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!stats?.recentScans || stats.recentScans.length === 0 ? (
                                        <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('dashboard.no_history')}</td></tr>
                                    ) : (
                                        stats.recentScans.map((scan, idx) => (
                                            <tr key={idx} style={{ borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none', transition: 'background 0.2s' }}>
                                                <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                                                            {scan.analyst ? scan.analyst.substring(0, 2).toUpperCase() : 'SYS'}
                                                        </div>
                                                        {scan.analyst || 'Sistema'}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                                    {fmtBRT(scan.timestamp, i18n.language === 'en' ? 'en-US' : (i18n.language === 'es' ? 'es-ES' : 'pt-BR'))}
                                                </td>
                                                <td
                                                    onClick={() => onSearch && onSearch(scan.target)}
                                                    style={{
                                                        padding: '1rem 1.5rem', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '0.9rem',
                                                        cursor: 'pointer', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                                    }}
                                                    title={scan.target}
                                                >
                                                    <span style={{ textDecoration: 'underline' }}>{scan.target}</span>
                                                </td>
                                                <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                                        color: getVerdictColor(scan.verdict),
                                                        fontSize: '0.8rem', fontWeight: 600,
                                                        background: 'var(--glass-bg)', padding: '0.3rem 0.6rem', borderRadius: '1rem', border: `1px solid ${getVerdictColor(scan.verdict)}`
                                                    }}>
                                                        {getVerdictIcon(scan.verdict)} {scan.verdict || 'N/A'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Recent Recon Jobs Table */}
                    {stats?.recentReconJobs && stats.recentReconJobs.length > 0 && (
                        <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                                <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                    <Radar size={20} color="var(--primary)" />
                                    {t('recon.title')}
                                </h3>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <caption className="sr-only">{t('recon.title')}</caption>
                                    <thead style={{ background: 'var(--bg-main)' }}>
                                        <tr>
                                            <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('dashboard.analyst')}</th>
                                            <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('dashboard.datetime')}</th>
                                            <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('dashboard.artifact')}</th>
                                            <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>{t('recon.modules_label')}</th>
                                            <th scope="col" style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem', textAlign: 'right' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.recentReconJobs.map((job, idx) => (
                                            <tr key={job.job_id} style={{ borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none' }}>
                                                <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                                                            {job.analyst ? job.analyst.substring(0, 2).toUpperCase() : 'SYS'}
                                                        </div>
                                                        {job.analyst || t('dashboard.sys')}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                                    {fmtBRT(job.created_at, i18n.language === 'en' ? 'en-US' : (i18n.language === 'es' ? 'es-ES' : 'pt-BR'))}
                                                </td>
                                                <td
                                                    onClick={() => onRecon && onRecon(job.target, { showHistory: true })}
                                                    style={{
                                                        padding: '1rem 1.5rem', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '0.9rem',
                                                        maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        cursor: onRecon ? 'pointer' : 'default',
                                                    }}
                                                    title={job.target}
                                                >
                                                    {onRecon ? <span style={{ textDecoration: 'underline' }}>{job.target}</span> : job.target}
                                                </td>
                                                <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    {job.modules?.join(', ') || '—'}
                                                </td>
                                                <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                    <span style={{
                                                        fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '1rem',
                                                        color: job.status === 'done' ? 'var(--green)' : job.status === 'error' ? 'var(--red)' : 'var(--primary)',
                                                        background: job.status === 'done' ? 'rgba(16,185,129,0.1)' : job.status === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(56,189,248,0.1)',
                                                        border: `1px solid ${job.status === 'done' ? 'var(--green)' : job.status === 'error' ? 'var(--red)' : 'var(--primary)'}`,
                                                    }}>
                                                        {job.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div> {/* END Grid */}
            </div> {/* END Ref */}
        </div>
    );
}

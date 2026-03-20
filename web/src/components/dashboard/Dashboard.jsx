import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard, TrendingUp, ShieldAlert, Activity, Target, ShieldCheck, AlertTriangle, History, Download, AlignLeft, Radar } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import API_URL from '../../config';
import { fmtBRT } from '../../utils/dateFormat';
import SettingsShell from '../layout/SettingsShell';
import ReconAdminPanel from '../admin/ReconAdminPanel';
import '../../index.css';

// Pie Chart Colors
const COLOR_SAFE = 'var(--status-safe)';
const COLOR_SUSPICIOUS = 'var(--status-suspicious)';
const COLOR_MALICIOUS = 'var(--status-risk)';

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

function VerdictBadge({ verdict }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            color: getVerdictColor(verdict),
            fontSize: '0.8rem', fontWeight: 600,
            background: 'var(--glass-bg)', padding: '0.3rem 0.6rem', borderRadius: '1rem',
            border: `1px solid ${getVerdictColor(verdict)}`,
        }}>
            {getVerdictIcon(verdict)} {verdict || 'N/A'}
        </span>
    );
}

function AnalystCell({ analyst }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                {analyst ? analyst.substring(0, 2).toUpperCase() : 'SYS'}
            </div>
            {analyst || 'Sistema'}
        </div>
    );
}

const locale = () => i18n.language === 'en' ? 'en-US' : (i18n.language === 'es' ? 'es-ES' : 'pt-BR');

export default function Dashboard({ onSearch, onRecon }) {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [stats, setStats] = useState(null);
    const [period, setPeriod] = useState('month');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const dashboardRef = useRef(null);

    const handleExportPDF = async () => {
        if (!dashboardRef.current) return;
        setIsExporting(true);
        try {
            const canvas = await html2canvas(dashboardRef.current, {
                scale: 2, backgroundColor: '#0f172a', useCORS: true,
                windowWidth: dashboardRef.current.scrollWidth,
                windowHeight: dashboardRef.current.scrollHeight,
            });
            const imgData = canvas.toDataURL('image/png');
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
                const response = await fetch(`${API_URL}/api/stats?period=${period}`, { credentials: 'include' });
                if (!response.ok) throw new Error(t('dashboard.err_stats'));
                const data = await response.json();
                setStats(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        if (user) fetchStats();
    }, [user, period]); // eslint-disable-line react-hooks/exhaustive-deps

    const menuGroups = useMemo(() => [
        {
            key: 'dashboard_group',
            label: t('dashboard.title'),
            items: [
                { key: 'overview', icon: <LayoutDashboard size={16} />, label: t('dashboard.tab_overview') },
                { key: 'history', icon: <History size={16} />, label: t('dashboard.tab_history') },
                ...(user?.role === 'admin' ? [{ key: 'recon_jobs', icon: <Radar size={16} />, label: t('dashboard.tab_recon_jobs') }] : []),
                { key: 'alerts', icon: <AlertTriangle size={16} />, label: t('dashboard.tab_alerts') },
            ],
        },
    ], [t, user?.role]);

    const breadcrumbs = useMemo(() => {
        const labels = {
            overview: t('dashboard.tab_overview'),
            history: t('dashboard.tab_history'),
            recon_jobs: t('dashboard.tab_recon_jobs'),
            alerts: t('dashboard.tab_alerts'),
        };
        return [
            { label: t('dashboard.title'), onClick: () => setActiveTab('overview') },
            { label: labels[activeTab] || activeTab },
        ];
    }, [activeTab, t]);

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
                <div className="alert-banner error" style={{ display: 'inline-flex' }}>
                    {error}
                </div>
            </div>
        );
    }

    return (
        <SettingsShell groups={menuGroups} activeKey={activeTab} onSelect={setActiveTab} breadcrumbs={breadcrumbs}>

            {/* Header with period selector and export */}
            <div className="v-zone-header">
                <div>
                    <h2 className="v-page-title" style={{ fontSize: '1.3rem' }}>
                        <LayoutDashboard size={24} color="var(--primary)" />
                        {t('dashboard.title')}
                    </h2>
                    <p className="v-page-subtitle">{t('dashboard.subtitle')}</p>
                </div>
                <div className="v-page-actions">
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="form-select"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    >
                        <option value="day">{t('dashboard.time_day')}</option>
                        <option value="week">{t('dashboard.time_week')}</option>
                        <option value="month">{t('dashboard.time_month')}</option>
                        <option value="all">{t('dashboard.time_all')}</option>
                    </select>
                    <button
                        className="btn-secondary"
                        onClick={handleExportPDF}
                        disabled={isExporting}
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    >
                        {isExporting ? <Activity size={16} className="spin" /> : <Download size={16} />}
                        {isExporting ? t('dashboard.export_active') : t('dashboard.export_idle')}
                    </button>
                </div>
            </div>

            {/* ===== TAB: OVERVIEW ===== */}
            {activeTab === 'overview' && (
                <div ref={dashboardRef} className="fade-in">
                    {/* Stat Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '0.75rem', borderRadius: '12px', color: 'var(--primary)' }}><Activity size={28} /></div>
                            <div>
                                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('dashboard.total_scans')}</p>
                                <h3 style={{ margin: '0.3rem 0 0 0', color: 'var(--text-primary)', fontSize: '1.8rem', fontWeight: 600 }}>{stats?.totalScans || 0}</h3>
                            </div>
                        </div>
                        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ background: 'var(--alert-error-bg)', padding: '0.75rem', borderRadius: '12px', color: 'var(--alert-error)' }}><ShieldAlert size={28} /></div>
                            <div>
                                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('dashboard.threats')}</p>
                                <h3 style={{ margin: '0.3rem 0 0 0', color: 'var(--text-primary)', fontSize: '1.8rem', fontWeight: 600 }}>{stats?.verdictDistribution?.find(v => v.name === 'HIGH RISK')?.value || 0}</h3>
                            </div>
                        </div>
                        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ background: 'rgba(56, 189, 248, 0.08)', padding: '0.75rem', borderRadius: '12px', color: 'var(--primary)' }}><Radar size={28} /></div>
                            <div>
                                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('recon.title')}</p>
                                <h3 style={{ margin: '0.3rem 0 0 0', color: 'var(--text-primary)', fontSize: '1.8rem', fontWeight: 600 }}>{stats?.reconTotal ?? 0}</h3>
                            </div>
                        </div>
                        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ background: stats?.workerHealth?.status === 'Healthy' ? 'var(--alert-success-bg)' : 'var(--alert-warning-bg)', padding: '0.75rem', borderRadius: '12px', color: stats?.workerHealth?.status === 'Healthy' ? 'var(--alert-success)' : 'var(--alert-warning)' }}><ShieldCheck size={28} /></div>
                            <div>
                                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{t('dashboard.worker_mon')}</p>
                                <h3 style={{ margin: '0.15rem 0 0 0', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600 }}>{stats?.workerHealth?.status === 'Healthy' ? t('dashboard.healthy') : t('dashboard.offline')}</h3>
                                {stats?.workerHealth?.last_run && (
                                    <p style={{ margin: '0.15rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.7rem' }}>{t('dashboard.seen_at')}: {fmtBRT(stats.workerHealth.last_run, locale())}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Charts Row */}
                    <div className="dashboard-grid-2col">
                        {/* Verdict Distribution */}
                        <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                <TrendingUp size={20} color="var(--primary)" />
                                {t('dashboard.proportion')}
                            </h3>
                            <div style={{ flexGrow: 1, minHeight: '300px' }}>
                                {stats?.verdictDistribution?.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={stats.verdictDistribution} cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={5} dataKey="value" stroke="none">
                                                {stats.verdictDistribution.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={getVerdictColor(entry.name)} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)' }} itemStyle={{ color: 'var(--text-primary)' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>{t('dashboard.no_data')}</div>
                                )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                                {stats?.verdictDistribution?.map(v => (
                                    <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: getVerdictColor(v.name) }} />
                                        {v.name} ({v.value})
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Threat Trends */}
                        <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                <Activity size={20} color="var(--primary)" />
                                {t('dashboard.threat_trends')}
                            </h3>
                            <div style={{ flexGrow: 1, minHeight: '300px' }}>
                                {stats?.threatTrends?.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={stats.threatTrends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" vertical={false} />
                                            <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickMargin={10} />
                                            <YAxis stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                                            <Tooltip contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)' }} itemStyle={{ color: 'var(--text-primary)' }} />
                                            <Legend iconType="circle" />
                                            <Line type="monotone" name="Total Scans" dataKey="total" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                                            <Line type="monotone" name="Malicious" dataKey="malicious" stroke={COLOR_MALICIOUS} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>{t('dashboard.no_data')}</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Typologies + Top Artifacts */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
                        {/* Top Threat Types */}
                        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                <AlignLeft size={20} color="var(--primary)" />
                                {t('dashboard.top_typologies')}
                            </h3>
                            <div style={{ flexGrow: 1, minHeight: '300px' }}>
                                {stats?.topThreatTypes?.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={stats.topThreatTypes} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" horizontal={false} />
                                            <XAxis type="number" stroke="var(--text-muted)" fontSize={12} allowDecimals={false} />
                                            <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={11} width={80} />
                                            <Tooltip contentStyle={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                            <Bar dataKey="value" name="Occurrences" fill="var(--accent-glow)" radius={[0, 4, 4, 0]}>
                                                {stats.topThreatTypes.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={index === 0 ? COLOR_MALICIOUS : 'var(--accent-glow)'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>{t('dashboard.no_data')}</div>
                                )}
                            </div>
                        </div>

                        {/* Top Targets */}
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
                                            <th scope="col" style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem' }}>{t('dashboard.artifact')}</th>
                                            <th scope="col" style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem' }}>{t('dashboard.type')}</th>
                                            <th scope="col" style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textAlign: 'center' }}>{t('dashboard.searches')}</th>
                                            <th scope="col" style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.8rem', textAlign: 'right' }}>{t('dashboard.last_risk')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {!stats?.topTargets?.length ? (
                                            <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('dashboard.no_artifacts')}</td></tr>
                                        ) : stats.topTargets.map((item, idx) => (
                                            <tr key={item.target} style={{ borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none' }}>
                                                <td onClick={() => onSearch?.(item.target)} style={{ padding: '0.75rem 1rem', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '0.88rem', cursor: 'pointer', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.target}>
                                                    <span style={{ textDecoration: 'underline' }}>{item.target}</span>
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.75rem' }}>{item.type}</td>
                                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 600 }}>{item.count}</td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}><VerdictBadge verdict={item.verdict} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== TAB: HISTORY ===== */}
            {activeTab === 'history' && (
                <div className="fade-in">
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
                                    {!stats?.recentScans?.length ? (
                                        <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('dashboard.no_history')}</td></tr>
                                    ) : stats.recentScans.map((scan, idx) => (
                                        <tr key={idx} style={{ borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none' }}>
                                            <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}><AnalystCell analyst={scan.analyst} /></td>
                                            <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{fmtBRT(scan.timestamp, locale())}</td>
                                            <td onClick={() => onSearch?.(scan.target)} style={{ padding: '1rem 1.5rem', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '0.9rem', cursor: 'pointer', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={scan.target}>
                                                <span style={{ textDecoration: 'underline' }}>{scan.target}</span>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}><VerdictBadge verdict={scan.verdict} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== TAB: RECON JOBS (admin only — uses ReconAdminPanel) ===== */}
            {activeTab === 'recon_jobs' && user?.role === 'admin' && (
                <ReconAdminPanel onRecon={onRecon} />
            )}

            {/* ===== TAB: ALERTS ===== */}
            {activeTab === 'alerts' && (
                <div className="fade-in">
                    <div className="glass-panel" style={{ padding: '0', overflow: 'hidden' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                            <h3 style={{ margin: 0, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                <AlertTriangle size={20} color="var(--red)" />
                                {t('dashboard.crit_incident')}
                            </h3>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
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
                                    {!stats?.criticalIncidents?.length ? (
                                        <tr><td colSpan="3" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('dashboard.no_crits')}</td></tr>
                                    ) : stats.criticalIncidents.map((scan, idx) => (
                                        <tr key={idx} style={{ borderTop: idx > 0 ? '1px solid var(--glass-border)' : 'none' }}>
                                            <td style={{ padding: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{fmtBRT(scan.timestamp, locale())}</td>
                                            <td onClick={() => onSearch?.(scan.target)} style={{ padding: '1rem 1.5rem', color: 'var(--red)', fontFamily: 'monospace', fontSize: '0.9rem', cursor: 'pointer', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={scan.target}>
                                                <span style={{ textDecoration: 'underline' }}>{scan.target}</span>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}><VerdictBadge verdict={scan.verdict} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

        </SettingsShell>
    );
}

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard, TrendingUp, ShieldAlert, Activity, Target, ShieldCheck, AlertTriangle, History, Download, AlignLeft, Radar, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import API_URL from '../../config';
import { fmtBRT } from '../../utils/dateFormat';
import SettingsShell from '../layout/SettingsShell';
import ReconAdminPanel from '../admin/ReconAdminPanel';
import Pagination from '../shared/Pagination';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import '../../index.css';

// Pie Chart Colors
const COLOR_MALICIOUS = 'var(--status-risk)';

const getVerdictColor = (verdict) => {
    if (!verdict) return 'var(--text-muted)';
    const v = verdict.toUpperCase();
    if (v === 'SAFE') return 'var(--status-safe)';
    if (v === 'SUSPICIOUS') return 'var(--status-suspicious)';
    if (v === 'HIGH RISK') return COLOR_MALICIOUS;
    return 'var(--primary)';
};

const VERDICT_MAP = {
    'SAFE':       { variant: 'success', icon: ShieldCheck },
    'SUSPICIOUS': { variant: 'warning', icon: AlertTriangle },
    'HIGH RISK':  { variant: 'danger',  icon: ShieldAlert },
};

function VerdictBadge({ verdict }) {
    const v = verdict ? verdict.toUpperCase() : null;
    const { variant, icon: Icon } = VERDICT_MAP[v] || { variant: 'neutral', icon: Activity };
    return (
        <Badge variant={variant}>
            <Icon size={14} /> {verdict || 'N/A'}
        </Badge>
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
    const [period, setPeriod] = useState('week');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [historyPage, setHistoryPage] = useState(1);
    const [historyScans, setHistoryScans] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const dashboardRef = useRef(null);
    const HISTORY_PER_PAGE = 20;

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

    useEffect(() => {
        if (activeTab !== 'history' || !user) return;
        const fetchHistory = async () => {
            setHistoryLoading(true);
            try {
                const skip = (historyPage - 1) * HISTORY_PER_PAGE;
                const res = await fetch(
                    `${API_URL}/api/stats?period=${period}&limit=${HISTORY_PER_PAGE}&skip=${skip}`,
                    { credentials: 'include' },
                );
                if (!res.ok) return;
                const data = await res.json();
                setHistoryScans(data.recentScans || []);
            } catch { /* ignore */ }
            finally { setHistoryLoading(false); }
        };
        fetchHistory();
    }, [activeTab, historyPage, period, user]); // eslint-disable-line react-hooks/exhaustive-deps

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
                        onChange={(e) => { setPeriod(e.target.value); setHistoryPage(1); }}
                        className="form-select"
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    >
                        <option value="day">{t('dashboard.time_day')}</option>
                        <option value="week">{t('dashboard.time_week')}</option>
                        <option value="month">{t('dashboard.time_month')}</option>
                        <option value="all">{t('dashboard.time_all')}</option>
                    </select>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleExportPDF}
                        disabled={isExporting}
                        loading={isExporting}
                        iconLeading={isExporting ? undefined : <Download size={16} />}
                    >
                        {isExporting ? t('dashboard.export_active') : t('dashboard.export_idle')}
                    </Button>
                </div>
            </div>

            {/* ===== TAB: OVERVIEW ===== */}
            {activeTab === 'overview' && (
                <div ref={dashboardRef} className="fade-in">
                    {/* Stat Cards */}
                    <div className="stat-grid stat-grid--wide">
                        <div className="stat-card stat-card--icon">
                            <div className="stat-card-icon" style={{ background: 'var(--ds-brand-soft)', color: 'var(--primary)' }}><Activity size={28} /></div>
                            <div>
                                <p className="stat-card-label">{t('dashboard.total_scans')}</p>
                                <h3 className="stat-card-value">{stats?.totalScans || 0}</h3>
                            </div>
                        </div>
                        <div className="stat-card stat-card--icon">
                            <div className="stat-card-icon" style={{ background: 'var(--alert-error-bg)', color: 'var(--alert-error)' }}><ShieldAlert size={28} /></div>
                            <div>
                                <p className="stat-card-label">{t('dashboard.threats')}</p>
                                <h3 className="stat-card-value">{stats?.verdictDistribution?.find(v => v.name === 'HIGH RISK')?.value || 0}</h3>
                            </div>
                        </div>
                        <div className="stat-card stat-card--icon">
                            <div className="stat-card-icon" style={{ background: 'var(--ds-brand-soft)', color: 'var(--primary)' }}><Radar size={28} /></div>
                            <div>
                                <p className="stat-card-label">{t('recon.title')}</p>
                                <h3 className="stat-card-value">{stats?.reconTotal ?? 0}</h3>
                            </div>
                        </div>
                        <div className="stat-card stat-card--icon">
                            <div className="stat-card-icon" style={{ background: stats?.workerHealth?.status === 'Healthy' ? 'var(--alert-success-bg)' : 'var(--alert-warning-bg)', color: stats?.workerHealth?.status === 'Healthy' ? 'var(--alert-success)' : 'var(--alert-warning)' }}><ShieldCheck size={28} /></div>
                            <div>
                                <p className="stat-card-label">{t('dashboard.worker_mon')}</p>
                                <h3 className="stat-card-value" style={{ fontSize: '1rem' }}>{stats?.workerHealth?.status === 'Healthy' ? t('dashboard.healthy') : t('dashboard.offline')}</h3>
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
                    <div className="dashboard-grid-2col" style={{ marginTop: '2rem' }}>
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
                        <div className="glass-panel" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                            <div className="data-table-toolbar">
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                    <Target size={20} color="var(--primary)" />
                                    {t('dashboard.top_artifacts')}
                                </h3>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table">
                                    <caption className="sr-only">{t('dashboard.top_artifacts')}</caption>
                                    <thead>
                                        <tr>
                                            <th>{t('dashboard.artifact').toUpperCase()}</th>
                                            <th>{t('dashboard.type').toUpperCase()}</th>
                                            <th style={{ textAlign: 'center' }}>{t('dashboard.searches').toUpperCase()}</th>
                                            <th style={{ textAlign: 'right' }}>{t('dashboard.last_risk').toUpperCase()}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {!stats?.topTargets?.length ? (
                                            <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('dashboard.no_artifacts')}</td></tr>
                                        ) : stats.topTargets.map((item) => (
                                            <tr key={item.target}>
                                                <td onClick={() => onSearch?.(item.target)} className="mono" style={{ color: 'var(--primary)', cursor: 'pointer', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.target}>
                                                    <span style={{ textDecoration: 'underline' }}>{item.target}</span>
                                                </td>
                                                <td style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.75rem' }}>{item.type}</td>
                                                <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.count}</td>
                                                <td style={{ textAlign: 'right' }}><VerdictBadge verdict={item.verdict} /></td>
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
                    <div className="glass-panel" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                        <div className="data-table-toolbar">
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                <History size={20} color="var(--primary)" />
                                {t('dashboard.recent_history')}
                            </h3>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                {stats?.totalScans != null && `${t('dashboard.showing_page', { page: historyPage, total: Math.ceil((stats.totalScans || 1) / HISTORY_PER_PAGE) })}`}
                            </span>
                        </div>
                        {historyLoading ? (
                            <div style={{ padding: '3rem', textAlign: 'center' }}>
                                <RefreshCw className="spin" size={22} color="var(--primary)" />
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table">
                                    <caption className="sr-only">{t('dashboard.recent_history')}</caption>
                                    <thead>
                                        <tr>
                                            <th>{t('dashboard.analyst').toUpperCase()}</th>
                                            <th>{t('dashboard.datetime').toUpperCase()}</th>
                                            <th>{t('dashboard.artifact').toUpperCase()}</th>
                                            <th style={{ textAlign: 'right' }}>{t('dashboard.verdict').toUpperCase()}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {!historyScans.length ? (
                                            <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('dashboard.no_history')}</td></tr>
                                        ) : historyScans.map((scan, idx) => (
                                            <tr key={idx}>
                                                <td style={{ color: 'var(--text-secondary)' }}><AnalystCell analyst={scan.analyst} /></td>
                                                <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtBRT(scan.timestamp, locale())}</td>
                                                <td onClick={() => onSearch?.(scan.target)} className="mono" style={{ color: 'var(--primary)', cursor: 'pointer', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={scan.target}>
                                                    <span style={{ textDecoration: 'underline' }}>{scan.target}</span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}><VerdictBadge verdict={scan.verdict} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {stats?.totalScans > HISTORY_PER_PAGE && (
                            <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                                <Pagination
                                    page={historyPage}
                                    totalPages={Math.ceil(stats.totalScans / HISTORY_PER_PAGE)}
                                    onPageChange={setHistoryPage}
                                />
                            </div>
                        )}
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
                    <div className="glass-panel" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                        <div className="data-table-toolbar">
                            <h3 style={{ margin: 0, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                                <AlertTriangle size={20} color="var(--red)" />
                                {t('dashboard.crit_incident')}
                            </h3>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <caption className="sr-only">{t('dashboard.crit_incident')}</caption>
                                <thead>
                                    <tr>
                                        <th>{t('dashboard.datetime').toUpperCase()}</th>
                                        <th>{t('dashboard.artifact').toUpperCase()}</th>
                                        <th style={{ textAlign: 'right' }}>{t('dashboard.verdict').toUpperCase()}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!stats?.criticalIncidents?.length ? (
                                        <tr><td colSpan="3" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('dashboard.no_crits')}</td></tr>
                                    ) : stats.criticalIncidents.map((scan, idx) => (
                                        <tr key={idx}>
                                            <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtBRT(scan.timestamp, locale())}</td>
                                            <td onClick={() => onSearch?.(scan.target)} className="mono" style={{ color: 'var(--red)', cursor: 'pointer', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={scan.target}>
                                                <span style={{ textDecoration: 'underline' }}>{scan.target}</span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}><VerdictBadge verdict={scan.verdict} /></td>
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

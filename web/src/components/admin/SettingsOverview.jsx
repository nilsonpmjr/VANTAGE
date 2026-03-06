import React from 'react';
import { Users, UserCheck, UserX, Lock, Shield, X, Terminal, KeyRound, BarChart2, Upload, Download, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SectionHeader from '../shared/SectionHeader';
import StatCard from '../shared/StatCard';

export default function SettingsOverview({ adminStats, onExport, exporting, onImport, importing, importResult, isAdmin }) {
    const { t } = useTranslation();

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <SectionHeader
                icon={<BarChart2 size={22} color="var(--primary)" />}
                title={t('settings.overview_iam_title')}
                subtitle={t('settings.subtitle')}
            />

            {adminStats && (
                <div className="stat-grid">
                    <StatCard icon={<Users size={20} />} label={t('settings.stats_total')} value={adminStats.total_users} color="var(--primary)" />
                    <StatCard icon={<UserCheck size={20} />} label={t('settings.stats_active')} value={adminStats.active_users} color="var(--green)" />
                    <StatCard icon={<UserX size={20} />} label={t('settings.stats_suspended')} value={adminStats.suspended_users} color="var(--red)" />
                    <StatCard icon={<Lock size={20} />} label={t('settings.stats_locked')} value={adminStats.locked_accounts} color="#fb923c" />
                    <StatCard icon={<Shield size={20} />} label={t('settings.stats_mfa')} value={adminStats.users_with_mfa} color="var(--primary)" />
                    <StatCard icon={<X size={20} />} label={t('settings.stats_failed_24h')} value={adminStats.failed_logins_24h} color="var(--red)" />
                    <StatCard icon={<Terminal size={20} />} label={t('settings.stats_sessions')} value={adminStats.active_sessions} color="var(--primary)" />
                    <StatCard icon={<KeyRound size={20} />} label={t('settings.stats_api_keys')} value={adminStats.active_api_keys} color="#a78bfa" />
                </div>
            )}

            {isAdmin && (
                <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Upload size={20} color="var(--primary)" />
                        {t('settings.import_export_title')}
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 0, marginBottom: '1.5rem' }}>
                        {t('settings.import_export_sub')}
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('settings.export_title')}</span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {['csv', 'json'].map(fmt => (
                                    <button
                                        key={fmt}
                                        onClick={() => onExport(fmt)}
                                        disabled={exporting}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, transition: 'border-color 0.2s, background 0.2s', opacity: exporting ? 0.6 : 1 }}
                                        onMouseOver={e => Object.assign(e.currentTarget.style, { background: 'rgba(56,189,248,0.08)', borderColor: 'var(--accent-border)' })}
                                        onMouseOut={e => Object.assign(e.currentTarget.style, { background: 'var(--glass-bg)', borderColor: 'var(--glass-border)' })}
                                    >
                                        <Download size={15} /> {fmt.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('settings.import_title')}</span>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('settings.import_format_hint')}</p>
                            <label className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                                {importing ? <Loader className="spin" size={15} /> : <Upload size={15} />}
                                {t('settings.import_btn')}
                                <input type="file" accept=".csv" onChange={onImport} style={{ display: 'none' }} disabled={importing} />
                            </label>
                        </div>
                    </div>

                    {importResult && (
                        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', background: importResult.error ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', fontSize: '0.875rem' }}>
                            {importResult.error ? (
                                <span style={{ color: 'var(--red)' }}>{importResult.error}</span>
                            ) : (
                                <>
                                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                                        {t('settings.import_created', { count: importResult.created })} &nbsp;
                                        {t('settings.import_skipped', { count: importResult.skipped })}
                                    </span>
                                    {importResult.errors?.length > 0 && (
                                        <details style={{ marginTop: '0.5rem' }}>
                                            <summary style={{ cursor: 'pointer', color: '#fb923c' }}>
                                                {t('settings.import_errors', { count: importResult.errors.length })}
                                            </summary>
                                            <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {importResult.errors.map((e, i) => (
                                                    <li key={i}>{t('settings.import_error_row', { row: e.row })}: {e.reason} {e.username ? `(${e.username})` : ''}</li>
                                                ))}
                                            </ul>
                                        </details>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

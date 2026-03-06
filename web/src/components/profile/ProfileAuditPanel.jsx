import React, { useState, useEffect } from 'react';
import { ClipboardList, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';

export default function ProfileAuditPanel() {
    const { t } = useTranslation();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetch_ = async () => {
            setLoading(true);
            try {
                const resp = await fetch(`${API_URL}/api/users/me/audit-logs?limit=20`, { credentials: 'include' });
                if (resp.ok) setLogs(await resp.json());
            } finally {
                setLoading(false);
            }
        };
        fetch_();
    }, []);

    return (
        <div className="fade-in">
            <SectionHeader
                icon={<ClipboardList size={22} color="var(--primary)" />}
                title={t('audit.my_history')}
                subtitle={t('audit.my_history_sub')}
            />
            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead style={{ background: 'var(--bg-main)' }}>
                        <tr>
                            {['col_timestamp', 'col_action', 'col_result', 'col_ip'].map(k => (
                                <th key={k} style={{ padding: '0.6rem 0.85rem', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'left' }}>
                                    {t(`audit.${k}`).toUpperCase()}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan="4" style={{ padding: '1.5rem', textAlign: 'center' }}><Loader className="spin" size={18} color="var(--primary)" /></td></tr>
                        )}
                        {!loading && logs.length === 0 && (
                            <tr><td colSpan="4" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('audit.no_entries')}</td></tr>
                        )}
                        {logs.map((item, idx) => (
                            <tr key={idx} style={{ borderTop: '1px solid var(--glass-border)' }}>
                                <td style={{ padding: '0.5rem 0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(item.timestamp).toLocaleString()}</td>
                                <td style={{ padding: '0.5rem 0.85rem' }}>
                                    <span style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '4px', padding: '0.1rem 0.4rem', fontFamily: 'monospace', color: 'var(--primary)', fontSize: '0.75rem' }}>
                                        {item.action}
                                    </span>
                                </td>
                                <td style={{ padding: '0.5rem 0.85rem', fontWeight: 600, color: item.result === 'success' ? 'var(--green)' : item.result === 'failure' ? 'var(--red)' : '#fb923c' }}>
                                    {t(`audit.result_${item.result}`) || item.result}
                                </td>
                                <td style={{ padding: '0.5rem 0.85rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>{item.ip || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

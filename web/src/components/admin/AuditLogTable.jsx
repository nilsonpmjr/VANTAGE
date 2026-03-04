import React, { useState, useEffect, useCallback } from 'react';
import { Loader, Download, ChevronLeft, ChevronRight, Search, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';

const RESULT_COLORS = {
    success: 'var(--green)',
    failure: 'var(--red)',
    denied: '#fb923c',
};

export default function AuditLogTable() {
    const { t } = useTranslation();
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [loading, setLoading] = useState(false);

    const [filterUser, setFilterUser] = useState('');
    const [filterAction, setFilterAction] = useState('');
    const [filterResult, setFilterResult] = useState('');
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');

    const PAGE_SIZE = 50;

    const buildQuery = useCallback((p = page) => {
        const params = new URLSearchParams({ page: p, page_size: PAGE_SIZE });
        if (filterUser) params.set('user', filterUser);
        if (filterAction) params.set('action', filterAction);
        if (filterResult) params.set('result', filterResult);
        if (filterFrom) params.set('from_date', new Date(filterFrom).toISOString());
        if (filterTo) params.set('to_date', new Date(filterTo + 'T23:59:59').toISOString());
        return params.toString();
    }, [page, filterUser, filterAction, filterResult, filterFrom, filterTo]);

    const fetchLogs = useCallback(async (p = page) => {
        setLoading(true);
        try {
            const resp = await fetch(`${API_URL}/api/admin/audit-logs?${buildQuery(p)}`, { credentials: 'include' });
            if (!resp.ok) return;
            const data = await resp.json();
            setItems(data.items);
            setTotal(data.total);
            setPage(data.page);
            setPages(data.pages);
        } finally {
            setLoading(false);
        }
    }, [buildQuery, page]);

    useEffect(() => { fetchLogs(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(1);
        fetchLogs(1);
    };

    const handleExport = async (format) => {
        const params = new URLSearchParams({ format });
        if (filterUser) params.set('user', filterUser);
        if (filterAction) params.set('action', filterAction);
        if (filterResult) params.set('result', filterResult);
        if (filterFrom) params.set('from_date', new Date(filterFrom).toISOString());
        if (filterTo) params.set('to_date', new Date(filterTo + 'T23:59:59').toISOString());
        const resp = await fetch(`${API_URL}/api/admin/audit-logs/export?${params}`, { credentials: 'include' });
        if (!resp.ok) return;
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_log.${format}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatTs = (raw) => {
        if (!raw) return '—';
        const d = new Date(raw);
        return isNaN(d.getTime()) ? raw : d.toLocaleString();
    };

    return (
        <div>
            {/* Filters */}
            <form onSubmit={handleSearch} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-main)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.4rem 0.75rem', flexGrow: 1, minWidth: '140px' }}>
                    <Search size={14} color="var(--text-muted)" />
                    <input
                        type="text" value={filterUser} onChange={e => setFilterUser(e.target.value)}
                        placeholder={t('audit.filter_user')}
                        style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', width: '100%' }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-main)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.4rem 0.75rem', flexGrow: 1, minWidth: '140px' }}>
                    <Filter size={14} color="var(--text-muted)" />
                    <input
                        type="text" value={filterAction} onChange={e => setFilterAction(e.target.value)}
                        placeholder={t('audit.filter_action')}
                        style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', width: '100%' }}
                    />
                </div>
                <select
                    value={filterResult} onChange={e => setFilterResult(e.target.value)}
                    style={{ background: 'var(--bg-main)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.4rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                    <option value="">{t('audit.filter_all')}</option>
                    <option value="success">{t('audit.filter_success')}</option>
                    <option value="failure">{t('audit.filter_failure')}</option>
                    <option value="denied">{t('audit.filter_denied')}</option>
                </select>
                <input
                    type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                    title={t('audit.filter_from')}
                    style={{ background: 'var(--bg-main)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.4rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
                <input
                    type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                    title={t('audit.filter_to')}
                    style={{ background: 'var(--bg-main)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.4rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
                <button type="submit" className="btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                    {t('audit.search')}
                </button>
                <button type="button" onClick={() => handleExport('csv')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', background: 'var(--bg-main)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <Download size={14} /> CSV
                </button>
            </form>

            {/* Table */}
            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                    <thead style={{ background: 'var(--bg-main)' }}>
                        <tr>
                            {['col_timestamp', 'col_user', 'col_action', 'col_target', 'col_result', 'col_ip', 'col_detail'].map(k => (
                                <th key={k} style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                    {t(`audit.${k}`).toUpperCase()}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}><Loader className="spin" size={20} /></td></tr>
                        )}
                        {!loading && items.length === 0 && (
                            <tr><td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('audit.no_entries')}</td></tr>
                        )}
                        {!loading && items.map((item, idx) => (
                            <tr key={idx} style={{ borderTop: '1px solid var(--glass-border)' }}>
                                <td style={{ padding: '0.6rem 1rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatTs(item.timestamp)}</td>
                                <td style={{ padding: '0.6rem 1rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>{item.user}</td>
                                <td style={{ padding: '0.6rem 1rem' }}>
                                    <span style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '4px', padding: '0.15rem 0.5rem', fontFamily: 'monospace', color: 'var(--primary)', fontSize: '0.78rem' }}>
                                        {item.action}
                                    </span>
                                </td>
                                <td style={{ padding: '0.6rem 1rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{item.target || '—'}</td>
                                <td style={{ padding: '0.6rem 1rem' }}>
                                    <span style={{ color: RESULT_COLORS[item.result] || 'var(--text-muted)', fontWeight: 600, fontSize: '0.78rem' }}>
                                        {t(`audit.result_${item.result}`) || item.result}
                                    </span>
                                </td>
                                <td style={{ padding: '0.6rem 1rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.78rem' }}>{item.ip || '—'}</td>
                                <td style={{ padding: '0.6rem 1rem', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.detail}>{item.detail || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {t('audit.page_of', { page, pages })} — {total} {t('audit.total_entries')}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => fetchLogs(page - 1)} disabled={page <= 1} style={{ background: 'var(--bg-main)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: page <= 1 ? 'not-allowed' : 'pointer', color: page <= 1 ? 'var(--glass-border)' : 'var(--text-primary)' }}>
                            <ChevronLeft size={16} />
                        </button>
                        <button onClick={() => fetchLogs(page + 1)} disabled={page >= pages} style={{ background: 'var(--bg-main)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: page >= pages ? 'not-allowed' : 'pointer', color: page >= pages ? 'var(--glass-border)' : 'var(--text-primary)' }}>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

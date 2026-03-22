import React, { useState, useEffect, useCallback } from 'react';
import { Loader, Download, Search, Filter } from 'lucide-react';
import { fmtBRT } from '../../utils/dateFormat';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Pagination from '../shared/Pagination';

const RESULT_VARIANT = {
    success: 'success',
    failure: 'danger',
    denied: 'warning',
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

    const formatTs = (raw) => fmtBRT(raw);

    return (
        <div className="v-density-compact">
            {/* Filters */}
            <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        <input
                            type="text" value={filterUser} onChange={e => setFilterUser(e.target.value)}
                            placeholder={t('audit.filter_user')}
                            className="form-input"
                            style={{ paddingLeft: '2rem', width: '100%' }}
                        />
                    </div>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Filter size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        <input
                            type="text" value={filterAction} onChange={e => setFilterAction(e.target.value)}
                            placeholder={t('audit.filter_action')}
                            className="form-input"
                            style={{ paddingLeft: '2rem', width: '100%' }}
                        />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        value={filterResult} onChange={e => setFilterResult(e.target.value)}
                        className="form-select"
                        style={{ width: 'auto', minWidth: '120px' }}
                    >
                        <option value="">{t('audit.filter_all')}</option>
                        <option value="success">{t('audit.filter_success')}</option>
                        <option value="failure">{t('audit.filter_failure')}</option>
                        <option value="denied">{t('audit.filter_denied')}</option>
                    </select>
                    <input
                        type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                        title={t('audit.filter_from')}
                        className="form-input"
                        style={{ width: 'auto' }}
                    />
                    <input
                        type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                        title={t('audit.filter_to')}
                        className="form-input"
                        style={{ width: 'auto' }}
                    />
                    <Button type="submit" variant="primary" size="sm" iconLeading={<Search size={14} />}>
                        {t('audit.search')}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => handleExport('csv')} iconLeading={<Download size={14} />}>
                        CSV
                    </Button>
                </div>
            </form>

            {/* Table */}
            <div className="glass-panel" style={{ padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                {['col_timestamp', 'col_user', 'col_action', 'col_target', 'col_result', 'col_ip', 'col_detail'].map(k => (
                                    <th key={k}>{t(`audit.${k}`).toUpperCase()}</th>
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
                                <tr key={idx}>
                                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatTs(item.timestamp)}</td>
                                    <td className="mono">{item.user}</td>
                                    <td>
                                        <Badge variant="primary">{item.action}</Badge>
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)' }} className="mono">{item.target || '—'}</td>
                                    <td>
                                        <Badge variant={RESULT_VARIANT[item.result] || 'neutral'}>
                                            {t(`audit.result_${item.result}`) || item.result}
                                        </Badge>
                                    </td>
                                    <td style={{ color: 'var(--text-muted)' }} className="mono">{item.ip || '—'}</td>
                                    <td style={{ color: 'var(--text-secondary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.detail}>{item.detail || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {pages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {t('audit.page_of', { page, pages })} — {total} {t('audit.total_entries')}
                    </span>
                    <Pagination page={page} totalPages={pages} onPageChange={fetchLogs} />
                </div>
            )}
        </div>
    );
}

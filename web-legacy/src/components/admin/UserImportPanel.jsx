import React, { useState } from 'react';
import { Upload, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';

export default function UserImportPanel({ onImportDone }) {
    const { t } = useTranslation();
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState(null);

    const handleImport = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        setResult(null);
        try {
            const form = new FormData();
            form.append('file', file);
            const resp = await fetch(`${API_URL}/api/admin/users/import`, {
                method: 'POST',
                credentials: 'include',
                body: form,
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail || t('settings.import_error'));
            setResult(data);
            if (onImportDone) onImportDone();
        } catch (err) {
            setResult({ error: err.message });
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    return (
        <div className="fade-in">
            <SectionHeader
                icon={<Upload size={22} color="var(--primary)" />}
                title={t('settings.import_title')}
                subtitle={t('settings.import_format_hint')}
            />

            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                <label className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.25rem', cursor: 'pointer' }}>
                    {importing ? <Loader className="spin" size={16} /> : <Upload size={16} />}
                    {t('settings.import_btn')}
                    <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} disabled={importing} />
                </label>

                {result && (
                    <div className={`alert-banner ${result.error ? 'error' : 'success'}`} style={{ marginTop: '1.25rem' }}>
                        {result.error ? (
                            <span>{result.error}</span>
                        ) : (
                            <>
                                <span style={{ fontWeight: 600 }}>
                                    {t('settings.import_created', { count: result.created })} &nbsp;
                                    {t('settings.import_skipped', { count: result.skipped })}
                                </span>
                                {result.errors?.length > 0 && (
                                    <details style={{ marginTop: '0.5rem' }}>
                                        <summary style={{ cursor: 'pointer', color: 'var(--alert-warning)' }}>
                                            {t('settings.import_errors', { count: result.errors.length })}
                                        </summary>
                                        <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            {result.errors.map((e, i) => (
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
        </div>
    );
}

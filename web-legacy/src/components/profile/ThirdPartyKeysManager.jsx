import React, { useState, useEffect, useCallback } from 'react';
import { Key, Check, X, Loader2, Trash2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';

const SERVICES = [
    { id: 'virustotal', name: 'VirusTotal', domain: 'virustotal.com', docsUrl: 'https://www.virustotal.com/gui/my-apikey' },
    { id: 'abuseipdb', name: 'AbuseIPDB', domain: 'abuseipdb.com', docsUrl: 'https://www.abuseipdb.com/account/api' },
    { id: 'shodan', name: 'Shodan', domain: 'shodan.io', docsUrl: 'https://account.shodan.io/' },
    { id: 'alienvault', name: 'AlienVault OTX', domain: 'alienvault.com', docsUrl: 'https://otx.alienvault.com/api' },
    { id: 'greynoise', name: 'GreyNoise', domain: 'greynoise.io', docsUrl: 'https://viz.greynoise.io/account/api-key' },
    { id: 'urlscan', name: 'UrlScan.io', domain: 'urlscan.io', docsUrl: 'https://urlscan.io/user/profile/' },
    { id: 'blacklistmaster', name: 'BlacklistMaster', domain: 'blacklistmaster.com', docsUrl: 'https://www.blacklistmaster.com/restapi' },
    { id: 'abusech', name: 'Abuse.ch', domain: 'abuse.ch', docsUrl: 'https://threatfox.abuse.ch/api/' },
    { id: 'pulsedive', name: 'Pulsedive', domain: 'pulsedive.com', docsUrl: 'https://pulsedive.com/account' },
];

export default function ThirdPartyKeysManager() {
    const { t } = useTranslation();
    const [status, setStatus] = useState({});  // { virustotal: { configured: true }, ... }
    const [editing, setEditing] = useState(null);  // service id being edited
    const [keyValue, setKeyValue] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const fetchStatus = useCallback(async () => {
        try {
            const r = await fetch(`${API_URL}/api/users/me/third-party-keys`, { credentials: 'include' });
            if (r.ok) setStatus(await r.json());
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchStatus(); }, [fetchStatus]);

    const handleSave = async (serviceId) => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const r = await fetch(`${API_URL}/api/users/me/third-party-keys`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys: { [serviceId]: keyValue } }),
            });
            if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Error'); }
            setSuccess(serviceId);
            setEditing(null);
            setKeyValue('');
            fetchStatus();
            setTimeout(() => setSuccess(null), 3000);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (serviceId) => {
        setSaving(true);
        setError(null);
        try {
            const r = await fetch(`${API_URL}/api/users/me/third-party-keys`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys: { [serviceId]: '' } }),
            });
            if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Error'); }
            fetchStatus();
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <Loader2 size={24} className="spin" style={{ color: 'var(--primary)' }} />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: '0.75rem' }}>
                {t('third_party_keys.description')}
            </p>
            {error && (
                <div className="alert-banner error compact">
                    {error}
                </div>
            )}
            {SERVICES.map(svc => {
                const configured = status[svc.id]?.configured;
                const isEditing = editing === svc.id;
                return (
                    <div
                        key={svc.id}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            padding: '0.75rem 1rem',
                            background: 'var(--bg-card)',
                            border: `1px solid ${success === svc.id ? 'var(--green)' : 'var(--glass-border)'}`,
                            borderRadius: 'var(--radius-sm)',
                            transition: 'border-color 0.3s',
                        }}
                    >
                        <img
                            src={`https://www.google.com/s2/favicons?domain=${svc.domain}&sz=32`}
                            alt=""
                            style={{ width: 20, height: 20, borderRadius: 2, flexShrink: 0 }}
                            onError={e => { e.target.style.display = 'none'; }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{svc.name}</span>
                                {configured && !isEditing && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: 'var(--green)', fontSize: '0.72rem', fontWeight: 600 }}>
                                        <Check size={12} /> {t('third_party_keys.configured')}
                                    </span>
                                )}
                                {!configured && !isEditing && (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                        {t('third_party_keys.not_configured')}
                                    </span>
                                )}
                            </div>
                            {isEditing && (
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                    <input
                                        type="password"
                                        value={keyValue}
                                        onChange={e => setKeyValue(e.target.value)}
                                        placeholder={t('third_party_keys.key_placeholder')}
                                        autoFocus
                                        style={{
                                            flex: 1,
                                            background: 'var(--bg-main)',
                                            border: '1px solid var(--glass-border)',
                                            color: 'var(--text-primary)',
                                            borderRadius: 'var(--radius-sm)',
                                            padding: '0.4rem 0.6rem',
                                            fontSize: '0.82rem',
                                            fontFamily: 'monospace',
                                        }}
                                        onKeyDown={e => { if (e.key === 'Enter' && keyValue.trim()) handleSave(svc.id); if (e.key === 'Escape') { setEditing(null); setKeyValue(''); } }}
                                    />
                                    <button
                                        onClick={() => handleSave(svc.id)}
                                        disabled={!keyValue.trim() || saving}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                                            background: 'var(--accent-glow)', border: '1px solid var(--accent-border)',
                                            color: 'var(--primary)', borderRadius: 'var(--radius-sm)',
                                            padding: '0.35rem 0.7rem', cursor: 'pointer', fontWeight: 600,
                                            fontSize: '0.8rem', opacity: (!keyValue.trim() || saving) ? 0.5 : 1,
                                        }}
                                    >
                                        {saving ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                                    </button>
                                    <button
                                        onClick={() => { setEditing(null); setKeyValue(''); }}
                                        style={{
                                            display: 'flex', alignItems: 'center',
                                            background: 'transparent', border: '1px solid var(--glass-border)',
                                            color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)',
                                            padding: '0.35rem 0.5rem', cursor: 'pointer',
                                        }}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                            <a
                                href={svc.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={t('third_party_keys.get_key')}
                                style={{
                                    display: 'flex', alignItems: 'center',
                                    color: 'var(--text-muted)', padding: '0.3rem',
                                    borderRadius: 'var(--radius-sm)',
                                    transition: 'color 0.2s',
                                }}
                            >
                                <ExternalLink size={14} />
                            </a>
                            {!isEditing && (
                                <button
                                    onClick={() => { setEditing(svc.id); setKeyValue(''); setError(null); }}
                                    style={{
                                        display: 'flex', alignItems: 'center',
                                        background: 'transparent', border: '1px solid var(--glass-border)',
                                        color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)',
                                        padding: '0.3rem 0.5rem', cursor: 'pointer', fontSize: '0.78rem',
                                    }}
                                >
                                    <Key size={12} />
                                </button>
                            )}
                            {configured && !isEditing && (
                                <button
                                    onClick={() => handleRemove(svc.id)}
                                    disabled={saving}
                                    title={t('third_party_keys.remove')}
                                    style={{
                                        display: 'flex', alignItems: 'center',
                                        background: 'transparent', border: '1px solid var(--glass-border)',
                                        color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)',
                                        padding: '0.3rem 0.5rem', cursor: 'pointer',
                                    }}
                                >
                                    <Trash2 size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

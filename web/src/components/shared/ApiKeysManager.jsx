import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Copy, CheckCircle, Key } from 'lucide-react';
import API_URL from '../../config';
import Button from '../ui/Button';
import { fmtDateBRT } from '../../utils/dateFormat';
import ConfirmModal from './ConfirmModal';

export default function ApiKeysManager() {
    const { t } = useTranslation();
    const [keys, setKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyExpiry, setNewKeyExpiry] = useState('');
    const [newKeyScopes, setNewKeyScopes] = useState(['analyze']);
    const [showForm, setShowForm] = useState(false);
    const [revealedKey, setRevealedKey] = useState(null); // { key_id, key }
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const [confirmRevoke, setConfirmRevoke] = useState(null); // { key_id, name }

    const fetchKeys = useCallback(async () => {
        setLoading(true);
        try {
            const resp = await fetch(`${API_URL}/api/api-keys/me`, { credentials: 'include' });
            if (resp.ok) setKeys(await resp.json());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchKeys(); }, [fetchKeys]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newKeyName.trim()) return;
        setError('');
        setCreating(true);
        try {
            const body = { name: newKeyName.trim(), scopes: newKeyScopes };
            if (newKeyExpiry) body.expires_days = parseInt(newKeyExpiry, 10);

            const resp = await fetch(`${API_URL}/api/api-keys`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                setError(err.detail || t('api_keys.err_create'));
                return;
            }

            const data = await resp.json();
            setRevealedKey({ key_id: data.key_id, key: data.key });
            setShowForm(false);
            setNewKeyName('');
            setNewKeyExpiry('');
            setNewKeyScopes(['analyze']);
            await fetchKeys();
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = (key_id, name) => {
        setConfirmRevoke({ key_id, name });
    };

    const doRevoke = async () => {
        if (!confirmRevoke) return;
        await fetch(`${API_URL}/api/api-keys/${confirmRevoke.key_id}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        if (revealedKey?.key_id === confirmRevoke.key_id) setRevealedKey(null);
        setConfirmRevoke(null);
        await fetchKeys();
    };

    const handleCopy = async () => {
        if (!revealedKey) return;
        await navigator.clipboard.writeText(revealedKey.key);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div>
            {confirmRevoke && (
                <ConfirmModal
                    title={t('api_keys.revoke')}
                    message={t('api_keys.confirm_revoke', { name: confirmRevoke.name })}
                    danger
                    onConfirm={doRevoke}
                    onCancel={() => setConfirmRevoke(null)}
                />
            )}
            <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {t('api_keys.subtitle')}
            </p>

            {/* Revealed key banner — shown once after creation */}
            {revealedKey && (
                <div style={{
                    background: 'var(--alert-success-bg)',
                    border: '1px solid var(--alert-success-border)',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1.25rem',
                }}>
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--green)', fontWeight: 600 }}>
                        {t('api_keys.copy_notice')}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <code style={{
                            flex: 1, padding: '0.5rem 0.75rem', borderRadius: '6px',
                            background: 'var(--bg-main)', border: '1px solid var(--glass-border)',
                            fontSize: '0.8rem', color: 'var(--primary)', wordBreak: 'break-all',
                            fontFamily: 'monospace',
                        }}>
                            {revealedKey.key}
                        </code>
                        <button
                            className="service-card-info-btn"
                            onClick={handleCopy}
                            title={t('api_keys.copy_key')}
                            style={{ color: copied ? 'var(--green)' : undefined }}
                        >
                            {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
                        </button>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>
            )}

            {/* Create form */}
            {showForm ? (
                <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem', padding: '1rem', background: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'end' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                                {t('api_keys.name_label')}
                            </label>
                            <input
                                type="text"
                                value={newKeyName}
                                onChange={e => setNewKeyName(e.target.value)}
                                placeholder={t('api_keys.name_placeholder')}
                                maxLength={80}
                                required
                                className="form-input"
                                style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'var(--bg-card)', fontSize: '0.85rem' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                                {t('api_keys.expiry_label')}
                            </label>
                            <input
                                type="number"
                                value={newKeyExpiry}
                                onChange={e => setNewKeyExpiry(e.target.value)}
                                placeholder={t('api_keys.expiry_placeholder')}
                                min={1}
                                max={3650}
                                className="form-input"
                                style={{ width: '120px', padding: '0.5rem 0.75rem', background: 'var(--bg-card)', fontSize: '0.85rem' }}
                            />
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                            {t('api_keys.scopes_label')}
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {['analyze', 'recon', 'batch', 'stats'].map(scope => (
                                <label key={scope} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                                    fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer',
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={newKeyScopes.includes(scope)}
                                        onChange={e => {
                                            setNewKeyScopes(prev =>
                                                e.target.checked
                                                    ? [...prev, scope]
                                                    : prev.filter(s => s !== scope)
                                            );
                                        }}
                                        style={{ accentColor: 'var(--primary)' }}
                                    />
                                    {t(`api_keys.scope_${scope}`)}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button type="submit" variant="primary" size="sm" loading={creating} iconLeading={<Plus size={14} />}>
                            {t('api_keys.create_btn')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setError(''); setNewKeyScopes(['analyze']); }}>
                            {t('api_keys.cancel')}
                        </Button>
                    </div>
                </form>
            ) : (
                <Button variant="secondary" size="sm" onClick={() => { setShowForm(true); setError(''); }} iconLeading={<Plus size={15} />} style={{ marginBottom: '1.25rem' }}>
                    {t('api_keys.new_key')}
                </Button>
            )}

            {/* Keys list */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                    <Loader className="spin" size={18} />
                </div>
            ) : keys.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0' }}>
                    {t('api_keys.no_keys')}
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {keys.map(k => (
                        <div key={k.key_id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.75rem 1rem', background: 'var(--bg-main)',
                            borderRadius: '8px', border: '1px solid var(--glass-border)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                                <Key size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {k.name}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                        {k.prefix}
                                        {k.expires_at && (
                                            <span style={{ marginLeft: '0.75rem' }}>
                                                {t('api_keys.expires')}: {fmtDateBRT(k.expires_at)}
                                            </span>
                                        )}
                                        {k.last_used_at && (
                                            <span style={{ marginLeft: '0.75rem' }}>
                                                {t('api_keys.last_used')}: {fmtDateBRT(k.last_used_at)}
                                            </span>
                                        )}
                                    </div>
                                    {k.scopes && k.scopes.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.3rem' }}>
                                            {k.scopes.map(s => (
                                                <span key={s} className="v-badge v-badge--primary" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', fontFamily: 'monospace' }}>
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => handleRevoke(k.key_id, k.name)}
                                title={t('api_keys.revoke')}
                                style={{
                                    background: 'transparent', border: 'none',
                                    color: 'var(--red)', cursor: 'pointer',
                                    padding: '0.25rem', borderRadius: '4px',
                                    display: 'flex', alignItems: 'center', flexShrink: 0,
                                }}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

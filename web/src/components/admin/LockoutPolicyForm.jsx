import React, { useState, useEffect } from 'react';
import { Lock, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';

export default function LockoutPolicyForm() {
    const { t } = useTranslation();
    const [policy, setPolicy] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        fetch(`${API_URL}/api/admin/lockout-policy`, { credentials: 'include' })
            .then(r => r.json())
            .then(setPolicy)
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMsg('');
        try {
            const resp = await fetch(`${API_URL}/api/admin/lockout-policy`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(policy),
            });
            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(err.detail || 'Error');
            }
            setPolicy(await resp.json());
            setMsg(t('settings.lockout_saved'));
        } catch (err) {
            setMsg(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fade-in">
            <SectionHeader
                icon={<Lock size={22} color="var(--primary)" />}
                title={t('settings.lockout_policy')}
                subtitle={t('settings.lockout_subtitle')}
            />

            {loading && <Loader className="spin" size={24} color="var(--primary)" />}

            {policy && (
                <form onSubmit={handleSave} className="glass-panel" style={{ padding: '1.75rem', borderRadius: '12px' }}>
                    <div className="form-grid form-grid-2" style={{ marginBottom: '1.5rem' }}>
                        <div className="form-field">
                            <label className="form-label">{t('settings.lockout_max_attempts')}</label>
                            <span className="form-hint">{t('settings.lockout_max_hint')}</span>
                            <input type="number" min={1} max={100} value={policy.max_attempts}
                                onChange={e => setPolicy(p => ({ ...p, max_attempts: Number(e.target.value) }))}
                                className="form-input" />
                        </div>
                        <div className="form-field">
                            <label className="form-label">{t('settings.lockout_minutes')}</label>
                            <span className="form-hint">{t('settings.lockout_minutes_hint')}</span>
                            <input type="number" min={1} max={1440} value={policy.lockout_minutes}
                                onChange={e => setPolicy(p => ({ ...p, lockout_minutes: Number(e.target.value) }))}
                                className="form-input" />
                        </div>
                    </div>

                    <div className="form-actions">
                        <button type="submit" disabled={saving} className="btn-primary" style={{ minWidth: '160px' }}>
                            {saving ? <Loader className="spin" size={18} /> : t('settings.lockout_save')}
                        </button>
                        {msg && <span style={{ fontSize: '0.85rem', color: msg === t('settings.lockout_saved') ? 'var(--green)' : 'var(--red)' }}>{msg}</span>}
                    </div>
                </form>
            )}
        </div>
    );
}

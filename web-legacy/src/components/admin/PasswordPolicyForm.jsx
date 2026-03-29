import React, { useState, useEffect } from 'react';
import { KeyRound, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';
import ToggleSwitch from '../shared/ToggleSwitch';

export default function PasswordPolicyForm() {
    const { t } = useTranslation();
    const [policy, setPolicy] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        fetch(`${API_URL}/api/admin/password-policy`, { credentials: 'include' })
            .then(r => r.json())
            .then(setPolicy)
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMsg('');
        try {
            const resp = await fetch(`${API_URL}/api/admin/password-policy`, {
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
            setMsg(t('settings.policy_saved'));
        } catch (err) {
            setMsg(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fade-in">
            <SectionHeader
                icon={<KeyRound size={22} color="var(--primary)" />}
                title={t('settings.policy_title')}
                subtitle={t('settings.policy_subtitle')}
            />

            {loading && <Loader className="spin" size={24} color="var(--primary)" />}

            {policy && (
                <form onSubmit={handleSave} className="glass-panel" style={{ padding: '1.75rem', borderRadius: '12px' }}>
                    <div className="form-grid form-grid-2" style={{ marginBottom: '1.5rem' }}>
                        <div className="form-field">
                            <label className="form-label">{t('settings.policy_min_length')}</label>
                            <input type="number" min={6} max={128} value={policy.min_length}
                                onChange={e => setPolicy(p => ({ ...p, min_length: Number(e.target.value) }))}
                                className="form-input" />
                        </div>
                        <div className="form-field">
                            <label className="form-label">{t('settings.policy_history')}</label>
                            <input type="number" min={0} max={24} value={policy.history_count}
                                onChange={e => setPolicy(p => ({ ...p, history_count: Number(e.target.value) }))}
                                className="form-input" />
                        </div>
                        <div className="form-field">
                            <label className="form-label">{t('settings.policy_expiry')}</label>
                            <input type="number" min={0} max={3650} value={policy.expiry_days}
                                onChange={e => setPolicy(p => ({ ...p, expiry_days: Number(e.target.value) }))}
                                className="form-input" />
                        </div>
                        <div className="form-field">
                            <label className="form-label">{t('settings.policy_warning')}</label>
                            <input type="number" min={1} max={90} value={policy.expiry_warning_days}
                                onChange={e => setPolicy(p => ({ ...p, expiry_warning_days: Number(e.target.value) }))}
                                className="form-input" />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        {[
                            ['require_uppercase', 'policy_uppercase'],
                            ['require_numbers', 'policy_numbers'],
                            ['require_symbols', 'policy_symbols'],
                        ].map(([key, labelKey]) => (
                            <ToggleSwitch
                                key={key}
                                checked={policy[key]}
                                onChange={v => setPolicy(p => ({ ...p, [key]: v }))}
                                label={t(`settings.${labelKey}`)}
                            />
                        ))}

                        <div style={{ borderTop: '1px solid var(--glass-border)', margin: '0.5rem 0', paddingTop: '0.5rem' }}>
                            <ToggleSwitch
                                checked={policy.mask_pii !== false}
                                onChange={v => setPolicy(p => ({ ...p, mask_pii: v }))}
                                label={t('settings.mask_pii')}
                            />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.15rem', marginLeft: '2.5rem' }}>
                                {t('settings.mask_pii_desc')}
                            </span>
                        </div>
                    </div>

                    <div className="form-actions">
                        <button type="submit" disabled={saving} className="btn-primary" style={{ minWidth: '160px' }}>
                            {saving ? <Loader className="spin" size={18} /> : t('settings.policy_save')}
                        </button>
                        {msg && <span style={{ fontSize: '0.85rem', color: msg === t('settings.policy_saved') ? 'var(--green)' : 'var(--red)' }}>{msg}</span>}
                    </div>
                </form>
            )}
        </div>
    );
}

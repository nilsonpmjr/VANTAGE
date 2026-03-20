import React, { useState } from 'react';
import { Lock, Loader, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';

export default function ProfilePasswordPanel({ notices }) {
    const { user, updateUserContext } = useAuth();
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });
        if (password !== confirmPassword) {
            setMessage({ type: 'error', text: t('profile.err_pass_match') });
            return;
        }
        if (password.length < 6) {
            setMessage({ type: 'error', text: t('profile.err_pass_len') });
            return;
        }
        setLoading(true);
        try {
            const resp = await fetch(`${API_URL}/api/users/me`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            if (!resp.ok) {
                const errData = await resp.json();
                const raw = errData.detail || t('profile.err_update');
                let msg = raw;
                if (typeof raw === 'string') {
                    if (raw.startsWith('password_too_short:')) msg = t('profile.err_policy_min', { min: raw.split(':')[1] });
                    else if (raw === 'password_needs_uppercase') msg = t('profile.err_policy_upper');
                    else if (raw === 'password_needs_number') msg = t('profile.err_policy_number');
                    else if (raw === 'password_needs_symbol') msg = t('profile.err_policy_symbol');
                    else if (raw === 'password_reuse_denied') msg = t('profile.err_pass_history');
                }
                throw new Error(msg);
            }
            try {
                const meResp = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
                if (meResp.ok && updateUserContext) updateUserContext({ ...user, ...(await meResp.json()) });
            } catch { /* non-critical */ }
            setMessage({ type: 'success', text: t('profile.success') });
            setPassword('');
            setConfirmPassword('');
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fade-in">
            <SectionHeader
                icon={<Lock size={22} color="var(--primary)" />}
                title={t('profile.security')}
                subtitle={t('profile.security_sub')}
            />
            {notices}
            {message.text && (
                <div className={`alert-banner wide ${message.type === 'error' ? 'error' : 'success'}`}>
                    {message.text}
                </div>
            )}
            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '12px' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '480px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('profile.new_pass')}</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="form-input" style={{ width: '100%', padding: '0.6rem' }} placeholder="••••••••" />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('profile.confirm_pass')}</label>
                        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="form-input" style={{ width: '100%', padding: '0.6rem' }} placeholder="••••••••" />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" disabled={loading} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {loading ? <Loader className="spin" size={18} /> : <Save size={18} />}
                            {t('profile.save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

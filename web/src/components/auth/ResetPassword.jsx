import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Loader, CheckCircle } from 'lucide-react';
import API_URL from '../../config';
import useBrandTheme from '../../branding/useBrandTheme';

export default function ResetPassword({ token, onSuccess }) {
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const { brand, logoPath } = useBrandTheme();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirm) {
            setError(t('reset_password.err_match'));
            return;
        }
        if (password.length < 6) {
            setError(t('reset_password.err_min_length'));
            return;
        }

        setLoading(true);
        try {
            const resp = await fetch(`${API_URL}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, new_password: password }),
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                const detail = err.detail || 'error';
                if (detail === 'invalid_or_expired_token') throw new Error(t('reset_password.err_invalid_token'));
                if (detail === 'token_already_used') throw new Error(t('reset_password.err_used_token'));
                if (detail === 'password_reuse_denied') throw new Error(t('reset_password.err_reuse'));
                if (typeof detail === 'string' && detail.startsWith('password_too_short:')) {
                    const min = detail.split(':')[1];
                    throw new Error(t('profile.err_policy_min', { min }));
                }
                throw new Error(t('reset_password.err_generic'));
            }

            setDone(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (done) {
        return (
            <div className="v-arch-focus" style={{ background: 'var(--bg-main)' }}>
                <div className="login-box glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>
                    <CheckCircle size={48} color="var(--green)" style={{ marginBottom: '1rem' }} />
                    <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>{t('reset_password.success_title')}</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{t('reset_password.success_subtitle')}</p>
                    <button onClick={onSuccess} className="btn-primary" style={{ width: '100%' }}>
                        {t('reset_password.go_to_login')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="v-arch-focus" style={{ background: 'var(--bg-main)' }}>
            <div className="login-box glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <img src={logoPath} alt={brand.name} style={{ width: '200px', height: 'auto' }} onError={(e) => { e.target.style.display = 'none'; }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                    <Lock size={40} color="var(--primary)" />
                </div>

                <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem', fontSize: '1.2rem' }}>
                    {t('reset_password.title')}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                    {t('reset_password.subtitle')}
                </p>

                {error && (
                    <div className="alert-banner error">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'left' }}>
                    <div className="form-field">
                        <label className="form-field__label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                            {t('reset_password.new_password')}
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            minLength={6}
                            className="form-input"
                            placeholder="••••••••"
                        />
                    </div>
                    <div className="form-field">
                        <label className="form-field__label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                            {t('reset_password.confirm_password')}
                        </label>
                        <input
                            type="password"
                            value={confirm}
                            onChange={e => setConfirm(e.target.value)}
                            required
                            className="form-input"
                            placeholder="••••••••"
                        />
                    </div>
                    <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: '0.5rem' }}>
                        {loading ? <Loader className="spin" size={18} /> : t('reset_password.submit')}
                    </button>
                </form>
            </div>
        </div>
    );
}

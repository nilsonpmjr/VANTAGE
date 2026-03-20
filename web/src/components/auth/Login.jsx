import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldAlert, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../index.css';
import { fmtTimeBRT } from '../../utils/dateFormat';
import useBrandTheme from '../../branding/useBrandTheme';

export default function Login({ onForgotPassword }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { login } = useAuth();
    const { t } = useTranslation();
    const { brand, logoPath } = useBrandTheme();

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            await login(username, password);
        } catch (err) {
            if (err.code === 'account_locked') {
                const until = err.locked_until
                    ? fmtTimeBRT(err.locked_until)
                    : '';
                setError(t('login.error_locked', { until }));
            } else {
                setError(t('login.error_credentials'));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="v-arch-focus" style={{ background: 'var(--bg-main)' }}>
            <div className="login-box glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <img
                        src={logoPath}
                        alt={brand.name}
                        style={{ width: '200px', height: 'auto', marginBottom: '0.5rem' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                </div>

                <h2 style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>{t('login.subtitle')}</h2>

                {error && (
                    <div className="alert-banner error wide">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-field" style={{ textAlign: 'left' }}>
                        <label className="form-field__label" style={{ marginBottom: '0.5rem', display: 'block' }}>{t('login.username')}</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="form-input"
                            placeholder={t('login.username_placeholder', 'Enter your username...')}
                        />
                    </div>

                    <div className="form-field" style={{ textAlign: 'left', marginBottom: '1rem' }}>
                        <label className="form-field__label" style={{ marginBottom: '0.5rem', display: 'block' }}>{t('login.password')}</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="form-input"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? <Loader className="spin" size={20} /> : t('login.submit')}
                    </button>
                </form>

                {onForgotPassword && (
                    <button
                        onClick={onForgotPassword}
                        style={{ marginTop: '1.25rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}
                    >
                        {t('login.forgot_password')}
                    </button>
                )}

            </div>
        </div>
    );
}

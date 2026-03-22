import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, ShieldAlert, ArrowLeft } from 'lucide-react';
import API_URL from '../../config';
import useBrandTheme from '../../branding/useBrandTheme';
import Button from '../ui/Button';

export default function ForgotPassword({ onBack }) {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');
    const { brand, logoPath } = useBrandTheme();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const resp = await fetch(`${API_URL}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.detail || t('forgot_password.error_generic'));
            }
            setSent(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="v-arch-focus">
            <div className="login-box glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <img src={logoPath} alt={brand.name} style={{ width: '200px', height: 'auto' }} onError={(e) => { e.target.style.display = 'none'; }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                    <ShieldAlert size={40} color="var(--primary)" />
                </div>

                <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem', fontSize: '1.2rem' }}>
                    {t('forgot_password.title')}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                    {t('forgot_password.subtitle')}
                </p>

                {sent ? (
                    <div>
                        <div className="alert-banner success wide">
                            <Mail size={18} />
                            {t('forgot_password.sent_notice')}
                        </div>
                        <Button variant="primary" onClick={onBack} iconLeading={<ArrowLeft size={16} />} style={{ width: '100%' }}>
                            {t('forgot_password.back_to_login')}
                        </Button>
                    </div>
                ) : (
                    <>
                        {error && (
                            <div className="alert-banner error">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="form-field" style={{ textAlign: 'left' }}>
                                <label className="form-field__label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                                    {t('forgot_password.email_label')}
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    className="form-input"
                                    placeholder={t('forgot_password.email_placeholder')}
                                />
                            </div>

                            <Button type="submit" variant="primary" loading={loading} style={{ width: '100%' }}>
                                {t('forgot_password.submit')}
                            </Button>
                        </form>

                        <Button variant="ghost" size="sm" onClick={onBack} iconLeading={<ArrowLeft size={14} />} style={{ margin: '1rem auto 0' }}>
                            {t('forgot_password.back_to_login')}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}

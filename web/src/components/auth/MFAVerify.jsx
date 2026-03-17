import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';

/**
 * OTP input screen shown after successful password login when mfa_required=true.
 * Props:
 *   onSuccess(user) – called with full user object after OTP verification
 *   onCancel()    – called when user wants to go back to login
 */
export default function MFAVerify({ onSuccess, onCancel }) {
    const { t } = useTranslation();
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isBackupMode, setIsBackupMode] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (otp.replace(/\s/g, '').length < 6) return;
        setLoading(true);
        setError('');
        try {
            const resp = await fetch(`${API_URL}/api/mfa/verify`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otp: otp.replace(/\s/g, '') }),
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.detail === 'invalid_otp' ? t('mfa.error_invalid_otp') : t('mfa.error_generic'));
            }
            const data = await resp.json();
            onSuccess(data.user);
        } catch (err) {
            setError(err.message);
            setOtp('');
            inputRef.current?.focus();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '380px', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>
                <ShieldCheck size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                <h2 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0', fontSize: '1.2rem' }}>
                    {t('mfa.verify_title')}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 1.5rem 0' }}>
                    {isBackupMode ? t('mfa.backup_subtitle') : t('mfa.verify_subtitle')}
                </p>

                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        inputMode={isBackupMode ? 'text' : 'numeric'}
                        autoComplete="one-time-code"
                        maxLength={isBackupMode ? 13 : 6}
                        value={otp}
                        onChange={e => {
                            const raw = e.target.value;
                            setOtp(isBackupMode
                                ? raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 13)
                                : raw.replace(/\D/g, '').slice(0, 6)
                            );
                        }}
                        className="search-input"
                        style={{
                            width: '100%', padding: '0.9rem', textAlign: 'center',
                            fontSize: isBackupMode ? '1.1rem' : '1.5rem',
                            letterSpacing: isBackupMode ? '0.15rem' : '0.4rem',
                            background: 'var(--bg-card)', marginBottom: '1rem',
                        }}
                        placeholder={isBackupMode ? 'XXXXXX-XXXXXX' : '000000'}
                    />
                    <button type="submit" disabled={loading || (isBackupMode ? otp.replace('-', '').length < 12 : otp.length < 6)} className="btn-primary" style={{ width: '100%', marginBottom: '0.75rem' }}>
                        {loading ? <Loader className="spin" size={18} /> : t('mfa.verify_btn')}
                    </button>
                </form>

                <button
                    onClick={onCancel}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                    {t('mfa.back_to_login')}
                </button>

                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 0.5rem 0' }}>
                        {t('mfa.lost_access_hint')}
                    </p>
                    <button
                        type="button"
                        onClick={() => { setIsBackupMode(b => !b); setOtp(''); setError(''); inputRef.current?.focus(); }}
                        style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.82rem', textDecoration: 'underline' }}
                    >
                        {isBackupMode ? t('mfa.use_totp_instead') : t('mfa.use_backup_code')}
                    </button>
                </div>
            </div>
        </div>
    );
}

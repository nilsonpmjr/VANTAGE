import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ShieldOff, Loader, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../../config';

/**
 * MFA enrollment panel embedded in Profile.
 * Props:
 *   mfaEnabled   – current MFA status
 *   userRole     – to check if disable is allowed
 *   onStatusChange() – called after enroll/disable so Profile can refresh
 */
export default function MFAEnroll({ mfaEnabled, userRole, onStatusChange }) {
    const { t } = useTranslation();
    const [step, setStep] = useState('idle'); // idle | enrolling | confirming | done | disabling
    const [qrUri, setQrUri] = useState('');
    const [backupCodes, setBackupCodes] = useState([]);
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const inputRef = useRef(null);

    const MFA_REQUIRED_ROLES = ['admin', 'manager'];
    const canDisable = !MFA_REQUIRED_ROLES.includes(userRole);

    useEffect(() => {
        if (step === 'confirming') inputRef.current?.focus();
    }, [step]);

    const handleEnroll = async () => {
        setLoading(true); setError('');
        try {
            const resp = await fetch(`${API_URL}/api/mfa/enroll`, {
                method: 'POST', credentials: 'include',
            });
            if (!resp.ok) throw new Error(t('mfa.error_generic'));
            const data = await resp.json();
            setQrUri(data.qr_uri);
            setBackupCodes(data.backup_codes);
            setStep('confirming');
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    const handleConfirm = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        try {
            const resp = await fetch(`${API_URL}/api/mfa/confirm`, {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otp }),
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.detail === 'invalid_otp' ? t('mfa.error_invalid_otp') : t('mfa.error_generic'));
            }
            setStep('done');
            onStatusChange();
        } catch (err) {
            setError(err.message);
            setOtp('');
            inputRef.current?.focus();
        } finally { setLoading(false); }
    };

    const handleDisable = async () => {
        if (!window.confirm(t('mfa.confirm_disable'))) return;
        setLoading(true); setError('');
        try {
            const resp = await fetch(`${API_URL}/api/mfa/me`, {
                method: 'DELETE', credentials: 'include',
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.detail === 'mfa_mandatory_for_role' ? t('mfa.error_mandatory') : t('mfa.error_generic'));
            }
            onStatusChange();
        } catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    const copyBackupCodes = () => {
        navigator.clipboard.writeText(backupCodes.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // ── Render: MFA already active ────────────────────────────────────────────
    if (mfaEnabled && step !== 'done') {
        return (
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.08)', border: '1px solid var(--green)', borderRadius: '8px', marginBottom: '1rem' }}>
                    <ShieldCheck size={20} color="var(--green)" />
                    <span style={{ color: 'var(--green)', fontWeight: 600, fontSize: '0.9rem' }}>{t('mfa.status_active')}</span>
                </div>
                {error && <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>}
                {canDisable && (
                    <button onClick={handleDisable} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                        {loading ? <Loader className="spin" size={16} /> : <ShieldOff size={16} />}
                        {t('mfa.disable_btn')}
                    </button>
                )}
                {!canDisable && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>{t('mfa.mandatory_notice')}</p>
                )}
            </div>
        );
    }

    // ── Render: idle (not enrolled) ───────────────────────────────────────────
    if (step === 'idle' || step === 'done') {
        return (
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.06)', border: '1px solid var(--glass-border)', borderRadius: '8px', marginBottom: '1rem' }}>
                    <ShieldOff size={20} color="var(--text-muted)" />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        {step === 'done' ? t('mfa.status_active') : t('mfa.status_inactive')}
                    </span>
                </div>
                {MFA_REQUIRED_ROLES.includes(userRole) && (
                    <div style={{ padding: '0.6rem 0.9rem', background: 'rgba(251,146,60,0.1)', border: '1px solid #fb923c', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.82rem', color: '#fb923c' }}>
                        {t('mfa.mandatory_warning')}
                    </div>
                )}
                {error && <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>}
                {step !== 'done' && (
                    <button onClick={handleEnroll} disabled={loading} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {loading ? <Loader className="spin" size={16} /> : <ShieldCheck size={16} />}
                        {t('mfa.enroll_btn')}
                    </button>
                )}
            </div>
        );
    }

    // ── Render: confirming (show QR + backup codes + OTP input) ──────────────
    return (
        <div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: 0 }}>{t('mfa.scan_instruction')}</p>

            {/* QR Code as data URI via browser API */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
                <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', display: 'inline-block' }}>
                    <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUri)}`}
                        alt="QR Code MFA"
                        width={180} height={180}
                        style={{ display: 'block' }}
                    />
                </div>
            </div>

            {/* Backup codes */}
            <div style={{ background: 'var(--bg-main)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t('mfa.backup_codes_title')}</span>
                    <button onClick={copyBackupCodes} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}>
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? t('mfa.copied') : t('mfa.copy_codes')}
                    </button>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.75rem 0' }}>{t('mfa.backup_codes_notice')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                    {backupCodes.map((code, i) => (
                        <span key={i} style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--primary)', background: 'var(--bg-card)', padding: '0.2rem 0.5rem', borderRadius: '4px', textAlign: 'center' }}>
                            {code}
                        </span>
                    ))}
                </div>
            </div>

            {/* OTP confirm */}
            <form onSubmit={handleConfirm}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('mfa.enter_otp_label')}</label>
                {error && <div style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: '0.5rem' }}>{error}</div>}
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="search-input"
                    style={{ width: '100%', padding: '0.7rem', textAlign: 'center', fontSize: '1.4rem', letterSpacing: '0.4rem', background: 'var(--bg-main)', marginBottom: '0.75rem' }}
                    placeholder="000000"
                />
                <button type="submit" disabled={loading || otp.length < 6} className="btn-primary" style={{ width: '100%' }}>
                    {loading ? <Loader className="spin" size={18} /> : t('mfa.confirm_btn')}
                </button>
            </form>
        </div>
    );
}

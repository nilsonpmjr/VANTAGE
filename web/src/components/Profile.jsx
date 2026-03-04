import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTour } from '../context/TourContext';
import { User, Camera, Lock, Webhook, Loader, Save, CheckCircle, RotateCcw, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API_URL from '../config';
import '../index.css';

export default function Profile() {
    const { user, updateUserContext } = useAuth();
    const { restartTour } = useTour();

    const { t, i18n } = useTranslation();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // The language UI state should still reflect the DB user context, 
    // but the system will render using the global i18n
    const [language, setLanguage] = useState(user?.preferred_lang || 'pt');
    const [avatarBase64, setAvatarBase64] = useState(user?.avatar_base64 || '');

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);

    const fileInputRef = useRef(null);

    useEffect(() => {
        const fetchAuditLogs = async () => {
            setAuditLoading(true);
            try {
                const resp = await fetch(`${API_URL}/api/users/me/audit-logs?limit=20`, { credentials: 'include' });
                if (resp.ok) setAuditLogs(await resp.json());
            } finally {
                setAuditLoading(false);
            }
        };
        fetchAuditLogs();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: t('profile.err_img_invalid') });
            return;
        }

        if (file.size > 1024 * 1024) { // 1MB limit for base64
            setMessage({ type: 'error', text: t('profile.err_img_size') });
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result && reader.result.startsWith('data:image/')) {
                setAvatarBase64(reader.result);
            } else {
                setMessage({ type: 'error', text: t('profile.err_img_invalid') });
            }
        };
        reader.onerror = () => {
            setMessage({ type: 'error', text: t('profile.err_img_invalid') });
        };
        reader.readAsDataURL(file);
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });

        if (password && password !== confirmPassword) {
            setMessage({ type: 'error', text: t('profile.err_pass_match') });
            return;
        }

        if (password && password.length < 6) {
            setMessage({ type: 'error', text: t('profile.err_pass_len') });
            return;
        }

        setLoading(true);
        try {
            const payload = {};

            if (password) payload.password = password;
            if (language !== user?.preferred_lang) payload.preferred_lang = language;
            if (avatarBase64 !== user?.avatar_base64) payload.avatar_base64 = avatarBase64;

            if (Object.keys(payload).length === 0) {
                setMessage({ type: 'error', text: t('profile.err_no_change') });
                setLoading(false);
                return;
            }

            const response = await fetch(`${API_URL}/api/users/me`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                const raw = errData.detail || t('profile.err_update');
                // Translate backend policy error codes into human-readable messages
                let msg = raw;
                if (typeof raw === 'string') {
                    if (raw.startsWith('password_too_short:')) {
                        const min = raw.split(':')[1];
                        msg = t('profile.err_policy_min', { min });
                    } else if (raw === 'password_needs_uppercase') {
                        msg = t('profile.err_policy_upper');
                    } else if (raw === 'password_needs_number') {
                        msg = t('profile.err_policy_number');
                    } else if (raw === 'password_needs_symbol') {
                        msg = t('profile.err_policy_symbol');
                    } else if (raw === 'password_reuse_denied') {
                        msg = t('profile.err_pass_history');
                    }
                }
                throw new Error(msg);
            }

            // Re-fetch /me so force_password_reset and expiry are refreshed in context
            let freshUser = { ...user, preferred_lang: language, avatar_base64: avatarBase64 };
            if (payload.password) {
                try {
                    const meResp = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
                    if (meResp.ok) freshUser = { ...freshUser, ...(await meResp.json()) };
                } catch { /* non-critical */ }
            }
            if (updateUserContext) updateUserContext(freshUser);

            // Translate the success message in the target language BEFORE switching
            const successMsg = i18n.t('profile.success', { lng: language });

            // Switch UI language immediately via react-i18next
            i18n.changeLanguage(language);

            setMessage({ type: 'success', text: successMsg });
            setPassword('');
            setConfirmPassword('');

            // Notify Sidebar to refresh avatar
            window.dispatchEvent(new Event('userProfileUpdated'));

        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fade-in" style={{ padding: '0 2rem', maxWidth: '800px', margin: '0 auto', width: '100%', paddingBottom: '3rem' }}>
            <header style={{ marginBottom: '3rem', marginTop: '3rem' }}>
                <h2 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <User size={28} color="var(--primary)" />
                    {t('profile.title')}
                </h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0, marginLeft: 'calc(28px + 0.75rem)' }}>{t('profile.subtitle')}</p>
            </header>

            {/* Force-reset or expiry notice */}
            {user && (user.force_password_reset || user.password_expires_in_days === 0) && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--status-risk)', color: 'var(--status-risk)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Lock size={18} />
                    <strong>{user.force_password_reset ? t('auth.force_reset_notice') : t('auth.password_expired_notice')}</strong>
                </div>
            )}

            {message.text && (
                <div style={{
                    background: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    color: message.type === 'error' ? 'var(--red)' : 'var(--green)',
                    padding: '1rem', borderRadius: '8px', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                    {message.type === 'success' && <CheckCircle size={18} />}
                    {message.text}
                </div>
            )}

            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '12px' }}>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* Avatar Selection */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                        <div
                            style={{
                                width: '100px', height: '100px', borderRadius: '50%', background: 'var(--bg-main)',
                                display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
                                border: '2px dashed var(--glass-border)', position: 'relative', cursor: 'pointer'
                            }}
                            onClick={triggerFileInput}
                        >
                            {avatarBase64 ? (
                                <img src={avatarBase64} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <User size={40} color="var(--text-muted)" />
                            )}
                            <div style={{ position: 'absolute', bottom: 0, background: 'rgba(0,0,0,0.6)', width: '100%', textAlign: 'center', padding: '0.2rem 0' }}>
                                <Camera size={14} color="#fff" />
                            </div>
                        </div>
                        <div>
                            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>{t('profile.photo')}</h3>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('profile.photo_sub')}</p>
                            <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/png, image/jpeg" style={{ display: 'none' }} />
                        </div>
                    </div>

                    <div style={{ height: '1px', background: 'var(--glass-border)' }}></div>

                    {/* Language Settings */}
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                            <Webhook size={18} color="var(--primary)" /> {t('profile.lang')}
                        </label>
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('profile.lang_sub')}</p>
                        <select
                            value={language}
                            onChange={e => setLanguage(e.target.value)}
                            className="lang-select"
                            style={{ width: '100%', maxWidth: '300px', padding: '0.6rem' }}
                        >
                            <option value="pt">Português (BR)</option>
                            <option value="en">English (US)</option>
                            <option value="es">Español (ES)</option>
                        </select>
                    </div>

                    <div style={{ height: '1px', background: 'var(--glass-border)' }}></div>

                    {/* Security Settings */}
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                            <Lock size={18} color="var(--primary)" /> {t('profile.security')}
                        </label>
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('profile.security_sub')}</p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('profile.new_pass')}</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="search-input"
                                    style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }}
                                    placeholder="••••••••"
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{t('profile.confirm_pass')}</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    className="search-input"
                                    style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-main)' }}
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        <button type="submit" disabled={loading} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {loading ? <Loader className="spin" size={18} /> : <Save size={18} />}
                            {t('profile.save')}
                        </button>
                    </div>
                </form>
            </div>

            {/* My Audit History */}
            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px', marginTop: '1.5rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                    <ClipboardList size={18} color="var(--primary)" />
                    {t('audit.my_history')}
                    {auditLoading && <Loader className="spin" size={16} color="var(--primary)" />}
                </h3>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{t('audit.my_history_sub')}</p>
                <div style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid var(--glass-border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead style={{ background: 'var(--bg-main)' }}>
                            <tr>
                                {['col_timestamp', 'col_action', 'col_result', 'col_ip'].map(k => (
                                    <th key={k} style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'left' }}>
                                        {t(`audit.${k}`).toUpperCase()}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {auditLogs.length === 0 && !auditLoading && (
                                <tr><td colSpan="4" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>{t('audit.no_entries')}</td></tr>
                            )}
                            {auditLogs.map((item, idx) => (
                                <tr key={idx} style={{ borderTop: '1px solid var(--glass-border)' }}>
                                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                        {new Date(item.timestamp).toLocaleString()}
                                    </td>
                                    <td style={{ padding: '0.5rem 0.75rem' }}>
                                        <span style={{ background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '4px', padding: '0.1rem 0.4rem', fontFamily: 'monospace', color: 'var(--primary)', fontSize: '0.75rem' }}>
                                            {item.action}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: item.result === 'success' ? 'var(--green)' : item.result === 'failure' ? 'var(--red)' : '#fb923c' }}>
                                        {t(`audit.result_${item.result}`) || item.result}
                                    </td>
                                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>{item.ip || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Restart Tour */}
            <div className="glass-panel" style={{ padding: '1.25rem 2rem', borderRadius: '12px', marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--text-primary)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <RotateCcw size={16} color="var(--primary)" />
                        {t('profile.restart_tour')}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{t('profile.restart_tour_sub')}</p>
                </div>
                <button
                    onClick={restartTour}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)',
                        background: 'var(--accent-glow)', border: '1px solid var(--accent-border)',
                        color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.82rem',
                        fontWeight: 500, transition: 'all 0.2s', whiteSpace: 'nowrap'
                    }}
                    onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--primary)', color: '#0a0f1a' })}
                    onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'var(--accent-glow)', color: 'var(--text-primary)' })}
                >
                    <RotateCcw size={14} />
                    {t('profile.restart_tour_btn')}
                </button>
            </div>
        </div>
    );
}

import React, { useEffect, useState, useRef } from 'react';
import { User, Camera, Loader, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';

export default function ProfileInfoPanel({ notices }) {
    const { user, updateUserContext } = useAuth();
    const { t } = useTranslation();
    const [avatarBase64, setAvatarBase64] = useState(user?.avatar_base64 || '');
    const [recoveryEmail, setRecoveryEmail] = useState(user?.recovery_email || '');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const fileInputRef = useRef(null);

    useEffect(() => {
        setAvatarBase64(user?.avatar_base64 || '');
        setRecoveryEmail(user?.recovery_email || '');
    }, [user?.avatar_base64, user?.recovery_email]);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: t('profile.err_img_invalid') });
            return;
        }
        if (file.size > 1024 * 1024) {
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
        reader.onerror = () => setMessage({ type: 'error', text: t('profile.err_img_invalid') });
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        const normalizedRecoveryEmail = recoveryEmail.trim().toLowerCase();
        const currentRecoveryEmail = (user?.recovery_email || '').trim().toLowerCase();
        if (avatarBase64 === user?.avatar_base64 && normalizedRecoveryEmail === currentRecoveryEmail) {
            setMessage({ type: 'error', text: t('profile.err_no_change') });
            return;
        }
        setLoading(true);
        setMessage({ type: '', text: '' });
        try {
            const resp = await fetch(`${API_URL}/api/users/me`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    avatar_base64: avatarBase64,
                    recovery_email: normalizedRecoveryEmail,
                }),
            });
            if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail || t('profile.err_update')); }
            if (updateUserContext) {
                updateUserContext({
                    ...user,
                    avatar_base64: avatarBase64,
                    recovery_email: normalizedRecoveryEmail || null,
                });
            }
            setMessage({ type: 'success', text: t('profile.success') });
            window.dispatchEvent(new Event('userProfileUpdated'));
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fade-in">
            <SectionHeader
                icon={<User size={22} color="var(--primary)" />}
                title={t('profile.photo')}
                subtitle={t('profile.photo_sub')}
            />
            {notices}
            {message.text && (
                <div className={`alert-banner wide ${message.type === 'error' ? 'error' : 'success'}`}>
                    {message.text}
                </div>
            )}
            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <div
                        style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'var(--bg-main)', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', border: '2px dashed var(--glass-border)', position: 'relative', cursor: 'pointer' }}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {avatarBase64
                            ? <img src={avatarBase64} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <User size={40} color="var(--text-muted)" />}
                        <div style={{ position: 'absolute', bottom: 0, background: 'rgba(0,0,0,0.6)', width: '100%', textAlign: 'center', padding: '0.2rem 0' }}>
                            <Camera size={14} color="#fff" />
                        </div>
                    </div>
                    <div>
                        <p style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>{user?.name}</p>
                        <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{user?.username}</p>
                        <button onClick={() => fileInputRef.current?.click()} className="btn-secondary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}>
                            {t('profile.photo')}
                        </button>
                        <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/png, image/jpeg" style={{ display: 'none' }} />
                    </div>
                </div>
                <div style={{ marginTop: '1.5rem', display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                            {t('profile.account_email')}
                        </label>
                        <input
                            type="email"
                            value={user?.email || ''}
                            disabled
                            aria-label={t('profile.account_email')}
                            className="form-input"
                            style={{ width: '100%', padding: '0.75rem', opacity: 0.75 }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                            {t('profile.recovery_email')}
                        </label>
                        <input
                            type="email"
                            value={recoveryEmail}
                            onChange={(event) => setRecoveryEmail(event.target.value)}
                            aria-label={t('profile.recovery_email')}
                            className="form-input"
                            style={{ width: '100%', padding: '0.75rem' }}
                            placeholder={t('profile.recovery_email_placeholder')}
                        />
                        <p style={{ margin: '0.45rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {t('profile.recovery_email_sub')}
                        </p>
                    </div>
                </div>
                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={handleSave} disabled={loading} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {loading ? <Loader className="spin" size={18} /> : <Save size={18} />}
                        {t('profile.save')}
                    </button>
                </div>
            </div>
        </div>
    );
}

import React, { useState } from 'react';
import { Webhook, Loader, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import API_URL from '../../config';
import SectionHeader from '../shared/SectionHeader';

export default function ProfileLanguagePanel({ notices }) {
    const { user, updateUserContext } = useAuth();
    const { t, i18n } = useTranslation();
    const [language, setLanguage] = useState(user?.preferred_lang || 'pt');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const handleSave = async () => {
        if (language === user?.preferred_lang) {
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
                body: JSON.stringify({ preferred_lang: language }),
            });
            if (!resp.ok) { const e = await resp.json(); throw new Error(e.detail || t('profile.err_update')); }
            if (updateUserContext) updateUserContext({ ...user, preferred_lang: language });
            const successMsg = i18n.t('profile.success', { lng: language });
            i18n.changeLanguage(language);
            setMessage({ type: 'success', text: successMsg });
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fade-in">
            <SectionHeader
                icon={<Webhook size={22} color="var(--primary)" />}
                title={t('profile.lang')}
                subtitle={t('profile.lang_sub')}
            />
            {notices}
            {message.text && (
                <div className={`alert-banner wide ${message.type === 'error' ? 'error' : 'success'}`}>
                    {message.text}
                </div>
            )}
            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '12px' }}>
                <select value={language} onChange={e => setLanguage(e.target.value)} className="lang-select" style={{ width: '100%', maxWidth: '300px', padding: '0.6rem' }}>
                    <option value="pt">Português (BR)</option>
                    <option value="en">English (US)</option>
                    <option value="es">Español (ES)</option>
                </select>
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

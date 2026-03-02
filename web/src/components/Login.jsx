import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../index.css';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { login } = useAuth();
    const { t } = useTranslation();

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            await login(username, password);
            // On success, start transition instead of unmounting immediately
            // Note: We need to modify AuthContext to not immediately set User if we want to delay unmount,
            // or simply render this overlay in App.jsx. Let's render the overlay here and delay the user setting.
            // Wait, useAuth sets user immediately, which unmounts <Login/>.
            // It's better to lift this overlay to App.jsx. I will undo this and do it in App.jsx.
        } catch {
            setError(t('login.error_credentials'));
            setIsSubmitting(false); // Only stop loading on error, on success we transition
        }
    };

    return (
        <div className="login-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
            <div className="login-box glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <img
                        src="/logo.svg"
                        alt="iT.eam Logo"
                        style={{ width: '200px', height: 'auto', marginBottom: '0.5rem' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                </div>

                <h2 style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>{t('login.subtitle')}</h2>

                {error && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ textAlign: 'left' }}>
                        <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>{t('login.username')}</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="search-input"
                            style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}
                            placeholder={t('login.username_placeholder', 'Enter your username...')}
                        />
                    </div>

                    <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                        <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>{t('login.password')}</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="search-input"
                            style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}
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

            </div>
        </div>
    );
}

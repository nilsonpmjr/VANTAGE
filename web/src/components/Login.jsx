import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Loader } from 'lucide-react';
import '../index.css';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login } = useAuth();

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            await login(username, password);
        } catch (err) {
            setError('Acesso negado. Credenciais inválidas.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="login-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
            <div className="login-box glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '1rem', borderRadius: '50%' }}>
                        <ShieldAlert size={48} color="var(--primary)" />
                    </div>
                </div>

                <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>iT.eam SOC</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>Centro de Operações de Segurança</p>

                {error && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ textAlign: 'left' }}>
                        <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>Usuário</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="search-input"
                            style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}
                            placeholder="Digite seu usuário..."
                        />
                    </div>

                    <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                        <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'block' }}>Senha</label>
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
                        className="search-button"
                        disabled={isSubmitting}
                        style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '0.875rem' }}
                    >
                        {isSubmitting ? <Loader className="spin" size={20} /> : 'Entrar no Sistema'}
                    </button>
                </form>

            </div>
        </div>
    );
}

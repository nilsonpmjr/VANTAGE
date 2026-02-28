import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Camera, Lock, Webhook, Loader, Save, CheckCircle } from 'lucide-react';
import '../index.css';

export default function Profile() {
    const { user, login, updateUserContext } = useAuth();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [language, setLanguage] = useState(user?.preferred_lang || 'pt');
    const [avatarBase64, setAvatarBase64] = useState(user?.avatar_base64 || '');

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const fileInputRef = useRef(null);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setMessage({ type: 'error', text: 'Por favor, selecione um arquivo de imagem válido.' });
            return;
        }

        if (file.size > 1024 * 1024) { // 1MB limit for base64
            setMessage({ type: 'error', text: 'A imagem deve ter no máximo 1MB.' });
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setAvatarBase64(reader.result);
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
            setMessage({ type: 'error', text: 'As senhas não coincidem.' });
            return;
        }

        if (password && password.length < 6) {
            setMessage({ type: 'error', text: 'A senha deve ter pelo menos 6 caracteres.' });
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const payload = {};

            if (password) payload.password = password;
            if (language !== user?.preferred_lang) payload.preferred_lang = language;
            if (avatarBase64 !== user?.avatar_base64) payload.avatar_base64 = avatarBase64;

            if (Object.keys(payload).length === 0) {
                setMessage({ type: 'error', text: 'Nenhuma alteração foi feita.' });
                setLoading(false);
                return;
            }

            const response = await fetch('http://localhost:8000/api/users/me', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Erro ao atualizar preferências.');
            }

            // Update local user context
            const updatedUser = { ...user, preferred_lang: language, avatar_base64: avatarBase64 };
            localStorage.setItem('user', JSON.stringify(updatedUser)); // Hacky but works for instant sync
            if (updateUserContext) {
                updateUserContext(updatedUser);
            }

            setMessage({ type: 'success', text: 'Preferências salvas com sucesso!' });
            setPassword('');
            setConfirmPassword('');

            // Dispatch a custom event so Sidebar can catch the avatar update immediately
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
                    Meu Perfil
                </h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0, marginLeft: 'calc(28px + 0.75rem)' }}>Gerencie suas preferências, senha e foto de exibição.</p>
            </header>

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
                            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Foto de Perfil</h3>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Clique na imagem para alterar. Máximo 1MB (JPG/PNG).</p>
                            <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/png, image/jpeg" style={{ display: 'none' }} />
                        </div>
                    </div>

                    <div style={{ height: '1px', background: 'var(--glass-border)' }}></div>

                    {/* Language Settings */}
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                            <Webhook size={18} color="var(--primary)" /> Idioma Principal
                        </label>
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Define o idioma padrão das inferências do módulo de inteligência.</p>
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
                            <Lock size={18} color="var(--primary)" /> Segurança (Senha)
                        </label>
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Deixe em branco se não deseja alterar sua senha.</p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Nova Senha</label>
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
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>Confirmar Nova Senha</label>
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
                            Salvar Preferências
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

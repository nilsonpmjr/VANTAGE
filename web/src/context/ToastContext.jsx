/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

let toastIdCounter = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info', duration = 4000) => {
        const id = ++toastIdCounter;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
    return ctx;
}

const TYPE_STYLES = {
    success: { background: 'rgba(16, 185, 129, 0.15)', borderColor: 'var(--green)', color: 'var(--green)', icon: '✅' },
    error:   { background: 'rgba(239, 68, 68, 0.15)',  borderColor: 'var(--red)',   color: 'var(--red)',   icon: '❌' },
    warning: { background: 'rgba(245, 158, 11, 0.15)', borderColor: '#f59e0b',      color: '#f59e0b',      icon: '⚠️' },
    info:    { background: 'rgba(56, 189, 248, 0.15)', borderColor: 'var(--primary)', color: 'var(--primary)', icon: 'ℹ️' },
};

function ToastContainer({ toasts, onRemove }) {
    if (toasts.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            zIndex: 9999,
            maxWidth: '380px',
        }}>
            {toasts.map(toast => {
                const s = TYPE_STYLES[toast.type] || TYPE_STYLES.info;
                return (
                    <div
                        key={toast.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.875rem 1rem',
                            borderRadius: '10px',
                            border: `1px solid ${s.borderColor}`,
                            background: s.background,
                            color: s.color,
                            backdropFilter: 'blur(12px)',
                            fontSize: '0.9rem',
                            animation: 'fadeIn 0.25s ease',
                        }}
                    >
                        <span>{s.icon}</span>
                        <span style={{ flex: 1, color: 'var(--text-primary)' }}>{toast.message}</span>
                        <button
                            onClick={() => onRemove(toast.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.1rem 0.3rem' }}
                        >
                            ✕
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

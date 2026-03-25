import React from 'react';

/**
 * Accessible confirmation modal.
 *
 * Props:
 *   title       — modal heading
 *   message     — body text
 *   onConfirm   — called when user confirms
 *   onCancel    — called when user cancels
 *   danger      — boolean; uses red accent when true (destructive actions)
 *   confirmLabel — label for confirm button (default "Confirmar")
 *   cancelLabel  — label for cancel button (default "Cancelar")
 */
export default function ConfirmModal({
    title,
    message,
    onConfirm,
    onCancel,
    danger = false,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
}) {
    const accentColor = danger ? 'var(--red)' : 'var(--primary)';
    const accentBg    = danger ? 'var(--alert-error-bg)' : 'rgba(56, 189, 248, 0.1)';

    return (
        /* Backdrop */
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={onCancel}
        >
            {/* Dialog */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-modal-title"
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--bg-card)',
                    border: `1px solid ${accentColor}`,
                    borderRadius: '14px',
                    padding: '2rem',
                    maxWidth: '420px',
                    width: '90%',
                    animation: 'fadeIn 0.2s ease',
                }}
            >
                <h3
                    id="confirm-modal-title"
                    style={{ margin: '0 0 0.75rem', color: accentColor, fontSize: '1.1rem' }}
                >
                    {title}
                </h3>
                <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {message}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '0.5rem 1.25rem', borderRadius: '8px', cursor: 'pointer',
                            background: 'transparent', border: '1px solid var(--glass-border)',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '0.5rem 1.25rem', borderRadius: '8px', cursor: 'pointer',
                            background: accentBg, border: `1px solid ${accentColor}`,
                            color: accentColor, fontWeight: 600,
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

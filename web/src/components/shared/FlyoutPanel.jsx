import React, { useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';

export default function FlyoutPanel({ open, onClose, title, titleIcon, children }) {
    const panelRef = useRef(null);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') onClose?.();
    }, [onClose]);

    useEffect(() => {
        if (open) {
            document.addEventListener('keydown', handleKeyDown);
            // Auto-focus the panel itself so keyboard nav starts here
            setTimeout(() => panelRef.current?.focus(), 50);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [open, handleKeyDown]);

    if (!open) return null;

    return (
        <>
            <div className="flyout-backdrop" onClick={onClose} aria-hidden="true" />
            <aside
                className="flyout-panel"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                ref={panelRef}
                tabIndex={-1}
            >
                <div className="flyout-header">
                    <span className="flyout-header-title">
                        {titleIcon}
                        {title}
                    </span>
                    <button className="flyout-close" onClick={onClose} aria-label="Fechar painel">
                        <X size={18} />
                    </button>
                </div>
                <div className="flyout-body">
                    {children}
                </div>
            </aside>
        </>
    );
}

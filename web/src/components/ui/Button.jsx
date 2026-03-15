import React from 'react';
import { Loader } from 'lucide-react';
import cn from '../../utils/cn';

export default function Button({
    children,
    className = '',
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    iconLeading = null,
    iconTrailing = null,
    type = 'button',
    ...props
}) {
    return (
        <button
            type={type}
            className={cn('v-btn', `v-btn--${variant}`, `v-btn--${size}`, loading && 'is-loading', className)}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            {...props}
        >
            {loading ? <Loader className="spin" size={16} aria-hidden="true" /> : iconLeading}
            {children}
            {!loading ? iconTrailing : null}
        </button>
    );
}

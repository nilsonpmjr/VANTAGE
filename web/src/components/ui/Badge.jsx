import React from 'react';
import cn from '../../utils/cn';

export default function Badge({ children, className = '', variant = 'neutral' }) {
    return (
        <span className={cn('v-badge', `v-badge--${variant}`, className)}>
            {children}
        </span>
    );
}

import React from 'react';

/**
 * Generic skeleton placeholder for loading states.
 *
 * Props:
 *   width   — CSS width (default '100%')
 *   height  — CSS height (default '1rem')
 *   count   — number of skeleton rows to render (default 1)
 *   style   — additional inline styles merged with each element
 */
export default function SkeletonLoader({ width = '100%', height = '1rem', count = 1, style = {} }) {
    const baseStyle = {
        display: 'block',
        width,
        height,
        borderRadius: '6px',
        background: 'linear-gradient(90deg, var(--bg-card) 25%, var(--glass-border) 50%, var(--bg-card) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.5s infinite',
        ...style,
    };

    return (
        <>
            {Array.from({ length: count }, (_, i) => (
                <span key={i} style={{ ...baseStyle, marginBottom: i < count - 1 ? '0.5rem' : 0 }} />
            ))}
        </>
    );
}

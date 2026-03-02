import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Pagination control.
 *
 * Props:
 *   page        — current page (1-indexed)
 *   totalPages  — total page count
 *   onPageChange — called with the new page number
 */
export default function Pagination({ page, totalPages, onPageChange }) {
    if (totalPages <= 1) return null;

    const btnStyle = (active) => ({
        minWidth: '2rem',
        height: '2rem',
        padding: '0 0.4rem',
        borderRadius: '6px',
        border: active ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
        background: active ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
        color: active ? 'var(--primary)' : 'var(--text-secondary)',
        cursor: active ? 'default' : 'pointer',
        fontWeight: active ? 700 : 400,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    });

    const iconBtn = (disabled) => ({
        width: '2rem', height: '2rem',
        borderRadius: '6px',
        border: '1px solid var(--glass-border)',
        background: 'transparent',
        color: disabled ? 'var(--glass-border)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    });

    // Build page range with ellipsis
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
            pages.push(i);
        } else if (pages[pages.length - 1] !== '…') {
            pages.push('…');
        }
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
            <button
                style={iconBtn(page === 1)}
                disabled={page === 1}
                onClick={() => onPageChange(page - 1)}
                aria-label="Previous page"
            >
                <ChevronLeft size={16} />
            </button>

            {pages.map((p, i) =>
                p === '…' ? (
                    <span key={`ellipsis-${i}`} style={{ color: 'var(--text-muted)', padding: '0 0.25rem' }}>…</span>
                ) : (
                    <button
                        key={p}
                        style={btnStyle(p === page)}
                        onClick={() => p !== page && onPageChange(p)}
                        aria-current={p === page ? 'page' : undefined}
                    >
                        {p}
                    </button>
                )
            )}

            <button
                style={iconBtn(page === totalPages)}
                disabled={page === totalPages}
                onClick={() => onPageChange(page + 1)}
                aria-label="Next page"
            >
                <ChevronRight size={16} />
            </button>
        </div>
    );
}

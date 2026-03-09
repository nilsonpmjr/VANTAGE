import React, { useState, useCallback } from 'react';
import { Search, Loader2, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Separators: comma, semicolon, or newline (browsers strip \n from <input> on paste → space)
const BATCH_PATTERN = /[,;\n]/;

function parseTargets(value) {
    return value
        .split(/[,;\n\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
}

export default function SearchBar({ onSearch, onBatchSearch, loading }) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');

    const targets = parseTargets(query);
    const isBatch = BATCH_PATTERN.test(query) && targets.length > 1;

    const handleSubmit = useCallback(
        (e) => {
            e.preventDefault();
            if (!query.trim() || loading) return;
            if (isBatch && targets.length > 0) {
                onBatchSearch?.(targets);
            } else {
                onSearch(query.trim());
            }
        },
        [query, isBatch, targets, loading, onSearch, onBatchSearch],
    );

    return (
        <div className="search-container">
            <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
                {isBatch
                    ? <Layers className="search-icon" size={20} />
                    : <Search className="search-icon" size={20} />}

                <input
                    type="text"
                    className="search-input"
                    placeholder={
                        isBatch
                            ? t('search.batch_placeholder')
                            : t('search.placeholder')
                    }
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={loading}
                    autoComplete="off"
                    spellCheck="false"
                    aria-label={
                        isBatch
                            ? t('search.batch_placeholder')
                            : t('search.placeholder')
                    }
                />

                {loading && (
                    <div
                        style={{
                            position: 'absolute',
                            right: '1rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                        }}
                    >
                        <Loader2 size={18} className="loader-pulse" style={{ color: 'var(--text-muted)' }} />
                    </div>
                )}
            </form>

            {isBatch && (
                <p
                    style={{
                        textAlign: 'center',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        marginTop: '0.4rem',
                        marginBottom: 0,
                    }}
                >
                    <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                        {t('search.batch_hint', { count: targets.length })}
                    </span>
                    {' · '}
                    {t('search.batch_tip')}
                </p>
            )}
        </div>
    );
}

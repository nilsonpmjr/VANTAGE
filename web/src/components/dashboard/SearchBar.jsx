import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Search, Loader2, Layers, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Separators: comma, semicolon, or newline (browsers strip \n from <input> on paste → space)
const BATCH_PATTERN = /[,;\n]/;
const BATCH_MAX_ITEMS = 100;

function parseTargets(value) {
    return value
        .split(/[,;\n\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
}

function looksLikeTarget(v) {
    if (!v || v.length < 3) return false;
    // IP, domain, hash, URL — loose check
    return /^[\w.:/@-]+$/.test(v);
}

function parseFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                let lines;

                if (file.name.endsWith('.csv')) {
                    const rows = text.split(/\r?\n/).filter(Boolean);
                    // Skip header if first cell doesn't look like a target
                    const firstCell = rows[0]?.split(',')[0]?.trim();
                    const startIdx = looksLikeTarget(firstCell) ? 0 : 1;
                    lines = rows.slice(startIdx).map((row) => row.split(',')[0].trim());
                } else {
                    // .txt — split by newline
                    lines = text.split(/\r?\n/).map((l) => l.trim());
                }

                const targets = lines.filter(Boolean).filter(looksLikeTarget);
                resolve(targets);
            } catch {
                reject(new Error('parse_error'));
            }
        };
        reader.onerror = () => reject(new Error('read_error'));
        reader.readAsText(file);
    });
}

export default function SearchBar({ onSearch, onBatchSearch, loading, focusSignal = 0 }) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [importWarning, setImportWarning] = useState(null);
    const fileInputRef = useRef(null);
    const inputRef = useRef(null);

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

    const handleFileImport = useCallback(
        async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            // Reset so same file can be re-selected
            e.target.value = '';

            try {
                const parsed = await parseFile(file);
                if (parsed.length === 0) {
                    setImportWarning(t('batch.import_error'));
                    return;
                }

                let skipped = 0;
                let final = parsed;
                if (parsed.length > BATCH_MAX_ITEMS) {
                    skipped = parsed.length - BATCH_MAX_ITEMS;
                    final = parsed.slice(0, BATCH_MAX_ITEMS);
                    setImportWarning(
                        t('batch.import_limit', { max: BATCH_MAX_ITEMS, skipped })
                    );
                } else {
                    setImportWarning(null);
                }

                setQuery(final.join(', '));
            } catch {
                setImportWarning(t('batch.import_error'));
            }
        },
        [t],
    );

    useEffect(() => {
        if (focusSignal > 0 && !loading) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [focusSignal, loading]);

    return (
        <div className="search-container">
            <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
                {isBatch
                    ? <Layers className="search-icon" size={20} />
                    : <Search className="search-icon" size={20} />}

                <input
                    ref={inputRef}
                    type="text"
                    className="search-input"
                    placeholder={
                        isBatch
                            ? t('search.batch_placeholder')
                            : t('search.placeholder')
                    }
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setImportWarning(null); }}
                    disabled={loading}
                    autoComplete="off"
                    spellCheck="false"
                    aria-label={
                        isBatch
                            ? t('search.batch_placeholder')
                            : t('search.placeholder')
                    }
                />

                {/* File import button */}
                <div
                    style={{
                        position: 'absolute',
                        right: loading ? '2.5rem' : '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                    }}
                >
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                        title={t('batch.import_file')}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: loading ? 'default' : 'pointer',
                            padding: '0.2rem',
                            display: 'flex',
                            alignItems: 'center',
                            opacity: loading ? 0.4 : 0.6,
                            transition: 'opacity 0.2s',
                        }}
                        onMouseOver={(e) => !loading && (e.currentTarget.style.opacity = '1')}
                        onMouseOut={(e) => (e.currentTarget.style.opacity = loading ? '0.4' : '0.6')}
                    >
                        <Upload size={16} />
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.csv"
                        onChange={handleFileImport}
                        style={{ display: 'none' }}
                    />
                </div>

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

            {importWarning && (
                <p
                    style={{
                        textAlign: 'center',
                        fontSize: '0.75rem',
                        color: 'var(--status-suspicious)',
                        marginTop: '0.4rem',
                        marginBottom: 0,
                    }}
                >
                    {importWarning}
                </p>
            )}
        </div>
    );
}

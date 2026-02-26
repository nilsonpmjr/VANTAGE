import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

export default function SearchBar({ onSearch, loading }) {
    const [query, setQuery] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query.trim());
        }
    };

    return (
        <div className="search-container">
            <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
                <Search className="search-icon" size={20} />
                <input
                    type="text"
                    className="search-input"
                    placeholder="Enter IP, Domain, or Hash..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={loading}
                    autoComplete="off"
                    spellCheck="false"
                />
                {loading && (
                    <div style={{ position: 'absolute', right: '1.25rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                        <Loader2 size={20} className="loader-pulse" />
                    </div>
                )}
            </form>
        </div>
    );
}

import React from 'react';
import { ChevronRight } from 'lucide-react';

export default function Breadcrumbs({ items }) {
    if (!items || items.length === 0) return null;

    return (
        <nav className="breadcrumbs" aria-label="Breadcrumbs">
            {items.map((item, idx) => {
                const isLast = idx === items.length - 1;
                return (
                    <React.Fragment key={idx}>
                        {idx > 0 && <ChevronRight size={12} className="breadcrumbs-sep" />}
                        {isLast ? (
                            <span className="breadcrumbs-current">{item.label}</span>
                        ) : (
                            <button
                                className="breadcrumbs-link"
                                onClick={item.onClick}
                                type="button"
                            >
                                {item.label}
                            </button>
                        )}
                    </React.Fragment>
                );
            })}
        </nav>
    );
}

import React from 'react';

export default function FormField({ label, hint, children, fullWidth }) {
    return (
        <div className="form-field" style={fullWidth ? { gridColumn: '1 / -1' } : undefined}>
            {label && <label className="form-label">{label}</label>}
            {children}
            {hint && <span className="form-hint">{hint}</span>}
        </div>
    );
}

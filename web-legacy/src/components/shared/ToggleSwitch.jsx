import React from 'react';

export default function ToggleSwitch({ checked, onChange, label, hint, disabled }) {
    if (label) {
        return (
            <div className="toggle-row">
                <div>
                    <div className="toggle-row-label">{label}</div>
                    {hint && <div className="toggle-row-hint">{hint}</div>}
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    aria-label={label}
                    className={`toggle${checked ? ' active' : ''}`}
                    onClick={() => !disabled && onChange?.(!checked)}
                    disabled={disabled}
                />
            </div>
        );
    }

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            className={`toggle${checked ? ' active' : ''}`}
            onClick={() => !disabled && onChange?.(!checked)}
            disabled={disabled}
        />
    );
}

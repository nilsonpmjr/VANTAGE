import React from 'react';

export default function SectionHeader({ icon, title, subtitle, actions }) {
    return (
        <div className="section-header">
            <div className="section-header-left">
                <h2 className="section-title">
                    {icon}
                    {title}
                </h2>
                {subtitle && <p className="section-subtitle">{subtitle}</p>}
            </div>
            {actions && <div style={{ display: 'flex', gap: '0.5rem' }}>{actions}</div>}
        </div>
    );
}

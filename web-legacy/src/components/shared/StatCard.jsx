import React from 'react';

export default function StatCard({ icon, label, value, color }) {
    return (
        <div className="stat-card">
            <span className="stat-card-label" style={{ color }}>
                {icon} {label}
            </span>
            <span className="stat-card-value">{value ?? '\u2014'}</span>
        </div>
    );
}

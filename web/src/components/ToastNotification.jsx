import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, ChevronDown, ChevronUp, Clock, Info, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SERVICE_NAMES = {
    virustotal: 'VirusTotal',
    abuseipdb: 'AbuseIPDB',
    alienvault: 'AlienVault OTX',
    urlscan: 'UrlScan.io',
    shodan: 'Shodan',
    greynoise: 'GreyNoise',
    blacklistmaster: 'BlacklistMaster',
    abusech: 'Abuse.ch',
    pulsedive: 'Pulsedive',
};

const ERROR_ICONS = {
    rate_limited: Clock,
    plan_limitation: Info,
    api_error: AlertTriangle,
};

export default function ToastNotification({ errors = [] }) {
    const [visible, setVisible] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const { t } = useTranslation();

    // Stable key to detect real changes (avoids array reference equality issues)
    const errorsKey = errors.map(e => e.name).sort().join(',');
    const prevKeyRef = useRef('');

    useEffect(() => {
        if (errorsKey && errorsKey !== prevKeyRef.current) {
            prevKeyRef.current = errorsKey;
            setVisible(true);
            setDismissed(false);
            setExpanded(false);

            const timer = setTimeout(() => {
                setVisible(false);
            }, 15000);

            return () => clearTimeout(timer);
        } else if (!errorsKey) {
            setVisible(false);
            prevKeyRef.current = '';
        }
    }, [errorsKey]);

    if (!visible || dismissed || errors.length === 0) return null;

    const handleDismiss = (e) => {
        e.stopPropagation();
        setDismissed(true);
        setVisible(false);
    };

    const getErrorLabel = (type) => {
        if (type === 'rate_limited') return t('toast.rateLimit');
        if (type === 'plan_limitation') return t('toast.planLimit');
        return t('toast.apiError');
    };

    // Use Portal to render at document.body level, bypassing parent overflow/scroll
    return createPortal(
        <div className="toast-notification">
            <div className="toast-header" onClick={() => setExpanded(!expanded)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldOff size={16} color="var(--status-suspicious)" />
                    <span className="toast-title">
                        {t('toast.title', { count: errors.length })}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    <button className="toast-close" onClick={handleDismiss} title={t('toast.dismiss')}>
                        <X size={14} />
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="toast-body">
                    {errors.map(({ name, type }) => {
                        const Icon = ERROR_ICONS[type] || AlertTriangle;
                        return (
                            <div key={name} className="toast-error-row">
                                <Icon size={13} color="var(--text-muted)" />
                                <span className="toast-service-name">{SERVICE_NAMES[name] || name}</span>
                                <span className="toast-error-label">{getErrorLabel(type)}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>,
        document.body
    );
}

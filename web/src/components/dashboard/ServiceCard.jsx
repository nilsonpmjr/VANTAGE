import React, { useState, useRef, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, Clock, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SERVICE_URLS = {
    virustotal:     (t) => `https://www.virustotal.com/gui/${t.type === 'ip' ? 'ip-address' : t.type === 'domain' ? 'domain' : 'file'}/${t.value}`,
    abuseipdb:      (t) => `https://www.abuseipdb.com/check/${t.value}`,
    alienvault:     (t) => `https://otx.alienvault.com/indicator/${t.type === 'ip' ? 'ip' : 'domain'}/${t.value}`,
    shodan:         (t) => `https://www.shodan.io/host/${t.value}`,
    greynoise:      (t) => `https://viz.greynoise.io/ip/${t.value}`,
    urlscan:        (t) => `https://urlscan.io/search/#${t.type === 'ip' ? 'ip' : 'domain'}:${t.value}`,
    blacklistmaster:(t) => `https://www.blacklistmaster.com/`,
    abusech:        (t) => `https://threatfox.abuse.ch/browse.php?search=${t.value}`,
    pulsedive:      (t) => `https://pulsedive.com/indicator/?ioc=${encodeURIComponent(t.value)}`,
};

export default function ServiceCard({ name, data, target }) {
    const isError = data.error || data._meta_error;
    const errorType = data._meta_error_type || (isError ? 'api_error' : null);
    const isRateLimit = errorType === 'rate_limited';
    const isPlanLimit = errorType === 'plan_limitation';
    // Soft errors: don't show as warnings — they're expected limitations
    const isSoftError = isRateLimit || isPlanLimit;

    // Decide Border color based on generic risk heuristics
    let isRisky = false;

    if (!isError) {
        if (name === 'virustotal' && data.data?.attributes?.last_analysis_stats?.malicious > 0) isRisky = true;
        if (name === 'abuseipdb' && data.data?.abuseConfidenceScore > 0) isRisky = true;
        if (name === 'alienvault' && data.pulse_info?.count > 0) isRisky = true;
        if (name === 'urlscan' && data.data?.verdict?.score > 0) isRisky = true;
        if (name === 'greynoise' && data.classification === 'malicious') isRisky = true;
        if (name === 'blacklistmaster' && data._meta_msg !== "No content returned") isRisky = true;
        if (name === 'abusech' && data.query_status === 'ok' && data.data?.length > 0) isRisky = true;
        if (name === 'pulsedive' && ['high', 'critical'].includes(data.risk)) isRisky = true;
    }

    const borderColor = isError
        ? (isSoftError ? 'var(--glass-border)' : 'var(--status-suspicious)')
        : (isRisky ? 'var(--status-risk)' : 'var(--glass-border)');
    const HeaderIcon = isError
        ? (isSoftError ? (isRateLimit ? Clock : Info) : AlertTriangle)
        : (isRisky ? AlertTriangle : CheckCircle);
    const iconColor = isError
        ? (isSoftError ? 'var(--text-muted)' : 'var(--status-suspicious)')
        : (isRisky ? 'var(--status-risk)' : 'var(--status-safe)');

    const { t } = useTranslation();
    const loc = key => t(`service_card.${key}`);

    const [showInfo, setShowInfo] = useState(false);
    const infoRef = useRef(null);

    useEffect(() => {
        if (!showInfo) return;
        const handler = (e) => {
            if (infoRef.current && !infoRef.current.contains(e.target)) setShowInfo(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showInfo]);

    const renderContent = () => {
        if (isError) {
            const message = isRateLimit
                ? loc('rateLimitError')
                : isPlanLimit
                    ? loc('planLimitError')
                    : (data.error || data._meta_msg || loc('apiError'));
            const color = isSoftError ? 'var(--text-muted)' : 'var(--status-suspicious)';
            const bg = isSoftError ? 'rgba(255,255,255,0.02)' : 'rgba(234, 179, 8, 0.05)';
            return (
                <div style={{ color, padding: '1rem', background: bg, borderRadius: 'var(--radius-sm)' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>{message}</p>
                </div>
            );
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.95rem' }}>
                {name === 'virustotal' && (
                    <>
                        <div className="flex-row"><span>{loc('malVendors')}</span> <span className={isRisky ? 'risk' : 'safe'}>{data.data?.attributes?.last_analysis_stats?.malicious || 0}</span></div>
                        <div className="flex-row"><span>{loc('totalVendors')}</span> <span>{data.data?.attributes?.last_analysis_stats?.undetected + (data.data?.attributes?.last_analysis_stats?.malicious || 0)}</span></div>

                        {/* Domain/Hash Info */}
                        {data.data?.attributes?.meaningful_name && <div className="flex-row"><span>{loc('filename')}</span> <span className="mono">{data.data.attributes.meaningful_name}</span></div>}

                        {data.data?.attributes?.categories && Object.keys(data.data.attributes.categories).length > 0 && (
                            <div className="flex-row"><span>{loc('categories')}</span> <span>{[...new Set(Object.values(data.data.attributes.categories))].join(', ')}</span></div>
                        )}
                        {data.data?.attributes?.last_dns_records && data.data.attributes.last_dns_records.length > 0 && (
                            <div className="flex-row"><span>{loc('dnsIp')}</span> <span>{data.data.attributes.last_dns_records.map(r => r.value).filter(v => v.match(/[\d.]+/)).slice(0, 3).join(', ')}</span></div>
                        )}

                        {/* IP Specific Info */}
                        {data.data?.attributes?.as_owner && (
                            <div className="flex-row"><span>{loc('owner')}</span> <span>{data.data.attributes.as_owner} {data.data.attributes.asn ? `(AS${data.data.attributes.asn})` : ''}</span></div>
                        )}
                        {data.data?.attributes?.country && (
                            <div className="flex-row"><span>{loc('country')}</span> <span>{data.data.attributes.country}</span></div>
                        )}
                        {data.data?.attributes?.network && (
                            <div className="flex-row"><span>{loc('network')}</span> <span className="mono">{data.data.attributes.network}</span></div>
                        )}
                    </>
                )}
                {name === 'abuseipdb' && (
                    <>
                        <div className="flex-row"><span>{loc('confScore')}</span> <span className={isRisky ? 'risk' : 'safe'}>{data.data?.abuseConfidenceScore}%</span></div>
                        <div className="flex-row"><span>{loc('totalReports')}</span> <span>{data.data?.totalReports}</span></div>
                        <div className="flex-row"><span>{loc('isp')}</span> <span>{data.data?.isp}</span></div>
                        {data.data?.usageType && <div className="flex-row"><span>{loc('usage')}</span> <span>{data.data.usageType}</span></div>}
                        {data.data?.domain && <div className="flex-row"><span>{loc('domain')}</span> <span>{data.data.domain}</span></div>}
                        <div className="flex-row"><span>{loc('country')}</span> <span>{data.data?.countryCode}</span></div>
                    </>
                )}
                {name === 'shodan' && (
                    <>
                        <div className="flex-row"><span>{loc('org')}</span> <span>{data.org || 'N/A'}</span></div>
                        <div className="flex-row"><span>{loc('os')}</span> <span>{data.os || 'N/A'}</span></div>
                        <div className="flex-row"><span>{loc('openPorts')}</span> <span>{data.ports ? data.ports.join(', ') : loc('none')}</span></div>
                        <div className="flex-row"><span>{loc('vulns')}</span> <span className={data.vulns?.length > 0 ? 'risk' : 'safe'}>{data.vulns ? data.vulns.length : 0} {loc('detected')}</span></div>
                    </>
                )}
                {name === 'alienvault' && (
                    <>
                        <div className="flex-row"><span>{loc('pulses')}</span> <span className={isRisky ? 'risk' : 'safe'}>{data.pulse_info?.count || 0}</span></div>
                        {data.country_name && <div className="flex-row"><span>{loc('country')}</span> <span>{data.country_name}</span></div>}
                        {data.city && <div className="flex-row"><span>{loc('city')}</span> <span>{data.city}</span></div>}
                        {data.asn && <div className="flex-row"><span>{loc('asn')}</span> <span>{data.asn}</span></div>}

                        {/* Domain Specific Data */}
                        {data.whois && (
                            <div className="flex-row"><span>{loc('whois')}</span> <span>{data.whois}</span></div>
                        )}
                    </>
                )}
                {name === 'greynoise' && (
                    <>
                        <div className="flex-row"><span>{loc('classif')}</span> <span className={isRisky ? 'risk' : 'safe'}>{data.classification || loc('unknown')}</span></div>
                        <div className="flex-row"><span>{loc('noise')}</span> <span>{data.noise ? loc('yes') : loc('no')}</span></div>
                        <div className="flex-row"><span>{loc('actor')}</span> <span>{data.actor || loc('unknown')}</span></div>
                    </>
                )}
                {name === 'urlscan' && (
                    <>
                        <div className="flex-row"><span>{loc('totalScans')}</span> <span>{data.total || 0}</span></div>
                        {data.results?.[0]?.page?.server && <div className="flex-row"><span>{loc('server')}</span> <span>{data.results[0].page.server}</span></div>}
                        {data.results?.[0]?.page?.title && <div className="flex-row"><span>{loc('pageTitle')}</span> <span>{data.results[0].page.title}</span></div>}
                        {data.results?.[0]?.page?.ip && <div className="flex-row"><span>{loc('resIp')}</span> <span className="mono">{data.results[0].page.ip}</span></div>}
                        {data.results?.[0]?.page?.city && data.results?.[0]?.page?.country && (
                            <div className="flex-row"><span>{loc('location')}</span> <span>{data.results[0].page.city}, {data.results[0].page.country}</span></div>
                        )}
                    </>
                )}
                {name === 'blacklistmaster' && (
                    <>
                        {!isRisky ? (
                            <div className="flex-row"><span className="safe">{loc('cleanBl')}</span></div>
                        ) : (
                            <div className="flex-row"><span className="risk">{loc('foundBl')}</span></div>
                        )}
                    </>
                )}
                {name === 'abusech' && (
                    <>
                        {data.query_status === 'ok' && Array.isArray(data.data) && data.data.length > 0 ? (
                            <>
                                <div className="flex-row"><span>{loc('threat')}</span> <span className="risk">{data.data[0].threat_type}</span></div>
                                <div className="flex-row"><span>{loc('conf')}</span> <span>{data.data[0].confidence_level}%</span></div>
                            </>
                        ) : (
                            <div className="flex-row"><span className="safe">{loc('none')}</span></div>
                        )}
                    </>
                )}
                {name === 'pulsedive' && (
                    <>
                        <div className="flex-row"><span>{loc('riskLevel')}</span> <span className={isRisky ? 'risk' : 'safe'} style={{ textTransform: 'capitalize' }}>{data.risk || loc('none')}</span></div>
                        <div className="flex-row"><span>{loc('feeds')}</span> <span>{data.feeds ? Object.keys(data.feeds).length : 0}</span></div>
                    </>
                )}
            </div>
        );
    };

    return (
        <div className="glass-panel fade-in" style={{ borderColor: borderColor }}>
            <div style={{
                padding: '1rem',
                borderBottom: `1px solid var(--glass-border)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <HeaderIcon size={18} color={iconColor} />
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                        {
                            {
                                'virustotal': 'VirusTotal',
                                'abuseipdb': 'AbuseIPDB',
                                'alienvault': 'AlienVault OTX',
                                'urlscan': 'UrlScan.io',
                                'shodan': 'Shodan',
                                'greynoise': 'GreyNoise',
                                'blacklistmaster': 'BlacklistMaster',
                                'abusech': 'Abuse.ch',
                                'pulsedive': 'Pulsedive'
                            }[name] || name
                        }
                    </h3>
                </div>
                {!isError && (
                    <div ref={infoRef} style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowInfo(v => !v)}
                            aria-label={t('service_card.info_label')}
                            style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', borderRadius: '4px', color: showInfo ? 'var(--primary)' : 'var(--text-muted)', transition: 'color 0.15s' }}
                        >
                            <Info size={16} />
                        </button>
                        {showInfo && (
                            <div style={{
                                position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 50,
                                background: 'var(--bg-card, rgba(15,23,42,0.97))',
                                border: '1px solid var(--glass-border)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '0.75rem 1rem',
                                minWidth: '220px', maxWidth: '280px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                                fontSize: '0.85rem',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.5,
                            }}>
                                <p style={{ margin: '0 0 0.6rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {t(`service_card.info.${name}.title`, { defaultValue: name })}
                                </p>
                                <p style={{ margin: '0 0 0.6rem' }}>
                                    {t(`service_card.info.${name}.desc`, { defaultValue: '' })}
                                </p>
                                {SERVICE_URLS[name] && target && (
                                    <a
                                        href={SERVICE_URLS[name]({ value: target.value, type: target.type })}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem' }}
                                    >
                                        {t('service_card.info.view_on_site')} <ExternalLink size={12} />
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div style={{ padding: '1.5rem' }}>
                <style>
                    {`
            .flex-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 0.5rem; }
            .flex-row span:first-child { color: var(--text-secondary); }
            .flex-row span:last-child { color: var(--text-primary); text-align: right; word-break: break-all; }
            .risk { color: var(--status-risk) !important; font-weight: 500; }
            .safe { color: var(--status-safe) !important; font-weight: 500; }
          `}
                </style>
                {renderContent()}
            </div>
        </div>
    );
}

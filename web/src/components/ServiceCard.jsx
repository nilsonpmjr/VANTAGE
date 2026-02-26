import React from 'react';
import { ExternalLink, AlertTriangle, CheckCircle, Info } from 'lucide-react';

export default function ServiceCard({ name, data }) {
    const isError = data.error || data._meta_error;

    // Decide Border color based on generic risk heuristics
    let isRisky = false;

    if (!isError) {
        if (name === 'virustotal' && data.data?.attributes?.last_analysis_stats?.malicious > 0) isRisky = true;
        if (name === 'abuseipdb' && data.data?.abuseConfidenceScore > 0) isRisky = true;
        if (name === 'alienvault' && data.pulse_info?.count > 0) isRisky = true;
        if (name === 'urlscan' && data.data?.verdict?.score > 0) isRisky = true;
        if (name === 'greynoise' && data.classification === 'malicious') isRisky = true;
        if (name === 'blacklistmaster' && data._meta_msg !== "No content returned") isRisky = true;
    }

    const borderColor = isError ? 'var(--status-suspicious)' : (isRisky ? 'var(--status-risk)' : 'var(--glass-border)');
    const HeaderIcon = isError ? AlertTriangle : (isRisky ? AlertTriangle : CheckCircle);
    const iconColor = isError ? 'var(--status-suspicious)' : (isRisky ? 'var(--status-risk)' : 'var(--status-safe)');

    const renderContent = () => {
        if (isError) {
            return (
                <div style={{ color: 'var(--status-suspicious)', padding: '1rem', background: 'rgba(234, 179, 8, 0.05)', borderRadius: 'var(--radius-sm)' }}>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>{data.error || data._meta_msg || "API Error"}</p>
                </div>
            );
        }

        // Very simplified rendering for MVP - dump specific keys based on service
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.95rem' }}>
                {name === 'virustotal' && (
                    <>
                        <div className="flex-row"><span>Malicious vendors:</span> <span className={isRisky ? 'risk' : 'safe'}>{data.data?.attributes?.last_analysis_stats?.malicious || 0}</span></div>
                        <div className="flex-row"><span>Total vendors:</span> <span>{data.data?.attributes?.last_analysis_stats?.undetected + (data.data?.attributes?.last_analysis_stats?.malicious || 0)}</span></div>
                        {data.data?.attributes?.meaningful_name && <div className="flex-row"><span>Filename:</span> <span className="mono">{data.data.attributes.meaningful_name}</span></div>}

                        {/* Domain Specific Data */}
                        {data.data?.attributes?.categories && Object.keys(data.data.attributes.categories).length > 0 && (
                            <div className="flex-row"><span>Categories:</span> <span>{[...new Set(Object.values(data.data.attributes.categories))].join(', ')}</span></div>
                        )}
                        {data.data?.attributes?.last_dns_records && data.data.attributes.last_dns_records.length > 0 && (
                            <div className="flex-row"><span>DNS/IP Resolutions:</span> <span>{data.data.attributes.last_dns_records.map(r => r.value).filter(v => v.match(/[\d\.]+/)).slice(0, 3).join(', ')}</span></div>
                        )}
                    </>
                )}
                {name === 'abuseipdb' && (
                    <>
                        <div className="flex-row"><span>Confidence Score:</span> <span className={isRisky ? 'risk' : 'safe'}>{data.data?.abuseConfidenceScore}%</span></div>
                        <div className="flex-row"><span>Total Reports:</span> <span>{data.data?.totalReports}</span></div>
                        <div className="flex-row"><span>ISP:</span> <span>{data.data?.isp}</span></div>
                        <div className="flex-row"><span>Country:</span> <span>{data.data?.countryCode}</span></div>
                    </>
                )}
                {name === 'shodan' && (
                    <>
                        <div className="flex-row"><span>Organization:</span> <span>{data.org || 'N/A'}</span></div>
                        <div className="flex-row"><span>OS:</span> <span>{data.os || 'N/A'}</span></div>
                        <div className="flex-row"><span>Open Ports:</span> <span>{data.ports ? data.ports.join(', ') : 'None'}</span></div>
                        <div className="flex-row"><span>Vulns:</span> <span className={data.vulns?.length > 0 ? 'risk' : 'safe'}>{data.vulns ? data.vulns.length : 0} detected</span></div>
                    </>
                )}
                {name === 'alienvault' && (
                    <>
                        <div className="flex-row"><span>Threat Pulses:</span> <span className={isRisky ? 'risk' : 'safe'}>{data.pulse_info?.count || 0}</span></div>
                        {data.country_name && <div className="flex-row"><span>Country:</span> <span>{data.country_name}</span></div>}

                        {/* Domain Specific Data */}
                        {data.whois && (
                            <div className="flex-row"><span>WHOIS Reg:</span> <span>{data.whois}</span></div>
                        )}
                    </>
                )}
                {name === 'greynoise' && (
                    <>
                        <div className="flex-row"><span>Classification:</span> <span className={isRisky ? 'risk' : 'safe'}>{data.classification || 'unknown'}</span></div>
                        <div className="flex-row"><span>Noise:</span> <span>{data.noise ? 'Yes' : 'No'}</span></div>
                        <div className="flex-row"><span>Actor:</span> <span>{data.actor || 'unknown'}</span></div>
                    </>
                )}
                {name === 'urlscan' && (
                    <>
                        <div className="flex-row"><span>Total Scans:</span> <span>{data.total || 0}</span></div>
                        {data.results?.[0]?.page?.server && <div className="flex-row"><span>Server:</span> <span>{data.results[0].page.server}</span></div>}
                        {data.results?.[0]?.page?.title && <div className="flex-row"><span>Page Title:</span> <span>{data.results[0].page.title}</span></div>}
                        {data.results?.[0]?.page?.ip && <div className="flex-row"><span>Resolved IP:</span> <span className="mono">{data.results[0].page.ip}</span></div>}
                        {data.results?.[0]?.page?.city && data.results?.[0]?.page?.country && (
                            <div className="flex-row"><span>Location:</span> <span>{data.results[0].page.city}, {data.results[0].page.country}</span></div>
                        )}
                    </>
                )}
                {name === 'blacklistmaster' && (
                    <>
                        {!isRisky ? (
                            <div className="flex-row"><span className="safe">Clean - Not found on blacklists</span></div>
                        ) : (
                            <div className="flex-row"><span className="risk">Found on blacklists</span></div>
                        )}
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
                    <h3 style={{ margin: 0, textTransform: 'capitalize', fontSize: '1.1rem' }}>{name}</h3>
                </div>
                {!isError && <Info size={16} color="var(--text-muted)" style={{ cursor: 'pointer' }} />}
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

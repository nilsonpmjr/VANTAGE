import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import API_URL from "../config";
import { generatePdfReport } from "../utils/pdfReport";

type AnalyzePayload = {
  target: string;
  type: string;
  summary?: {
    risk_sources: number;
    total_sources: number;
    verdict: string;
  };
  results?: Record<string, any>;
  analysis_report?: string;
  analysis_reports?: Partial<Record<"pt" | "en" | "es", string>>;
};

type EvidenceRow = {
  source: string;
  signal: string;
  riskLabel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
};

const SOURCE_LABELS: Record<string, string> = {
  virustotal: "VirusTotal",
  abuseipdb: "AbuseIPDB",
  alienvault: "AlienVault OTX",
  shodan: "Shodan",
  greynoise: "GreyNoise",
  urlscan: "UrlScan.io",
  abusech: "Abuse.ch",
  pulsedive: "Pulsedive",
  blacklistmaster: "BlacklistMaster",
};

function decodeTarget(target?: string) {
  return target ? decodeURIComponent(target) : "unknown";
}

function scoreToPercent(riskSources = 0, totalSources = 0) {
  if (!totalSources) return 0;
  return Math.round((riskSources / totalSources) * 100);
}

function verdictMeta(verdict?: string) {
  if (verdict === "HIGH RISK") {
    return {
      badge: "CRITICAL NODE",
      colorClass: "bg-error/10 text-error",
      status: "High Risk",
    };
  }
  if (verdict === "SUSPICIOUS") {
    return {
      badge: "SUSPICIOUS",
      colorClass: "bg-amber-500/10 text-amber-600",
      status: "Suspicious",
    };
  }
  return {
    badge: "CLEAN",
    colorClass: "bg-emerald-500/10 text-emerald-700",
    status: "Safe",
  };
}

function getOpenPorts(results?: Record<string, any>) {
  const ports = Array.isArray(results?.shodan?.ports) ? results?.shodan?.ports : [];
  return ports.slice(0, 6).map((port: number) => ({
    port,
    label:
      {
        22: "SSH",
        80: "HTTP",
        443: "HTTPS",
        3389: "RDP",
        25: "SMTP",
        53: "DNS",
      }[port] || "Service",
    tag: port === 3389 ? "Critical" : port === 443 ? "Encrypted" : "Public",
    danger: port === 3389,
  }));
}

function buildEvidenceRows(results?: Record<string, any>): EvidenceRow[] {
  if (!results) return [];
  const rows: EvidenceRow[] = [];

  for (const [service, data] of Object.entries(results)) {
    if (!data || typeof data !== "object" || data.error || data._meta_error) continue;

    if (service === "virustotal") {
      const malicious = data.data?.attributes?.last_analysis_stats?.malicious || 0;
      rows.push({
        source: SOURCE_LABELS[service],
        signal: `${malicious}/${(data.data?.attributes?.last_analysis_stats?.undetected || 0) + malicious} detections`,
        riskLabel: malicious >= 8 ? "CRITICAL" : malicious >= 3 ? "HIGH" : malicious >= 1 ? "MEDIUM" : "LOW",
        confidence: Math.min(100, malicious * 12 + 20),
      });
      continue;
    }

    if (service === "abuseipdb") {
      const score = data.data?.abuseConfidenceScore || 0;
      rows.push({
        source: SOURCE_LABELS[service],
        signal: `${data.data?.totalReports || 0} reports (${score}% confidence)`,
        riskLabel: score >= 75 ? "CRITICAL" : score >= 25 ? "HIGH" : score > 0 ? "MEDIUM" : "LOW",
        confidence: Math.min(100, score),
      });
      continue;
    }

    if (service === "shodan") {
      const ports = Array.isArray(data.ports) ? data.ports : [];
      const hasRdp = ports.includes(3389);
      rows.push({
        source: SOURCE_LABELS[service],
        signal: ports.length ? `Open ports: ${ports.slice(0, 5).join(", ")}` : "No exposed ports reported",
        riskLabel: hasRdp ? "CRITICAL" : ports.length >= 3 ? "MEDIUM" : "LOW",
        confidence: hasRdp ? 100 : Math.min(100, ports.length * 18 + 20),
      });
      continue;
    }

    if (service === "alienvault") {
      const pulses = data.pulse_info?.count || 0;
      rows.push({
        source: SOURCE_LABELS[service],
        signal: pulses > 0 ? `Pulse count: ${pulses}` : "No active pulses",
        riskLabel: pulses >= 5 ? "CRITICAL" : pulses > 0 ? "HIGH" : "LOW",
        confidence: pulses >= 5 ? 92 : pulses > 0 ? 75 : 20,
      });
      continue;
    }

    if (service === "greynoise") {
      const classification = data.classification || "unknown";
      rows.push({
        source: SOURCE_LABELS[service],
        signal: `Classification: ${classification}`,
        riskLabel: classification === "malicious" ? "HIGH" : classification === "unknown" ? "LOW" : "MEDIUM",
        confidence: classification === "malicious" ? 82 : 40,
      });
      continue;
    }

    if (service === "urlscan") {
      const total = data.total || 0;
      rows.push({
        source: SOURCE_LABELS[service],
        signal: total > 0 ? `Indexed scans: ${total}` : "No relevant scans",
        riskLabel: total > 3 ? "HIGH" : total > 0 ? "MEDIUM" : "LOW",
        confidence: total > 0 ? 68 : 20,
      });
      continue;
    }

    if (service === "abusech") {
      const entry = Array.isArray(data.data) ? data.data[0] : null;
      rows.push({
        source: SOURCE_LABELS[service],
        signal: entry ? `${entry.threat_type || "Malware"} (${entry.confidence_level || 0}%)` : "No malware linkage",
        riskLabel: entry ? "CRITICAL" : "LOW",
        confidence: entry?.confidence_level || 15,
      });
      continue;
    }

    if (service === "pulsedive") {
      const risk = data.risk || "none";
      rows.push({
        source: SOURCE_LABELS[service],
        signal: `Risk level: ${risk}`,
        riskLabel: risk === "critical" ? "CRITICAL" : risk === "high" ? "HIGH" : risk === "medium" ? "MEDIUM" : "LOW",
        confidence: risk === "critical" ? 95 : risk === "high" ? 86 : risk === "medium" ? 60 : 20,
      });
      continue;
    }

    if (service === "blacklistmaster") {
      const listed = data._meta_msg !== "No content returned";
      rows.push({
        source: SOURCE_LABELS[service],
        signal: listed ? "Present on blacklist sources" : "Not present on blacklist sources",
        riskLabel: listed ? "HIGH" : "LOW",
        confidence: listed ? 88 : 25,
      });
    }
  }

  return rows;
}

function riskBadgeClasses(level: EvidenceRow["riskLabel"]) {
  if (level === "CRITICAL") return "bg-error/10 text-error";
  if (level === "HIGH") return "bg-error-container/30 text-on-error-container";
  if (level === "MEDIUM") return "bg-amber-500/10 text-amber-600";
  return "bg-slate-500/10 text-slate-600";
}

export default function AnalysisResult() {
  const { target } = useParams();
  const displayTarget = decodeTarget(target);
  const [payload, setPayload] = useState<AnalyzePayload | null>(null);
  const [reportLanguage, setReportLanguage] = useState<"pt" | "en" | "es">("pt");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("lastSearch", displayTarget);
  }, [displayTarget]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/api/analyze?target=${encodeURIComponent(displayTarget)}&lang=pt`, {
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to analyze target");
        }
        return response.json();
      })
      .then((data) => {
        if (!mounted) return;
        setPayload(data);
      })
      .catch((err: Error) => {
        if (!mounted) return;
        setError(err.message);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [displayTarget]);

  const summary = payload?.summary;
  const threatScore = scoreToPercent(summary?.risk_sources, summary?.total_sources);
  const meta = verdictMeta(summary?.verdict);
  const ports = getOpenPorts(payload?.results);
  const rows = buildEvidenceRows(payload?.results);
  const currentReport =
    payload?.analysis_reports?.[reportLanguage] ||
    payload?.analysis_report ||
    "No narrative report was generated for this target.";

  const entity =
    payload?.results?.virustotal?.data?.attributes?.as_owner ||
    payload?.results?.shodan?.org ||
    payload?.results?.alienvault?.asn ||
    "Unclassified";

  const category =
    payload?.results?.abusech?.data?.[0]?.threat_type ||
    payload?.results?.greynoise?.classification ||
    summary?.verdict ||
    "Unknown";

  if (loading) {
    return (
      <div className="page-frame">
        <div className="surface-section px-6 py-8 text-sm text-on-surface-variant">
          Running cross-provider analysis for <strong className="text-on-surface">{displayTarget}</strong>...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-frame max-w-4xl">
        <div className="surface-section overflow-hidden border-error/20">
          <div className="bg-surface-container-high px-6 py-4">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
              Analysis Failure
            </h2>
          </div>
          <div className="px-6 py-8 text-error text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-frame space-y-8">
      <div className="page-header">
        <div className="page-header-copy">
          <div className="page-eyebrow">Analysis</div>
          <h1 className="page-heading">{displayTarget}</h1>
          <p className="page-subheading">
            Consolidated intelligence profile assembled from {summary?.total_sources || 0} active sources for this{" "}
            {(payload?.type || "target").toUpperCase()} artifact.
          </p>
        </div>
        <div className="summary-strip">
          <div className="summary-pill">
            <span className={`w-1.5 h-1.5 rounded-full ${summary?.verdict === "HIGH RISK" ? "bg-error" : summary?.verdict === "SUSPICIOUS" ? "bg-amber-500" : "bg-emerald-500"}`}></span>
            <span>{meta.status}</span>
          </div>
          <div className="summary-pill-muted">
            <span>{threatScore}% threat score</span>
          </div>
        </div>
      </div>

      <div className="page-toolbar">
        <div className="page-toolbar-copy">Evidence actions</div>
        <div className="page-toolbar-actions">
          <label className="inline-flex items-center gap-2 rounded-sm bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface">
            Report language
            <select
              value={reportLanguage}
              onChange={(event) =>
                setReportLanguage(event.target.value as "pt" | "en" | "es")
              }
              className="bg-transparent text-on-surface outline-none"
              aria-label="Report language"
              title="Report language"
            >
              <option value="pt">PT</option>
              <option value="en">EN</option>
              <option value="es">ES</option>
            </select>
          </label>
          <button
            className="btn btn-outline"
            onClick={() => {
              const blob = new Blob(
                [JSON.stringify(payload?.results || {}, null, 2)],
                { type: "application/json" },
              );
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `vantage-analysis-${displayTarget}.json`;
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export JSON
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!payload) return;
              generatePdfReport(payload, currentReport, reportLanguage);
            }}
          >
            Export PDF
          </button>
        </div>
      </div>

      <div className="page-with-side-rail">
        <div className="page-main-pane space-y-6">
          <section className="surface-section flex flex-col h-full">
            <header className="surface-section-header">
              <div>
                <h2 className="surface-section-title uppercase">Evidence & Indicators</h2>
                <p className="mt-1 text-[10px] text-on-surface-variant font-medium">
                  Showing live search results from {summary?.total_sources || 0} intelligence sources
                </p>
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    <th className="px-6 py-3">Source</th>
                    <th className="px-6 py-3">Indicator / Signal</th>
                    <th className="px-6 py-3">Risk Level</th>
                    <th className="px-6 py-3">Confidence</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low">
                  {rows.length > 0 ? (
                    rows.map((row) => (
                      <tr key={`${row.source}-${row.signal}`} className="hover:bg-surface-container-low transition-colors duration-150 h-10">
                        <td className="px-6 py-2">
                          <span className="text-[11px] font-bold text-primary-dim">{row.source}</span>
                        </td>
                        <td className="px-6 py-2">
                          <span className="text-[11px] font-medium text-on-surface">{row.signal}</span>
                        </td>
                        <td className="px-6 py-2">
                          <span className={`text-[10px] px-2 py-0.5 font-black rounded-sm ${riskBadgeClasses(row.riskLabel)}`}>
                            {row.riskLabel}
                          </span>
                        </td>
                        <td className="px-6 py-2">
                          <div className="w-20 h-1 bg-surface-container-low rounded-full overflow-hidden">
                            <div
                              className={row.riskLabel === "CRITICAL" || row.riskLabel === "HIGH" ? "bg-error h-full" : row.riskLabel === "MEDIUM" ? "bg-amber-500 h-full" : "bg-slate-500 h-full"}
                              style={{ width: `${row.confidence}%` }}
                            ></div>
                          </div>
                        </td>
                        <td className="px-6 py-2 text-right">
                          <button className="text-primary-dim hover:underline text-[11px] font-bold">Pivot</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-sm text-on-surface-variant">
                        No successful source responses were returned for this target.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface-section overflow-hidden">
            <header className="surface-section-header">
              <div>
                <h2 className="surface-section-title uppercase">Analyst Report</h2>
                <p className="mt-1 text-[10px] text-on-surface-variant font-medium">
                  Heuristic narrative generated by the VANTAGE analysis engine
                </p>
              </div>
            </header>
            <div className="px-6 py-5">
              <pre className="whitespace-pre-wrap text-sm leading-7 text-on-surface-variant font-sans">
                {currentReport}
              </pre>
            </div>
          </section>
        </div>

        <div className="page-side-rail-right">
        <section className="surface-section p-0 overflow-hidden">
          <header className="bg-surface-container-high px-4 py-3 flex justify-between items-center">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Results Summary</h2>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-sm ${meta.colorClass}`}>{meta.badge}</span>
          </header>
          <div className="p-6 flex flex-col items-center text-center">
            <div className="relative w-32 h-32 mb-6 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle className="text-surface-container-low" cx="64" cy="64" fill="transparent" r="58" stroke="currentColor" strokeWidth="8"></circle>
                <circle
                  className={summary?.verdict === "HIGH RISK" ? "text-error" : summary?.verdict === "SUSPICIOUS" ? "text-amber-500" : "text-emerald-500"}
                  cx="64"
                  cy="64"
                  fill="transparent"
                  r="58"
                  stroke="currentColor"
                  strokeDasharray="364.4"
                  strokeDashoffset={364.4 - (364.4 * threatScore) / 100}
                  strokeWidth="8"
                ></circle>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-on-surface leading-none">{threatScore}</span>
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tighter">Threat Score</span>
              </div>
            </div>
            <div className="space-y-1 mb-8">
              <h3 className="text-2xl font-bold tracking-tight text-on-surface">{displayTarget}</h3>
              <p className="text-sm text-outline font-medium">{payload?.type?.toUpperCase() || "TARGET"}</p>
            </div>
            <div className="w-full grid grid-cols-2 gap-4 text-left border-t border-surface-container-low pt-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-outline-variant font-bold mb-1">Status</p>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${summary?.verdict === "HIGH RISK" ? "bg-error" : summary?.verdict === "SUSPICIOUS" ? "bg-amber-500" : "bg-emerald-500"}`}></div>
                  <span className={`text-sm font-bold ${summary?.verdict === "HIGH RISK" ? "text-error" : summary?.verdict === "SUSPICIOUS" ? "text-amber-600" : "text-emerald-700"}`}>
                    {meta.status}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-outline-variant font-bold mb-1">Entity</p>
                <span className="text-sm font-bold text-on-surface">{entity}</span>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-outline-variant font-bold mb-1">Valid Sources</p>
                <span className="text-sm font-medium text-on-surface">
                  {summary?.risk_sources || 0}/{summary?.total_sources || 0}
                </span>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-outline-variant font-bold mb-1">Category</p>
                <span className="text-sm font-medium text-on-surface" style={{ textTransform: "capitalize" }}>
                  {String(category).replace(/_/g, " ")}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="surface-section overflow-hidden">
          <header className="bg-surface-container-high px-4 py-3">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Active Exposure (Ports)</h2>
          </header>
          <div className="p-4 space-y-2">
            {ports.length > 0 ? (
              ports.map((port) => (
                <div
                  key={port.port}
                  className={`flex items-center justify-between p-3 rounded-sm ${port.danger ? "border border-error-container bg-error/5" : "bg-surface-container-low"}`}
                >
                  <div className="flex items-center space-x-3">
                    <span className={`text-sm font-bold ${port.danger ? "text-error" : "text-primary-dim"}`}>{port.port}</span>
                    <span className="text-xs font-semibold text-on-surface">{port.label}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 font-bold uppercase ${port.danger ? "bg-error/10 text-error" : "bg-primary/10 text-primary-dim"}`}>
                    {port.tag}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-3 bg-surface-container-low rounded-sm text-sm text-on-surface-variant">
                No exposed ports were returned by the active sources.
              </div>
            )}
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}

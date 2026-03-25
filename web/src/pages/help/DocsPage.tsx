import { useState } from "react";
import {
  BookOpen,
  Terminal,
  Rss,
  Radar,
  Eye,
  Crosshair,
  ShieldAlert,
  LayoutDashboard,
  Shield,
  Play,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface DocSection {
  id: string;
  label: string;
  icon: typeof BookOpen;
  content: DocArticle[];
}

interface DocArticle {
  title: string;
  body: string;
}

const sections: DocSection[] = [
  {
    id: "quick-start",
    label: "Quick Start",
    icon: Play,
    content: [
      {
        title: "What is VANTAGE",
        body: "VANTAGE is an external threat intelligence and digital risk platform designed for small-to-mid security teams. It aggregates data from 9+ intelligence sources (VirusTotal, Shodan, AbuseIPDB, AlienVault OTX, GreyNoise, UrlScan.io, Abuse.ch, Pulsedive, and more) into a single analyst environment for IOC analysis, reconnaissance, feed monitoring, and exposure tracking.",
      },
      {
        title: "First Login & Guided Tour",
        body: "After your first login, VANTAGE launches an interactive guided tour that walks you through every major feature: the search bar, report language selector, sidebar navigation, and each module. You can restart the tour at any time from this documentation page or from your profile settings.",
      },
      {
        title: "Setting Up Intelligence API Keys",
        body: "Navigate to Profile > Third-Party API Keys to configure your credentials for each intelligence provider. VANTAGE will only query services for which you have configured valid keys. The Analysis Status indicator on the Home page shows which services are currently available.",
      },
      {
        title: "Your First Analysis",
        body: "Enter any IP address, domain, or file hash into the search bar on the Home page and click Execute. VANTAGE queries all configured intelligence sources in parallel and returns a consolidated verdict with detailed findings from each provider. Results can be exported as PDF reports in Portuguese, English, or Spanish.",
      },
    ],
  },
  {
    id: "analysis",
    label: "Analysis",
    icon: Terminal,
    content: [
      {
        title: "Individual Search (IP, Domain, Hash)",
        body: "The query engine on the Home page accepts IPv4/IPv6 addresses, domain names, and MD5/SHA1/SHA256 file hashes. Type or paste the indicator and press Execute. VANTAGE automatically detects the indicator type and routes it to the appropriate intelligence sources.",
      },
      {
        title: "Integrated Services",
        body: "Each configured service returns specific data: VirusTotal provides multi-engine scan results and community votes. Shodan reveals open ports, services, and banners. AbuseIPDB shows abuse confidence scores and report history. OTX delivers pulse-based threat correlation. GreyNoise classifies noise vs. targeted activity. UrlScan.io captures page screenshots and DOM analysis. Abuse.ch checks against known malware/botnet databases. Pulsedive provides risk scoring and enrichment.",
      },
      {
        title: "Understanding the Verdict Panel",
        body: "The verdict panel aggregates findings into a risk classification: SAFE (no indicators of compromise), SUSPICIOUS (some flags but inconclusive), HIGH RISK (multiple sources confirm malicious activity), or CRITICAL (active, confirmed threat requiring immediate action). The panel also shows a confidence score based on source agreement.",
      },
      {
        title: "PDF Reports",
        body: "After an analysis completes, use the Export button to generate a detailed PDF report. Reports are available in Portuguese (PT-BR), English (EN), and Spanish (ES). The report includes all source findings, the verdict rationale, and recommended actions.",
      },
      {
        title: "Batch Analysis",
        body: "For bulk analysis, navigate to the Batch section from the Home page. Upload a CSV or TXT file with one indicator per line, or paste indicators directly. VANTAGE processes them in parallel with a daily quota system. Track progress via the live SSE stream and download results when complete.",
      },
    ],
  },
  {
    id: "feed",
    label: "Threat Feed",
    icon: Rss,
    content: [
      {
        title: "Navigating the Feed",
        body: "The Feed page displays threat intelligence articles ingested from configured sources. Articles are shown in a 2-column editorial grid with a featured item section highlighting the most critical or recent high-severity entry. Each card shows the source name, TLP classification, severity badge, publication date, and a summary.",
      },
      {
        title: "Filters: Source, TLP, Sector, Severity",
        body: "Use the filter bar to narrow results by severity level (Critical, High, Medium, Low, Info), source type (RSS, MISP), TLP classification (White, Green, Amber, Red), or sector tags (Finance, Healthcare, Government, etc.). Filters are combinable and reset pagination to page 1.",
      },
      {
        title: "Built-in vs. Custom Sources",
        body: "VANTAGE ships with built-in feeds from NVD (CVE database) and FortiGuard (outbreak alerts and threat signals). Administrators can add custom RSS feeds through Settings > Threat Ingestion & SMTP, specifying a name, URL, family, polling interval, and default TLP classification.",
      },
      {
        title: "MISP Integration",
        body: "For organizations running MISP, VANTAGE can ingest events directly. Configure the MISP server URL and API key in Settings > Threat Ingestion & SMTP. Events are normalized into the standard feed format with automatic TLP extraction from MISP tags and sector inference from event content.",
      },
    ],
  },
  {
    id: "recon",
    label: "Recon Engine",
    icon: Radar,
    content: [
      {
        title: "Available Modules",
        body: "The Recon Engine offers multiple reconnaissance modules: DNS (A, AAAA, MX, NS, TXT, CNAME records), WHOIS (registrant, registrar, dates), SSL/TLS (certificate chain, expiration, SANs), Port Scanning (top ports, services, banners), Subdomain Enumeration (passive discovery), Passive DNS (historical resolution data), Web Analysis (headers, technologies, screenshots), and Traceroute (network path analysis).",
      },
      {
        title: "Starting a Scan",
        body: "Enter a target domain or IP on the Recon page, select the modules you want to run, and click Start Scan. VANTAGE validates the target against security policies (no internal IPs, no command injection patterns) before launching the scan. Each module runs independently and streams results as they complete.",
      },
      {
        title: "Live Results (SSE Streaming)",
        body: "Scan results stream in real-time via Server-Sent Events. As each module completes, its findings appear immediately in the results panel without requiring a page refresh. The progress indicator shows which modules are still running.",
      },
      {
        title: "History & Scheduled Scans",
        body: "View historical scans for any target from the Recon History section. You can also create scheduled scans that run at defined intervals, useful for ongoing monitoring of critical infrastructure. Administrators can view all jobs across analysts from the Admin Jobs view.",
      },
    ],
  },
  {
    id: "watchlist",
    label: "Watchlist",
    icon: Eye,
    content: [
      {
        title: "Adding Assets for Monitoring",
        body: "The Watchlist lets you register indicators (IPs, domains, hashes) for ongoing monitoring. When an indicator is added, VANTAGE periodically re-analyzes it across all configured intelligence sources and tracks changes in risk status over time.",
      },
      {
        title: "Automatic Re-scan",
        body: "A background worker runs daily re-scans on all watchlist items. If an indicator's verdict changes (e.g., from SAFE to SUSPICIOUS), the change is recorded and available in the item's history timeline.",
      },
      {
        title: "Email Notifications",
        body: "When SMTP is configured (Settings > Threat Ingestion & SMTP), VANTAGE can send email alerts when a watchlist item's risk status changes. Notifications include the old and new verdicts, the triggering source, and a direct link to the analysis.",
      },
      {
        title: "Managing Items",
        body: "Edit watchlist items to update notes or priority. Remove items you no longer need to track. The SMTP Status indicator shows whether email notifications are currently operational.",
      },
    ],
  },
  {
    id: "hunting",
    label: "Hunting",
    icon: Crosshair,
    content: [
      {
        title: "Available Sources",
        body: "Hunting is an extension-driven investigation module. When the Sherlock source is installed, you can search for username and identity presence across social media platforms, forums, and web services. Additional sources can be added through the extensions catalog.",
      },
      {
        title: "Username / Identity Search",
        body: "Enter a username on the Hunting page and select the scope (identity, social, or both). The provider checks hundreds of platforms for matching accounts and returns a list of confirmed profiles with direct links.",
      },
      {
        title: "Interpreting Results",
        body: "Results are grouped by platform category. Each finding shows the platform name, profile URL, and confirmation status. Use this data for OSINT investigations, insider threat analysis, or brand monitoring.",
      },
    ],
  },
  {
    id: "exposure",
    label: "Exposure",
    icon: ShieldAlert,
    content: [
      {
        title: "Registering Assets",
        body: "The Exposure module tracks your organization's external attack surface. Register assets by type: domains, subdomains, or brand keywords. Each asset can be scanned independently to discover exposed services, leaked credentials, or brand abuse.",
      },
      {
        title: "Surface Scan",
        body: "Trigger a scan on any registered asset to check for exposure signals. The scan leverages installed exposure providers to search for credential leaks, subdomain takeover opportunities, certificate transparency logs, and other external risk indicators.",
      },
      {
        title: "Active Sources",
        body: "Exposure sources are installed through the extensions catalog. Check Settings > Extensions Catalog to see which sources are active. Each one specializes in a different exposure type, such as credentials, external surface, or leaks.",
      },
    ],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    content: [
      {
        title: "Metrics & Time Windows",
        body: "The Dashboard provides an operational overview with three time windows: Day, Week, and Month. Key metrics include total scans, threats detected, and active recon modules. The 7-day trend chart visualizes scan volume and malicious findings over time.",
      },
      {
        title: "Case Verdict Distribution",
        body: "The donut chart shows the breakdown of analysis verdicts (Safe, Suspicious, High Risk, Critical) across all scans in the selected time window. Use this to gauge the overall threat posture of analyzed indicators.",
      },
      {
        title: "Top Threat Typologies & Artifacts",
        body: "The typologies section ranks the most common threat categories by event count. The dangerous artifacts table lists the most frequently analyzed high-risk indicators with their type, search count, and current risk status.",
      },
    ],
  },
  {
    id: "account",
    label: "Account & Security",
    icon: Shield,
    content: [
      {
        title: "Changing Your Password",
        body: "Navigate to Profile to change your password. The platform enforces configurable password policies (minimum length, complexity, history). If your administrator has set a password expiration policy, you'll see a warning banner when your password is nearing expiration.",
      },
      {
        title: "MFA (TOTP)",
        body: "Multi-factor authentication adds a second layer of security using time-based one-time passwords (TOTP). Enroll from Profile > MFA section using any authenticator app (Google Authenticator, Authy, etc.). During enrollment, save your 8 backup codes in a secure location — each code can only be used once.",
      },
      {
        title: "Managing Active Sessions",
        body: "View all your active sessions from Profile > Sessions. Each entry shows the device, IP address, and last activity time. You can revoke individual sessions or terminate all other sessions at once.",
      },
      {
        title: "Personal API Keys",
        body: "Create API keys from Profile > API Keys for programmatic access to the VANTAGE API. Keys use a secure prefix format (iti_xxx) and only the SHA-256 hash is stored on the server. Copy the full key immediately after creation — it cannot be retrieved later.",
      },
      {
        title: "Personal Audit Log",
        body: "Your personal audit log shows all actions performed under your account: logins, analysis requests, password changes, MFA events, and more. Use it to verify your activity or detect unauthorized access.",
      },
    ],
  },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("quick-start");

  const current = sections.find((s) => s.id === activeSection) || sections[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start mt-6">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
        <div className="surface-section">
          <div className="surface-section-header">
            <h3 className="surface-section-title">Sections</h3>
          </div>
          <nav className="p-2">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 text-[13px] font-medium rounded-sm transition-colors text-left",
                    activeSection === section.id
                      ? "bg-primary/10 text-primary"
                      : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {section.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="card p-4 space-y-3">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            Quick Actions
          </h4>
          <button className="btn btn-outline w-full text-left justify-start">
            <Play className="w-3.5 h-3.5" />
            Restart Guided Tour
          </button>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <current.icon className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-extrabold tracking-tight text-on-surface">
            {current.label}
          </h2>
        </div>

        {current.content.map((article, idx) => (
          <article key={idx} className="surface-section">
            <div className="surface-section-header">
              <h3 className="surface-section-title">{article.title}</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-on-surface-variant leading-relaxed">
                {article.body}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import SearchBar from './components/SearchBar';
import VerdictPanel from './components/VerdictPanel';
import ServiceCard from './components/ServiceCard';
import ReactMarkdown from 'react-markdown';
import { Globe } from 'lucide-react';
import './index.css';

const INTEGRATIONS = [
  { name: 'VirusTotal', domain: 'virustotal.com' },
  { name: 'AbuseIPDB', domain: 'abuseipdb.com' },
  { name: 'AlienVault OTX', domain: 'alienvault.com' },
  { name: 'UrlScan.io', domain: 'urlscan.io' },
  { name: 'Shodan', domain: 'shodan.io' },
  { name: 'GreyNoise', domain: 'greynoise.io' },
  { name: 'BlacklistMaster', domain: 'blacklistmaster.com' },
  { name: 'Abuse.ch', domain: 'abuse.ch' },
  { name: 'Pulsedive', domain: 'pulsedive.com' }
];

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [lang, setLang] = useState('pt');
  const [hasSearched, setHasSearched] = useState(false);

  const t = {
    pt: {
      title: 'Threat Intelligence Hub',
      services: 'Serviços Integrados',
      scanning: 'Consultando múltiplas fontes de inteligência...',
      summary: 'Resumo',
      error: 'Erro:'
    },
    en: {
      title: 'Threat Intelligence Hub',
      services: 'Integrated Services',
      scanning: 'Scanning multiple intelligence sources...',
      summary: 'Summary',
      error: 'Error:'
    },
    es: {
      title: 'Centro de Inteligencia de Amenazas',
      services: 'Servicios Integrados',
      scanning: 'Consultando múltiples fuentes de inteligencia...',
      summary: 'Resumen',
      error: 'Error:'
    }
  };

  const handleSearch = async (query) => {
    setHasSearched(true);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const response = await fetch(`http://localhost:8000/api/analyze?target=${encodeURIComponent(query)}&lang=${lang}`);

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Failed to analyze target");
      }

      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Animated Header */}
      <header className={`app-header ${hasSearched ? 'active' : ''}`}>
        <div className="header-left">
          <img
            src="/logo.svg"
            alt="iT.eam Logo"
            className="app-logo"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              setHasSearched(false);
              setData(null);
              setError(null);
            }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <p className="app-subtitle">{t[lang].title}</p>
        </div>

        <div className="header-center">
          <SearchBar key={hasSearched ? 'active' : 'initial'} onSearch={handleSearch} loading={loading} lang={lang} />
        </div>

        <div className="header-right">
          <Globe size={18} color="var(--text-muted)" />
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="lang-select"
          >
            <option value="pt">Português</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flexGrow: 1, paddingBottom: '2rem' }}>
        {error && (
          <div className="fade-in" style={{
            marginTop: '2rem',
            padding: '1rem',
            background: 'var(--status-risk-bg)',
            border: '1px solid var(--status-risk)',
            color: 'var(--status-risk)',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center'
          }}>
            <p><strong>{t[lang].error}</strong> {error}</p>
          </div>
        )}

        {!data && !error && (
          <div className="fade-in" style={{
            marginTop: hasSearched ? '1rem' : '2rem',
            textAlign: 'center',
            transition: 'all 0.7s cubic-bezier(0.25, 1, 0.5, 1)'
          }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t[lang].services}
            </p>
            <div className="marquee-container">
              <div className="marquee-content">
                {[...INTEGRATIONS, ...INTEGRATIONS].map((provider, i) => (
                  <div key={i} className="provider-card">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${provider.domain}&sz=64`}
                      alt={provider.name}
                      className="provider-icon"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <span>{provider.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {loading && !data && (
          <div style={{ marginTop: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="loader-pulse" style={{ width: '40px', height: '40px', background: 'var(--accent-glow)', borderRadius: '50%', margin: '0 auto 1rem' }}></div>
            <p>{t[lang].scanning}</p>
          </div>
        )}

        {data && (
          <div className="fade-in">
            <VerdictPanel target={data.target} type={data.type} summary={data.summary} lang={lang} />

            <div className="grid-dashboard">
              {Object.entries(data.results).map(([serviceName, serviceData]) => (
                <ServiceCard key={serviceName} name={serviceName} data={serviceData} lang={lang} />
              ))}
            </div>

            {(data.analysis_report || data.analysis_reports) && (
              <div className="glass-panel fade-in" style={{ marginTop: '2rem', padding: '2rem', borderTop: '4px solid var(--accent-border)' }}>
                <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  {t[lang].summary}
                </h3>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '1.05rem' }}>
                  <ReactMarkdown>{data.analysis_reports ? data.analysis_reports[lang] : data.analysis_report}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ marginTop: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', borderTop: '1px solid var(--glass-border)', paddingTop: '2rem' }}>
        <p>&copy; {new Date().getFullYear()} iT.eam Next Generation SOC. All rights reserved.</p>
      </footer>
    </div>
  );
}

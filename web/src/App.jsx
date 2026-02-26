import React, { useState } from 'react';
import SearchBar from './components/SearchBar';
import VerdictPanel from './components/VerdictPanel';
import ServiceCard from './components/ServiceCard';
import ReactMarkdown from 'react-markdown';
import './index.css';

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const handleSearch = async (query) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const response = await fetch(`http://localhost:8000/api/analyze?target=${encodeURIComponent(query)}`);

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
      {/* Header */}
      <header style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '3rem', gap: '1rem' }}>
        <img src="/logo.svg" alt="iT.eam Logo" style={{ height: '60px', opacity: 0.9 }} onError={(e) => {
          // Fallback if logo not copied correctly
          e.target.style.display = 'none';
        }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', margin: 0 }}>
          Threat Intelligence Hub
        </p>
      </header>

      {/* Main Search Area */}
      <main style={{ flexGrow: 1, paddingBottom: '4rem' }}>
        <SearchBar onSearch={handleSearch} loading={loading} />

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
            <p><strong>Error:</strong> {error}</p>
          </div>
        )}

        {!data && !loading && !error && (
          <div className="fade-in" style={{ marginTop: '4rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Serviços Integrados Prontos para Consulta
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1rem', maxWidth: '800px', margin: '0 auto' }}>
              {['VirusTotal', 'AbuseIPDB', 'AlienVault OTX', 'UrlScan.io', 'Shodan', 'GreyNoise', 'BlacklistMaster'].map(provider => (
                <div key={provider} className="glass-panel" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.8 }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-safe)' }}></div>
                  {provider}
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && !data && (
          <div style={{ marginTop: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="loader-pulse" style={{ width: '40px', height: '40px', background: 'var(--accent-glow)', borderRadius: '50%', margin: '0 auto 1rem' }}></div>
            <p>Scanning multiple intelligence sources...</p>
          </div>
        )}

        {data && (
          <div className="fade-in">
            <VerdictPanel target={data.target} type={data.type} summary={data.summary} />

            <div className="grid-dashboard">
              {Object.entries(data.results).map(([serviceName, serviceData]) => (
                <ServiceCard key={serviceName} name={serviceName} data={serviceData} />
              ))}
            </div>

            {data.analysis_report && (
              <div className="glass-panel fade-in" style={{ marginTop: '2rem', padding: '2rem', borderTop: '4px solid var(--accent-border)' }}>
                <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  Resumo
                </h3>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '1.05rem' }}>
                  <ReactMarkdown>{data.analysis_report}</ReactMarkdown>
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

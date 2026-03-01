import React, { useState, useEffect } from 'react';
import SearchBar from './components/SearchBar';
import VerdictPanel from './components/VerdictPanel';
import ServiceCard from './components/ServiceCard';
import ReactMarkdown from 'react-markdown';
import { Globe, Download, LogOut } from 'lucide-react';
import { generatePDFReport } from './utils/pdfGenerator';
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Settings from './components/Settings';
import Dashboard from './components/Dashboard';
import Profile from './components/Profile';
import { useTranslation } from 'react-i18next';
import './index.css';

const INTEGRATIONS = [
  { id: 'virustotal', name: 'VirusTotal', domain: 'virustotal.com' },
  { id: 'abuseipdb', name: 'AbuseIPDB', domain: 'abuseipdb.com' },
  { id: 'alienvault', name: 'AlienVault OTX', domain: 'alienvault.com' },
  { id: 'urlscan', name: 'UrlScan.io', domain: 'urlscan.io' },
  { id: 'shodan', name: 'Shodan', domain: 'shodan.io' },
  { id: 'greynoise', name: 'GreyNoise', domain: 'greynoise.io' },
  { id: 'blacklistmaster', name: 'BlacklistMaster', domain: 'blacklistmaster.com' },
  { id: 'abusech', name: 'Abuse.ch', domain: 'abuse.ch' },
  { id: 'pulsedive', name: 'Pulsedive', domain: 'pulsedive.com' }
];

export default function App() {
  const { user, loading: authLoading, isTransitioning, isFadingOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [lang, setLang] = useState('pt');
  const [hasSearched, setHasSearched] = useState(false);
  const [currentView, setCurrentView] = useState('home');

  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (user?.preferred_lang) {
      setLang(user.preferred_lang);
      i18n.changeLanguage(user.preferred_lang);
    }
  }, [user?.preferred_lang, i18n]);


  const handleSearch = async (query) => {
    setHasSearched(true);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:8000/api/analyze?target=${encodeURIComponent(query)}&lang=${lang}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

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

  if (authLoading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', color: 'var(--primary)' }}>{t('app.loading')}</div>;
  }

  if (!user && !isTransitioning) {
    return <Login />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>

      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />

      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'scroll' }}>

        {currentView === 'home' && (
          <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
            {/* Animated Header */}
            <header className={`app-header ${hasSearched ? 'active' : ''} ${isTransitioning && !isFadingOut ? 'from-login' : ''}`}>

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
                <p className="app-subtitle" style={{ marginLeft: 0 }}>{t('app.title')}</p>
              </div>

              <div className="header-center">
                <SearchBar key={hasSearched ? 'active' : 'initial'} onSearch={handleSearch} loading={loading} lang={lang} />
              </div>

              <div className="header-right">
                {data && (
                  <button
                    onClick={() => generatePDFReport(data, data.analysis_reports?.[lang], lang)}
                    className="fade-in"
                    style={{ marginRight: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', background: 'var(--glass-bg)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.2s' }}
                    title={t('app.download')}
                    onMouseOver={(e) => Object.assign(e.currentTarget.style, { background: 'var(--accent-glow)', borderColor: 'var(--accent-border)' })}
                    onMouseOut={(e) => Object.assign(e.currentTarget.style, { background: 'var(--glass-bg)', borderColor: 'var(--glass-border)' })}
                  >
                    <Download size={18} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>PDF</span>
                  </button>
                )}

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
            <main style={{ paddingBottom: '2rem', flexGrow: 1 }}>
              {error && (
                <div className="fade-in" style={{
                  marginTop: '2rem',
                  padding: '1rem',
                  background: 'var(--status-risk-bg)',
                  border: '1px solid var(--status-risk)',
                  color: 'var(--status-risk)',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  flexShrink: 0
                }}>
                  <p><strong>{t('app.error')}</strong> {error}</p>
                </div>
              )}

              {!data && !error && (
                <div className="fade-in" style={{
                  marginTop: hasSearched ? '1rem' : '2rem',
                  textAlign: 'center',
                  transition: 'all 0.7s cubic-bezier(0.25, 1, 0.5, 1)',
                  flexShrink: 0
                }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('app.services')}
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
                <div style={{ marginTop: '4rem', textAlign: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
                  <div className="loader-pulse" style={{ width: '40px', height: '40px', background: 'var(--accent-glow)', borderRadius: '50%', margin: '0 auto 1rem' }}></div>
                  <p>{t('app.scanning')}</p>
                </div>
              )}

              {data && (
                <div className="fade-in" style={{ flexGrow: 1, paddingTop: '1rem' }}>
                  <VerdictPanel target={data.target} type={data.type} summary={data.summary} lang={lang} />

                  <div className="grid-dashboard">
                    {Object.entries(data.results).map(([serviceName, serviceData]) => (
                      <ServiceCard key={serviceName} name={serviceName} data={serviceData} lang={lang} />
                    ))}
                  </div>

                  {(data.analysis_report || data.analysis_reports) && (
                    <div className="glass-panel fade-in" style={{ marginTop: '2rem', padding: '2rem', borderTop: '4px solid var(--accent-border)' }}>
                      <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                        {t('app.summary')}
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
            <footer style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', width: '100%', color: 'var(--text-muted)', fontSize: '0.9rem', borderTop: '1px solid var(--glass-border)', padding: '1.2rem 0', flexShrink: 0 }}>
              <p>&copy; {new Date().getFullYear()} iT.eam Next Generation SOC. All rights reserved.</p>
            </footer>
          </div>
        )}

        {currentView === 'dashboard' && <Dashboard onSearch={(query) => { setCurrentView('home'); handleSearch(query); }} />}
        {currentView === 'settings' && <Settings />}
        {currentView === 'profile' && <Profile />}
      </div>
    </div>
  );
}

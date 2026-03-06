import React, { useState, useEffect } from 'react';
import SearchBar from './components/dashboard/SearchBar';
import VerdictPanel from './components/dashboard/VerdictPanel';
import ServiceCard from './components/dashboard/ServiceCard';
import ToastNotification from './components/shared/ToastNotification';
import ReactMarkdown from 'react-markdown';
import { Globe, Download, LogOut } from 'lucide-react';
import { generatePDFReport } from './utils/pdfGenerator';
import { useAuth } from './context/AuthContext';
import Login from './components/auth/Login';
import MFAVerify from './components/auth/MFAVerify';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import Sidebar from './components/layout/Sidebar';
import Settings from './components/admin/Settings';
import Dashboard from './components/dashboard/Dashboard';
import Profile from './components/Profile';
import TourOverlay from './components/shared/TourOverlay';
import { useTranslation } from 'react-i18next';
import API_URL from './config';
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
  const { user, loading: authLoading, isTransitioning, isFadingOut, mfaPending, mfaSetupRequired, setMfaSetupRequired, completeMfaLogin, cancelMfa } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [lang, setLang] = useState('pt');
  const [hasSearched, setHasSearched] = useState(false);
  const [currentView, setCurrentView] = useState('home');
  const [resetToken, setResetToken] = useState(null);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);

  const { t, i18n } = useTranslation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) setResetToken(token);
  }, []);

  const clearResetToken = () => {
    setResetToken(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url);
  };

  useEffect(() => {
    if (user?.preferred_lang) {
      setLang(user.preferred_lang);
      i18n.changeLanguage(user.preferred_lang);
    }
  }, [user?.preferred_lang, i18n]);

  // Force navigation to profile when password reset is required or expired
  useEffect(() => {
    if (!user) return;
    if (user.force_password_reset || user.password_expires_in_days === 0) {
      setCurrentView('profile');
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Force navigation to profile when MFA setup is required
  useEffect(() => {
    if (mfaSetupRequired && user) {
      setCurrentView('profile');
    }
  }, [mfaSetupRequired, user]); // eslint-disable-line react-hooks/exhaustive-deps


  const handleSearch = async (query) => {
    setHasSearched(true);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const response = await fetch(`${API_URL}/api/analyze?target=${encodeURIComponent(query)}&lang=${lang}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        let detail = "Failed to analyze target";
        try { const err = await response.json(); detail = err.detail || detail; } catch { /* non-JSON error body */ }
        throw new Error(detail);
      }

      const result = await response.json();
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
    if (resetToken) return <ResetPassword token={resetToken} onSuccess={clearResetToken} />;
    if (mfaPending) return <MFAVerify preAuthToken={mfaPending.preAuthToken} onSuccess={completeMfaLogin} onCancel={cancelMfa} />;
    if (forgotPasswordMode) return <ForgotPassword onBack={() => setForgotPasswordMode(false)} />;
    return <Login onForgotPassword={() => setForgotPasswordMode(true)} />;
  }

  // Expiry warning: show banner when within warning window but not yet expired
  const expiryWarningDays = (user && typeof user.password_expires_in_days === 'number' && user.password_expires_in_days > 0 && user.password_expires_in_days <= 7)
    ? user.password_expires_in_days
    : null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>

      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />

      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' }}>

        {/* Password expiry / force-reset notice — inside content column, does not cover sidebar */}
        {user && (user.force_password_reset || user.password_expires_in_days === 0) && (
          <div style={{ background: 'var(--status-risk-bg)', borderBottom: '1px solid var(--status-risk)', color: 'var(--status-risk)', padding: '0.5rem 1.5rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', flexShrink: 0 }}>
            <strong>{user.force_password_reset ? t('auth.force_reset_notice') : t('auth.password_expired_notice')}</strong>
            <button onClick={() => setCurrentView('profile')} style={{ background: 'var(--status-risk)', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.2rem 0.7rem', cursor: 'pointer', fontSize: '0.82rem' }}>
              {t('auth.change_now')}
            </button>
          </div>
        )}

        {/* MFA setup required banner */}
        {mfaSetupRequired && (
          <div style={{ background: 'rgba(251,146,60,0.12)', borderBottom: '1px solid #fb923c', color: '#fb923c', padding: '0.5rem 1.5rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', flexShrink: 0 }}>
            <strong>{t('mfa.setup_required_notice')}</strong>
            <button onClick={() => { setCurrentView('profile'); setMfaSetupRequired(false); }} style={{ background: '#fb923c', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.2rem 0.7rem', cursor: 'pointer', fontSize: '0.82rem' }}>
              {t('mfa.setup_now')}
            </button>
          </div>
        )}

        {/* Password expiry warning (within warning window) */}
        {expiryWarningDays !== null && (
          <div style={{ background: 'rgba(251, 146, 60, 0.12)', borderBottom: '1px solid #fb923c', color: '#fb923c', padding: '0.5rem 1.5rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', flexShrink: 0 }}>
            {t('auth.password_expiry_warning', { days: expiryWarningDays })}
            <button onClick={() => setCurrentView('profile')} style={{ background: '#fb923c', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.2rem 0.6rem', cursor: 'pointer', fontSize: '0.78rem' }}>
              {t('auth.change_now')}
            </button>
          </div>
        )}

        {currentView === 'home' && (
          <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
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

              <div className="header-center" data-tour="search-bar">
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
                  data-tour="lang-select"
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
                  {/* Stale cache notice */}
                  {data._stale_cache && (
                    <div style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid #fb923c', color: '#fb923c', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      ⚠ {t('app.stale_cache_notice')}
                    </div>
                  )}
                  {/* Recalculate source counts from actual results (fixes cached data with stale counts) */}
                  {(() => {
                    const successEntries = Object.entries(data.results).filter(([, d]) => !d.error && !d._meta_error);
                    const correctedSummary = {
                      ...data.summary,
                      total_sources: successEntries.length,
                    };
                    return <VerdictPanel target={data.target} type={data.type} summary={correctedSummary} lang={lang} />;
                  })()}

                  <div className="grid-dashboard">
                    {Object.entries(data.results)
                      .filter(([, d]) => !d.error && !d._meta_error)
                      .map(([serviceName, serviceData]) => (
                        <ServiceCard key={serviceName} name={serviceName} data={serviceData} lang={lang} target={{ value: data.target, type: data.type }} />
                      ))}
                  </div>

                  <ToastNotification
                    errors={Object.entries(data.results)
                      .filter(([, d]) => d.error || d._meta_error)
                      .map(([name, d]) => ({ name, type: d._meta_error_type || 'api_error', message: d._meta_error || d.error }))}
                  />

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

          </div>
        )}

        {currentView === 'dashboard' && <Dashboard onSearch={(query) => { setCurrentView('home'); handleSearch(query); }} style={{ flexShrink: 0 }} />}
        {currentView === 'settings' && <div style={{ flexShrink: 0 }}><Settings /></div>}
        {currentView === 'profile' && <div style={{ flexShrink: 0 }}><Profile /></div>}

        {/* Shared footer — end of scrollable content */}
        <footer style={{ display: 'flex', justifyContent: 'center', width: '100%', color: 'var(--text-muted)', fontSize: '0.9rem', borderTop: '1px solid var(--glass-border)', padding: '1.2rem 0', flexShrink: 0, background: 'var(--bg-main)' }}>
          <p>&copy; {new Date().getFullYear()} iT.eam Next Generation SOC. All rights reserved.</p>
        </footer>
      </div>

      {/* Tour only runs on the home page */}
      {currentView === 'home' && <TourOverlay />}
    </div>
  );
}

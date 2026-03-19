import React, { useState, useEffect, Suspense } from 'react';
import SearchBar from './components/dashboard/SearchBar';
import VerdictPanel from './components/dashboard/VerdictPanel';
import ServiceCard from './components/dashboard/ServiceCard';
const BatchResultsPanel = React.lazy(() => import('./components/dashboard/BatchResultsPanel'));
import ToastNotification from './components/shared/ToastNotification';
import ReactMarkdown from 'react-markdown';
import { Globe, Download, LogOut, Menu } from 'lucide-react';
import { generatePDFReport } from './utils/pdfGenerator';
import { useAuth } from './context/AuthContext';
import Login from './components/auth/Login';
import MFAVerify from './components/auth/MFAVerify';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import Sidebar from './components/layout/Sidebar';
import Settings from './components/admin/Settings';
const Dashboard = React.lazy(() => import('./components/dashboard/Dashboard'));
const ReconPage = React.lazy(() => import('./components/recon/ReconPage'));
const FeedPage = React.lazy(() => import('./components/feed/FeedPage'));
import FeedPreview from './components/feed/FeedPreview';
import Profile from './components/Profile';
import WatchlistSettings from './components/profile/WatchlistSettings';
import TourOverlay from './components/shared/TourOverlay';
import OnboardingApiKeysPrompt from './components/shared/OnboardingApiKeysPrompt';
import { useTranslation } from 'react-i18next';
import API_URL from './config';
import useBrandTheme from './branding/useBrandTheme';
import { useTour } from './context/TourContext';
import { shouldHandleSearchShortcut } from './utils/searchShortcuts';
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

// Pre-built double list for marquee infinite scroll — defined outside component (FE-10)
const MARQUEE_ITEMS = [...INTEGRATIONS, ...INTEGRATIONS];

export default function App() {
  const { user, loading: authLoading, isTransitioning, isFadingOut, mfaPending, mfaSetupRequired, setMfaSetupRequired, completeMfaLogin, cancelMfa } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [lang, setLang] = useState('pt');
  const [hasSearched, setHasSearched] = useState(false);
  const [batchTargets, setBatchTargets] = useState(null);
  const [currentView, setCurrentView] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resetToken, setResetToken] = useState(null);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [reconTarget, setReconTarget] = useState(null);
  const [reconOpenHistory, setReconOpenHistory] = useState(false);
  const [profileInitialKey, setProfileInitialKey] = useState(null);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);

  const { t, i18n } = useTranslation();
  const { brand, logoPath } = useBrandTheme();
  const { isOnboardingPromptVisible, acceptOnboardingPrompt, declineOnboardingPrompt } = useTour();
  const canAccessSettings = user?.role === 'admin';

  // BUG-02: Clear recon navigation state when leaving the recon view
  const setCurrentViewSafe = (view) => {
    if (view !== 'recon') {
      setReconTarget(null);
      setReconOpenHistory(false);
    }
    if (view !== 'profile') {
      setProfileInitialKey(null);
    }
    // When navigating to home, clear search state for a clean landing
    if (view === 'home') {
      setHasSearched(false);
      setData(null);
      setError(null);
      setBatchTargets(null);
    }
    setCurrentView(view);
  };

  const handleConfigureApiKeysBeforeTour = () => {
    acceptOnboardingPrompt();
    setProfileInitialKey('third_party_keys');
    setCurrentView('profile');
  };

  const handleContinueTour = () => {
    declineOnboardingPrompt();
  };

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
      setCurrentViewSafe('profile');
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Force navigation to profile when MFA setup is required
  useEffect(() => {
    if (mfaSetupRequired && user) {
      setCurrentViewSafe('profile');
    }
  }, [mfaSetupRequired, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentView === 'settings' && !canAccessSettings) {
      setCurrentViewSafe('home');
    }
  }, [currentView, canAccessSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcut — ctrl+l focuses search bar on home view
  useEffect(() => {
    if (!user || currentView !== 'home') return;

    const handleShortcut = (event) => {
      if (shouldHandleSearchShortcut(currentView, event)) {
        event.preventDefault();
        setSearchFocusSignal((current) => current + 1);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [user, currentView]);


  const handleBatchSearch = (rawTargets) => {
    setHasSearched(true);
    setData(null);
    setError(null);
    setBatchTargets(rawTargets);
  };

  const handleSearch = async (query) => {
    setBatchTargets(null);
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
    if (mfaPending) return <MFAVerify onSuccess={completeMfaLogin} onCancel={cancelMfa} />;
    if (forgotPasswordMode) return <ForgotPassword onBack={() => setForgotPasswordMode(false)} />;
    return <Login onForgotPassword={() => setForgotPasswordMode(true)} />;
  }

  // Expiry warning: show banner when within warning window but not yet expired
  const expiryWarningDays = (user && typeof user.password_expires_in_days === 'number' && user.password_expires_in_days > 0 && user.password_expires_in_days <= 7)
    ? user.password_expires_in_days
    : null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>

      {/* Backdrop for mobile sidebar drawer (UX-03) */}
      <div
        className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <div className={`sidebar-wrapper${sidebarOpen ? ' sidebar-open' : ''}`}>
        <Sidebar currentView={currentView} setCurrentView={setCurrentViewSafe} onMobileClose={() => setSidebarOpen(false)} />
      </div>

      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' }}>

        {/* Mobile topbar — hamburger visible only on ≤640px (UX-03) */}
        <div className="mobile-topbar">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label={t('sidebar.open_menu')}
            style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', padding: '0.35rem' }}
          >
            <Menu size={20} />
          </button>
          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{brand.name}</span>
        </div>

        {/* Password expiry / force-reset notice (UX-06: role=alert) */}
        {user && (user.force_password_reset || user.password_expires_in_days === 0) && (
          <div role="alert" aria-live="polite" style={{ background: 'var(--status-risk-bg)', borderBottom: '1px solid var(--status-risk)', color: 'var(--status-risk)', padding: '0.5rem 1.5rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', flexShrink: 0 }}>
            <strong>{user.force_password_reset ? t('auth.force_reset_notice') : t('auth.password_expired_notice')}</strong>
            <button onClick={() => setCurrentViewSafe('profile')} style={{ background: 'var(--status-risk)', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.2rem 0.7rem', cursor: 'pointer', fontSize: '0.82rem' }}>
              {t('auth.change_now')}
            </button>
          </div>
        )}

        {/* MFA setup required banner (UX-06: role=alert) */}
        {mfaSetupRequired && (
          <div role="alert" aria-live="polite" style={{ background: 'rgba(251,146,60,0.12)', borderBottom: '1px solid #fb923c', color: '#fb923c', padding: '0.5rem 1.5rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', flexShrink: 0 }}>
            <strong>{t('mfa.setup_required_notice')}</strong>
            <button onClick={() => { setCurrentViewSafe('profile'); setMfaSetupRequired(false); }} style={{ background: '#fb923c', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.2rem 0.7rem', cursor: 'pointer', fontSize: '0.82rem' }}>
              {t('mfa.setup_now')}
            </button>
          </div>
        )}

        {/* Password expiry warning (UX-06: role=alert) */}
        {expiryWarningDays !== null && (
          <div role="alert" aria-live="polite" style={{ background: 'rgba(251, 146, 60, 0.12)', borderBottom: '1px solid #fb923c', color: '#fb923c', padding: '0.5rem 1.5rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', flexShrink: 0 }}>
            {t('auth.password_expiry_warning', { days: expiryWarningDays })}
            <button onClick={() => setCurrentViewSafe('profile')} style={{ background: '#fb923c', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.2rem 0.6rem', cursor: 'pointer', fontSize: '0.78rem' }}>
              {t('auth.change_now')}
            </button>
          </div>
        )}

        {/* View content — keyed by currentView for fade-in transition (UX-01) */}
        <div key={currentView} className="fade-in" style={{ display: 'contents' }}>

          {/* ── HOME — unified search + landing with animated header ── */}
          {currentView === 'home' && (
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
              {/* Animated Header — hero (default) → compact (hasSearched) */}
              <header className={`app-header ${hasSearched ? 'active' : ''} ${isTransitioning && !isFadingOut ? 'from-login' : ''}`}>

                <div className="header-left">
                  <img
                    src={logoPath}
                    alt={brand.name}
                    className="app-logo"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setHasSearched(false);
                      setData(null);
                      setError(null);
                      setBatchTargets(null);
                    }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <p className="app-subtitle" style={{ marginLeft: 0 }}>{t('app.tagline', { defaultValue: brand.tagline })}</p>
                </div>

                <div className="header-center" data-tour="search-bar">
                  <SearchBar
                    key={hasSearched ? 'active' : 'initial'}
                    onSearch={handleSearch}
                    onBatchSearch={handleBatchSearch}
                    loading={loading}
                    focusSignal={searchFocusSignal}
                  />
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

                {/* Landing content — visible only before any search */}
                {!hasSearched && !data && !error && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                    {/* Marquee — integrated services */}
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
                          {MARQUEE_ITEMS.map((provider, i) => (
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

                    {/* Feed preview — latest threat intelligence cards */}
                    <FeedPreview onViewAll={() => setCurrentViewSafe('feed')} />
                  </div>
                )}

                {loading && !data && (
                  <div style={{ marginTop: '4rem', textAlign: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
                    <div className="loader-pulse" style={{ width: '40px', height: '40px', background: 'var(--accent-glow)', borderRadius: '50%', margin: '0 auto 1rem' }}></div>
                    <p>{t('app.scanning')}</p>
                  </div>
                )}

                {batchTargets && (
                  <Suspense fallback={
                    <div style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <span className="loader-pulse" style={{ width: 32, height: 32, background: 'var(--accent-glow)', borderRadius: '50%', display: 'inline-block' }} />
                    </div>
                  }>
                    <BatchResultsPanel
                      targets={batchTargets}
                      lang={lang}
                      onReset={() => { setBatchTargets(null); setHasSearched(false); }}
                    />
                  </Suspense>
                )}

                {!batchTargets && data && (
                  <div className="fade-in" style={{ flexGrow: 1, paddingTop: '1rem' }}>
                    {/* Stale cache notice */}
                    {data._stale_cache && (
                      <div style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid #fb923c', color: '#fb923c', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        ⚠ {t('app.stale_cache_notice')}
                      </div>
                    )}
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
                )}{/* end single result */}
              </main>

            </div>
          )}

          {/* ── FEED — dedicated threat intelligence feed page ── */}
          {currentView === 'feed' && (
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1, padding: '4rem', color: 'var(--primary)' }}><span className="loader-pulse" style={{ width: 36, height: 36, background: 'var(--accent-glow)', borderRadius: '50%' }} /></div>}>
                <FeedPage />
              </Suspense>
            </div>
          )}

          {currentView === 'dashboard' && (
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1, padding: '4rem', color: 'var(--primary)' }}><span className="loader-pulse" style={{ width: 36, height: 36, background: 'var(--accent-glow)', borderRadius: '50%' }} /></div>}>
                <Dashboard
                  onSearch={(query) => { setCurrentViewSafe('home'); handleSearch(query); }}
                  onRecon={(target, opts) => { setReconTarget(target); setReconOpenHistory(!!opts?.showHistory); setCurrentView('recon'); }}
                />
              </Suspense>
            </div>
          )}
          {currentView === 'settings' && canAccessSettings && <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}><Settings /></div>}
          {currentView === 'watchlist' && <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', padding: '2rem', maxWidth: '1400px', margin: '0 auto', width: '100%' }}><WatchlistSettings /></div>}
          {currentView === 'profile' && <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}><Profile initialActiveKey={profileInitialKey ?? 'info'} /></div>}
          {currentView === 'recon' && (
            <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '4rem', color: 'var(--primary)' }}><span className="loader-pulse" style={{ width: 36, height: 36, background: 'var(--accent-glow)', borderRadius: '50%' }} /></div>}>
              <ReconPage initialTarget={reconTarget} initialShowHistory={reconOpenHistory} />
            </Suspense>
          )}

        </div>{/* end view fade-in wrapper */}

        {/* Shared footer — end of scrollable content */}
        <footer style={{ display: 'flex', justifyContent: 'center', width: '100%', color: 'var(--text-muted)', fontSize: '0.9rem', borderTop: '1px solid var(--glass-border)', padding: '1.2rem 0', flexShrink: 0, background: 'var(--bg-main)' }}>
          <p>&copy; {new Date().getFullYear()} {brand.copyrightHolder}. All rights reserved.</p>
        </footer>
      </div>

      <OnboardingApiKeysPrompt
        open={Boolean(user && currentView === 'home' && isOnboardingPromptVisible)}
        onConfigureNow={handleConfigureApiKeysBeforeTour}
        onContinueTour={handleContinueTour}
      />

      {/* Tour only runs on the home page */}
      {currentView === 'home' && <TourOverlay />}
    </div>
  );
}

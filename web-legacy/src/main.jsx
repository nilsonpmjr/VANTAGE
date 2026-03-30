import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './branding/brand.css'
import './index.css'
import App from './App.jsx'
import { applyBrandTheme } from './branding/runtime'
import { AuthProvider } from './context/AuthContext.jsx'
import { TourProvider } from './context/TourContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import ErrorBoundary from './components/shared/ErrorBoundary.jsx'
import './i18n';

applyBrandTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <TourProvider>
            <App />
          </TourProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)

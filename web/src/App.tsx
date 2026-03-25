/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import SettingsLayout from "./components/SettingsLayout";
import Home from "./pages/Home";
import Feed from "./pages/Feed";
import Recon from "./pages/Recon";
import Watchlist from "./pages/Watchlist";
import Hunting from "./pages/Hunting";
import Exposure from "./pages/Exposure";
import Dashboard from "./pages/Dashboard";
import ExtensionsCatalog from "./pages/ExtensionsCatalog";
import ThreatIngestion from "./pages/ThreatIngestion";
import SystemHealth from "./pages/SystemHealth";
import UsersRoles from "./pages/UsersRoles";
import SecurityPolicies from "./pages/SecurityPolicies";
import OperationalPatterns from "./pages/OperationalPatterns";
import Profile from "./pages/Profile";
import Notifications from "./pages/Notifications";
import AnalysisResult from "./pages/AnalysisResult";
import BatchAnalysis from "./pages/BatchAnalysis";
import HelpLayout from "./pages/help/HelpLayout";
import DocsPage from "./pages/help/DocsPage";
import ShortcutsPage from "./pages/help/ShortcutsPage";
import ApiReferencePage from "./pages/help/ApiReferencePage";
import ContactSupportPage from "./pages/help/ContactSupportPage";
import { AuthProvider, RequireAuth, RequirePathAccess } from "./context/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
            }
          >
            <Route index element={<Home />} />
            <Route path="feed" element={<Feed />} />
            <Route path="recon" element={<Recon />} />
            <Route path="watchlist" element={<Watchlist />} />
            <Route path="hunting" element={<Hunting />} />
            <Route path="exposure" element={<Exposure />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route
              path="settings"
              element={
                <RequirePathAccess path="/settings">
                  <SettingsLayout />
                </RequirePathAccess>
              }
            >
              <Route index element={<Navigate to="/settings/extensions" replace />} />
              <Route path="patterns" element={<OperationalPatterns />} />
              <Route path="extensions" element={<ExtensionsCatalog />} />
              <Route path="threat-ingestion" element={<ThreatIngestion />} />
              <Route path="system-health" element={<SystemHealth />} />
              <Route path="users-roles" element={<UsersRoles />} />
              <Route path="security-policies" element={<SecurityPolicies />} />
            </Route>
            <Route path="profile" element={<Profile />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="analyze/:target" element={<AnalysisResult />} />
            <Route path="batch" element={<BatchAnalysis />} />
            <Route path="help" element={<HelpLayout />}>
              <Route index element={<Navigate to="/help/docs" replace />} />
              <Route path="docs" element={<DocsPage />} />
              <Route path="shortcuts" element={<ShortcutsPage />} />
              <Route path="api" element={<ApiReferencePage />} />
              <Route path="support" element={<ContactSupportPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

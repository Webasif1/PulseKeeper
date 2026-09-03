import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Toaster } from '@/components/ui/Toaster';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { SitesPage } from '@/pages/SitesPage';

/**
 * Router shell.
 *
 * Routing and providers only — no page markup (SPEC §26). Pages that arrive in
 * later phases are routed to a placeholder so every navigation link works from
 * the start.
 */
export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/sites" element={<SitesPage />} />
                <Route
                  path="/incidents"
                  element={
                    <PlaceholderPage
                      title="Incidents"
                      description="Active and resolved incidents with durations arrive shortly."
                    />
                  }
                />
                <Route
                  path="/analytics"
                  element={
                    <PlaceholderPage
                      title="Analytics"
                      description="Uptime, response-time trends, and site rankings arrive shortly."
                    />
                  }
                />
                <Route
                  path="/notifications"
                  element={
                    <PlaceholderPage
                      title="Notifications"
                      description="The notification feed arrives shortly."
                    />
                  }
                />
                <Route
                  path="/logs"
                  element={
                    <PlaceholderPage
                      title="Monitoring log"
                      description="Every monitoring sweep and its results arrive shortly."
                    />
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <PlaceholderPage
                      title="Settings"
                      description="Monitoring defaults, notifications, appearance, and retention arrive shortly."
                    />
                  }
                />
              </Route>

              <Route path="/404" element={<NotFoundPage />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Routes>

            <Toaster />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}

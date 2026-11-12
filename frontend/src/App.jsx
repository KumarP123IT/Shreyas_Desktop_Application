import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';

import AppShell from '@/components/layout/AppShell';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import CustomersPage from '@/pages/CustomersPage';
import DeliveriesPage from '@/pages/DeliveriesPage';
import RemindersPage from '@/pages/RemindersPage';
import NotificationsPage from '@/pages/NotificationsPage';
import SettingsPage from '@/pages/SettingsPage';
import StocksPage from '@/pages/StocksPage';

/**
 * Guard: redirect to /login if not authenticated.
 */
function RequireAuth({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { theme } = useThemeStore();

  // Apply dark class to <html> for Tailwind dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"     element={<DashboardPage />} />
        <Route path="customers/*"   element={<CustomersPage />} />
        <Route path="deliveries/*"  element={<DeliveriesPage />} />
        <Route path="reminders"     element={<RemindersPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="stocks/*"      element={<StocksPage />} />
        <Route path="settings/*"    element={<SettingsPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

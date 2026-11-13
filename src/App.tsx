import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { AppLayout } from './layouts/AppLayout.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { InventoryPage } from './pages/InventoryPage.tsx';
import { SalesPage } from './pages/SalesPage.tsx';
import { ForecastingPage } from './pages/ForecastingPage.tsx';
import { RestockingPage } from './pages/RestockingPage.tsx';
import { AnalyticsPage } from './pages/AnalyticsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';

const AppRoutes: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Loading Smart Market...
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/forecasting" element={<ForecastingPage />} />
        <Route path="/restocking" element={<RestockingPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

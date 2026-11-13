import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  Settings,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { t } from '../utils/i18n.ts';
import { PWAInstallButton } from '../components/PWAInstallButton.tsx';

export const AppLayout: React.FC = () => {
  const {
    user,
    business,
    language,
    setLanguage,
    logout,
    pendingSalesCount,
    isSyncing,
    syncOfflineQueue,
  } = useAuth();
  const { isOnline, simulatedOffline } = useOnlineStatus();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { to: '/', label: t(language, 'navDashboard'), icon: LayoutDashboard, end: true },
    { to: '/inventory', label: t(language, 'navInventory'), icon: Package },
    { to: '/sales', label: t(language, 'navSales'), icon: ShoppingCart },
    { to: '/forecasting', label: t(language, 'navForecasting'), icon: TrendingUp },
    { to: '/restocking', label: t(language, 'navRestocking'), icon: AlertTriangle },
    { to: '/analytics', label: t(language, 'navAnalytics'), icon: BarChart3 },
    { to: '/settings', label: t(language, 'navSettings'), icon: Settings },
  ];

  const currentNav =
    navItems.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))) ??
    navItems[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar (256px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white no-print">
        <div className="flex h-16 items-center px-6 border-b border-slate-200">
          <Link to="/" className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Smart Market
          </Link>
        </div>

        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {business?.name ?? 'Business Account'}
          </p>
          <p className="text-xs text-slate-500 truncate mt-0.5">
            {business?.marketLocation ?? 'Onitsha, Anambra'}
          </p>
        </div>

        <nav aria-label="Primary Navigation" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-50 text-teal-800'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 space-y-3">
          <div className="text-xs text-slate-500">
            <div className="font-medium text-slate-800 truncate">{user?.fullName}</div>
            <div className="truncate">{user?.email}</div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t(language, 'logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb/Location left, concise controls & 1 primary CTA right */}
        <header className="sticky top-0 z-30 flex h-14 sm:h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400">Smart Market</span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {currentNav.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 whitespace-nowrap">
                <WifiOff className="w-3.5 h-3.5" />
                {simulatedOffline ? 'Offline (Test)' : 'Offline'}
              </span>
            )}

            {pendingSalesCount > 0 && (
              <button
                type="button"
                onClick={() => syncOfflineQueue()}
                disabled={!isOnline || isSyncing}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="tabular-nums">{pendingSalesCount} Pending</span>
              </button>
            )}

            <div
              role="group"
              aria-label={t(language, 'languageLabel')}
              className="hidden sm:flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"
            >
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                  language === 'en'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage('ig')}
                className={`px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                  language === 'ig'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                IG
              </button>
            </div>

            <PWAInstallButton />

            <Link
              to="/sales"
              className="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
            >
              {t(language, 'recordSale')}
            </Link>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/40"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative flex w-72 max-w-[85vw] flex-col bg-white border-r border-slate-200">
              <div className="flex h-14 items-center justify-between px-4 border-b border-slate-200">
                <span className="font-display text-base font-bold text-slate-900">
                  Smart Market
                </span>
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900 truncate">{business?.name}</p>
                <p className="text-xs text-slate-500 truncate">{business?.marketLocation}</p>
              </div>
              <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                          isActive
                            ? 'bg-teal-50 text-teal-800'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </nav>
              <div className="border-t border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Language</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setLanguage('en')}
                      className={`px-2 py-1 text-xs rounded border ${
                        language === 'en' ? 'border-teal-600 text-teal-800 font-semibold' : 'border-slate-200'
                      }`}
                    >
                      EN
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanguage('ig')}
                      className={`px-2 py-1 text-xs rounded border ${
                        language === 'ig' ? 'border-teal-600 text-teal-800 font-semibold' : 'border-slate-200'
                      }`}
                    >
                      IG
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t(language, 'logout')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {business?.isDemo && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 text-xs text-slate-600 no-print">
              <span>
                {t(language, 'demoTag')} · Chinedu Electronics, Main Market Onitsha
              </span>
              <span className="text-slate-500">
                Synthetic 45-day sales history enabled for forecasting & restocking evaluation
              </span>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
};

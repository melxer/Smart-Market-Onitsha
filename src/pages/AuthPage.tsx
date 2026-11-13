import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, BarChart3, CheckCircle2, ShieldCheck, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';

export const AuthPage: React.FC = () => {
  const { login, loginDemo, register } = useAuth();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [marketLocation, setMarketLocation] = useState('Main Market, Onitsha');

  useEffect(() => {
    if (searchParams.get('autostart') === '1') {
      setSubmitting(true);
      loginDemo()
        .then(() => addToast('success', 'Signed into Onitsha Demo Business.'))
        .catch((err) => setError(err instanceof Error ? err.message : 'Demo login failed'))
        .finally(() => setSubmitting(false));
    }
  }, [searchParams, loginDemo, addToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        addToast('success', 'Welcome back to Smart Market.');
      } else {
        await register({
          fullName,
          email,
          phone,
          password,
          businessName,
          marketLocation,
        });
        addToast('success', 'Business account created.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await loginDemo();
      addToast('success', 'Signed into Chinedu Electronics (Onitsha Demo).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left column: Clear product framing for Onitsha traders */}
        <div className="lg:col-span-6 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-8">
          <div>
            <p className="text-xs font-medium text-teal-800">
              Onitsha, Anambra State · Inventory & Demand Intelligence
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900 text-balance">
              Smart Market Inventory & Sales Forecasting
            </h1>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Built for Nigerian wholesale and retail traders to replace paper notebooks with atomic stock tracking, real Naira profit accounting, statistical demand forecasting, and offline-first POS sales.
            </p>

            <div className="mt-8 space-y-4 border-t border-slate-100 pt-6">
              <div className="flex items-start gap-3">
                <BarChart3 className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Statistical 7-Day & 30-Day Demand Forecasting
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Exponential smoothing, weighted moving averages, day-of-week market seasonality, and MAE backtesting from real transactions.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Explainable Restocking Intelligence
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Calculates reorder points using supplier lead times and safety stock so fast-moving goods never stock out unexpectedly.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <WifiOff className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Offline-First Market Floor POS
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Records sales into IndexedDB when network drops in the market and syncs automatically without duplicate transactions.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-5 flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
            <span>Business-isolated accounts · Historical cost preservation · PWA ready</span>
          </div>
        </div>

        {/* Right column: Auth form + Instant Demo button */}
        <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-8 flex flex-col justify-between">
          <div>
            <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Explore Demo Account
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Chinedu Electronics (Onitsha) · 10 products · 45-day synthetic history
                  </p>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleDemoLogin}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <span>Enter Demo Shop</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Business Account
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="auth-fullname" className="block text-xs font-medium text-slate-700 mb-1">
                        Your Full Name
                      </label>
                      <input
                        id="auth-fullname"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Chinedu Okafor"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="auth-phone" className="block text-xs font-medium text-slate-700 mb-1">
                        Phone Number
                      </label>
                      <input
                        id="auth-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+234 803..."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="auth-biz" className="block text-xs font-medium text-slate-700 mb-1">
                      Shop / Business Name
                    </label>
                    <input
                      id="auth-biz"
                      type="text"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Okafor Electronics Plaza"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-loc" className="block text-xs font-medium text-slate-700 mb-1">
                      Market Location
                    </label>
                    <input
                      id="auth-loc"
                      type="text"
                      value={marketLocation}
                      onChange={(e) => setMarketLocation(e.target.value)}
                      placeholder="Main Market, Onitsha"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@smartmarket.ng"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting
                  ? 'Signing in...'
                  : mode === 'login'
                  ? 'Sign In'
                  : 'Create Account & Start'}
              </button>
            </form>
          </div>

          <p className="mt-6 text-xs text-slate-500 text-center">
            Demo credentials: <span className="font-mono text-slate-700">demo@smartmarket.ng</span> / <span className="font-mono text-slate-700">DemoTrader2026!</span>
          </p>
        </div>
      </div>
    </div>
  );
};

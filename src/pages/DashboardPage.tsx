import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, AlertTriangle, Package, ShoppingCart, TrendingUp } from 'lucide-react';
import type { DashboardSummary, ProductForecast, RestockingRecommendation } from '../types/index.ts';
import { apiFetch } from '../services/api.ts';
import {
  cacheDashboard,
  cacheForecasting,
  getCachedDashboard,
  getCachedForecasting,
} from '../services/offlineDb.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { formatNaira, formatNairaCompact, formatShortDate } from '../utils/format.ts';
import { t } from '../utils/i18n.ts';

export const DashboardPage: React.FC = () => {
  const { business, language } = useAuth();
  const { isOnline } = useOnlineStatus();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recommendations, setRecommendations] = useState<RestockingRecommendation[]>([]);
  const [forecasts, setForecasts] = useState<ProductForecast[]>([]);
  const [trendMode, setTrendMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    setError(null);
    try {
      if (isOnline) {
        const [dash, fc] = await Promise.all([
          apiFetch<DashboardSummary>('/api/dashboard'),
          apiFetch<{
            forecasts: ProductForecast[];
            recommendations: RestockingRecommendation[];
          }>('/api/forecasting'),
        ]);
        setSummary(dash);
        setForecasts(fc.forecasts);
        setRecommendations(fc.recommendations);
        await Promise.all([cacheDashboard(business.id, dash), cacheForecasting(business.id, fc)]);
      } else {
        const [cachedDash, cachedFc] = await Promise.all([
          getCachedDashboard(business.id),
          getCachedForecasting(business.id),
        ]);
        if (cachedDash) setSummary(cachedDash);
        if (cachedFc) {
          setForecasts(cachedFc.forecasts);
          setRecommendations(cachedFc.recommendations);
        }
        if (!cachedDash) {
          setError('Offline and no cached dashboard data available yet.');
        }
      }
    } catch (err) {
      const cachedDash = await getCachedDashboard(business.id);
      if (cachedDash) {
        setSummary(cachedDash);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to load dashboard.');
      }
    } finally {
      setLoading(false);
    }
  }, [business, isOnline]);

  useEffect(() => {
    loadData();
    const onSynced = () => loadData();
    window.addEventListener('smart-market-data-synced', onSynced);
    return () => window.removeEventListener('smart-market-data-synced', onSynced);
  }, [loadData]);

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-lg border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
        <div className="h-80 rounded-lg border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!summary) return null;

  const trendData =
    trendMode === 'daily'
      ? summary.dailyTrend.slice(-30).map((d) => ({
          label: formatShortDate(d.date),
          revenue: d.revenue,
          profit: d.profit,
        }))
      : trendMode === 'weekly'
      ? summary.weeklyTrend.map((w) => ({
          label: w.period,
          revenue: w.revenue,
          profit: w.profit,
        }))
      : summary.monthlyTrend.map((m) => ({
          label: m.period,
          revenue: m.revenue,
          profit: m.profit,
        }));

  const urgentRecs = recommendations
    .filter((r) => r.status === 'Restock immediately' || r.status === 'Restock soon')
    .slice(0, 5);

  const topForecasted = [...forecasts]
    .sort((a, b) => b.forecast7d - a.forecast7d)
    .slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Primary 4-column KPI strip */}
      <section aria-label="Key Financial Metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">{t(language, 'totalRevenue')}</p>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatNaira(summary.totalRevenue)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            Gross margin <span className="font-mono font-medium text-teal-700">{summary.grossMarginPct}%</span>
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">{t(language, 'grossProfit')}</p>
          <p className="mt-2 font-mono text-2xl font-bold text-teal-800 tabular-nums">
            {formatNaira(summary.estimatedGrossProfit)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            Calculated from historical cost prices
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">{t(language, 'stockValue')}</p>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatNaira(summary.totalStockValue)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            Retail potential {formatNairaCompact(summary.totalRetailValue)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">{t(language, 'todaysSales')}</p>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatNaira(summary.todaySalesRevenue)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {summary.todaySalesCount} order(s) · Profit {formatNaira(summary.todayGrossProfit)}
          </p>
        </div>
      </section>

      {/* Secondary Operational Strip */}
      <section aria-label="Inventory Health Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-600">{t(language, 'totalProducts')}</span>
          <span className="font-mono text-base font-semibold text-slate-900 tabular-nums">
            {summary.totalProducts}
          </span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-600">{t(language, 'lowStock')}</span>
          <span className="font-mono text-base font-semibold text-amber-700 tabular-nums">
            {summary.lowStockCount}
          </span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-600">{t(language, 'outOfStock')}</span>
          <span className="font-mono text-base font-semibold text-red-700 tabular-nums">
            {summary.outOfStockCount}
          </span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-600">Restock Alerts</span>
          <span className="font-mono text-base font-semibold text-amber-700 tabular-nums">
            {summary.urgentRestockCount}
          </span>
        </div>
      </section>

      {/* Primary Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Revenue & Gross Profit Trends
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Completed sales performance across selected cadence
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(['daily', 'weekly', 'monthly'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTrendMode(m)}
                  className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    trendMode === m
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {trendData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-sm text-slate-500">
              <ShoppingCart className="w-8 h-8 text-slate-300 mb-2" />
              <p>No completed sales recorded yet.</p>
              <Link to="/sales" className="mt-2 text-xs font-medium text-teal-700 hover:underline">
                Record First Sale
              </Link>
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis
                    tickFormatter={(v) => formatNairaCompact(Number(v))}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    width={64}
                  />
                  <Tooltip
                    formatter={(value) => formatNaira(Number(value ?? 0))}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#0F766E"
                    fill="#CCFBF1"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    name="Gross Profit"
                    stroke="#0284C7"
                    fill="#E0F2FE"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Demand Forecasting Snapshot */}
        <div className="lg:col-span-4 rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="font-display text-base font-semibold text-slate-900">
                7-Day Demand Outlook
              </h2>
              <Link
                to="/forecasting"
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
              >
                <span>Open Forecasts</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Statistical predictions from historical sales velocity
            </p>

            {topForecasted.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                Add products to generate demand forecasts.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {topForecasted.map((fc) => (
                  <div key={fc.productId} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {fc.productName}
                      </p>
                      <span className="font-mono text-sm font-semibold text-teal-800 tabular-nums whitespace-nowrap">
                        {fc.forecast7d} {fc.unit}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      Avg {fc.averageDailyDemand}/day · Stock {fc.currentStock} ·{' '}
                      {fc.insufficientData ? 'Baseline fallback' : `MAE ${fc.mae ?? 'N/A'}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-teal-700" />
              Exponential Smoothing & Seasonality
            </span>
          </div>
        </div>
      </div>

      {/* Urgent Restocking Alerts + Top vs Slow Products */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                {t(language, 'restockAlert')}
              </h2>
            </div>
            <Link
              to="/restocking"
              className="text-xs font-medium text-teal-700 hover:underline whitespace-nowrap"
            >
              View All Recommendations
            </Link>
          </div>

          {urgentRecs.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              <Package className="w-7 h-7 text-slate-300 mx-auto mb-2" />
              All active products are above their reorder points.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">Product</th>
                    <th className="py-2.5 px-2 font-medium text-right">Stock</th>
                    <th className="py-2.5 px-2 font-medium text-right">Reorder Pt</th>
                    <th className="py-2.5 px-2 font-medium text-right">Suggested Qty</th>
                    <th className="py-2.5 pl-2 font-medium">Action Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {urgentRecs.map((rec) => (
                    <tr key={rec.productId} className="hover:bg-slate-50/70">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-slate-900">{rec.productName}</div>
                        <div className="text-slate-500">{rec.supplierName}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-900">
                        {rec.currentStock}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600">
                        {rec.reorderPoint}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-teal-800">
                        +{rec.recommendedOrderQty} {rec.unit}
                      </td>
                      <td className="py-2.5 pl-2">
                        <span
                          className={`font-medium ${
                            rec.status === 'Restock immediately'
                              ? 'text-red-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-display text-base font-semibold text-slate-900 mb-1">
            Top-Selling Products
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Highest revenue contributors vs slow-moving stock
          </p>

          {summary.topSellingProducts.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">No product sales yet.</p>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={summary.topSellingProducts.map((p) => ({
                    name:
                      p.productName.length > 22
                        ? `${p.productName.slice(0, 20).trim()}…`
                        : p.productName,
                    revenue: p.revenue,
                  }))}
                  layout="vertical"
                  margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatNairaCompact(Number(v))}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={144}
                    tick={{ fontSize: 11, fill: '#334155' }}
                  />
                  <Tooltip
                    formatter={(value) => formatNaira(Number(value ?? 0))}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="revenue" name="Revenue" fill="#0F766E" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {summary.slowMovingProducts.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-700 mb-2">Slowest Moving Items</p>
              <div className="space-y-1.5">
                {summary.slowMovingProducts.slice(0, 2).map((s) => (
                  <div key={s.productId} className="flex items-center justify-between text-xs text-slate-600">
                    <span className="truncate pr-2">{s.productName}</span>
                    <span className="font-mono tabular-nums whitespace-nowrap text-slate-500">
                      {s.unitsSold} sold · {s.currentStock} in stock
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

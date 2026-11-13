import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, Info, TrendingUp } from 'lucide-react';
import type { ProductForecast } from '../types/index.ts';
import { apiFetch } from '../services/api.ts';
import { cacheForecasting, getCachedForecasting } from '../services/offlineDb.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { formatShortDate } from '../utils/format.ts';

export const ForecastingPage: React.FC = () => {
  const { business } = useAuth();
  const { isOnline } = useOnlineStatus();

  const [forecasts, setForecasts] = useState<ProductForecast[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadForecasts = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      if (isOnline) {
        const res = await apiFetch<{
          forecasts: ProductForecast[];
          recommendations: never[];
        }>('/api/forecasting');
        setForecasts(res.forecasts);
        if (res.forecasts.length > 0) {
          setSelectedId((prev) => prev ?? res.forecasts[0].productId);
        }
        await cacheForecasting(business.id, res);
      } else {
        const cached = await getCachedForecasting(business.id);
        if (cached) {
          setForecasts(cached.forecasts);
          if (cached.forecasts.length > 0) {
            setSelectedId((prev) => prev ?? cached.forecasts[0].productId);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [business, isOnline]);

  useEffect(() => {
    loadForecasts();
  }, [loadForecasts]);

  const selected = useMemo(
    () => forecasts.find((f) => f.productId === selectedId) ?? forecasts[0] ?? null,
    [forecasts, selectedId]
  );

  const chartData = useMemo(() => {
    if (!selected) return [];
    return selected.series.map((pt) => ({
      date: formatShortDate(pt.date),
      rawDate: pt.date,
      actual: pt.actual,
      predicted: pt.predicted,
      band:
        pt.lower !== null && pt.upper !== null
          ? [pt.lower, pt.upper]
          : undefined,
    }));
  }, [selected]);

  if (loading && forecasts.length === 0) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-lg border border-slate-200 bg-white animate-pulse" />
        <div className="h-80 rounded-lg border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Statistical Demand Forecasting Engine
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Computed from historical transactions with zero-sales day handling, exponential smoothing, weekly seasonality, and MAE validation.
          </p>
        </div>

        {forecasts.length > 0 && (
          <div className="sm:w-72">
            <label htmlFor="forecast-product-select" className="sr-only">
              Select product to inspect forecast
            </label>
            <select
              id="forecast-product-select"
              value={selected?.productId ?? ''}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-teal-600 focus:outline-none"
            >
              {forecasts.map((f) => (
                <option key={f.productId} value={f.productId}>
                  {f.productName} ({f.sku})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!selected ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Add products and record sales to generate statistical demand forecasts.
        </div>
      ) : (
        <>
          {/* Selected Product Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">Avg Daily Demand</p>
              <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {selected.averageDailyDemand.toFixed(2)}{' '}
                <span className="text-sm font-normal text-slate-500">{selected.unit}/day</span>
              </p>
              <p className="mt-1.5 text-xs text-slate-500">
                {selected.nonZeroDays} active sale days / {selected.historyDays}d window
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">7-Day Demand Forecast</p>
              <p className="mt-2 font-mono text-2xl font-bold text-teal-800 tabular-nums">
                {selected.forecast7d}{' '}
                <span className="text-sm font-normal text-slate-500">{selected.unit}</span>
              </p>
              <p className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
                Range: {selected.forecast7dLower} – {selected.forecast7dUpper} {selected.unit}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">30-Day Demand Forecast</p>
              <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {selected.forecast30d}{' '}
                <span className="text-sm font-normal text-slate-500">{selected.unit}</span>
              </p>
              <p className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
                Range: {selected.forecast30dLower} – {selected.forecast30dUpper} {selected.unit}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">Backtest Accuracy (MAE)</p>
              <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {selected.mae !== null ? `${selected.mae}` : 'N/A'}{' '}
                {selected.mae !== null && (
                  <span className="text-sm font-normal text-slate-500">{selected.unit}/day</span>
                )}
              </p>
              <p className="mt-1.5 text-xs text-slate-500">
                Confidence: <strong className="text-slate-800">{selected.confidenceLabel}</strong>
                {selected.wape !== null ? ` · WAPE ${selected.wape}%` : ''}
              </p>
            </div>
          </div>

          {/* Insufficient Data Notice or Method Explanation */}
          <div
            className={`rounded-lg border p-4 flex items-start gap-3 ${
              selected.insufficientData
                ? 'border-amber-300 bg-amber-50/70'
                : 'border-slate-200 bg-white'
            }`}
          >
            {selected.insufficientData ? (
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            )}
            <div className="text-xs space-y-1">
              <p className="font-semibold text-slate-900">
                Method: {selected.method}
              </p>
              <p className="text-slate-600 leading-relaxed">{selected.explanation}</p>
            </div>
          </div>

          {/* Forecast vs Actual Chart */}
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Historical Actuals, Backtest Fit & 14-Day Horizon
                </h3>
                <p className="text-xs text-slate-500">
                  Solid teal line shows actual daily sales; dashed blue shows statistical forecast & 80% uncertainty band
                </p>
              </div>
              {selected.peakDays.length > 0 && (
                <span className="text-xs font-medium text-teal-800">
                  Peak market days: {selected.peakDays.join(', ')}
                </span>
              )}
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} width={40} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="band"
                    name="80% Uncertainty Interval"
                    stroke="none"
                    fill="#BAE6FD"
                    fillOpacity={0.45}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual Sales"
                    stroke="#0F766E"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    name="Forecast / Backtest"
                    stroke="#0284C7"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* All Products Forecast Comparison Table */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3.5 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-700" />
              <h3 className="font-display text-sm font-semibold text-slate-900">
                All Products Demand Forecast Summary
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2.5 pl-4 pr-3 font-medium">Product</th>
                    <th className="py-2.5 px-2 font-medium text-right">Stock</th>
                    <th className="py-2.5 px-2 font-medium text-right">Avg / Day</th>
                    <th className="py-2.5 px-2 font-medium text-right">7-Day</th>
                    <th className="py-2.5 px-2 font-medium text-right">30-Day</th>
                    <th className="py-2.5 px-2 font-medium text-right">MAE</th>
                    <th className="py-2.5 pl-2 pr-4 font-medium">Model & Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {forecasts.map((f) => (
                    <tr
                      key={f.productId}
                      onClick={() => setSelectedId(f.productId)}
                      className={`cursor-pointer hover:bg-slate-50 ${
                        selected.productId === f.productId ? 'bg-teal-50/40' : ''
                      }`}
                    >
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="font-medium text-slate-900">{f.productName}</div>
                        <div className="text-slate-500 font-mono">{f.sku}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                        {f.currentStock} {f.unit}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                        {f.averageDailyDemand.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-teal-800">
                        {f.forecast7d}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums font-medium text-slate-900">
                        {f.forecast30d}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600">
                        {f.mae !== null ? f.mae : '—'}
                      </td>
                      <td className="py-2.5 pl-2 pr-4">
                        <div className="text-slate-800">
                          {f.confidenceLabel} Confidence
                          {f.insufficientData && (
                            <span className="ml-1.5 text-amber-700 font-medium">
                              (Insufficient History)
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500 truncate max-w-xs">{f.method}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

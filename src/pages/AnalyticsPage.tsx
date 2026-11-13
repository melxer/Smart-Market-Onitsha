import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download } from 'lucide-react';
import type { DashboardSummary, Product, RestockingRecommendation, Sale } from '../types/index.ts';
import { apiFetch } from '../services/api.ts';
import { useToast } from '../context/ToastContext.tsx';
import { downloadCSV, formatNaira, formatNairaCompact, formatShortDate } from '../utils/format.ts';

export const AnalyticsPage: React.FC = () => {
  const { addToast } = useToast();

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [recommendations, setRecommendations] = useState<RestockingRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (fromDate) qs.set('fromDate', fromDate);
      if (toDate) qs.set('toDate', toDate);
      const qStr = qs.toString() ? `?${qs.toString()}` : '';

      const [dash, prodRes, salesRes, fcRes] = await Promise.all([
        apiFetch<DashboardSummary>(`/api/dashboard${qStr}`),
        apiFetch<{ products: Product[] }>('/api/products?includeArchived=false'),
        apiFetch<{ sales: Sale[] }>(`/api/sales${qStr}`),
        apiFetch<{ recommendations: RestockingRecommendation[] }>('/api/forecasting'),
      ]);
      setSummary(dash);
      setProducts(prodRes.products);
      setSales(salesRes.sales);
      setRecommendations(fcRes.recommendations);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Unable to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, addToast]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const applyPreset = (days: number | null) => {
    if (days === null) {
      setFromDate('');
      setToDate('');
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - days);
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(end.toISOString().slice(0, 10));
  };

  const exportSalesCSV = () => {
    downloadCSV(
      `smart-market-sales-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Receipt', 'Date', 'Customer', 'Order Type', 'Payment', 'Revenue (NGN)', 'Cost (NGN)', 'Gross Profit (NGN)', 'Status'],
      sales.map((s) => [
        s.receiptNumber,
        s.createdAt,
        s.customerName,
        s.saleType,
        s.paymentMethod,
        s.totalRevenue,
        s.totalCost,
        s.grossProfit,
        s.status,
      ])
    );
    addToast('success', 'Exported Sales CSV.');
  };

  const exportInventoryCSV = () => {
    downloadCSV(
      `smart-market-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
      ['SKU', 'Product', 'Category', 'Unit', 'Stock', 'Purchase Cost (NGN)', 'Selling Price (NGN)', 'Cost Valuation (NGN)', 'Retail Valuation (NGN)'],
      products.map((p) => [
        p.sku,
        p.name,
        p.categoryName,
        p.unit,
        p.currentStock,
        p.purchasePrice,
        p.sellingPrice,
        p.currentStock * p.purchasePrice,
        p.currentStock * p.sellingPrice,
      ])
    );
    addToast('success', 'Exported Inventory Valuation CSV.');
  };

  const exportRestockCSV = () => {
    downloadCSV(
      `smart-market-restocking-plan-${new Date().toISOString().slice(0, 10)}.csv`,
      ['SKU', 'Product', 'Supplier', 'Current Stock', 'Avg Daily Demand', 'Lead Time (d)', 'Safety Stock', 'Reorder Point', 'Status', 'Suggested Order Qty', 'Estimated Cost (NGN)'],
      recommendations.map((r) => [
        r.sku,
        r.productName,
        r.supplierName,
        r.currentStock,
        r.averageDailyDemand,
        r.leadTimeDays,
        r.safetyStock,
        r.reorderPoint,
        r.status,
        r.recommendedOrderQty,
        r.estimatedOrderCost,
      ])
    );
    addToast('success', 'Exported Restocking Plan CSV.');
  };

  const trendData =
    !summary
      ? []
      : cadence === 'daily'
      ? summary.dailyTrend.map((d) => ({
          label: formatShortDate(d.date),
          revenue: d.revenue,
          profit: d.profit,
        }))
      : cadence === 'weekly'
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

  const categoryValuation = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      map.set(p.categoryName, (map.get(p.categoryName) ?? 0) + p.currentStock * p.purchasePrice);
    }
    return Array.from(map.entries()).map(([category, value]) => ({ category, value }));
  }, [products]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Analytics, Valuation & CSV Reports
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Filter performance across daily, weekly, and monthly horizons or download accountant-ready CSV spreadsheets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportSalesCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Sales CSV</span>
          </button>
          <button
            type="button"
            onClick={exportInventoryCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Valuation CSV</span>
          </button>
          <button
            type="button"
            onClick={exportRestockCSV}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-medium text-white hover:bg-teal-800"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Restocking CSV</span>
          </button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => applyPreset(7)}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => applyPreset(30)}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={() => applyPreset(null)}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            All Time
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label htmlFor="ana-from" className="text-slate-500">From</label>
          <input
            id="ana-from"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs"
          />
          <label htmlFor="ana-to" className="text-slate-500">To</label>
          <input
            id="ana-to"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs"
          />
        </div>
      </div>

      {loading && !summary ? (
        <div className="h-72 rounded-lg border border-slate-200 bg-white animate-pulse" />
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Revenue vs Gross Profit
                </h3>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                  {(['daily', 'weekly', 'monthly'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCadence(c)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                        cadence === c ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis
                      tickFormatter={(v) => formatNairaCompact(Number(v))}
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      width={60}
                    />
                    <Tooltip
                      formatter={(value) => formatNaira(Number(value ?? 0))}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                    />
                    <Line isAnimationActive={false} type="monotone" dataKey="revenue" name="Revenue" stroke="#0F766E" strokeWidth={2} dot={false} />
                    <Line isAnimationActive={false} type="monotone" dataKey="profit" name="Gross Profit" stroke="#0284C7" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-display text-base font-semibold text-slate-900 mb-1">
                Inventory Valuation by Category
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Capital currently held in stock (cost basis)
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={categoryValuation}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => formatNairaCompact(Number(v))}
                      tick={{ fontSize: 11, fill: '#64748B' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="category"
                      width={136}
                      tick={{ fontSize: 11, fill: '#334155' }}
                    />
                    <Tooltip
                      formatter={(value) => formatNaira(Number(value ?? 0))}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                    />
                    <Bar isAnimationActive={false} dataKey="value" name="Cost Valuation" fill="#0F766E" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-display text-sm font-semibold text-slate-900 mb-3">
                Best-Selling Products
              </h3>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 font-medium">Product</th>
                    <th className="py-2 font-medium text-right">Units Sold</th>
                    <th className="py-2 font-medium text-right">Revenue</th>
                    <th className="py-2 font-medium text-right">Gross Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.topSellingProducts.map((p) => (
                    <tr key={p.productId}>
                      <td className="py-2.5 font-medium text-slate-900">{p.productName}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">{p.unitsSold}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">{formatNaira(p.revenue)}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-teal-700">{formatNaira(p.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="font-display text-sm font-semibold text-slate-900 mb-3">
                Slow-Moving Stock
              </h3>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 font-medium">Product</th>
                    <th className="py-2 font-medium text-right">Units Sold</th>
                    <th className="py-2 font-medium text-right">On Hand</th>
                    <th className="py-2 font-medium text-right">Tied Capital</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.slowMovingProducts.map((p) => (
                    <tr key={p.productId}>
                      <td className="py-2.5 font-medium text-slate-900">{p.productName}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">{p.unitsSold}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">{p.currentStock}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-slate-700">
                        {formatNaira(p.stockValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PackageCheck, Sliders, ShoppingBag, X } from 'lucide-react';
import type { RestockingRecommendation, RestockStatus } from '../types/index.ts';
import { apiFetch } from '../services/api.ts';
import { cacheForecasting, getCachedForecasting } from '../services/offlineDb.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { formatNaira } from '../utils/format.ts';

export const RestockingPage: React.FC = () => {
  const { business } = useAuth();
  const { addToast } = useToast();
  const { isOnline } = useOnlineStatus();

  const [recommendations, setRecommendations] = useState<RestockingRecommendation[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | RestockStatus>('all');
  const [loading, setLoading] = useState(true);

  // Edit Lead Time & Safety Stock Modal
  const [configTarget, setConfigTarget] = useState<RestockingRecommendation | null>(null);
  const [leadTimeDays, setLeadTimeDays] = useState('3');
  const [safetyStock, setSafetyStock] = useState('5');

  // Create Purchase Order from Recommendation Modal
  const [orderTarget, setOrderTarget] = useState<RestockingRecommendation | null>(null);
  const [orderQty, setOrderQty] = useState('10');
  const [orderCost, setOrderCost] = useState('0');

  const loadRecommendations = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      if (isOnline) {
        const res = await apiFetch<{
          forecasts: never[];
          recommendations: RestockingRecommendation[];
        }>('/api/forecasting');
        setRecommendations(res.recommendations);
        await cacheForecasting(business.id, res);
      } else {
        const cached = await getCachedForecasting(business.id);
        if (cached) setRecommendations(cached.recommendations);
      }
    } finally {
      setLoading(false);
    }
  }, [business, isOnline]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return recommendations;
    return recommendations.filter((r) => r.status === statusFilter);
  }, [recommendations, statusFilter]);

  const totalSuggestedBudget = useMemo(
    () => recommendations.reduce((sum, r) => sum + r.estimatedOrderCost, 0),
    [recommendations]
  );

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configTarget) return;
    try {
      await apiFetch(`/api/products/${configTarget.productId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          leadTimeDays: Number(leadTimeDays),
          safetyStock: Number(safetyStock),
        }),
      });
      addToast('success', `Updated lead time & safety stock for ${configTarget.productName}.`);
      setConfigTarget(null);
      await loadRecommendations();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update settings.');
    }
  };

  const handleConfirmPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderTarget) return;
    try {
      await apiFetch('/api/purchases', {
        method: 'POST',
        body: JSON.stringify({
          notes: `Restock from intelligence recommendation (${orderTarget.status})`,
          items: [
            {
              productId: orderTarget.productId,
              quantity: Number(orderQty),
              unitCost: Number(orderCost),
            },
          ],
        }),
      });
      addToast(
        'success',
        `Restocked +${orderQty} ${orderTarget.unit} of ${orderTarget.productName}.`
      );
      setOrderTarget(null);
      await loadRecommendations();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Purchase failed.');
    }
  };

  const statusColor = (status: RestockStatus) => {
    switch (status) {
      case 'Restock immediately':
        return 'text-red-700 font-semibold';
      case 'Restock soon':
        return 'text-amber-700 font-semibold';
      case 'Potential overstock':
        return 'text-sky-700 font-medium';
      case 'Product is moving slowly':
        return 'text-slate-600 font-medium';
      default:
        return 'text-teal-700 font-medium';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Restocking Intelligence & Reorder Planner
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Formula: <span className="font-mono text-slate-700">Reorder Point = Average Daily Demand × Supplier Lead Time + Safety Stock</span>
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-right">
          <div className="text-xs text-slate-500">Estimated Urgent Restock Budget</div>
          <div className="font-mono text-base font-bold text-slate-900 tabular-nums">
            {formatNaira(totalSuggestedBudget)}
          </div>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 overflow-x-auto">
        {(
          [
            'all',
            'Restock immediately',
            'Restock soon',
            'Stock level is healthy',
            'Product is moving slowly',
            'Potential overstock',
          ] as const
        ).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              statusFilter === s
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {s === 'all' ? 'All Products' : s}
          </button>
        ))}
      </div>

      {/* Recommendations Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Computing reorder points...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <PackageCheck className="w-7 h-7 text-slate-300 mx-auto mb-2" />
            No products match the selected restocking filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filtered.map((rec) => (
              <div
                key={rec.productId}
                className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{rec.productName}</h3>
                    <span className="text-xs text-slate-400">·</span>
                    <span className={`text-xs ${statusColor(rec.status)}`}>{rec.status}</span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">{rec.supplierName}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{rec.reason}</p>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-mono tabular-nums pt-1">
                    <span>Stock: <strong className="text-slate-800">{rec.currentStock} {rec.unit}</strong></span>
                    <span>Reorder Pt: <strong className="text-slate-800">{rec.reorderPoint}</strong></span>
                    <span>Demand: <strong className="text-slate-800">{rec.averageDailyDemand.toFixed(2)}/day</strong></span>
                    <span>Lead: <strong className="text-slate-800">{rec.leadTimeDays}d</strong></span>
                    <span>Safety: <strong className="text-slate-800">{rec.safetyStock}</strong></span>
                    <span>Cover: <strong className="text-slate-800">{rec.daysOfCover >= 999 ? '90+' : rec.daysOfCover}d</strong></span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {rec.recommendedOrderQty > 0 && (
                    <div className="text-right pr-2">
                      <div className="font-mono text-sm font-bold text-teal-800 tabular-nums">
                        Order +{rec.recommendedOrderQty} {rec.unit}
                      </div>
                      <div className="font-mono text-xs text-slate-500 tabular-nums">
                        Est. {formatNaira(rec.estimatedOrderCost)}
                      </div>
                    </div>
                  )}

                  {isOnline && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setConfigTarget(rec);
                          setLeadTimeDays(String(rec.leadTimeDays));
                          setSafetyStock(String(rec.safetyStock));
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Lead & Safety</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOrderTarget(rec);
                          setOrderQty(String(Math.max(1, rec.recommendedOrderQty || 10)));
                          setOrderCost(String(rec.unitPurchasePrice));
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 whitespace-nowrap"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Record Restock</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lead Time & Safety Stock Modal */}
      {configTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Configure Reorder Inputs · {configTarget.productName}
              </h3>
              <button
                type="button"
                aria-label="Close configuration dialog"
                onClick={() => setConfigTarget(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveConfig} className="mt-4 space-y-4">
              <div>
                <label htmlFor="cfg-lead" className="block text-xs font-medium text-slate-700 mb-1">
                  Supplier Lead Time (Days)
                </label>
                <input
                  id="cfg-lead"
                  type="number"
                  min="1"
                  required
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label htmlFor="cfg-safety" className="block text-xs font-medium text-slate-700 mb-1">
                  Safety Stock Buffer ({configTarget.unit})
                </label>
                <input
                  id="cfg-safety"
                  type="number"
                  min="0"
                  required
                  value={safetyStock}
                  onChange={(e) => setSafetyStock(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfigTarget(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                >
                  Recalculate Reorder Point
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Restock Order Modal */}
      {orderTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Receive Restock Purchase · {orderTarget.productName}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Recommended order quantity: {orderTarget.recommendedOrderQty} {orderTarget.unit}
            </p>
            <form onSubmit={handleConfirmPurchase} className="mt-4 space-y-4">
              <div>
                <label htmlFor="ord-qty" className="block text-xs font-medium text-slate-700 mb-1">
                  Order Quantity ({orderTarget.unit})
                </label>
                <input
                  id="ord-qty"
                  type="number"
                  min="1"
                  required
                  value={orderQty}
                  onChange={(e) => setOrderQty(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label htmlFor="ord-cost" className="block text-xs font-medium text-slate-700 mb-1">
                  Unit Purchase Cost (₦)
                </label>
                <input
                  id="ord-cost"
                  type="number"
                  min="0"
                  required
                  value={orderCost}
                  onChange={(e) => setOrderCost(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOrderTarget(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                >
                  Receive Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

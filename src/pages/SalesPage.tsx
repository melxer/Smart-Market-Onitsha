import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Receipt, RotateCcw, Search, Trash2, WifiOff } from 'lucide-react';
import type { OfflinePendingSale, PaymentMethod, Product, Sale } from '../types/index.ts';
import { apiFetch } from '../services/api.ts';
import {
  cacheProducts,
  cacheSales,
  enqueueOfflineSale,
  getCachedProducts,
  getCachedSales,
  listPendingOfflineSales,
} from '../services/offlineDb.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { formatDateTime, formatNaira } from '../utils/format.ts';
import { ReceiptModal } from '../components/ReceiptModal.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';

interface CartLine {
  product: Product;
  quantity: number;
  unitSellingPrice: number;
}

export const SalesPage: React.FC = () => {
  const { business, refreshPendingCount, syncOfflineQueue } = useAuth();
  const { addToast } = useToast();
  const { isOnline } = useOnlineStatus();

  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [pendingSales, setPendingSales] = useState<OfflinePendingSale[]>([]);
  const [loading, setLoading] = useState(true);

  const [productQuery, setProductQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [saleType, setSaleType] = useState<'retail' | 'wholesale'>('retail');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [returnTarget, setReturnTarget] = useState<Sale | null>(null);

  const loadData = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      const pending = await listPendingOfflineSales(business.id);
      setPendingSales(pending);

      if (isOnline) {
        const [prodRes, salesRes] = await Promise.all([
          apiFetch<{ products: Product[] }>('/api/products?includeArchived=false'),
          apiFetch<{ sales: Sale[] }>('/api/sales'),
        ]);
        setProducts(prodRes.products);
        setSales(salesRes.sales);
        await Promise.all([
          cacheProducts(business.id, prodRes.products),
          cacheSales(business.id, salesRes.sales),
        ]);
      } else {
        const [cachedProds, cachedSales] = await Promise.all([
          getCachedProducts(business.id),
          getCachedSales(business.id),
        ]);
        setProducts(cachedProds.filter((p) => !p.isArchived));
        setSales(cachedSales);
      }
    } catch (err) {
      const cachedProds = await getCachedProducts(business.id);
      const cachedSales = await getCachedSales(business.id);
      setProducts(cachedProds.filter((p) => !p.isArchived));
      setSales(cachedSales);
      if (cachedProds.length === 0) {
        addToast('error', err instanceof Error ? err.message : 'Unable to load sales data.');
      }
    } finally {
      setLoading(false);
    }
  }, [business, isOnline, addToast]);

  useEffect(() => {
    loadData();
    const onSynced = () => loadData();
    window.addEventListener('smart-market-data-synced', onSynced);
    return () => window.removeEventListener('smart-market-data-synced', onSynced);
  }, [loadData]);

  // Adjust visible available stock by subtracting pending offline quantities
  const pendingQtyByProduct = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of pendingSales) {
      for (const it of s.items) {
        map.set(it.productId, (map.get(it.productId) ?? 0) + it.quantity);
      }
    }
    return map;
  }, [pendingSales]);

  const availableProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return products
      .filter((p) => !p.isArchived)
      .filter((p) =>
        q ? p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) : true
      );
  }, [products, productQuery]);

  const addToCart = (product: Product) => {
    const effectiveStock = Math.max(
      0,
      product.currentStock - (pendingQtyByProduct.get(product.id) ?? 0)
    );
    if (effectiveStock <= 0) {
      addToast('error', `"${product.name}" is out of stock.`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        if (existing.quantity + 1 > effectiveStock) {
          addToast('error', `Only ${effectiveStock} ${product.unit} available.`);
          return prev;
        }
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        { product, quantity: 1, unitSellingPrice: product.sellingPrice },
      ];
    });
  };

  const updateCartQty = (productId: number, nextQty: number) => {
    const line = cart.find((l) => l.product.id === productId);
    if (!line) return;
    const effectiveStock = Math.max(
      0,
      line.product.currentStock - (pendingQtyByProduct.get(productId) ?? 0)
    );
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((l) => l.product.id !== productId));
      return;
    }
    if (nextQty > effectiveStock) {
      addToast('error', `Maximum available stock is ${effectiveStock} ${line.product.unit}.`);
      return;
    }
    setCart((prev) =>
      prev.map((l) => (l.product.id === productId ? { ...l, quantity: nextQty } : l))
    );
  };

  const updateCartPrice = (productId: number, nextPrice: number) => {
    if (nextPrice < 0) return;
    setCart((prev) =>
      prev.map((l) =>
        l.product.id === productId ? { ...l, unitSellingPrice: nextPrice } : l
      )
    );
  };

  const cartTotals = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    for (const l of cart) {
      revenue += l.unitSellingPrice * l.quantity;
      cost += l.product.purchasePrice * l.quantity;
    }
    return { revenue, cost, profit: revenue - cost };
  }, [cart]);

  const handleCompleteSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;
    if (cart.length === 0) {
      addToast('error', 'Select at least one product to record a sale.');
      return;
    }

    const clientTxId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setSubmitting(true);
    const payload = {
      clientTxId,
      customerName: customerName.trim() || 'Walk-in Customer',
      paymentMethod,
      saleType,
      notes,
      createdAt: new Date().toISOString(),
      items: cart.map((l) => ({
        productId: l.product.id,
        quantity: l.quantity,
        unitSellingPrice: l.unitSellingPrice,
      })),
    };

    try {
      if (isOnline) {
        const res = await apiFetch<{ sale: Sale }>('/api/sales', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        addToast(
          'success',
          `Sale ${res.sale.receiptNumber} recorded (${formatNaira(res.sale.totalRevenue)}).`
        );
        setCart([]);
        setNotes('');
        setReceiptSale(res.sale);
        await loadData();
      } else {
        const offlineRecord: OfflinePendingSale = {
          clientTxId,
          businessId: business.id,
          customerName: payload.customerName,
          paymentMethod,
          saleType,
          notes,
          createdAt: payload.createdAt,
          items: cart.map((l) => ({
            productId: l.product.id,
            productName: l.product.name,
            sku: l.product.sku,
            unit: l.product.unit,
            quantity: l.quantity,
            unitSellingPrice: l.unitSellingPrice,
            unitCostPrice: l.product.purchasePrice,
          })),
          totalRevenue: cartTotals.revenue,
          syncStatus: 'pending',
        };
        await enqueueOfflineSale(offlineRecord);
        await refreshPendingCount();
        setCart([]);
        setNotes('');
        addToast(
          'info',
          `Saved sale offline (${formatNaira(offlineRecord.totalRevenue)}). It will sync automatically when connected.`
        );
        await loadData();
      }
    } catch (err) {
      // If network unexpectedly dropped mid-request, preserve into IndexedDB
      if (!navigator.onLine) {
        const offlineRecord: OfflinePendingSale = {
          clientTxId,
          businessId: business.id,
          customerName: payload.customerName,
          paymentMethod,
          saleType,
          notes,
          createdAt: payload.createdAt,
          items: cart.map((l) => ({
            productId: l.product.id,
            productName: l.product.name,
            sku: l.product.sku,
            unit: l.product.unit,
            quantity: l.quantity,
            unitSellingPrice: l.unitSellingPrice,
            unitCostPrice: l.product.purchasePrice,
          })),
          totalRevenue: cartTotals.revenue,
          syncStatus: 'pending',
        };
        await enqueueOfflineSale(offlineRecord);
        await refreshPendingCount();
        setCart([]);
        addToast('info', 'Network lost — transaction safely queued offline in IndexedDB.');
        await loadData();
      } else {
        addToast('error', err instanceof Error ? err.message : 'Failed to record sale.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleProcessReturn = async () => {
    if (!returnTarget) return;
    try {
      await apiFetch(`/api/sales/${returnTarget.id}/return`, {
        method: 'POST',
        body: JSON.stringify({ status: 'returned' }),
      });
      addToast(
        'success',
        `Returned ${returnTarget.receiptNumber} and restored stock quantities.`
      );
      setReturnTarget(null);
      await loadData();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Return processing failed.');
    }
  };

  return (
    <div className="space-y-6">
      {/* POS & Checkout Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Product Picker */}
        <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Select Products for Sale
              </h2>
              <p className="text-xs text-slate-500">
                Click any product to add to the transaction cart
              </p>
            </div>
            <div className="relative sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Search products to sell"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Search product or SKU..."
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-sm focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading catalog...</div>
          ) : availableProducts.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No active products match your search.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
              {availableProducts.map((p) => {
                const effectiveStock = Math.max(
                  0,
                  p.currentStock - (pendingQtyByProduct.get(p.id) ?? 0)
                );
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={effectiveStock <= 0}
                    onClick={() => addToCart(p)}
                    className="text-left rounded-lg border border-slate-200 p-3.5 hover:border-teal-600 hover:bg-teal-50/30 disabled:opacity-50 disabled:hover:border-slate-200 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900 line-clamp-1">
                        {p.name}
                      </span>
                      <span className="font-mono text-sm font-semibold text-teal-800 tabular-nums whitespace-nowrap">
                        {formatNaira(p.sellingPrice)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {p.sku} · {p.unit}
                      </span>
                      <span
                        className={`font-mono tabular-nums ${
                          effectiveStock === 0
                            ? 'text-red-600 font-medium'
                            : effectiveStock <= p.minStockLevel
                            ? 'text-amber-700 font-medium'
                            : 'text-slate-600'
                        }`}
                      >
                        {effectiveStock} left
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart & Payment Checkout */}
        <form
          onSubmit={handleCompleteSale}
          className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Current Transaction
              </h2>
              {!isOnline && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                  <WifiOff className="w-3.5 h-3.5" />
                  Offline Queue Active
                </span>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                Cart is empty. Select products on the left to build a sale.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto my-2">
                {cart.map((line) => (
                  <div key={line.product.id} className="py-2.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{line.product.name}</p>
                        <p className="text-xs text-slate-500 font-mono">
                          Cost {formatNaira(line.product.purchasePrice)} / {line.product.unit}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${line.product.name}`}
                        onClick={() => updateCartQty(line.product.id, 0)}
                        className="text-slate-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center border border-slate-200 rounded-md">
                        <button
                          type="button"
                          aria-label={`Decrease quantity for ${line.product.name}`}
                          onClick={() => updateCartQty(line.product.id, line.quantity - 1)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          aria-label={`Quantity for ${line.product.name}`}
                          min="1"
                          value={line.quantity}
                          onChange={(e) =>
                            updateCartQty(line.product.id, Number(e.target.value))
                          }
                          className="w-12 text-center text-xs font-mono tabular-nums focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label={`Increase quantity for ${line.product.name}`}
                          onClick={() => updateCartQty(line.product.id, line.quantity + 1)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400">₦</span>
                        <input
                          type="number"
                          aria-label={`Unit price for ${line.product.name}`}
                          min="0"
                          value={line.unitSellingPrice}
                          onChange={(e) =>
                            updateCartPrice(line.product.id, Number(e.target.value))
                          }
                          className="w-24 rounded border border-slate-200 px-2 py-1 text-right text-xs font-mono tabular-nums"
                        />
                      </div>

                      <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums w-20 text-right">
                        {formatNaira(line.unitSellingPrice * line.quantity)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sale-customer" className="block text-xs font-medium text-slate-700 mb-1">
                    Customer Name
                  </label>
                  <input
                    id="sale-customer"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="sale-type" className="block text-xs font-medium text-slate-700 mb-1">
                    Order Type
                  </label>
                  <select
                    id="sale-type"
                    value={saleType}
                    onChange={(e) => setSaleType(e.target.value as 'retail' | 'wholesale')}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                  >
                    <option value="retail">Retail</option>
                    <option value="wholesale">Wholesale</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sale-payment" className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    id="sale-payment"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="pos">POS Terminal</option>
                    <option value="credit">Credit / Pay Later</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="sale-note" className="block text-xs font-medium text-slate-700 mb-1">
                    Note (Optional)
                  </label>
                  <input
                    id="sale-note"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Plaza delivery"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Estimated Gross Profit</span>
              <span className="font-mono font-semibold text-teal-700 tabular-nums">
                {formatNaira(cartTotals.profit)}
              </span>
            </div>
            <div className="flex items-center justify-between text-base font-bold text-slate-900">
              <span>Total Amount</span>
              <span className="font-mono tabular-nums">{formatNaira(cartTotals.revenue)}</span>
            </div>
            <button
              type="submit"
              disabled={submitting || cart.length === 0}
              className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {submitting
                ? 'Saving...'
                : isOnline
                ? 'Complete Sale & Deduct Stock'
                : 'Save Sale Offline (Queue)'}
            </button>
          </div>
        </form>
      </div>

      {/* Pending Offline Sales Banner/List */}
      {pendingSales.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Pending Offline Transactions ({pendingSales.length})
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Stored safely in IndexedDB. They will automatically synchronize when internet returns.
              </p>
            </div>
            <button
              type="button"
              disabled={!isOnline}
              onClick={() => syncOfflineQueue()}
              className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Sync Now
            </button>
          </div>
          <div className="mt-3 divide-y divide-amber-200/70">
            {pendingSales.map((ps) => (
              <div key={ps.clientTxId} className="py-2 flex items-center justify-between text-xs">
                <div>
                  <span className="font-medium text-slate-900">{ps.customerName}</span>
                  <span className="text-slate-600 ml-2">
                    · {ps.items.length} item(s) · {formatDateTime(ps.createdAt)}
                  </span>
                  {ps.lastError && (
                    <span className="ml-2 text-red-700 font-medium">Error: {ps.lastError}</span>
                  )}
                </div>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatNaira(ps.totalRevenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales History Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Transaction History
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">{sales.length} receipts</span>
        </div>

        {sales.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No sales recorded yet. Use the Point of Sale panel above to record your first sale.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 pl-4 pr-3 font-medium">Receipt</th>
                  <th className="py-2.5 px-2 font-medium">Date</th>
                  <th className="py-2.5 px-2 font-medium">Customer & Payment</th>
                  <th className="py-2.5 px-2 font-medium text-right">Revenue</th>
                  <th className="py-2.5 px-2 font-medium text-right">Gross Profit</th>
                  <th className="py-2.5 px-2 font-medium">Status</th>
                  <th className="py-2.5 pl-2 pr-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.slice(0, 40).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pl-4 pr-3 font-mono font-medium text-slate-900">
                      {s.receiptNumber}
                      {s.isDemoSynthetic && (
                        <span className="font-sans text-slate-400">
                          {' '}· Demo
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                      {formatDateTime(s.createdAt)}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="font-medium text-slate-900">{s.customerName}</span>
                      <span className="text-slate-500 capitalize">
                        {' '}
                        · {s.saleType} · {s.paymentMethod.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums font-medium text-slate-900">
                      {formatNaira(s.totalRevenue)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-teal-700">
                      {formatNaira(s.grossProfit)}
                    </td>
                    <td className="py-2.5 px-2 capitalize">
                      <span
                        className={
                          s.status === 'completed'
                            ? 'text-teal-700 font-medium'
                            : 'text-red-700 font-medium'
                        }
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-2.5 pl-2 pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setReceiptSale(s)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </button>
                        {s.status === 'completed' && isOnline && (
                          <button
                            type="button"
                            onClick={() => setReturnTarget(s)}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Return</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReceiptModal
        sale={receiptSale}
        business={business}
        onClose={() => setReceiptSale(null)}
      />

      <ConfirmDialog
        open={!!returnTarget}
        title={`Process Return for ${returnTarget?.receiptNumber ?? ''}?`}
        description="This will mark the sale as returned and atomically restore all sold item quantities back into inventory."
        confirmLabel="Confirm Return"
        destructive
        onConfirm={handleProcessReturn}
        onCancel={() => setReturnTarget(null)}
      />
    </div>
  );
};

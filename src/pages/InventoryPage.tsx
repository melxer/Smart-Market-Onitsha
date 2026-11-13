import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Edit3,
  History,
  PackagePlus,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { Category, Product, StockMovement, Supplier, UnitType } from '../types/index.ts';
import { apiFetch } from '../services/api.ts';
import { cacheProducts, getCachedProducts } from '../services/offlineDb.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { formatDateTime, formatNaira } from '../utils/format.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';

export const InventoryPage: React.FC = () => {
  const { business } = useAuth();
  const { addToast } = useToast();
  const { isOnline } = useOnlineStatus();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'low' | 'out' | 'archived'>('active');

  // Product Form Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formState, setFormState] = useState({
    sku: '',
    name: '',
    categoryName: 'Chargers & Adapters',
    supplierId: '',
    unit: 'piece' as UnitType,
    purchasePrice: '',
    sellingPrice: '',
    initialStock: '10',
    minStockLevel: '5',
    leadTimeDays: '3',
    safetyStock: '5',
  });

  // Restock Purchase Modal
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState('15');
  const [restockCost, setRestockCost] = useState('');
  const [restockNote, setRestockNote] = useState('');

  // Adjust Stock Modal
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('0');
  const [adjustNote, setAdjustNote] = useState('');

  // Stock Movement History Modal
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Confirm Archive / Delete
  const [confirmTarget, setConfirmTarget] = useState<Product | null>(null);

  const loadInventory = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      if (isOnline) {
        const [prodRes, catRes, supRes] = await Promise.all([
          apiFetch<{ products: Product[] }>('/api/products'),
          apiFetch<{ categories: Category[] }>('/api/categories'),
          apiFetch<{ suppliers: Supplier[] }>('/api/suppliers'),
        ]);
        setProducts(prodRes.products);
        setCategories(catRes.categories);
        setSuppliers(supRes.suppliers);
        await cacheProducts(business.id, prodRes.products);
      } else {
        const cached = await getCachedProducts(business.id);
        setProducts(cached);
      }
    } catch (err) {
      const cached = await getCachedProducts(business.id);
      if (cached.length > 0) setProducts(cached);
      else addToast('error', err instanceof Error ? err.message : 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [business, isOnline, addToast]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (statusFilter === 'archived') {
        if (!p.isArchived) return false;
      } else {
        if (p.isArchived) return false;
        if (statusFilter === 'low' && !(p.currentStock > 0 && p.currentStock <= p.minStockLevel)) {
          return false;
        }
        if (statusFilter === 'out' && p.currentStock !== 0) {
          return false;
        }
      }

      if (categoryFilter !== 'all' && p.categoryName !== categoryFilter) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [products, statusFilter, categoryFilter, search]);

  const totalCostValuation = useMemo(
    () =>
      products
        .filter((p) => !p.isArchived)
        .reduce((sum, p) => sum + p.currentStock * p.purchasePrice, 0),
    [products]
  );

  const openAddModal = () => {
    setEditingProduct(null);
    setFormState({
      sku: `SM-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      name: '',
      categoryName: categories[0]?.name ?? 'Chargers & Adapters',
      supplierId: suppliers[0] ? String(suppliers[0].id) : '',
      unit: 'piece',
      purchasePrice: '',
      sellingPrice: '',
      initialStock: '10',
      minStockLevel: '5',
      leadTimeDays: '3',
      safetyStock: '5',
    });
    setFormOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormState({
      sku: p.sku,
      name: p.name,
      categoryName: p.categoryName,
      supplierId: p.supplierId ? String(p.supplierId) : '',
      unit: p.unit,
      purchasePrice: String(p.purchasePrice),
      sellingPrice: String(p.sellingPrice),
      initialStock: String(p.currentStock),
      minStockLevel: String(p.minStockLevel),
      leadTimeDays: String(p.leadTimeDays),
      safetyStock: String(p.safetyStock),
    });
    setFormOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      addToast('error', 'Connect to the internet to add or edit products.');
      return;
    }

    try {
      const payload = {
        sku: formState.sku,
        name: formState.name,
        categoryName: formState.categoryName,
        supplierId: formState.supplierId ? Number(formState.supplierId) : null,
        unit: formState.unit,
        purchasePrice: Number(formState.purchasePrice),
        sellingPrice: Number(formState.sellingPrice),
        initialStock: Number(formState.initialStock),
        minStockLevel: Number(formState.minStockLevel),
        leadTimeDays: Number(formState.leadTimeDays),
        safetyStock: Number(formState.safetyStock),
      };

      if (editingProduct) {
        await apiFetch(`/api/products/${editingProduct.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        addToast('success', `Updated "${formState.name}".`);
      } else {
        await apiFetch('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        addToast('success', `Added "${formState.name}" to inventory.`);
      }
      setFormOpen(false);
      await loadInventory();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save product.');
    }
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockProduct) return;
    try {
      await apiFetch('/api/purchases', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: restockProduct.supplierId,
          notes: restockNote || `Restock ${restockProduct.name}`,
          items: [
            {
              productId: restockProduct.id,
              quantity: Number(restockQty),
              unitCost: restockCost ? Number(restockCost) : restockProduct.purchasePrice,
            },
          ],
        }),
      });
      addToast('success', `Added ${restockQty} ${restockProduct.unit} to ${restockProduct.name}.`);
      setRestockProduct(null);
      await loadInventory();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to record purchase.');
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustProduct) return;
    try {
      await apiFetch(`/api/products/${adjustProduct.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          quantityChange: Number(adjustDelta),
          note: adjustNote,
        }),
      });
      addToast('success', `Adjusted stock for ${adjustProduct.name}.`);
      setAdjustProduct(null);
      await loadInventory();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Adjustment failed.');
    }
  };

  const openHistory = async (p: Product) => {
    setHistoryProduct(p);
    setLoadingHistory(true);
    try {
      const res = await apiFetch<{ movements: StockMovement[] }>(
        `/api/stock-movements?productId=${p.id}&limit=50`
      );
      setMovements(res.movements);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Unable to load movements.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleConfirmDeleteOrArchive = async () => {
    if (!confirmTarget) return;
    try {
      const res = await apiFetch<{ action: 'deleted' | 'archived' }>(
        `/api/products/${confirmTarget.id}`,
        { method: 'DELETE' }
      );
      addToast(
        'success',
        res.action === 'archived'
          ? `Archived "${confirmTarget.name}" (sales history preserved).`
          : `Deleted "${confirmTarget.name}".`
      );
      setConfirmTarget(null);
      await loadInventory();
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Action failed.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Inventory Catalog & Valuation
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {products.filter((p) => !p.isArchived).length} active SKUs · Total cost valuation{' '}
            <strong className="font-mono text-slate-800">{formatNaira(totalCostValuation)}</strong>
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Search products"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, SKU, or category..."
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-teal-600 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 overflow-x-auto">
          {(
            [
              { id: 'active', label: 'Active' },
              { id: 'low', label: 'Low Stock' },
              { id: 'out', label: 'Out of Stock' },
              { id: 'archived', label: 'Archived' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading inventory...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-900">No matching products found</p>
            <p className="text-xs text-slate-500 mt-1">
              Adjust your search filters or add a new product to your shop catalog.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800"
            >
              Add Product
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-3 pl-4 pr-3 font-medium">Product / SKU</th>
                  <th className="py-3 px-2 font-medium">Category</th>
                  <th className="py-3 px-2 font-medium text-right">Purchase Cost</th>
                  <th className="py-3 px-2 font-medium text-right">Selling Price</th>
                  <th className="py-3 px-2 font-medium text-right">Stock</th>
                  <th className="py-3 px-2 font-medium text-right">Valuation</th>
                  <th className="py-3 pl-2 pr-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  const isOut = p.currentStock === 0;
                  const isLow = p.currentStock > 0 && p.currentStock <= p.minStockLevel;
                  const marginPct =
                    p.sellingPrice > 0
                      ? Math.round(((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100)
                      : 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pl-4 pr-3">
                        <div className="font-medium text-slate-900 text-sm">{p.name}</div>
                        <div className="text-slate-500 font-mono mt-0.5">
                          {p.sku} · {p.unit} · Lead {p.leadTimeDays}d
                        </div>
                      </td>
                      <td className="py-3 px-2 text-slate-600">{p.categoryName}</td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-700">
                        {formatNaira(p.purchasePrice)}
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums">
                        <div className="font-medium text-slate-900">{formatNaira(p.sellingPrice)}</div>
                        <div className="text-teal-700">{marginPct}% margin</div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums">
                        <div
                          className={`font-semibold ${
                            isOut ? 'text-red-700' : isLow ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          {p.currentStock} {p.unit}
                        </div>
                        <div className="text-slate-400">Min {p.minStockLevel}</div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-700">
                        {formatNaira(p.currentStock * p.purchasePrice)}
                      </td>
                      <td className="py-3 pl-2 pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            title="Restock purchase"
                            aria-label={`Restock ${p.name}`}
                            onClick={() => {
                              setRestockProduct(p);
                              setRestockQty('15');
                              setRestockCost(String(p.purchasePrice));
                              setRestockNote('');
                            }}
                            className="rounded p-1.5 text-teal-700 hover:bg-teal-50"
                          >
                            <PackagePlus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="Adjust stock"
                            aria-label={`Adjust stock for ${p.name}`}
                            onClick={() => {
                              setAdjustProduct(p);
                              setAdjustDelta('0');
                              setAdjustNote('');
                            }}
                            className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                          >
                            <SlidersHorizontal className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="Stock movement history"
                            aria-label={`View history for ${p.name}`}
                            onClick={() => openHistory(p)}
                            className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="Edit product"
                            aria-label={`Edit ${p.name}`}
                            onClick={() => openEditModal(p)}
                            className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {!p.isArchived && (
                            <button
                              type="button"
                              title="Archive or delete product"
                              aria-label={`Archive ${p.name}`}
                              onClick={() => setConfirmTarget(p)}
                              className="rounded p-1.5 text-red-600 hover:bg-red-50"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-form-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 overflow-y-auto"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-lg my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 id="product-form-title" className="font-display text-base font-semibold text-slate-900">
                {editingProduct ? `Edit ${editingProduct.name}` : 'Add New Product'}
              </h3>
              <button
                type="button"
                aria-label="Close product form"
                onClick={() => setFormOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="prod-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Product Name
                  </label>
                  <input
                    id="prod-name"
                    type="text"
                    required
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    placeholder="e.g. Oraimo 20W Fast Charger"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="prod-sku" className="block text-xs font-medium text-slate-700 mb-1">
                    SKU Code
                  </label>
                  <input
                    id="prod-sku"
                    type="text"
                    required
                    value={formState.sku}
                    onChange={(e) => setFormState({ ...formState, sku: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="prod-cat" className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <input
                    id="prod-cat"
                    type="text"
                    required
                    list="category-options"
                    value={formState.categoryName}
                    onChange={(e) => setFormState({ ...formState, categoryName: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  />
                  <datalist id="category-options">
                    {categories.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label htmlFor="prod-unit" className="block text-xs font-medium text-slate-700 mb-1">
                    Selling Unit
                  </label>
                  <select
                    id="prod-unit"
                    value={formState.unit}
                    onChange={(e) => setFormState({ ...formState, unit: e.target.value as UnitType })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  >
                    <option value="piece">Piece</option>
                    <option value="pack">Pack</option>
                    <option value="dozen">Dozen</option>
                    <option value="carton">Carton</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="prod-sup" className="block text-xs font-medium text-slate-700 mb-1">
                    Supplier
                  </label>
                  <select
                    id="prod-sup"
                    value={formState.supplierId}
                    onChange={(e) => setFormState({ ...formState, supplierId: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
                  >
                    <option value="">Direct Purchase</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="prod-cost" className="block text-xs font-medium text-slate-700 mb-1">
                    Purchase Price (₦)
                  </label>
                  <input
                    id="prod-cost"
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={formState.purchasePrice}
                    onChange={(e) => setFormState({ ...formState, purchasePrice: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="prod-sell" className="block text-xs font-medium text-slate-700 mb-1">
                    Selling Price (₦)
                  </label>
                  <input
                    id="prod-sell"
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={formState.sellingPrice}
                    onChange={(e) => setFormState({ ...formState, sellingPrice: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-none"
                  />
                </div>
                {!editingProduct && (
                  <div>
                    <label htmlFor="prod-stock" className="block text-xs font-medium text-slate-700 mb-1">
                      Opening Stock
                    </label>
                    <input
                      id="prod-stock"
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={formState.initialStock}
                      onChange={(e) => setFormState({ ...formState, initialStock: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="prod-min" className="block text-xs font-medium text-slate-700 mb-1">
                    Min Stock Level
                  </label>
                  <input
                    id="prod-min"
                    type="number"
                    min="0"
                    required
                    value={formState.minStockLevel}
                    onChange={(e) => setFormState({ ...formState, minStockLevel: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="prod-lead" className="block text-xs font-medium text-slate-700 mb-1">
                    Lead Time (Days)
                  </label>
                  <input
                    id="prod-lead"
                    type="number"
                    min="1"
                    required
                    value={formState.leadTimeDays}
                    onChange={(e) => setFormState({ ...formState, leadTimeDays: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="prod-safety" className="block text-xs font-medium text-slate-700 mb-1">
                    Safety Stock
                  </label>
                  <input
                    id="prod-safety"
                    type="number"
                    min="0"
                    required
                    value={formState.safetyStock}
                    onChange={(e) => setFormState({ ...formState, safetyStock: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                >
                  {editingProduct ? 'Save Changes' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restock Purchase Modal */}
      {restockProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Record Stock Purchase · {restockProduct.name}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Current stock: {restockProduct.currentStock} {restockProduct.unit}
            </p>
            <form onSubmit={handleRestockSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="restock-qty" className="block text-xs font-medium text-slate-700 mb-1">
                  Quantity Received ({restockProduct.unit})
                </label>
                <input
                  id="restock-qty"
                  type="number"
                  min="1"
                  required
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label htmlFor="restock-cost" className="block text-xs font-medium text-slate-700 mb-1">
                  Unit Purchase Cost (₦)
                </label>
                <input
                  id="restock-cost"
                  type="number"
                  min="0"
                  required
                  value={restockCost}
                  onChange={(e) => setRestockCost(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label htmlFor="restock-note" className="block text-xs font-medium text-slate-700 mb-1">
                  Supplier Invoice / Note
                </label>
                <input
                  id="restock-note"
                  type="text"
                  value={restockNote}
                  onChange={(e) => setRestockNote(e.target.value)}
                  placeholder="e.g. Delivery from Alaba Depot"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRestockProduct(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                >
                  Confirm Restock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Stock Adjustment Modal */}
      {adjustProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Adjust Stock · {adjustProduct.name}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Current stock: {adjustProduct.currentStock} {adjustProduct.unit}. Enter positive or negative integer.
            </p>
            <form onSubmit={handleAdjustSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="adj-delta" className="block text-xs font-medium text-slate-700 mb-1">
                  Quantity Change (e.g. +5 or -2)
                </label>
                <input
                  id="adj-delta"
                  type="number"
                  required
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label htmlFor="adj-note" className="block text-xs font-medium text-slate-700 mb-1">
                  Reason for Adjustment
                </label>
                <input
                  id="adj-note"
                  type="text"
                  required
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="e.g. Physical count audit / damaged unit"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustProduct(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Apply Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Movement History Modal */}
      {historyProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        >
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Stock Movement Ledger · {historyProduct.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Current balance: {historyProduct.currentStock} {historyProduct.unit}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close movement ledger"
                onClick={() => setHistoryProduct(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-4">
              {loadingHistory ? (
                <p className="text-xs text-slate-500 py-6 text-center">Loading ledger...</p>
              ) : movements.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No movements recorded yet.</p>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-2 font-medium">Date</th>
                      <th className="py-2 px-2 font-medium">Type</th>
                      <th className="py-2 px-2 font-medium text-right">Change</th>
                      <th className="py-2 px-2 font-medium text-right">After</th>
                      <th className="py-2 pl-2 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2 pr-2 text-slate-500 whitespace-nowrap">
                          {formatDateTime(m.createdAt)}
                        </td>
                        <td className="py-2 px-2 capitalize font-medium text-slate-800">
                          {m.movementType}
                        </td>
                        <td
                          className={`py-2 px-2 text-right font-mono tabular-nums font-semibold ${
                            m.quantityChange >= 0 ? 'text-teal-700' : 'text-red-700'
                          }`}
                        >
                          {m.quantityChange >= 0 ? `+${m.quantityChange}` : m.quantityChange}
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700">
                          {m.stockAfter}
                        </td>
                        <td className="py-2 pl-2 text-slate-600">{m.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        title={`Archive or Delete "${confirmTarget?.name ?? ''}"?`}
        description="Products with historical sales will be safely archived to preserve revenue & profit audit trails. Products with no sales will be permanently removed."
        confirmLabel="Confirm"
        destructive
        onConfirm={handleConfirmDeleteOrArchive}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
};

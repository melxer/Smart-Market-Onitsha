import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Business, OfflinePendingSale, User } from '../types/index.ts';
import { apiFetch, getStoredToken, setStoredToken } from '../services/api.ts';
import {
  cacheProducts,
  cacheSales,
  listPendingOfflineSales,
  removePendingOfflineSale,
  updatePendingOfflineSale,
} from '../services/offlineDb.ts';
import type { Product, Sale } from '../types/index.ts';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { useToast } from './ToastContext.tsx';
import type { LangCode } from '../utils/i18n.ts';

interface AuthContextValue {
  user: User | null;
  business: Business | null;
  loading: boolean;
  language: LangCode;
  pendingSalesCount: number;
  isSyncing: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginDemo: () => Promise<void>;
  register: (input: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    businessName: string;
    marketLocation?: string;
  }) => Promise<void>;
  logout: () => void;
  setLanguage: (lang: LangCode) => Promise<void>;
  updateBusiness: (updates: { name?: string; marketLocation?: string }) => Promise<void>;
  refreshPendingCount: () => Promise<void>;
  syncOfflineQueue: () => Promise<{ synced: number; duplicates: number; failed: number }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CACHED_SESSION_KEY = 'smart_market_session_cache';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSalesCount, setPendingSalesCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const { isOnline } = useOnlineStatus();
  const { addToast } = useToast();

  const persistSession = (u: User, b: Business, token?: string) => {
    if (token) setStoredToken(token);
    setUser(u);
    setBusiness(b);
    localStorage.setItem(CACHED_SESSION_KEY, JSON.stringify({ user: u, business: b }));
  };

  const refreshPendingCount = useCallback(async () => {
    if (!business) {
      setPendingSalesCount(0);
      return;
    }
    const list = await listPendingOfflineSales(business.id);
    setPendingSalesCount(list.length);
  }, [business]);

  useEffect(() => {
    let active = true;
    async function init() {
      const token = getStoredToken();
      if (!token) {
        if (active) setLoading(false);
        return;
      }
      try {
        const res = await apiFetch<{ user: User; business: Business }>('/api/auth/me');
        if (active) {
          persistSession(res.user, res.business);
        }
      } catch {
        // If offline, fall back to cached session if token exists
        const cached = localStorage.getItem(CACHED_SESSION_KEY);
        if (cached && !navigator.onLine) {
          try {
            const parsed = JSON.parse(cached) as { user: User; business: Business };
            if (active) {
              setUser(parsed.user);
              setBusiness(parsed.business);
            }
          } catch {
            setStoredToken(null);
          }
        } else {
          setStoredToken(null);
          localStorage.removeItem(CACHED_SESSION_KEY);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Pre-warm offline IndexedDB product & sales caches whenever online & authenticated
  useEffect(() => {
    if (!business || !isOnline) return;
    let cancelled = false;
    Promise.all([
      apiFetch<{ products: Product[] }>('/api/products'),
      apiFetch<{ sales: Sale[] }>('/api/sales'),
    ])
      .then(async ([prodRes, salesRes]) => {
        if (cancelled) return;
        await Promise.all([
          cacheProducts(business.id, prodRes.products),
          cacheSales(business.id, salesRes.sales),
        ]);
      })
      .catch(() => {
        // Ignore background warm-up errors
      });
    return () => {
      cancelled = true;
    };
  }, [business?.id, isOnline]);

  const syncOfflineQueue = useCallback(async () => {
    if (!business || !isOnline || isSyncing) {
      return { synced: 0, duplicates: 0, failed: 0 };
    }
    const pending = await listPendingOfflineSales(business.id);
    if (pending.length === 0) return { synced: 0, duplicates: 0, failed: 0 };

    setIsSyncing(true);
    let synced = 0;
    let duplicates = 0;
    let failed = 0;

    try {
      const payload = pending.map((p: OfflinePendingSale) => ({
        clientTxId: p.clientTxId,
        customerName: p.customerName,
        paymentMethod: p.paymentMethod,
        saleType: p.saleType,
        notes: p.notes,
        createdAt: p.createdAt,
        items: p.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitSellingPrice: it.unitSellingPrice,
        })),
      }));

      const res = await apiFetch<{
        results: Array<{
          clientTxId: string;
          status: 'synced' | 'duplicate' | 'error';
          error?: string;
        }>;
      }>('/api/sales/sync', {
        method: 'POST',
        body: JSON.stringify({ sales: payload }),
      });

      for (const r of res.results) {
        if (r.status === 'synced') {
          await removePendingOfflineSale(r.clientTxId);
          synced++;
        } else if (r.status === 'duplicate') {
          await removePendingOfflineSale(r.clientTxId);
          duplicates++;
        } else {
          const orig = pending.find((p) => p.clientTxId === r.clientTxId);
          if (orig) {
            await updatePendingOfflineSale({
              ...orig,
              syncStatus: 'failed',
              lastError: r.error ?? 'Sync conflict',
            });
          }
          failed++;
        }
      }

      await refreshPendingCount();
      if (synced > 0) {
        addToast('success', `Synced ${synced} offline sale(s) to server.`);
      }
      if (duplicates > 0) {
        addToast('info', `Skipped ${duplicates} duplicate offline transaction(s).`);
      }
      if (failed > 0) {
        addToast(
          'error',
          `${failed} offline transaction(s) have stock conflicts. Inspect them in Settings.`
        );
      }
      window.dispatchEvent(new Event('smart-market-data-synced'));
    } catch (err) {
      addToast(
        'error',
        err instanceof Error ? err.message : 'Unable to sync offline sales right now.'
      );
    } finally {
      setIsSyncing(false);
    }

    return { synced, duplicates, failed };
  }, [business, isOnline, isSyncing, refreshPendingCount, addToast]);

  // Automatic background synchronization when connection returns
  useEffect(() => {
    if (isOnline && business && pendingSalesCount > 0) {
      syncOfflineQueue();
    }
  }, [isOnline, business, pendingSalesCount, syncOfflineQueue]);

  const login = async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: User; business: Business }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }
    );
    persistSession(res.user, res.business, res.token);
  };

  const loginDemo = async () => {
    const res = await apiFetch<{ token: string; user: User; business: Business }>(
      '/api/auth/demo',
      { method: 'POST' }
    );
    persistSession(res.user, res.business, res.token);
  };

  const register = async (input: {
    fullName: string;
    email: string;
    phone?: string;
    password: string;
    businessName: string;
    marketLocation?: string;
  }) => {
    const res = await apiFetch<{ token: string; user: User; business: Business }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
    persistSession(res.user, res.business, res.token);
  };

  const logout = () => {
    setStoredToken(null);
    localStorage.removeItem(CACHED_SESSION_KEY);
    setUser(null);
    setBusiness(null);
  };

  const setLanguage = async (lang: LangCode) => {
    if (!business) return;
    setBusiness({ ...business, preferredLanguage: lang });
    if (isOnline) {
      try {
        const res = await apiFetch<{ business: Business }>('/api/business', {
          method: 'PATCH',
          body: JSON.stringify({ preferredLanguage: lang }),
        });
        setBusiness(res.business);
      } catch {
        // Keep local preference if offline
      }
    }
  };

  const updateBusiness = async (updates: { name?: string; marketLocation?: string }) => {
    const res = await apiFetch<{ business: Business }>('/api/business', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setBusiness(res.business);
    addToast('success', 'Business profile updated.');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        business,
        loading,
        language: business?.preferredLanguage ?? 'en',
        pendingSalesCount,
        isSyncing,
        login,
        loginDemo,
        register,
        logout,
        setLanguage,
        updateBusiness,
        refreshPendingCount,
        syncOfflineQueue,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

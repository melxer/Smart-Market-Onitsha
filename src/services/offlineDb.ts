import { openDB, type IDBPDatabase } from 'idb';
import type {
  DashboardSummary,
  OfflinePendingSale,
  Product,
  ProductForecast,
  RestockingRecommendation,
  Sale,
} from '../types/index.ts';

const DB_NAME = 'smart-market-offline-v1';
const DB_VERSION = 1;

interface CachedEntry<T> {
  key: string;
  businessId: number;
  data: T;
  updatedAt: string;
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pending_sales')) {
        const store = db.createObjectStore('pending_sales', { keyPath: 'clientTxId' });
        store.createIndex('by_business', 'businessId');
      }
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }
    },
  });
}

export async function cacheData<T>(businessId: number, slot: string, data: T): Promise<void> {
  const db = await getDb();
  const entry: CachedEntry<T> = {
    key: `${businessId}:${slot}`,
    businessId,
    data,
    updatedAt: new Date().toISOString(),
  };
  await db.put('cache', entry);
}

export async function getCachedData<T>(businessId: number, slot: string): Promise<T | null> {
  const db = await getDb();
  const entry = (await db.get('cache', `${businessId}:${slot}`)) as CachedEntry<T> | undefined;
  return entry ? entry.data : null;
}

export async function cacheProducts(businessId: number, products: Product[]): Promise<void> {
  await cacheData(businessId, 'products', products);
}

export async function getCachedProducts(businessId: number): Promise<Product[]> {
  return (await getCachedData<Product[]>(businessId, 'products')) ?? [];
}

export async function cacheSales(businessId: number, sales: Sale[]): Promise<void> {
  await cacheData(businessId, 'sales', sales);
}

export async function getCachedSales(businessId: number): Promise<Sale[]> {
  return (await getCachedData<Sale[]>(businessId, 'sales')) ?? [];
}

export async function cacheDashboard(businessId: number, summary: DashboardSummary): Promise<void> {
  await cacheData(businessId, 'dashboard', summary);
}

export async function getCachedDashboard(businessId: number): Promise<DashboardSummary | null> {
  return getCachedData<DashboardSummary>(businessId, 'dashboard');
}

export async function cacheForecasting(
  businessId: number,
  data: { forecasts: ProductForecast[]; recommendations: RestockingRecommendation[] }
): Promise<void> {
  await cacheData(businessId, 'forecasting', data);
}

export async function getCachedForecasting(
  businessId: number
): Promise<{ forecasts: ProductForecast[]; recommendations: RestockingRecommendation[] } | null> {
  return getCachedData(businessId, 'forecasting');
}

export async function enqueueOfflineSale(sale: OfflinePendingSale): Promise<void> {
  const db = await getDb();
  await db.put('pending_sales', sale);
}

export async function listPendingOfflineSales(businessId: number): Promise<OfflinePendingSale[]> {
  const db = await getDb();
  const all = (await db.getAllFromIndex('pending_sales', 'by_business', businessId)) as OfflinePendingSale[];
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updatePendingOfflineSale(sale: OfflinePendingSale): Promise<void> {
  const db = await getDb();
  await db.put('pending_sales', sale);
}

export async function removePendingOfflineSale(clientTxId: string): Promise<void> {
  const db = await getDb();
  await db.delete('pending_sales', clientTxId);
}

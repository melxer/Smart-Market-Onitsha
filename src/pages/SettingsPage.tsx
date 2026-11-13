import React, { useEffect, useState } from 'react';
import { RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import type { OfflinePendingSale } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';
import { useToast } from '../context/ToastContext.tsx';
import {
  listPendingOfflineSales,
  removePendingOfflineSale,
} from '../services/offlineDb.ts';
import { formatDateTime, formatNaira } from '../utils/format.ts';
import { PWAInstallButton } from '../components/PWAInstallButton.tsx';

export const SettingsPage: React.FC = () => {
  const {
    business,
    language,
    setLanguage,
    updateBusiness,
    syncOfflineQueue,
    refreshPendingCount,
    pendingSalesCount,
    isSyncing,
  } = useAuth();
  const { isOnline, simulatedOffline, setSimulatedOffline } = useOnlineStatus();
  const { addToast } = useToast();

  const [bizName, setBizName] = useState(business?.name ?? '');
  const [marketLoc, setMarketLoc] = useState(business?.marketLocation ?? '');
  const [saving, setSaving] = useState(false);
  const [pendingList, setPendingList] = useState<OfflinePendingSale[]>([]);

  const loadQueue = async () => {
    if (!business) return;
    const list = await listPendingOfflineSales(business.id);
    setPendingList(list);
  };

  useEffect(() => {
    setBizName(business?.name ?? '');
    setMarketLoc(business?.marketLocation ?? '');
  }, [business]);

  useEffect(() => {
    loadQueue();
  }, [business, pendingSalesCount, isSyncing]);

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateBusiness({ name: bizName, marketLocation: marketLoc });
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardOffline = async (clientTxId: string) => {
    await removePendingOfflineSale(clientTxId);
    await refreshPendingCount();
    await loadQueue();
    addToast('info', 'Removed failed offline item from queue.');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900">
          Business Settings & Offline Sync Center
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage your shop profile, English/Igbo language preference, PWA installation, and offline transaction synchronization.
        </p>
      </div>

      {/* Business Profile */}
      <form
        onSubmit={handleSaveBusiness}
        className="rounded-lg border border-slate-200 bg-white p-6 space-y-4"
      >
        <h3 className="font-display text-base font-semibold text-slate-900">
          Business Profile
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="set-biz-name" className="block text-xs font-medium text-slate-700 mb-1">
              Business / Shop Name
            </label>
            <input
              id="set-biz-name"
              type="text"
              required
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="set-biz-loc" className="block text-xs font-medium text-slate-700 mb-1">
              Market Location
            </label>
            <input
              id="set-biz-loc"
              type="text"
              required
              value={marketLoc}
              onChange={(e) => setMarketLoc(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
          <div>
            <p className="text-xs font-medium text-slate-700">Interface Language</p>
            <p className="text-xs text-slate-500">Switch between Simple English and Igbo labels</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                language === 'en' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLanguage('ig')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                language === 'ig' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Igbo (Asụsụ Igbo)
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !isOnline}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Business Profile'}
          </button>
        </div>
      </form>

      {/* Offline Synchronization & Connectivity Simulation */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Offline Queue & Connectivity Control
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Test offline sales recording and automatic deduplicated synchronization without turning off your device Wi-Fi.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSimulatedOffline(!simulatedOffline)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium ${
              simulatedOffline
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {simulatedOffline ? (
              <>
                <WifiOff className="w-4 h-4" />
                <span>Simulated Offline Active (Click to Go Online)</span>
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4 text-teal-700" />
                <span>Simulate Offline Mode</span>
              </>
            )}
          </button>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-800">
              IndexedDB Pending Queue ({pendingList.length})
            </span>
            <button
              type="button"
              disabled={!isOnline || isSyncing || pendingList.length === 0}
              onClick={async () => {
                await syncOfflineQueue();
                await loadQueue();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync All Now</span>
            </button>
          </div>

          {pendingList.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              All offline transactions are synchronized. Zero pending records.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingList.map((item) => (
                <div key={item.clientTxId} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-medium text-slate-900">
                      {item.customerName} · {item.items.length} item(s) ·{' '}
                      <span className="font-mono">{formatNaira(item.totalRevenue)}</span>
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      ID: <span className="font-mono">{item.clientTxId.slice(0, 12)}</span> ·{' '}
                      {formatDateTime(item.createdAt)} · Status: {item.syncStatus}
                    </p>
                    {item.lastError && (
                      <p className="text-red-700 font-medium mt-0.5">{item.lastError}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Discard failed offline sale"
                    onClick={() => handleDiscardOffline(item.clientTxId)}
                    className="p-1.5 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PWA Installation Card */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-semibold text-slate-900">
            Progressive Web App (Installable Mobile & Desktop App)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Install Smart Market onto your Android phone, iPhone, or shop laptop for instant offline access.
          </p>
        </div>
        <PWAInstallButton />
      </div>
    </div>
  );
};

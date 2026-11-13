import { useEffect, useState } from 'react';

const SIMULATE_OFFLINE_KEY = 'smart_market_simulate_offline';

export function useOnlineStatus() {
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulatedOffline, setSimulatedOfflineState] = useState(
    () => localStorage.getItem(SIMULATE_OFFLINE_KEY) === 'true'
  );

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleCustom = () => {
      setSimulatedOfflineState(localStorage.getItem(SIMULATE_OFFLINE_KEY) === 'true');
    };
    window.addEventListener('smart-market-offline-toggle', handleCustom);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('smart-market-offline-toggle', handleCustom);
    };
  }, []);

  const setSimulatedOffline = (next: boolean) => {
    localStorage.setItem(SIMULATE_OFFLINE_KEY, next ? 'true' : 'false');
    setSimulatedOfflineState(next);
    window.dispatchEvent(new Event('smart-market-offline-toggle'));
  };

  return {
    isOnline: browserOnline && !simulatedOffline,
    browserOnline,
    simulatedOffline,
    setSimulatedOffline,
  };
}

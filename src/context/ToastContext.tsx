import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextValue {
  addToast: (type: ToastItem['type'], message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastItem['type'], message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => removeToast(id), 4500);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-white px-4 py-3 text-sm shadow-sm ${
              toast.type === 'error'
                ? 'border-red-300 text-red-900'
                : toast.type === 'success'
                ? 'border-teal-300 text-slate-900'
                : 'border-slate-200 text-slate-800'
            }`}
          >
            {toast.type === 'success' && (
              <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            )}
            {toast.type === 'error' && (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            {toast.type === 'info' && (
              <Info className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
            )}
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-700 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

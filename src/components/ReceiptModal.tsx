import React from 'react';
import { Printer, X } from 'lucide-react';
import type { Business, Sale } from '../types/index.ts';
import { formatDateTime, formatNaira } from '../utils/format.ts';

interface ReceiptModalProps {
  sale: Sale | null;
  business: Business | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ sale, business, onClose }) => {
  if (!sale) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 no-print">
          <h3 id="receipt-modal-title" className="text-sm font-semibold text-slate-900">
            Sales Receipt · {sale.receiptNumber}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Receipt
            </button>
            <button
              type="button"
              aria-label="Close receipt modal"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="printable-receipt p-6 text-slate-900 space-y-4">
          <div className="text-center border-b border-dashed border-slate-300 pb-4">
            <h4 className="text-base font-bold text-slate-900">
              {business?.name ?? 'Smart Market Shop'}
            </h4>
            <p className="text-xs text-slate-600 mt-0.5">
              {business?.marketLocation ?? 'Onitsha, Anambra State'}
            </p>
            <p className="text-xs font-mono text-slate-500 mt-2">
              Receipt {sale.receiptNumber} · {formatDateTime(sale.createdAt)}
            </p>
          </div>

          <div className="flex justify-between text-xs text-slate-600">
            <span>Customer: <strong className="text-slate-900">{sale.customerName}</strong></span>
            <span className="capitalize">
              {sale.saleType} · {sale.paymentMethod.replace('_', ' ')}
            </span>
          </div>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-y border-slate-200 text-left text-slate-500">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 font-medium text-right">Qty</th>
                <th className="py-2 font-medium text-right">Unit</th>
                <th className="py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sale.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="py-2 pr-2 font-medium text-slate-900">{item.productName}</td>
                  <td className="py-2 text-right font-mono tabular-nums">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums">
                    {formatNaira(item.unitSellingPrice)}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums font-medium">
                    {formatNaira(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-dashed border-slate-300 pt-3 space-y-1 text-sm">
            <div className="flex justify-between font-bold text-slate-900">
              <span>Total Paid</span>
              <span className="font-mono tabular-nums">{formatNaira(sale.totalRevenue)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Status</span>
              <span className="capitalize font-medium text-slate-700">{sale.status}</span>
            </div>
          </div>

          <p className="text-center text-xs text-slate-500 pt-2 border-t border-slate-100">
            Thank you for your patronage · Daalụ!
          </p>
        </div>
      </div>
    </div>
  );
};

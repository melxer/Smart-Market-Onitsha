export function formatNaira(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(safe);
}

export function formatNairaCompact(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  if (Math.abs(safe) >= 1_000_000) {
    return `₦${(safe / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(safe) >= 1_000) {
    return `₦${(safe / 1_000).toFixed(1)}k`;
  }
  return formatNaira(safe);
}

export function formatNumber(val: number, decimals = 0): string {
  return new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(val) ? val : 0);
}

export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-NG', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return '';
  const normalized = dateStr.includes('T') ? dateStr : `${dateStr.replace(' ', 'T')}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('en-NG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function downloadCSV(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const escape = (cell: string | number) => {
    const s = String(cell ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Safe CSV export utilities with RFC-4180 quoting and spreadsheet formula-injection protection.
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function sanitizeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function downloadCsvReport(
  fileName: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): void {
  const lines = [
    headers.map(sanitizeCsvCell).join(','),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(',')),
  ];
  const csvContent = `\uFEFF${lines.join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function minorToDecimalString(amountMinor: number, currencyCode = 'INR'): string {
  const zeroDecimal = ['JPY', 'KRW', 'VND'].includes(currencyCode.toUpperCase());
  if (zeroDecimal) return String(Math.trunc(amountMinor));
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(amountMinor));
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  return `${sign}${major}.${String(minor).padStart(2, '0')}`;
}

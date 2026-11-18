/**
 * Integer minor-unit currency utilities.
 * Never performs floating-point arithmetic for financial sums or calculations.
 */

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND']);

export function formatMinorCurrency(amountMinor: number, currencyCode = 'INR'): string {
  const safeCode = (currencyCode || 'INR').toUpperCase();
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(safeCode);
  const divisor = isZeroDecimal ? 1 : 100;
  const sign = amountMinor < 0 ? '-' : '';
  const absMinor = Math.abs(Math.trunc(amountMinor));
  const major = Math.floor(absMinor / divisor);
  const minor = absMinor % divisor;

  const locale = safeCode === 'INR' ? 'en-IN' : 'en-US';
  const formattedMajor = new Intl.NumberFormat(locale).format(major);
  const symbol = getCurrencySymbol(safeCode);

  if (isZeroDecimal) {
    return `${sign}${symbol}${formattedMajor}`;
  }
  return `${sign}${symbol}${formattedMajor}.${String(minor).padStart(2, '0')}`;
}

export function getCurrencySymbol(currencyCode: string): string {
  switch (currencyCode.toUpperCase()) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'INR':
      return '₹';
    case 'JPY':
      return '¥';
    default:
      return `${currencyCode.toUpperCase()} `;
  }
}

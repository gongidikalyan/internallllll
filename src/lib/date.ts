/**
 * Local-timezone-safe ISO date helpers (YYYY-MM-DD).
 * Avoids `new Date().toISOString().slice(0, 10)` which shifts to UTC tomorrow/yesterday
 * around midnight in non-UTC timezones.
 */

export function getLocalTodayIso(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysIso(baseIso: string, days: number): string {
  const normalized = normalizeDateIso(baseIso) ?? getLocalTodayIso();
  const [y, m, d] = normalized.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return getLocalTodayIso(dt);
}

export function normalizeDateIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  return match ? match[1] : null;
}

export function isValidIsoDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split('-').map(Number);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

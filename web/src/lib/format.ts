/**
 * The locale every date, number and money figure is formatted in. Set from the
 * language preference rather than read from the browser: the page can be in
 * English on a Spanish-locale machine, and the two must agree.
 */
let LOCALE: string = 'es-PY';
let LANG: 'es' | 'en' = 'es';

export function setFormatLocale(lang: 'es' | 'en'): void {
  LANG = lang;
  LOCALE = lang === 'en' ? 'en-US' : 'es-PY';
}

export function formatLocale(): string {
  return LOCALE;
}

export type WeightUnit = 'kg' | 't' | 'lb';

const LB_PER_KG = 2.2046226218;

export function convertKg(kg: number, unit: WeightUnit): number {
  if (unit === 't') return kg / 1000;
  if (unit === 'lb') return kg * LB_PER_KG;
  return kg;
}

/** Tonnes need decimals to say anything; kilos of feed almost never do. */
export function formatWeight(
  kg: number | null | undefined,
  unit: WeightUnit,
  /**
   * Decimals to show. Left off, weights round to whole kg, which is right for
   * totals — a truckload does not need a gram. Pass it where the reading
   * itself is the point, such as one ingredient on the mixer scale.
   */
  digits?: number,
): string {
  if (kg == null || Number.isNaN(kg)) return '—';
  const v = convertKg(kg, unit);
  const d = digits ?? (unit === 't' ? (Math.abs(v) < 10 ? 2 : 1) : 0);
  return `${v.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d })} ${unit}`;
}

/**
 * The precision that matches the unit: a tenth of a kilo, and the equivalent
 * in tonnes and pounds. Used where an operator wants to see exactly what the
 * scale recorded, not a tidy total.
 */
export function exactDigits(unit: WeightUnit): number {
  return unit === 't' ? 3 : 1;
}

export function formatNumber(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

/**
 * Guaraní is quoted in whole units — 12.500 Gs, never 12.500,37 — so a
 * currency with no minor unit gets no decimals. Everything else keeps two.
 */
const ZERO_DECIMAL = new Set(['PYG', 'CLP', 'JPY', 'KRW', 'VND', 'ISK']);

export function formatMoney(v: number | null | undefined, currency = 'PYG'): string {
  if (v == null || Number.isNaN(v)) return '—';
  const digits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  try {
    return v.toLocaleString(LOCALE, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  } catch {
    // An unknown code should not blank the cell.
    return `${v.toLocaleString(LOCALE, { maximumFractionDigits: digits })} ${currency}`;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(LOCALE, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(LOCALE, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.round((Date.now() - then) / 1000);
  const es = LANG === 'es';
  if (seconds < 45) return es ? 'ahora' : 'just now';
  if (seconds < 90) return es ? 'hace 1 min' : '1 min ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return es ? `hace ${minutes} min` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return es ? `hace ${hours} h` : `${hours} hr ago`;
  return formatDate(iso);
}

/** Local-day key, used everywhere a chart or a "per day fed" figure buckets. */
export function dayKey(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

/** Quotes every cell so a comma inside a note cannot shift the columns. */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escape = (cell: string | number | null): string =>
    `"${(cell == null ? '' : String(cell)).replace(/"/g, '""')}"`;
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  // The BOM makes Excel read the file as UTF-8 instead of mangling accents.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

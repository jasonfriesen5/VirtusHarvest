import type { Weighing } from './types';
import { toKg } from './units';

/**
 * Shared derivations over the weighings list. Kept out of components so the
 * dashboard, records table and map all agree on what "a load" is and what
 * counts toward a total.
 */

/**
 * Rows where `is_truck_empty` is set are truck-empty events the phone app
 * writes when a truck unloads — they are not harvested loads, and summing
 * them would double-count grain that was already recorded at the field.
 */
export function isHarvestLoad(w: Weighing): boolean {
  return !w.is_truck_empty;
}

export function filterBySeason(rows: Weighing[], seasonId: string): Weighing[] {
  if (!seasonId) return rows;
  return rows.filter((w) => w.season_id === seasonId);
}

/** Net weight in kg, preferring dry weight when the app recorded one. */
export function netKg(w: Weighing): number {
  const raw = w.dry_weight ?? w.weight;
  return toKg(raw, w.unit);
}

export function wetKg(w: Weighing): number {
  return toKg(w.wet_weight ?? w.weight, w.unit);
}

export function totalKg(rows: Weighing[]): number {
  return rows.reduce((sum, w) => sum + netKg(w), 0);
}

/** Average moisture weighted by load size — a plain mean over-weights small loads. */
export function weightedMoisture(rows: Weighing[]): number {
  let numerator = 0;
  let denominator = 0;
  for (const w of rows) {
    const kg = netKg(w);
    if (kg <= 0 || w.moisture == null) continue;
    numerator += w.moisture * kg;
    denominator += kg;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

export interface GroupTotal {
  key: string;
  label: string;
  kg: number;
  loads: number;
}

/** Group loads by any text column, folding blanks into a single bucket. */
export function groupBy(
  rows: Weighing[],
  pick: (w: Weighing) => string | null | undefined,
  blankLabel = 'Unassigned',
): GroupTotal[] {
  const map = new Map<string, GroupTotal>();
  for (const w of rows) {
    const raw = (pick(w) ?? '').trim();
    const key = raw || blankLabel;
    const existing = map.get(key);
    if (existing) {
      existing.kg += netKg(w);
      existing.loads += 1;
    } else {
      map.set(key, { key, label: key, kg: netKg(w), loads: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.kg - a.kg);
}

export interface DayTotal {
  /** Local YYYY-MM-DD, used as both the key and the axis label source. */
  date: string;
  kg: number;
  loads: number;
}

export function groupByDay(rows: Weighing[]): DayTotal[] {
  const map = new Map<string, DayTotal>();
  for (const w of rows) {
    if (!w.timestamp) continue;
    const d = new Date(w.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    // Built from local parts rather than toISOString(), which would shift
    // evening loads into the next day for anyone west of UTC.
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    const existing = map.get(date);
    if (existing) {
      existing.kg += netKg(w);
      existing.loads += 1;
    } else {
      map.set(date, { date, kg: netKg(w), loads: 1 });
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Distinct non-blank values of a column, for populating filter dropdowns. */
export function distinct(rows: Weighing[], pick: (w: Weighing) => string | null | undefined): string[] {
  const set = new Set<string>();
  for (const w of rows) {
    const v = (pick(w) ?? '').trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

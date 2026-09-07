import type { Weighing } from './types';
import { buildTruckloads } from './truckloads';
import type { TruckloadOptions } from './truckloads';

/** Names are stored on weighings, not crop IDs. Fiscal product codes are not
 * crop identity: they belong to a buyer's catalogue. */
export function cropKey(name: string | null | undefined): string {
  const key = (name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const aliases: Record<string, string> = {
    soja: 'soybeans', soy: 'soybeans', soybean: 'soybeans',
    maiz: 'corn', maize: 'corn', trigo: 'wheat', sorgo: 'sorghum',
    girasol: 'sunflower', arroz: 'rice', algodon: 'cotton',
    mani: 'peanuts', cebada: 'barley', avena: 'oats',
  };
  return aliases[key] ?? key;
}

export function truckloadCropError(loads: Pick<Weighing, 'crop'>[]): string | null {
  if (loads.some(w => !cropKey(w.crop))) return 'Set a crop on every transaction before adding it to a truckload.';
  if (new Set(loads.map(w => cropKey(w.crop))).size > 1)
    return 'A truckload can contain only one crop. Remove the different-crop transaction first.';
  return null;
}

/**
 * The crop records a truckload's loads resolve to, one entry per CANONICAL
 * crop — the same grouping `truckloadCropError` validates against, so a load
 * set it accepts always yields exactly one entry here.
 *
 * This exists because grouping by the raw `crop` string does not agree with the
 * guard. "Soja" and "Soybeans" share a cropKey, so the guard passes them as one
 * crop, but raw-name grouping emitted two document lines for the one grain —
 * and, since the crop lookup was an exact-name match, the line whose spelling
 * was not in the crop list fell back to using its own name as the product code.
 * One truckload, one grain, two merchandise codes. Callers building document
 * lines must group through this rather than by name.
 */
export function truckloadCropGroups<T extends Pick<Weighing, 'crop'>>(
  loads: T[],
  weigh: (load: T) => number,
): { key: string; name: string; kg: number }[] {
  const groups = new Map<string, { key: string; name: string; kg: number }>();
  for (const load of loads) {
    const key = cropKey(load.crop);
    const existing = groups.get(key);
    // The first spelling seen names the group. With the guard satisfied every
    // load in it is the same crop, so any of them is a correct label.
    if (existing) existing.kg += weigh(load);
    else groups.set(key, { key, name: (load.crop ?? '').trim() || 'Sin especificar', kg: weigh(load) });
  }
  return [...groups.values()];
}

/** Re-derive after an edit: changing the truck can change membership too. */
export function editedTruckloadCropError(rows: Weighing[], updated: Weighing, options: TruckloadOptions): string | null {
  const before = rows.find(w => w.id === updated.id);
  if (before && cropKey(before.crop) === cropKey(updated.crop) && before.buggy === updated.buggy) return null;
  const groups = buildTruckloads(rows.map(w => w.id === updated.id ? updated : w), options);
  const affected = [...groups.completed, ...groups.open].find(t => t.loads.some(w => w.id === updated.id));
  return affected ? truckloadCropError(affected.loads) : null;
}

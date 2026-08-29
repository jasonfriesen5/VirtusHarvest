import { supabase } from './supabase';
import type { Boundary, BoundaryPoint } from './types';

export interface Ring {
  /** Preserved across edits so saving one ring never renames the others. */
  id: string;
  points: BoundaryPoint[];
}

/**
 * `ht_boundaries.points` has two shapes in the wild. Current rows hold a list
 * of rings, `[{id, points:[{lat,lng}]}]`, so one field can carry several drawn
 * areas. Older rows hold a bare `[{lat,lng}]`. Both are parsed to `Ring[]`
 * here so the rest of the app only ever deals with one shape.
 */
export function parseRings(row: Boundary): Ring[] {
  const raw = row.points;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const isPoint = (v: unknown): v is BoundaryPoint =>
    typeof v === 'object' &&
    v !== null &&
    Number.isFinite((v as BoundaryPoint).lat) &&
    Number.isFinite((v as BoundaryPoint).lng);

  // Legacy flat form: the array itself is a single ring of points.
  if (isPoint(raw[0])) {
    const points = (raw as unknown[]).filter(isPoint);
    return points.length >= 3 ? [{ id: `${row.field_id}_b1`, points }] : [];
  }

  const rings: Ring[] = [];
  for (const [i, entry] of (raw as unknown[]).entries()) {
    if (typeof entry !== 'object' || entry === null) continue;
    const inner = (entry as { points?: unknown }).points;
    if (!Array.isArray(inner)) continue;
    const points = inner.filter(isPoint);
    // Fewer than three points cannot enclose an area, so it would render as
    // an invisible sliver — drop it rather than draw a degenerate polygon.
    if (points.length < 3) continue;
    const id = (entry as { id?: unknown }).id;
    rings.push({ id: typeof id === 'string' ? id : `${row.field_id}_b${i + 1}`, points });
  }
  return rings;
}

/** Spherical-excess area of a lat/lng ring, in hectares. */
export function ringAreaHectares(ring: BoundaryPoint[]): number {
  if (ring.length < 3) return 0;
  const R = 6378137; // WGS-84 equatorial radius, metres
  const rad = (deg: number) => (deg * Math.PI) / 180;

  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    total += (rad(b.lng) - rad(a.lng)) * (2 + Math.sin(rad(a.lat)) + Math.sin(rad(b.lat)));
  }
  return Math.abs((total * R * R) / 2) / 10_000;
}

export function ringsAreaHectares(rings: Ring[]): number {
  return rings.reduce((sum, r) => sum + ringAreaHectares(r.points), 0);
}

export function centroid(points: BoundaryPoint[]): BoundaryPoint | null {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

export function nextRingId(fieldId: string, existing: Ring[]): string {
  // Matches the phone app's `<fieldId>_b<n>` shape, skipping any n already taken.
  let n = existing.length + 1;
  const taken = new Set(existing.map((r) => r.id));
  while (taken.has(`${fieldId}_b${n}`)) n++;
  return `${fieldId}_b${n}`;
}

/**
 * Writes the complete ring list for one field.
 *
 * The whole `points` array is replaced rather than patched, because it is a
 * single jsonb column — there is no way to update one ring in place. Passing
 * an empty list deletes the row outright, which is what "delete the last
 * boundary" means.
 *
 * The field's `area` is recalculated to match, mirroring the phone app's
 * "auto-calculated from drawn boundary" behaviour — otherwise yield-per-hectare
 * would keep using an area the boundary no longer describes.
 */
export async function saveFieldRings(
  fieldId: string,
  userId: string,
  rings: Ring[],
): Promise<{ error: string | null }> {
  if (rings.length === 0) {
    const { error } = await supabase
      .from('ht_boundaries')
      .delete()
      .eq('field_id', fieldId)
      .eq('user_id', userId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from('ht_boundaries').upsert(
      {
        field_id: fieldId,
        user_id: userId,
        points: rings.map((r) => ({ id: r.id, points: r.points })),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'field_id,user_id' },
    );
    if (error) return { error: error.message };
  }

  const hectares = ringsAreaHectares(rings);
  const { error: areaError } = await supabase
    .from('ht_fields')
    .update({
      area: rings.length === 0 ? null : Math.round(hectares * 100) / 100,
      area_unit: 'ha',
      updated_at: new Date().toISOString(),
    })
    .eq('id', fieldId)
    .eq('user_id', userId);

  if (areaError) {
    return { error: `Boundary saved, but the field area could not be updated: ${areaError.message}` };
  }
  return { error: null };
}

/**
 * Every weighing carries its own `unit`, so summing raw `weight` across rows
 * is meaningless the moment one device is set to lb and another to kg.
 * Everything is normalised to kilograms on read, then formatted into the
 * unit the viewer picked in the header.
 */

export type DisplayUnit = 'kg' | 'lb' | 't';

const LB_PER_KG = 2.2046226218;

/** Convert a stored weight to kilograms using the unit recorded on its row. */
export function toKg(weight: number | null | undefined, unit: string | null | undefined): number {
  if (weight == null || !Number.isFinite(weight)) return 0;
  return (unit ?? 'kg').toLowerCase() === 'lb' ? weight / LB_PER_KG : weight;
}

export function fromKg(kg: number, unit: DisplayUnit): number {
  if (unit === 'lb') return kg * LB_PER_KG;
  if (unit === 't') return kg / 1000;
  return kg;
}

export const UNIT_LABEL: Record<DisplayUnit, string> = {
  kg: 'kg',
  lb: 'lb',
  t: 't',
};

/** Tonnes deserve more decimals than kilograms — 0.4 t reads as 0 otherwise. */
export function formatWeight(kg: number, unit: DisplayUnit): string {
  const value = fromKg(kg, unit);
  const decimals = unit === 't' ? 2 : 0;
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${UNIT_LABEL[unit]}`;
}

/** Bare number for chart axes and CSV cells, where the unit is in the header. */
export function weightValue(kg: number, unit: DisplayUnit): number {
  const value = fromKg(kg, unit);
  return unit === 't' ? Math.round(value * 100) / 100 : Math.round(value);
}

// ── Area ────────────────────────────────────────────────────────────────────

export type AreaUnit = 'ha' | 'ac';

const ACRES_PER_HA = 2.4710538147;

/** Field areas are computed from boundary geometry, which is always hectares. */
export function fromHa(hectares: number, unit: AreaUnit): number {
  return unit === 'ac' ? hectares * ACRES_PER_HA : hectares;
}

/** ht_fields.area carries its own area_unit, so stored values need normalising. */
export function toHa(value: number | null | undefined, unit: string | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return (unit ?? 'ha').toLowerCase() === 'ac' ? value / ACRES_PER_HA : value;
}

export const AREA_LABEL: Record<AreaUnit, string> = { ha: 'ha', ac: 'ac' };

export function formatArea(hectares: number, unit: AreaUnit): string {
  return `${fromHa(hectares, unit).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} ${AREA_LABEL[unit]}`;
}

export function areaValue(hectares: number, unit: AreaUnit): number {
  return Math.round(fromHa(hectares, unit) * 10) / 10;
}

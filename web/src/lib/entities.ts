import { supabase } from './supabase';
import type { EntityKind, Weighing } from './types';

/**
 * `weighings` stores farm/crop/truck/field/destination/operator as the *name*
 * that was current when the load was weighed — only `field_id` and
 * `season_id` are real references. So renaming an entity leaves historic rows
 * pointing at a name that no longer exists, and reports silently split in two.
 *
 * `backfillColumns` records which text columns carry each entity's name, so a
 * rename can rewrite them in the same operation. `ht_carts` has no column on
 * `weighings`, which is why its list is empty.
 */
/**
 * `reference` renders a picker over another table and stores its id;
 * `select` constrains free text to a fixed set. Both exist because typing an
 * id or a unit by hand is a reliable way to produce data nothing can read —
 * an area_unit of "hectares" would silently fall back to hectares-as-written
 * and never convert.
 */
type SpecBase = {
  key: string;
  label: string;
  /**
   * Only shown when the Nota de Remisión feature is on. Fiscal identifiers are
   * meaningless clutter to a farm that doesn't issue transport documents, and
   * a form full of fields nobody can explain is worse than a short one.
   */
  remisionOnly?: boolean;
};

export type EntityFieldSpec =
  | (SpecBase & { type: 'text' | 'number' })
  | (SpecBase & {
      type: 'select';
      options: { value: string; label: string }[];
      defaultValue?: string;
    })
  | (SpecBase & { type: 'reference'; ref: 'farms' })
  | (SpecBase & { type: 'boolean' });

export interface EntityConfig {
  kind: EntityKind;
  table: string;
  label: string;
  singular: string;
  backfillColumns: (keyof Weighing)[];
  /** Extra editable columns beyond `name`, in display order. */
  fields: EntityFieldSpec[];
}

export const ENTITIES: EntityConfig[] = [
  {
    kind: 'farms',
    table: 'ht_farms',
    label: 'Farms',
    singular: 'farm',
    backfillColumns: ['farm'],
    fields: [
      { key: 'address', label: 'Address (departure point)', type: 'text', remisionOnly: true },
      { key: 'district', label: 'District', type: 'text', remisionOnly: true },
      { key: 'department', label: 'Department', type: 'text', remisionOnly: true },
    ],
  },
  {
    kind: 'fields',
    table: 'ht_fields',
    label: 'Fields',
    singular: 'field',
    backfillColumns: ['zone'],
    fields: [
      { key: 'farm_id', label: 'Farm', type: 'reference', ref: 'farms' },
      { key: 'area', label: 'Area', type: 'number' },
      {
        key: 'area_unit',
        label: 'Area unit',
        type: 'select',
        defaultValue: 'ha',
        options: [
          { value: 'ha', label: 'Hectares (ha)' },
          { value: 'ac', label: 'Acres (ac)' },
        ],
      },
      { key: 'notes', label: 'Notes', type: 'text' },
    ],
  },
  {
    kind: 'crops',
    table: 'ht_crops',
    label: 'Crops',
    singular: 'crop',
    backfillColumns: ['crop'],
    fields: [
      { key: 'product_code', label: 'Product code', type: 'text', remisionOnly: true },
      { key: 'fiscal_description', label: 'Document description', type: 'text', remisionOnly: true },
    ],
  },
  {
    kind: 'trucks',
    table: 'ht_trucks',
    label: 'Trucks',
    singular: 'truck',
    backfillColumns: ['buggy'],
    fields: [
      { key: 'plate', label: 'Plate', type: 'text' },
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'capacity', label: 'Capacity', type: 'number' },
      { key: 'make_model', label: 'Make / model (marca)', type: 'text' },
      { key: 'vehicle_type', label: 'Vehicle type', type: 'text', remisionOnly: true },
      { key: 'driver_ci', label: 'Driver cédula (CI)', type: 'text', remisionOnly: true },
      { key: 'driver_address', label: 'Driver address', type: 'text', remisionOnly: true },
      { key: 'transportista_name', label: 'Hauler (transportista)', type: 'text', remisionOnly: true },
      { key: 'transportista_ruc', label: 'Hauler RUC', type: 'text', remisionOnly: true },
      { key: 'transportista_address', label: 'Hauler address', type: 'text', remisionOnly: true },
      { key: 'notes', label: 'Notes', type: 'text' },
    ],
  },
  {
    kind: 'carts',
    table: 'ht_carts',
    label: 'Grain carts',
    singular: 'grain cart',
    backfillColumns: [],
    fields: [{ key: 'serial', label: 'Serial', type: 'text' }],
  },
  {
    kind: 'operators',
    table: 'ht_operators',
    label: 'Operators',
    singular: 'operator',
    backfillColumns: ['worker'],
    fields: [
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'ci', label: 'Cédula (CI)', type: 'text', remisionOnly: true },
      { key: 'address', label: 'Address', type: 'text', remisionOnly: true },
    ],
  },
  {
    kind: 'destinations',
    table: 'ht_destinations',
    label: 'Destinations',
    singular: 'destination',
    // The app writes the destination to both columns, so both must move.
    backfillColumns: ['unload', 'delivered_to'],
    fields: [
      { key: 'requires_remision', label: 'Needs remisión', type: 'boolean', remisionOnly: true },
      { key: 'razon_social', label: 'Legal name (razón social)', type: 'text', remisionOnly: true },
      { key: 'ruc', label: 'RUC', type: 'text', remisionOnly: true },
      { key: 'address', label: 'Address', type: 'text', remisionOnly: true },
      { key: 'district', label: 'District', type: 'text', remisionOnly: true },
      { key: 'department', label: 'Department', type: 'text', remisionOnly: true },
    ],
  },
  {
    kind: 'seasons',
    table: 'ht_seasons',
    label: 'Seasons',
    singular: 'season',
    // Weighings reference seasons by id, so a rename needs no backfill.
    backfillColumns: [],
    fields: [],
  },
];

/** The spec list for one entity, minus anything the remisión toggle hides. */
export function visibleFields(config: EntityConfig, remisionEnabled: boolean): EntityFieldSpec[] {
  return remisionEnabled ? config.fields : config.fields.filter((f) => !f.remisionOnly);
}

export function entityByKind(kind: EntityKind): EntityConfig {
  const found = ENTITIES.find((e) => e.kind === kind);
  if (!found) throw new Error(`Unknown entity kind: ${kind}`);
  return found;
}

/**
 * The phone app generates ids client-side rather than relying on a database
 * default, and every id column is `text` with no default — so the web app has
 * to mint one too. Matches the app's base-36 timestamp + random suffix shape.
 */
export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** How many weighings would a rename of `oldName` touch? */
export async function countAffected(
  config: EntityConfig,
  oldName: string,
  userId: string,
): Promise<number> {
  if (config.backfillColumns.length === 0) return 0;

  const counts = await Promise.all(
    config.backfillColumns.map((col) =>
      supabase
        .from('weighings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq(col as string, oldName),
    ),
  );

  // Destinations write the same name to two columns on the same row, so the
  // per-column counts overlap — the largest is the row count, not the sum.
  return counts.reduce((max, r) => Math.max(max, r.count ?? 0), 0);
}

/**
 * Renames the entity and rewrites every weighing that carries the old name.
 * The entity row is updated first: if a backfill then fails, the lists and the
 * records disagree visibly rather than the rename appearing to have worked.
 */
export async function renameWithBackfill(
  config: EntityConfig,
  id: string,
  oldName: string,
  newName: string,
  userId: string,
  extraPatch: Record<string, unknown> = {},
): Promise<{ error: string | null; updated: number }> {
  const { error: entityError } = await supabase
    .from(config.table)
    .update({ name: newName, ...extraPatch })
    .eq('id', id)
    .eq('user_id', userId);

  if (entityError) return { error: entityError.message, updated: 0 };

  if (oldName === newName || config.backfillColumns.length === 0) {
    return { error: null, updated: 0 };
  }

  let updated = 0;
  for (const col of config.backfillColumns) {
    const { error, count } = await supabase
      .from('weighings')
      .update({ [col]: newName }, { count: 'exact' })
      .eq('user_id', userId)
      .eq(col as string, oldName);

    if (error) {
      return {
        error: `Renamed the ${config.singular}, but updating historic records failed: ${error.message}`,
        updated,
      };
    }
    updated = Math.max(updated, count ?? 0);
  }

  return { error: null, updated };
}

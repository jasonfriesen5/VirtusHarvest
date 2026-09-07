import { supabase } from './supabase';
import type { Weighing, LoadAssignment } from './types';
import { buildTruckloads } from './truckloads';
import { truckloadCropError } from './truckloadCrop';

/** Fresh, paginated read before writing; UI checks alone may use old data.
 * This is a web guard, not a transaction lock across other devices. */
async function checkCrops(userId: string, ids: string[], closingId?: string): Promise<void> {
  if (!ids.length) throw new Error('Choose at least one transaction.');
  async function readAll(table: string) {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from(table).select('*').eq('user_id', userId)
        .order(table === 'ht_load_assignments' ? 'weighing_id' : table === 'ht_truckloads' ? 'closing_weighing_id' : 'id')
        .range(offset, offset + 999);
      if (error) throw new Error('Could not verify truckload crops. Refresh and try again.');
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) return rows;
    }
  }
  const rows = await readAll('weighings') as Weighing[];
  const wanted = new Set(ids);
  const selected = rows.filter(w => wanted.has(w.id) && !w.is_truck_empty);
  if (selected.length !== wanted.size) throw new Error('Some transactions are no longer available. Refresh and try again.');
  let members: Weighing[] = [];
  if (closingId) {
    if (!rows.some(w => w.id === closingId && w.is_truck_empty)) throw new Error('Truckload no longer exists.');
    const [assignments, tickets] = await Promise.all([readAll('ht_load_assignments'), readAll('ht_truckloads')]);
    const groups = buildTruckloads(rows, {
      assignments: assignments as LoadAssignment[],
      manualClosingIds: new Set(tickets.filter(t => t.manual).map(t => t.closing_weighing_id as string)),
    });
    members = groups.completed.find(t => t.closedBy?.id === closingId)?.loads ?? [];
  }
  const error = truckloadCropError([...members, ...selected]);
  if (error) throw new Error(error);
}

/**
 * Mutations behind the manual truckload controls.
 *
 * Truckloads are normally derived from the empty-truck sequence, and that stays
 * the default. These functions write the exceptions: a load pulled out of the
 * bundle it landed in, a load put into a different one, and the empty-truck row
 * that a driver forgot to record.
 */

/**
 * Matches the id format the phone app writes — base36 milliseconds plus a short
 * random tail. Weighing ids are text and have no database default, so the
 * console has to mint one the same way the app does.
 */
export function newWeighingId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

/** Takes a load out of whatever truckload it is currently grouped into. */
export async function unassignLoad(userId: string, weighingId: string): Promise<void> {
  const { error } = await supabase.from('ht_load_assignments').upsert(
    {
      weighing_id: weighingId,
      user_id: userId,
      closing_weighing_id: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'weighing_id' },
  );
  if (error) throw new Error(error.message);
}

/** Pins loads to one truckload, overriding the time-order grouping. */
export async function assignLoads(
  userId: string,
  weighingIds: string[],
  closingWeighingId: string,
): Promise<void> {
  if (weighingIds.length === 0) return;
  await checkCrops(userId, weighingIds, closingWeighingId);
  const now = new Date().toISOString();
  const { error } = await supabase.from('ht_load_assignments').upsert(
    weighingIds.map((id) => ({
      weighing_id: id,
      user_id: userId,
      closing_weighing_id: closingWeighingId,
      updated_at: now,
    })),
    { onConflict: 'weighing_id' },
  );
  if (error) throw new Error(error.message);
}

/**
 * Drops the override for a load, so it goes back to being grouped by time.
 * Used when a load is returned to the bundle it would naturally fall into.
 */
export async function clearAssignment(userId: string, weighingId: string): Promise<void> {
  const { error } = await supabase
    .from('ht_load_assignments')
    .delete()
    .eq('weighing_id', weighingId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export interface NewTruckload {
  truck: string;
  destination: string;
  /** ISO timestamp the truck was emptied. */
  emptiedAt: string;
  /** UTC offset where this closing event was entered. */
  timezoneOffsetMinutes?: number | null;
  seasonId: string | null;
  loadIds: string[];
  reason?: 'assembled' | 'finished-loading';
}

/**
 * Creates the empty-truck row a driver never pressed, and puts the chosen
 * loads on it.
 *
 * The closing row is a real `weighings` row because everything downstream —
 * the buyer's ticket, the Nota de Remisión — is keyed on it. Making it a
 * different kind of object would mean a console-made truckload could never
 * carry a remisión, which is most of the reason for creating one.
 */
export async function createTruckload(userId: string, input: NewTruckload): Promise<string> {
  await checkCrops(userId, input.loadIds);
  const closingId = newWeighingId();

  const { error: insertError } = await supabase.from('weighings').insert({
    id: closingId,
    user_id: userId,
    buggy: input.truck,
    unload: input.destination || null,
    delivered_to: input.destination || null,
    timestamp: input.emptiedAt,
    timezone_offset_minutes: input.timezoneOffsetMinutes ?? null,
    season_id: input.seasonId,
    is_truck_empty: true,
    // Weight lives on the field loads; the closing row only marks the event.
    weight: null,
    unit: 'kg',
    synced: true,
    notes: input.reason === 'finished-loading'
      ? 'Loading completed in the web console.'
      : 'Truckload assembled in the web console.',
  });
  if (insertError) throw new Error(insertError.message);

  // Marks the truckload as console-made. Without it the grouping would treat
  // this row as a driver's empty-truck press and let it swallow any earlier
  // loose loads on the same truck.
  const { error: markError } = await supabase.from('ht_truckloads').upsert(
    {
      closing_weighing_id: closingId,
      user_id: userId,
      manual: true,
      ticket_unit: 'kg',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'closing_weighing_id' },
  );
  if (markError) throw new Error(markError.message);

  await assignLoads(userId, input.loadIds, closingId);
  return closingId;
}

/**
 * Deletes a console-made truckload and frees its loads.
 *
 * The loads are explicitly unassigned first rather than left to the cascade:
 * dropping the override rows would hand them back to the time-order grouping,
 * which could quietly fold them into a neighbouring truckload instead of
 * leaving them where the user can see them.
 */
export async function deleteManualTruckload(
  userId: string,
  closingId: string,
  loads: Weighing[],
): Promise<void> {
  for (const load of loads) await unassignLoad(userId, load.id);

  const { error } = await supabase
    .from('weighings')
    .delete()
    .eq('id', closingId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

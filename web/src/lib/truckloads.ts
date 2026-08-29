import type { Weighing } from './types';
import { netKg } from './selectors';

/**
 * A truckload is every field load put on one truck between two "empty truck"
 * events. The phone app already records both halves — field loads, and an
 * `is_truck_empty` row carrying the destination — so this is derived from
 * `weighings` rather than stored. Nothing to keep in sync, and it applies
 * retroactively to records that predate the feature.
 *
 * The grouping is: partition by truck, order by time, and every truck-empty
 * row closes the bundle that precedes it.
 */

export interface Truckload {
  /** Stable within a render, derived from the truck and its closing event. */
  key: string;
  truck: string;
  loads: Weighing[];
  kg: number;
  /** The truck-empty row that closed this bundle; absent while still loaded. */
  closedBy: Weighing | null;
  /** Destination recorded on the empty event. */
  destination: string | null;
  firstLoadAt: string | null;
  lastLoadAt: string | null;
  emptiedAt: string | null;
  crops: string[];
  fields: string[];
  operators: string[];
}

const UNASSIGNED_TRUCK = 'Unassigned';

function truckOf(w: Weighing): string {
  const name = (w.buggy ?? '').trim();
  return name === '' || name.toLowerCase() === 'unset' ? UNASSIGNED_TRUCK : name;
}

function byTime(a: Weighing, b: Weighing): number {
  const at = a.timestamp ?? '';
  const bt = b.timestamp ?? '';
  if (at !== bt) return at < bt ? -1 : 1;
  // Ties broken by id so the order is stable between renders; two loads can
  // share a timestamp when a device syncs a backlog.
  return a.id < b.id ? -1 : 1;
}

function distinctValues(loads: Weighing[], pick: (w: Weighing) => string | null | undefined): string[] {
  const set = new Set<string>();
  for (const w of loads) {
    const v = (pick(w) ?? '').trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function build(truck: string, loads: Weighing[], closedBy: Weighing | null, index: number): Truckload {
  const ordered = [...loads].sort(byTime);
  return {
    key: closedBy ? `${truck}:${closedBy.id}` : `${truck}:open:${index}`,
    truck,
    loads: ordered,
    kg: ordered.reduce((sum, w) => sum + netKg(w), 0),
    closedBy,
    destination: closedBy ? ((closedBy.delivered_to ?? closedBy.unload)?.trim() || null) : null,
    firstLoadAt: ordered[0]?.timestamp ?? null,
    lastLoadAt: ordered[ordered.length - 1]?.timestamp ?? null,
    emptiedAt: closedBy?.timestamp ?? null,
    crops: distinctValues(ordered, (w) => w.crop),
    fields: distinctValues(ordered, (w) => w.zone),
    operators: distinctValues(ordered, (w) => w.worker),
  };
}

/**
 * Splits weighings into completed truckloads and trucks still carrying grain.
 *
 * Empty-truck events with nothing before them produce no truckload — pressing
 * "empty" on an already-empty truck is a no-op, not a delivery of zero.
 */
export function buildTruckloads(weighings: Weighing[]): {
  completed: Truckload[];
  open: Truckload[];
} {
  const byTruck = new Map<string, Weighing[]>();
  for (const w of weighings) {
    const truck = truckOf(w);
    const list = byTruck.get(truck);
    if (list) list.push(w);
    else byTruck.set(truck, [w]);
  }

  const completed: Truckload[] = [];
  const open: Truckload[] = [];

  for (const [truck, rows] of byTruck) {
    rows.sort(byTime);
    let pending: Weighing[] = [];
    let openIndex = 0;

    for (const row of rows) {
      if (row.is_truck_empty) {
        if (pending.length > 0) {
          completed.push(build(truck, pending, row, openIndex));
          pending = [];
        }
        continue;
      }
      pending.push(row);
    }

    if (pending.length > 0) {
      open.push(build(truck, pending, null, openIndex++));
    }
  }

  completed.sort((a, b) => (b.emptiedAt ?? '').localeCompare(a.emptiedAt ?? ''));
  open.sort((a, b) => b.kg - a.kg);

  return { completed, open };
}

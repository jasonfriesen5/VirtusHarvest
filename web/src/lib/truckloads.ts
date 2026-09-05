import type { LoadAssignment, Weighing } from './types';
import { wetKg } from './selectors';

/**
 * A truckload is every field load put on one truck between two "empty truck"
 * events. The phone app already records both halves — field loads, and an
 * `is_truck_empty` row carrying the destination — so this is derived from
 * `weighings` rather than stored. Nothing to keep in sync, and it applies
 * retroactively to records that predate the feature.
 *
 * The grouping is: partition by truck, order by time, and every truck-empty
 * row closes the bundle that precedes it.
 *
 * That is right whenever the driver actually pressed "empty truck". When they
 * forgot, `ht_load_assignments` overrides the derivation for individual loads —
 * see `applyAssignments` below. The override table holds only the exceptions,
 * so an account that never needs a correction groups exactly as it always did.
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
  /** True when this truckload was assembled in the console, not in the field. */
  manual: boolean;
}

export interface TruckloadOptions {
  /** Per-load overrides of the derived grouping. */
  assignments?: LoadAssignment[];
  /**
   * Closing rows written by the console rather than by a driver. They take
   * only the loads explicitly pinned to them: a manually created truckload
   * must never quietly swallow whatever happens to sit before it in time.
   */
  manualClosingIds?: Set<string>;
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

function build(
  truck: string,
  loads: Weighing[],
  closedBy: Weighing | null,
  index: number,
  manual = false,
): Truckload {
  const ordered = [...loads].sort(byTime);
  return {
    key: closedBy ? `${truck}:${closedBy.id}` : `${truck}:open:${index}`,
    truck,
    loads: ordered,
    // Wet weight, not dry: a truckload is what is on the road. Dry weight is
    // the moisture-shrunk figure used for yield and settlement, and is lighter
    // than the lorry actually is.
    kg: ordered.reduce((sum, w) => sum + wetKg(w), 0),
    closedBy,
    destination: closedBy ? ((closedBy.delivered_to ?? closedBy.unload)?.trim() || null) : null,
    firstLoadAt: ordered[0]?.timestamp ?? null,
    lastLoadAt: ordered[ordered.length - 1]?.timestamp ?? null,
    emptiedAt: closedBy?.timestamp ?? null,
    crops: distinctValues(ordered, (w) => w.crop),
    fields: distinctValues(ordered, (w) => w.zone),
    operators: distinctValues(ordered, (w) => w.worker),
    manual,
  };
}

/**
 * Splits weighings into completed truckloads, trucks still carrying grain, and
 * loads that belong to neither.
 *
 * Empty-truck events with nothing before them produce no truckload — pressing
 * "empty" on an already-empty truck is a no-op, not a delivery of zero.
 */
export function buildTruckloads(
  weighings: Weighing[],
  options: TruckloadOptions = {},
): {
  completed: Truckload[];
  open: Truckload[];
  /**
   * Loads deliberately pulled out of a truckload, waiting to be put into one.
   * Only ever populated by an explicit removal — a load nobody has touched is
   * grouped by time as usual.
   */
  unassigned: Weighing[];
} {
  const { assignments = [], manualClosingIds = new Set<string>() } = options;

  /** weighing id -> closing row it belongs to, or null for "no truckload". */
  const pinned = new Map<string, string | null>();
  for (const a of assignments) pinned.set(a.weighing_id, a.closing_weighing_id);

  // Rows still driving the plain time-ordered derivation.
  const flow: Weighing[] = [];
  // Loads attached to a specific closing row by hand.
  const attached = new Map<string, Weighing[]>();
  const unassigned: Weighing[] = [];
  const manualClosings: Weighing[] = [];
  const closingIds = new Set<string>();

  for (const w of weighings) {
    if (w.is_truck_empty) {
      closingIds.add(w.id);
      if (manualClosingIds.has(w.id)) manualClosings.push(w);
      else flow.push(w);
      continue;
    }
    if (pinned.has(w.id)) {
      const target = pinned.get(w.id) ?? null;
      if (target === null) {
        unassigned.push(w);
      } else {
        const list = attached.get(target);
        if (list) list.push(w);
        else attached.set(target, [w]);
      }
      continue;
    }
    flow.push(w);
  }

  // A pin whose closing row has since been deleted would otherwise vanish
  // from every view. Fall back to treating it as unassigned, so it stays
  // visible and can be put somewhere else.
  for (const [closingId, loads] of attached) {
    if (!closingIds.has(closingId)) {
      unassigned.push(...loads);
      attached.delete(closingId);
    }
  }

  const byTruck = new Map<string, Weighing[]>();
  for (const w of flow) {
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
        const extra = attached.get(row.id) ?? [];
        if (pending.length > 0 || extra.length > 0) {
          completed.push(build(truck, [...pending, ...extra], row, openIndex));
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

  // Console-made truckloads: whatever was pinned to them, and nothing else.
  // They stay listed even at zero loads, because a ticket or a remisión may
  // already be attached and a silently disappearing document is worse than an
  // empty row the user can see and delete.
  for (const row of manualClosings) {
    completed.push(build(truckOf(row), attached.get(row.id) ?? [], row, 0, true));
  }

  completed.sort((a, b) => (b.emptiedAt ?? '').localeCompare(a.emptiedAt ?? ''));
  open.sort((a, b) => b.kg - a.kg);
  unassigned.sort((a, b) => byTime(b, a));

  return { completed, open, unassigned };
}

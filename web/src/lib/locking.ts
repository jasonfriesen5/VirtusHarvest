import type { Remision, Weighing } from './types';
import { buildTruckloads } from './truckloads';
import type { TruckloadOptions } from './truckloads';
import { remisionLocked } from './remisionWorkflow';

/**
 * Loads sent for review, including unresolved delivery, may no longer change
 * through the web console. Phone and database enforcement are separate.
 *
 * A remisión is a legal declaration of what left the field, and Fenex has no
 * way to amend one. If a load could still be edited afterwards, the app's own
 * records would quietly disagree with the document the driver is carrying —
 * and the document is the version that counts.
 *
 * The lock is computed from the data rather than stored on each row, so it
 * cannot fall out of step with which documents actually exist.
 */
export function lockedWeighingIds(
  weighings: Weighing[],
  remisiones: Remision[],
  // The same grouping the page shows, so a load moved into a filed truckload
  // by hand is locked too, and one moved out stops being locked.
  options: TruckloadOptions = {},
): Set<string> {
  const issuedClosings = new Set(
    remisiones
      .filter(remisionLocked)
      .map((r) => r.closing_weighing_id),
  );
  if (issuedClosings.size === 0) return new Set();

  const locked = new Set<string>();
  const { completed } = buildTruckloads(weighings, options);

  for (const truckload of completed) {
    const closingId = truckload.closedBy?.id;
    if (!closingId || !issuedClosings.has(closingId)) continue;
    // The empty-truck row is locked too: it carries the destination that the
    // document names, and moving it would re-bundle the whole truckload.
    locked.add(closingId);
    for (const load of truckload.loads) locked.add(load.id);
  }

  return locked;
}

export const LOCK_REASON =
  'This truckload is locked because its remisión has been sent or is awaiting delivery confirmation. ' +
  'Its transactions must match the details being reviewed in Fenex.';

/**
 * Truckloads whose remisión has been filed. Their membership is frozen: no
 * load may be added or removed, for the same reason the loads themselves are
 * locked.
 */
export function lockedClosingIds(remisiones: Remision[]): Set<string> {
  return new Set(
    remisiones
      .filter(remisionLocked)
      .map((r) => r.closing_weighing_id),
  );
}

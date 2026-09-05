/**
 * Ids are generated the same way the app generates them
 * (`src/js/02-storage.js`): client-side, so a record exists before it syncs,
 * and text rather than uuid because every vf_* primary key is text. Keeping
 * the format identical means a row written from this console is
 * indistinguishable from one written on the tablet.
 */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

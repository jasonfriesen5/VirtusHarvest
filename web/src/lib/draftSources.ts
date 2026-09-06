import { isFenexRequest, normalise } from './fenexPayload';
import type { FenexItem, FenexRemission, FenexRequest } from './fenexPayload';

export type StoredFenexDraft = FenexRequest & { _virtusSourceSnapshot?: FenexRequest };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Metadata stays in Supabase only; requestFromStored returns sendable JSON. */
export function requestFromStored(value: unknown): FenexRequest | null {
  if (!isFenexRequest(value)) return null;
  return normalise(value);
}

export function sourceFromStored(value: unknown): FenexRequest | null {
  if (!isFenexRequest(value)) return null;
  const source = (value as StoredFenexDraft)._virtusSourceSnapshot;
  return isFenexRequest(source) ? normalise(source) : null;
}

export function storeDraft(request: FenexRequest, source: FenexRequest): StoredFenexDraft {
  return { ...normalise(request), _virtusSourceSnapshot: normalise(source) };
}

export function sourcesChanged(value: unknown, fresh: FenexRequest): boolean {
  const old = sourceFromStored(value);
  return old ? !same(old, normalise(fresh)) : false;
}

function mergeRecord<T extends Record<string, unknown>>(saved: T, old: T, fresh: T): T {
  const next = { ...saved };
  for (const key of Object.keys(fresh) as (keyof T)[]) {
    // Only replace values the operator left equal to the old prefill.
    if (same(saved[key], old[key])) next[key] = fresh[key];
  }
  return next;
}

export function refreshDraftSources(
  saved: FenexRequest,
  oldSource: FenexRequest,
  freshSource: FenexRequest,
): FenexRequest {
  const items = saved.items.length === oldSource.items.length && oldSource.items.length === freshSource.items.length
    ? saved.items.map((item, index) => mergeRecord(
        item as FenexItem & Record<string, unknown>,
        oldSource.items[index] as FenexItem & Record<string, unknown>,
        freshSource.items[index] as FenexItem & Record<string, unknown>,
      ) as FenexItem)
    : (same(saved.items, oldSource.items) ? freshSource.items : saved.items);
  return normalise({
    idempotencyKey: saved.idempotencyKey,
    remission: mergeRecord(
      saved.remission as FenexRemission & Record<string, unknown>,
      oldSource.remission as FenexRemission & Record<string, unknown>,
      freshSource.remission as FenexRemission & Record<string, unknown>,
    ) as FenexRemission,
    items,
  });
}

import { supabase } from './supabase';
import { FenexError, sendDraftForApproval } from './fenexClient';
import type { FenexRequest } from './fenexPayload';

const STORAGE_KEY = 'vh_web_remision_outbox_v1';
export const REMISION_OUTBOX_EVENT = 'virtus-remision-outbox-change';

export interface QueuedRemision {
  closingId: string;
  userId: string;
  issuerId: string;
  issuerName: string | null;
  payload: FenexRequest;
  queuedAt: string;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
}

interface FlushResult {
  changed: boolean;
  permanentError: string | null;
}

let flushing = false;

function read(): Record<string, QueuedRemision> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
    return value && typeof value === 'object' ? value as Record<string, QueuedRemision> : {};
  } catch {
    return {};
  }
}

function write(entries: Record<string, QueuedRemision>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(REMISION_OUTBOX_EVENT));
}

export function queuedRemision(userId: string, closingId: string): QueuedRemision | null {
  const entry = read()[closingId];
  return entry?.userId === userId ? entry : null;
}

export function queueRemision(
  entry: Omit<QueuedRemision, 'queuedAt' | 'attempts' | 'nextAttemptAt' | 'lastError'>,
): QueuedRemision {
  const entries = read();
  const previous = entries[entry.closingId];
  const queued: QueuedRemision = {
    ...entry,
    queuedAt: previous?.queuedAt ?? new Date().toISOString(),
    attempts: previous?.attempts ?? 0,
    nextAttemptAt: 0,
    lastError: null,
  };
  entries[entry.closingId] = queued;
  write(entries);
  return queued;
}

function retryLater(entries: Record<string, QueuedRemision>, entry: QueuedRemision, message: string) {
  const attempts = entry.attempts + 1;
  entries[entry.closingId] = {
    ...entry,
    attempts,
    lastError: message,
    // Exponential backoff, capped at five minutes. The browser `online` event
    // bypasses this delay so restored field connectivity is used immediately.
    nextAttemptAt: Date.now() + Math.min(5 * 60_000, 5_000 * 2 ** Math.min(attempts, 6)),
  };
}

function networkLike(error: unknown): boolean {
  if (!navigator.onLine) return true;
  if (error instanceof FenexError) return error.retryable;
  const message = error instanceof Error ? error.message : String(error);
  return /fetch|network|offline|timeout|load failed|connection/i.test(message);
}

/**
 * Delivers queued requests serially. The payload (including idempotencyKey) is
 * never rebuilt during retries, so an uncertain response cannot create a
 * second fiscal draft in Fenex.
 */
export async function flushQueuedRemisions(
  userId: string,
  onlyClosingId?: string,
  force = false,
): Promise<FlushResult> {
  if (flushing || !navigator.onLine) return { changed: false, permanentError: null };
  flushing = true;
  let changed = false;
  let permanentError: string | null = null;
  const entries = read();

  try {
    for (const entry of Object.values(entries)) {
      if (entry.userId !== userId || (onlyClosingId && entry.closingId !== onlyClosingId)) continue;
      if (!force && entry.nextAttemptAt > Date.now()) continue;

      try {
        const { error: saveError } = await supabase.from('ht_remisiones').upsert({
          closing_weighing_id: entry.closingId,
          user_id: entry.userId,
          status: 'sending',
          request_payload: entry.payload,
          response_payload: null,
          issuer_id: entry.issuerId,
          issuer_name: entry.issuerName,
          fenex_status: null,
          error_message: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'closing_weighing_id' });
        if (saveError) throw new Error(saveError.message);

        const result = await sendDraftForApproval(entry.payload, entry.issuerId);
        const { error: resultError } = await supabase.from('ht_remisiones').update({
          fenex_remission_id: result.id,
          fenex_status: result.status,
          response_payload: result,
          error_message: null,
          updated_at: new Date().toISOString(),
        }).eq('closing_weighing_id', entry.closingId).eq('user_id', entry.userId);
        if (resultError) throw new Error(resultError.message);

        delete entries[entry.closingId];
        changed = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (networkLike(error)) {
          retryLater(entries, entry, message);
          continue;
        }

        // Validation/auth/permission failures need a person, not an infinite
        // retry loop. Preserve the reason on the cloud row and stop retrying.
        await supabase.from('ht_remisiones').update({
          error_message: message,
          updated_at: new Date().toISOString(),
        }).eq('closing_weighing_id', entry.closingId).eq('user_id', entry.userId);
        delete entries[entry.closingId];
        permanentError = message;
        changed = true;
      }
    }
  } finally {
    write(entries);
    flushing = false;
  }

  return { changed, permanentError };
}

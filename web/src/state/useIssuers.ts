import { useCallback, useEffect, useState } from 'react';
import { fenexIssuers } from '../lib/fenexClient';
import type { Issuer } from '../lib/fenexClient';

/**
 * The issuers an account can file a remisión under.
 *
 * Not part of DataProvider, because issuers are not a table this app may read
 * directly: the row carries the Fenex token, and the whole point of the Edge
 * Function is that the token never reaches a browser. So they come back from
 * `fenex/issuers`, which returns every column except that one.
 *
 * Cached at module level rather than fetched per component — the settings page
 * and every open truckload panel all want the same short list, and issuers
 * change perhaps twice a year.
 */

let cache: Issuer[] | null = null;
let inflight: Promise<Issuer[]> | null = null;
const subscribers = new Set<() => void>();

function publish(next: Issuer[]): void {
  cache = next;
  for (const notify of subscribers) notify();
}

/** Replaces the cache after a write, so every mounted picker updates at once. */
export function setIssuers(next: Issuer[]): void {
  publish(next);
}

async function load(force: boolean): Promise<Issuer[]> {
  if (cache && !force) return cache;
  // A single in-flight request is shared: several panels mounting together
  // would otherwise each call the Edge Function for the same list.
  if (!inflight || force) {
    inflight = fenexIssuers()
      .then((rows) => {
        publish(rows);
        return rows;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useIssuers(): {
  issuers: Issuer[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Pre-selected on a new document; falls back to the only one there is. */
  defaultIssuer: Issuer | null;
} {
  const [, force] = useState(0);
  const [loading, setLoading] = useState(cache == null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const notify = () => force((n) => n + 1);
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the issuers.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (cache != null) {
      setLoading(false);
      return;
    }
    load(false)
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the issuers.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const issuers = cache ?? [];
  return {
    issuers,
    loading,
    error,
    reload,
    defaultIssuer: issuers.find((i) => i.is_default) ?? issuers[0] ?? null,
  };
}

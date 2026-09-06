import { useCallback, useEffect, useState } from 'react';
import { fenexIssuers } from '../lib/fenexClient';
import type { Issuer } from '../lib/fenexClient';
import { useAuth } from './AuthProvider';

// Share requests, not account data. An old session response must never populate
// a newly signed-in user's picker.
const inflight = new Map<string, Promise<Issuer[]>>();
function fetchIssuers(userId: string) {
  let pending = inflight.get(userId);
  if (!pending) {
    pending = fenexIssuers().finally(() => inflight.delete(userId));
    inflight.set(userId, pending);
  }
  return pending;
}

export function useIssuers() {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<{ userId?: string; issuers: Issuer[]; error: string | null }>({ issuers: [], error: null });
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const issuers = await fetchIssuers(userId);
      setState({ userId, issuers, error: null });
    } catch (error) {
      // Fail closed: stale approval must not remain selectable.
      setState({ userId, issuers: [], error: error instanceof Error ? error.message : 'Could not load connections.' });
    } finally {
      setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => { if (!document.hidden) void reload(); }, 15000);
    return () => clearInterval(timer);
  }, [reload]);
  const issuers = state.userId === userId && userId ? state.issuers : [];
  const connected = issuers.filter(i => i.connection_status === 'APPROVED');
  return {
    issuers, loading, reload,
    error: state.userId === userId ? state.error : null,
    defaultIssuer: connected.find(i => i.is_default) ?? connected[0] ?? null,
  };
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import type {
  Boundary,
  Cart,
  Crop,
  Destination,
  DestinationCustomer,
  Emisor,
  Farm,
  Field,
  LoadAssignment,
  Operator,
  Season,
  Remision,
  Route,
  Truck,
  TruckloadTicket,
  Weighing,
} from '../lib/types';

/**
 * The whole account is a few hundred rows across ten small tables, so it is
 * loaded once into memory and every page filters it client-side. That keeps
 * the dashboard, records table, map and live view perfectly consistent with
 * each other, and makes cross-cutting filters (season, date range) instant.
 * If an account ever grows past a few thousand weighings, the fix is to move
 * `weighings` to a paged/server-filtered query — the rest can stay as-is.
 */

export type LiveStatus = 'connecting' | 'live' | 'polling';

interface DataValue {
  weighings: Weighing[];
  farms: Farm[];
  fields: Field[];
  crops: Crop[];
  trucks: Truck[];
  carts: Cart[];
  operators: Operator[];
  seasons: Season[];
  destinations: Destination[];
  boundaries: Boundary[];
  tickets: TruckloadTicket[];
  assignments: LoadAssignment[];
  remisiones: Remision[];
  routes: Route[];
  destinationCustomers: DestinationCustomer[];
  emisor: Emisor | null;
  loading: boolean;
  error: string | null;
  /** Whether the live feed is on Realtime or has fallen back to polling. */
  liveStatus: LiveStatus;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataValue | null>(null);

const EMPTY: Omit<DataValue, 'loading' | 'error' | 'refresh' | 'liveStatus'> = {
  weighings: [],
  farms: [],
  fields: [],
  crops: [],
  trucks: [],
  carts: [],
  operators: [],
  seasons: [],
  destinations: [],
  boundaries: [],
  tickets: [],
  assignments: [],
  remisiones: [],
  routes: [],
  destinationCustomers: [],
  emisor: null,
};

const POLL_MS = 30_000;

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting');

  // Guards against a slow first fetch resolving after a faster later one and
  // overwriting fresher data with stale rows.
  const fetchSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setData(EMPTY);
      setLoading(false);
      return;
    }
    const seq = ++fetchSeq.current;

    // Every table is scoped by user_id in RLS, so these filters mirror what
    // the database would enforce anyway — they just avoid over-fetching.
    const uid = user.id;
    const [
      weighings,
      farms,
      fields,
      crops,
      trucks,
      carts,
      operators,
      seasons,
      destinations,
      boundaries,
      tickets,
      assignments,
      remisiones,
      routes,
      destinationCustomers,
      emisor,
    ] = await Promise.all([
      supabase.from('weighings').select('*').eq('user_id', uid).order('timestamp', { ascending: false }),
      supabase.from('ht_farms').select('*').eq('user_id', uid).order('name'),
      supabase.from('ht_fields').select('*').eq('user_id', uid).order('name'),
      supabase.from('ht_crops').select('*').eq('user_id', uid).order('name'),
      supabase.from('ht_trucks').select('*').eq('user_id', uid).order('name'),
      supabase.from('ht_carts').select('*').eq('user_id', uid).order('name'),
      supabase.from('ht_operators').select('*').eq('user_id', uid).order('name'),
      supabase.from('ht_seasons').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('ht_destinations').select('*').eq('user_id', uid).order('name'),
      supabase.from('ht_boundaries').select('*').eq('user_id', uid),
      supabase.from('ht_truckloads').select('*').eq('user_id', uid),
      supabase.from('ht_load_assignments').select('*').eq('user_id', uid),
      supabase.from('ht_remisiones').select('*').eq('user_id', uid),
      supabase.from('ht_routes').select('*').eq('user_id', uid),
      supabase.from('ht_destination_customers').select('*').eq('user_id', uid),
      supabase.from('ht_emisor').select('*').eq('user_id', uid).maybeSingle(),
    ]);

    if (seq !== fetchSeq.current) return;

    const failed = [
      weighings,
      farms,
      fields,
      crops,
      trucks,
      carts,
      operators,
      seasons,
      destinations,
      boundaries,
      tickets,
      assignments,
      remisiones,
      routes,
      destinationCustomers,
      emisor,
    ].find((r) => r.error);

    if (failed?.error) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    setError(null);
    setData({
      weighings: (weighings.data ?? []) as Weighing[],
      farms: (farms.data ?? []) as Farm[],
      fields: (fields.data ?? []) as Field[],
      crops: (crops.data ?? []) as Crop[],
      trucks: (trucks.data ?? []) as Truck[],
      carts: (carts.data ?? []) as Cart[],
      operators: (operators.data ?? []) as Operator[],
      seasons: (seasons.data ?? []) as Season[],
      destinations: (destinations.data ?? []) as Destination[],
      boundaries: (boundaries.data ?? []) as Boundary[],
      tickets: (tickets.data ?? []) as TruckloadTicket[],
      assignments: (assignments.data ?? []) as LoadAssignment[],
      remisiones: (remisiones.data ?? []) as Remision[],
      routes: (routes.data ?? []) as Route[],
      destinationCustomers: (destinationCustomers.data ?? []) as DestinationCustomer[],
      emisor: (emisor.data ?? null) as Emisor | null,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // ── Live updates ────────────────────────────────────────────────────────
  // Realtime has to be enabled on `weighings` server-side. If the channel
  // never reaches SUBSCRIBED, fall back to polling so the live view still
  // works rather than silently going stale.
  useEffect(() => {
    if (!user) return;

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (pollTimer) return;
      setLiveStatus('polling');
      pollTimer = setInterval(() => void refresh(), POLL_MS);
    };

    setLiveStatus('connecting');
    const channel = supabase
      .channel('weighings-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'weighings', filter: `user_id=eq.${user.id}` },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setLiveStatus('live');
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          startPolling();
        }
      });

    // Realtime can accept the subscription and simply never deliver rows when
    // the table is not in the publication, so a slow-connect watchdog is not
    // enough on its own — but it does catch the common "never connects" case.
    const watchdog = setTimeout(() => {
      setLiveStatus((s) => {
        if (s === 'connecting') startPolling();
        return s === 'connecting' ? 'polling' : s;
      });
    }, 8000);

    return () => {
      clearTimeout(watchdog);
      if (pollTimer) clearInterval(pollTimer);
      void supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const value = useMemo<DataValue>(
    () => ({ ...data, loading, error, liveStatus, refresh }),
    [data, loading, error, liveStatus, refresh],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}

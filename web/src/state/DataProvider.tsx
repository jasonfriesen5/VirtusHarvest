import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import { usePrefs } from './PrefsProvider';
import { buildIndex } from '../lib/analytics';
import type { FeedIndex, Tables } from '../lib/analytics';
import type {
  BunkScore,
  Cycle,
  FeedDelivery,
  FeedGroup,
  FeedLoad,
  FeedReturn,
  Feeding,
  Ingredient,
  Lot,
  LotGroup,
  Mixer,
  Operator,
  Ration,
  RationItem,
  StockMove,
  WeighIn,
} from '../lib/types';

/**
 * A feedlot account is a few thousand rows across sixteen small tables, so the
 * whole thing is loaded once and every page filters it in memory. That is what
 * keeps the dashboard, the delivery table and the pen pages agreeing with each
 * other — they are all reading the same arrays through the same index.
 *
 * The volume to watch is vf_feed_deliveries: two feedings a day across twenty
 * pens is ~15k rows a year. When that becomes the bottleneck, the fix is to
 * date-bound the deliveries/loads queries server-side; nothing else needs to
 * change.
 */

export type LiveStatus = 'connecting' | 'live' | 'polling';

/**
 * Desktop-owned switches, one row per account (`vf_settings`). The console is
 * the authority; the app pulls them read-only.
 *
 * An absent or unreadable row means ALLOWED, never locked — the app takes the
 * same view, and for the same reason: a failed read that defaulted to locked
 * would strand an operator mid-shift with no way to fix it.
 */
export interface AppSettings {
  allowAppRationEdits: boolean;
  /** False when no row exists yet — the account is on the defaults. */
  stored: boolean;
  updatedAt: string | null;
}

const DEFAULT_SETTINGS: AppSettings = { allowAppRationEdits: true, stored: false, updatedAt: null };

interface Raw {
  cycles: Cycle[];
  lots: Lot[];
  ingredients: Ingredient[];
  rations: Ration[];
  rationItems: RationItem[];
  groups: FeedGroup[];
  lotGroups: LotGroup[];
  mixers: Mixer[];
  operators: Operator[];
  feedings: Feeding[];
  loads: FeedLoad[];
  deliveries: FeedDelivery[];
  returns: FeedReturn[];
  stockMoves: StockMove[];
  weighIns: WeighIn[];
  bunkScores: BunkScore[];
}

interface DataValue extends Raw {
  /** Everything, indexed and already narrowed to the selected cycle. */
  ix: FeedIndex;
  settings: AppSettings;
  loading: boolean;
  error: string | null;
  liveStatus: LiveStatus;
  refresh: () => Promise<void>;
}

const EMPTY: Raw = {
  cycles: [],
  lots: [],
  ingredients: [],
  rations: [],
  rationItems: [],
  groups: [],
  lotGroups: [],
  mixers: [],
  operators: [],
  feedings: [],
  loads: [],
  deliveries: [],
  returns: [],
  stockMoves: [],
  weighIns: [],
  bunkScores: [],
};

const DataContext = createContext<DataValue | null>(null);
const POLL_MS = 30_000;

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { cycleId } = usePrefs();
  const [raw, setRaw] = useState<Raw>(EMPTY);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting');

  // Guards against a slow first fetch resolving after a faster later one and
  // overwriting fresher rows with stale ones.
  const fetchSeq = useRef(0);
  // Consecutive failures, for the retry backoff.
  const failures = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setRaw(EMPTY);
      setLoading(false);
      return;
    }
    const seq = ++fetchSeq.current;
    const uid = user.id;
    const from = (table: string) => supabase.from(table).select('*').eq('user_id', uid);

    const results = await Promise.all([
      from('vf_cycles'),
      from('vf_lots').order('route_order'),
      from('vf_ingredients').order('name'),
      from('vf_rations').order('name'),
      from('vf_ration_items').order('seq'),
      from('vf_feed_groups').order('route_order'),
      from('vf_lot_groups'),
      from('vf_mixers').order('name'),
      from('vf_operators').order('name'),
      from('vf_feedings').order('started_at', { ascending: false }),
      from('vf_feed_loads'),
      from('vf_feed_deliveries').order('at', { ascending: false }),
      from('vf_feed_returns').order('at', { ascending: false }),
      from('vf_stock_moves').order('at', { ascending: false }),
      from('vf_weigh_ins'),
      from('vf_bunk_scores'),
    ]);

    // Fetched apart from the tables above, and deliberately allowed to fail
    // quietly: an account created before vf_settings existed still works, on
    // the defaults.
    try {
      const st = await supabase.from('vf_settings').select('*').eq('user_id', uid).maybeSingle();
      if (seq === fetchSeq.current) {
        setSettings(
          st.data
            ? {
                allowAppRationEdits: st.data.allow_app_ration_edits !== false,
                stored: true,
                updatedAt: st.data.updated_at ?? null,
              }
            : DEFAULT_SETTINGS,
        );
      }
    } catch {
      // Leave the last known value alone rather than falling back to locked.
    }

    if (seq !== fetchSeq.current) return;

    const failed = results.find((r) => r.error);
    if (failed?.error) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    const [
      cycles,
      lots,
      ingredients,
      rations,
      rationItems,
      groups,
      lotGroups,
      mixers,
      operators,
      feedings,
      loads,
      deliveries,
      returns,
      stockMoves,
      weighIns,
      bunkScores,
    ] = results.map((r) => r.data ?? []);

    setError(null);
    setRaw({
      cycles: cycles as Cycle[],
      lots: lots as Lot[],
      ingredients: ingredients as Ingredient[],
      rations: rations as Ration[],
      rationItems: rationItems as RationItem[],
      groups: groups as FeedGroup[],
      lotGroups: lotGroups as LotGroup[],
      mixers: mixers as Mixer[],
      operators: operators as Operator[],
      feedings: feedings as Feeding[],
      loads: loads as FeedLoad[],
      deliveries: deliveries as FeedDelivery[],
      returns: returns as FeedReturn[],
      stockMoves: stockMoves as StockMove[],
      weighIns: weighIns as WeighIn[],
      bunkScores: bunkScores as BunkScore[],
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // A failed load retries on its own, backing off 5s → 15s → 30s. The errors
  // worth designing for here are transient and server-side — a token rejected
  // over a second of clock skew between the node that signs it and the node
  // that checks it, a dropped connection — and sitting on an error screen
  // until somebody thinks to reload is the wrong response to both.
  useEffect(() => {
    if (!error || !user) return;
    const delay = [5000, 15000, 30000][Math.min(failures.current - 1, 2)] ?? 30000;
    const timer = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(timer);
  }, [error, user, refresh]);

  // ── Live updates ─────────────────────────────────────────────────────────
  // Realtime has to be enabled on vf_feedings server-side
  // (`alter publication supabase_realtime add table public.vf_feedings;`).
  // Until it is, the channel never reaches SUBSCRIBED and this falls back to
  // polling, so the today view goes stale-but-refreshing rather than dead.
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
      .channel('vf-feedings-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vf_feedings', filter: `user_id=eq.${user.id}` },
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

  // Cycle scoping. Loads and deliveries carry no cycle of their own — they
  // hang off a feeding — so they are narrowed by the feedings that survive the
  // filter rather than by a column of their own.
  const ix = useMemo<FeedIndex>(() => {
    const feedings = cycleId ? raw.feedings.filter((f) => f.cycle_id === cycleId) : raw.feedings;
    const keep = new Set(feedings.map((f) => f.id));
    const tables: Tables = {
      cycles: raw.cycles,
      lots: cycleId ? raw.lots.filter((l) => l.cycle_id === cycleId) : raw.lots,
      ingredients: raw.ingredients,
      rationItems: raw.rationItems,
      groups: cycleId ? raw.groups.filter((g) => g.cycle_id === cycleId) : raw.groups,
      lotGroups: raw.lotGroups,
      feedings,
      loads: cycleId ? raw.loads.filter((l) => keep.has(l.feeding_id)) : raw.loads,
      deliveries: cycleId ? raw.deliveries.filter((d) => keep.has(d.feeding_id)) : raw.deliveries,
      returns: cycleId ? raw.returns.filter((r) => r.cycle_id === cycleId) : raw.returns,
      stockMoves: raw.stockMoves,
      weighIns: cycleId ? raw.weighIns.filter((w) => w.cycle_id === cycleId) : raw.weighIns,
      bunkScores: cycleId ? raw.bunkScores.filter((b) => b.cycle_id === cycleId) : raw.bunkScores,
    };
    return buildIndex(tables);
  }, [raw, cycleId]);

  const value = useMemo<DataValue>(
    () => ({ ...raw, ix, settings, loading, error, liveStatus, refresh }),
    [raw, ix, settings, loading, error, liveStatus, refresh],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}

/** The currency every money figure on the site is quoted in — whatever the
 *  ingredients say, defaulting to guaraníes. */
export function useCurrency(): string {
  const { ingredients } = useData();
  return ingredients.find((i) => i.currency)?.currency ?? 'PYG';
}

import { useEffect, useMemo, useState } from 'react';
import { useData } from '../state/DataProvider';
import { usePrefs } from '../state/PrefsProvider';
import { Button, Card, CardHeader, EmptyState, ErrorNote, Spinner, Stat, cx } from '../components/ui';
import { formatTime, isSameLocalDay, relativeTime } from '../lib/format';
import { formatWeight } from '../lib/units';
import { filterBySeason, isHarvestLoad, netKg, totalKg } from '../lib/selectors';

export default function Live() {
  const { weighings, loading, error, liveStatus, refresh } = useData();
  const { unit, seasonId } = usePrefs();

  // Relative timestamps ("4 min ago") would freeze without a repaint, since
  // nothing else re-renders this page between incoming rows.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const today = useMemo(() => {
    const now = new Date();
    return filterBySeason(weighings, seasonId).filter((w) => isSameLocalDay(w.timestamp, now));
  }, [weighings, seasonId]);

  const todayLoads = useMemo(() => today.filter(isHarvestLoad), [today]);

  const feed = useMemo(
    () =>
      [...today].sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? '')).slice(0, 40),
    [today],
  );

  const lastHourKg = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return totalKg(
      todayLoads.filter((w) => {
        const t = w.timestamp ? new Date(w.timestamp).getTime() : NaN;
        return !Number.isNaN(t) && t >= cutoff;
      }),
    );
  }, [todayLoads]);

  if (loading) return <Spinner label="Loading today's activity…" />;
  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-5">
      {liveStatus === 'polling' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          Realtime is not available on this project, so this page refreshes every 30 seconds instead.
          Enabling Realtime on the <code className="font-mono">weighings</code> table makes loads appear the moment they sync.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Today" value={formatWeight(totalKg(todayLoads), unit)} hint={`${todayLoads.length} loads`} />
        <Stat label="Last hour" value={formatWeight(lastHourKg, unit)} />
        <Stat
          label="Average load"
          value={todayLoads.length ? formatWeight(totalKg(todayLoads) / todayLoads.length, unit) : '—'}
        />
      </div>

      <Card>
        <CardHeader
          title="Today's loads"
          subtitle="Newest first"
          action={<Button onClick={() => void refresh()}>Refresh</Button>}
        />
        {feed.length === 0 ? (
          <EmptyState title="Nothing recorded today yet" hint="Loads appear here as soon as a device syncs." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {feed.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={cx(
                    'h-2 w-2 shrink-0 rounded-full',
                    w.is_truck_empty ? 'bg-amber-500' : 'bg-brand-500',
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {w.is_truck_empty ? 'Truck emptied' : w.zone || 'No field'}
                    {w.crop && !w.is_truck_empty && (
                      <span className="font-normal text-slate-500 dark:text-slate-400"> · {w.crop}</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {[w.worker, w.buggy, w.delivered_to || w.unload].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatWeight(netKg(w), unit)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400" title={formatTime(w.timestamp)}>
                    {relativeTime(w.timestamp)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

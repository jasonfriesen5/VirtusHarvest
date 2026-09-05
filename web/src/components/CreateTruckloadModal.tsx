import { useMemo, useState } from 'react';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { usePrefs } from '../state/PrefsProvider';
import { Button, ErrorNote, Input, Label, Modal, Select, cx } from './ui';
import { createTruckload } from '../lib/assignments';
import { wetKg } from '../lib/selectors';
import type { Weighing } from '../lib/types';
import { formatWeight } from '../lib/units';
import { formatDateTime } from '../lib/format';

/** One selectable load, with a note saying where it is sitting right now. */
export interface Candidate {
  load: Weighing;
  note: string;
}

/**
 * Converts an ISO timestamp to the value a `datetime-local` input wants, in
 * the browser's own timezone. `toISOString()` would shift the time by the UTC
 * offset and quietly re-date evening loads.
 */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/**
 * Assembles a truckload by hand, for the case the whole feature exists to
 * cover: the grain went to the buyer but nobody pressed "empty truck", so the
 * loads are still sitting on the truck — or in the wrong bundle.
 */
export default function CreateTruckloadModal({
  candidates,
  onClose,
  onCreated,
}: {
  candidates: Candidate[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { user } = useAuth();
  const { trucks, destinations } = useData();
  const { unit, seasonId } = usePrefs();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [truck, setTruck] = useState('');
  const [destination, setDestination] = useState('');
  const [emptiedAt, setEmptiedAt] = useState(() => toLocalInput(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = useMemo(
    () => candidates.filter((c) => selected.has(c.load.id)),
    [candidates, selected],
  );
  const totalKg = useMemo(() => chosen.reduce((sum, c) => sum + wetKg(c.load), 0), [chosen]);

  /**
   * The truck the loads were actually weighed on, when they all agree. It is a
   * default rather than a constraint — the console is where you go to fix a
   * load that was recorded against the wrong truck in the first place.
   */
  const impliedTruck = useMemo(() => {
    const names = new Set(chosen.map((c) => (c.load.buggy ?? '').trim()).filter(Boolean));
    return names.size === 1 ? [...names][0] : '';
  }, [chosen]);

  const effectiveTruck = truck || impliedTruck;

  const truckNames = useMemo(() => {
    const names = new Set(trucks.map((t) => t.name));
    for (const c of candidates) {
      const n = (c.load.buggy ?? '').trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [trucks, candidates]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!user) return;
    if (chosen.length === 0) {
      setError('Pick at least one load to put on the truckload.');
      return;
    }
    if (!effectiveTruck) {
      setError('Choose which truck this load went out on.');
      return;
    }
    const when = new Date(emptiedAt);
    if (Number.isNaN(when.getTime())) {
      setError('Enter a valid date and time for when the truck was emptied.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createTruckload(user.id, {
        truck: effectiveTruck,
        destination,
        emptiedAt: when.toISOString(),
        // Follows the season being viewed, so the new truckload shows up in
        // the same filter as the loads it contains.
        seasonId: seasonId || chosen[0].load.season_id,
        loadIds: chosen.map((c) => c.load.id),
      });
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the truckload.');
      setSaving(false);
    }
  }

  return (
    <Modal title="New truckload" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Bundles loads into a delivery that was never closed off in the field. Only loads
          that are not already in a delivered truckload can be picked — to move one that is,
          remove it from its truckload first.
        </p>

        {error && <ErrorNote message={error} />}

        {candidates.length === 0 ? (
          <p className="rounded-lg border border-slate-200 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Every load is already in a truckload. Remove one from its truckload to make it
            available here.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="w-8 py-1.5 pl-3" />
                  <th className="py-1.5 font-medium">When</th>
                  <th className="py-1.5 font-medium">Field</th>
                  <th className="py-1.5 font-medium">Crop</th>
                  <th className="py-1.5 font-medium">Truck</th>
                  <th className="py-1.5 font-medium">Status</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {candidates.map(({ load, note }) => (
                  <tr
                    key={load.id}
                    onClick={() => toggle(load.id)}
                    className={cx(
                      'cursor-pointer text-slate-700 dark:text-slate-200',
                      selected.has(load.id)
                        ? 'bg-gold-500/15 dark:bg-gold-500/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    )}
                  >
                    <td className="py-1.5 pl-3">
                      <input
                        type="checkbox"
                        checked={selected.has(load.id)}
                        onChange={() => toggle(load.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Include the load from ${formatDateTime(load.timestamp)}`}
                      />
                    </td>
                    <td className="py-1.5 whitespace-nowrap">{formatDateTime(load.timestamp)}</td>
                    <td className="py-1.5">{load.zone || '—'}</td>
                    <td className="py-1.5">{load.crop || '—'}</td>
                    <td className="py-1.5">{load.buggy || '—'}</td>
                    <td className="py-1.5 text-slate-500 dark:text-slate-400">{note}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {formatWeight(wetKg(load), unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Truck</Label>
            <Select value={effectiveTruck} onChange={(e) => setTruck(e.target.value)}>
              <option value="">Choose a truck…</option>
              {truckNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Destination</Label>
            <Select value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="">Not recorded</option>
              {destinations.map((d) => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Emptied at</Label>
            <Input
              type="datetime-local"
              value={emptiedAt}
              onChange={(e) => setEmptiedAt(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {chosen.length} load{chosen.length === 1 ? '' : 's'} ·{' '}
            <strong className="tabular-nums text-slate-900 dark:text-slate-50">
              {formatWeight(totalKg, unit)}
            </strong>{' '}
            <span className="text-xs text-slate-500 dark:text-slate-400">on the road</span>
          </p>
          <div className="flex gap-2">
            <Button onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? 'Creating…' : 'Create truckload'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

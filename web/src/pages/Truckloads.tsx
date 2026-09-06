import { remisionLabels, remisionState } from '../lib/remisionWorkflow';
import { useMemo, useState } from 'react';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { usePrefs } from '../state/PrefsProvider';
import { supabase } from '../lib/supabase';
import {
  Button,
  Card,
  Input,
  CardHeader,
  EmptyState,
  ErrorNote,
  Label,
  Modal,
  Select,
  Spinner,
  Stat,
  cx,
} from '../components/ui';
import EditRecordModal from '../components/EditRecordModal';
import ErrorBoundary from '../components/ErrorBoundary';
import RemisionPanel from '../components/RemisionPanel';
import CreateTruckloadModal from '../components/CreateTruckloadModal';
import type { Candidate } from '../components/CreateTruckloadModal';
import { buildTruckloads } from '../lib/truckloads';
import { createTruckload, deleteManualTruckload, unassignLoad } from '../lib/assignments';
import { truckloadCropError } from '../lib/truckloadCrop';
import { LOCK_REASON, lockedClosingIds, lockedWeighingIds } from '../lib/locking';
import type { Truckload } from '../lib/truckloads';
import type { Weighing } from '../lib/types';
import { formatWeight, weightValue, toKg, UNIT_LABEL } from '../lib/units';
import { downloadCsv, formatDateTime, relativeTime, toCsv } from '../lib/format';
import { filterBySeason, wetKg } from '../lib/selectors';

export default function Truckloads() {
  const { user } = useAuth();
  const { weighings, trucks, destinations, tickets, assignments, remisiones, loading, error, refresh } = useData();
  const { unit, seasonId } = usePrefs();

  const [truckFilter, setTruckFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingLoad, setEditingLoad] = useState<Weighing | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyLoadId, setBusyLoadId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Truckload | null>(null);
  const [finishing, setFinishing] = useState<Truckload | null>(null);

  /** Ticket weights normalised to kg, keyed by the closing empty-truck row. */
  const ticketKgById = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const t of tickets) {
      map.set(
        t.closing_weighing_id,
        t.ticket_weight == null ? null : toKg(t.ticket_weight, t.ticket_unit),
      );
    }
    return map;
  }, [tickets]);

  /**
   * Saves in the unit currently displayed, recording that unit alongside the
   * number — storing "91780" without knowing whether it meant kg or lb would
   * make the variance meaningless later.
   */
  async function saveTicket(closingId: string, raw: string) {
    if (!user) return;
    const trimmed = raw.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      setActionError('Ticket weight must be a positive number.');
      return;
    }
    setSavingId(closingId);
    setActionError(null);
    // Clearing a ticket writes a null rather than deleting the row: the same
    // row also carries the flag marking a console-made truckload, and dropping
    // it would dissolve the truckload along with the ticket.
    const { error: err } = await supabase.from('ht_truckloads').upsert(
      {
        closing_weighing_id: closingId,
        user_id: user.id,
        ticket_weight: value,
        ticket_unit: unit === 't' ? 'kg' : unit,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'closing_weighing_id' },
    );
    setSavingId(null);
    if (err) {
      setActionError(err.message);
      return;
    }
    await refresh();
  }

  const seasonRows = useMemo(() => filterBySeason(weighings, seasonId), [weighings, seasonId]);

  /**
   * Truckloads whose closing row the console wrote rather than a driver. They
   * take only the loads pinned to them, so the grouping has to know which ones
   * they are before it runs.
   */
  const grouping = useMemo(
    () => ({
      assignments,
      manualClosingIds: new Set(
        tickets.filter((t) => t.manual).map((t) => t.closing_weighing_id),
      ),
    }),
    [assignments, tickets],
  );

  const { completed, open, unassigned } = useMemo(
    () => buildTruckloads(seasonRows, grouping),
    [seasonRows, grouping],
  );

  const locked = useMemo(
    () => lockedWeighingIds(weighings, remisiones, grouping),
    [weighings, remisiones, grouping],
  );

  /** Truckloads that have been filed and may no longer gain or lose loads. */
  const frozenTruckloads = useMemo(() => lockedClosingIds(remisiones), [remisiones]);

  /**
   * What the "new truckload" picker may choose from: loads pulled out of a
   * bundle, plus loads still showing as on a truck. The second group is the
   * common case — the delivery happened, nobody pressed "empty truck".
   */
  const candidates = useMemo<Candidate[]>(() => {
    const list: Candidate[] = unassigned.map((load) => ({ load, note: 'not in a truckload' }));
    for (const t of open) {
      for (const load of t.loads) list.push({ load, note: `still on ${t.truck}` });
    }
    return list;
  }, [unassigned, open]);

  /** Pulls one load out of the truckload it is currently grouped into. */
  async function removeLoad(load: Weighing) {
    if (!user) return;
    setBusyLoadId(load.id);
    setActionError(null);
    try {
      await unassignLoad(user.id, load.id);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not remove the load.');
    }
    setBusyLoadId(null);
  }

  async function removeTruckload(load: Truckload) {
    if (!user || !load.closedBy) return;
    setActionError(null);
    try {
      await deleteManualTruckload(user.id, load.closedBy.id, load.loads);
      setDeleting(null);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not delete the truckload.');
    }
  }

  const shown = useMemo(
    () => (truckFilter ? completed.filter((t) => t.truck === truckFilter) : completed),
    [completed, truckFilter],
  );

  const truckNames = useMemo(() => {
    const names = new Set<string>([...completed, ...open].map((t) => t.truck));
    for (const t of trucks) names.add(t.name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [completed, open, trucks]);

  const totals = useMemo(
    () => ({
      kg: shown.reduce((sum, t) => sum + t.kg, 0),
      loads: shown.reduce((sum, t) => sum + t.loads.length, 0),
      average: shown.length ? shown.reduce((sum, t) => sum + t.kg, 0) / shown.length : 0,
      onTruck: open.reduce((sum, t) => sum + t.kg, 0),
    }),
    [shown, open],
  );

  function exportCsv() {
    const headers = [
      'Emptied at',
      'Truck',
      'Destination',
      'Loads',
      `Field total (${UNIT_LABEL[unit]})`,
      `Ticket (${UNIT_LABEL[unit]})`,
      'Variance %',
      'Crops',
      'Fields',
      'Operators',
      'First load',
      'Last load',
    ];
    const rows = shown.map((t) => [
      t.emptiedAt ?? '',
      t.truck,
      t.destination ?? '',
      t.loads.length,
      weightValue(t.kg, unit),
      (() => {
        const k = ticketKgById.get(t.closedBy?.id ?? '');
        return k == null ? '' : weightValue(k, unit);
      })(),
      (() => {
        const k = ticketKgById.get(t.closedBy?.id ?? '');
        return k == null || t.kg === 0 ? '' : (((k - t.kg) / t.kg) * 100).toFixed(2);
      })(),
      t.crops.join(' / '),
      t.fields.join(' / '),
      t.operators.join(' / '),
      t.firstLoadAt ?? '',
      t.lastLoadAt ?? '',
    ]);
    downloadCsv(
      `virtus-truckloads-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(headers, rows),
    );
  }

  if (loading) return <Spinner label="Building truckloads…" />;
  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-5">
      {actionError && <ErrorNote message={actionError} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Truckloads"
          value={String(shown.length)}
          hint={`${totals.loads} field loads`}
        />
        <Stat label="Total hauled" value={formatWeight(totals.kg, unit)} />
        <Stat label="Average truckload" value={shown.length ? formatWeight(totals.average, unit) : '—'} />
        <Stat
          label="On trucks now"
          value={open.length ? formatWeight(totals.onTruck, unit) : '—'}
          hint={open.length ? `${open.length} truck${open.length === 1 ? '' : 's'} loaded` : 'all empty'}
        />
      </div>

      {open.length > 0 && (
        <Card>
          <CardHeader
            title="On truck now"
            subtitle="Loaded but not yet emptied at a destination"
          />
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {open.map((t) => (
              <TruckloadRow
                key={t.key}
                load={t}
                unit={unit}
                ticketKg={null}
                saving={false}
                onSaveTicket={null}
                onEditLoad={setEditingLoad}
                locked={locked}
                // A truck that has not been emptied has no truckload to be
                // removed from — the loads are simply still on it.
                onRemoveLoad={null}
                busyLoadId={busyLoadId}
                onDelete={null}
                onFinish={() => setFinishing(t)}
                expanded={expanded === t.key}
                onToggle={() => setExpanded(expanded === t.key ? null : t.key)}
              />
            ))}
          </ul>
        </Card>
      )}

      {unassigned.length > 0 && (
        <Card>
          <CardHeader
            title="Loads not in a truckload"
            subtitle="Taken out of a truckload by hand · pick them up in a new truckload"
            action={<Button variant="primary" onClick={() => setCreating(true)}>New truckload</Button>}
          />
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {unassigned.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />
                <span className="min-w-40 flex-1 text-slate-700 dark:text-slate-200">
                  {formatDateTime(w.timestamp)}
                  <span className="text-slate-500 dark:text-slate-400">
                    {w.zone ? ` · ${w.zone}` : ''}
                    {w.crop ? ` · ${w.crop}` : ''}
                    {w.buggy ? ` · ${w.buggy}` : ''}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-slate-900 dark:text-slate-50">
                  {formatWeight(wetKg(w), unit)}
                </span>
                <Button variant="ghost" onClick={() => setEditingLoad(w)}>Edit</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {creating && (
        <CreateTruckloadModal
          candidates={candidates}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await refresh();
          }}
        />
      )}

      {finishing && user && (
        <FinishLoadingModal
          load={finishing}
          destinations={destinations.map((d) => d.name)}
          userId={user.id}
          onClose={() => setFinishing(null)}
          onFinished={async () => {
            setFinishing(null);
            await refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title="Delete this truckload?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Deletes the truckload {deleting.truck}
            {deleting.destination ? ` → ${deleting.destination}` : ''} and its buyer&rsquo;s
            ticket. The {deleting.loads.length} load
            {deleting.loads.length === 1 ? '' : 's'} on it are kept — they move back to
            &ldquo;loads not in a truckload&rdquo;.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => void removeTruckload(deleting)}>
              Delete truckload
            </Button>
          </div>
        </Modal>
      )}

      {editingLoad && (
        <EditRecordModal
          record={editingLoad}
          onClose={() => setEditingLoad(null)}
          onSaved={async () => {
            setEditingLoad(null);
            // Truckloads are derived, so a corrected weight or crop reshapes
            // the bundle it belongs to as soon as the data comes back.
            await refresh();
          }}
        />
      )}

      <Card>
        <CardHeader
          title="Completed truckloads"
          subtitle="Finished loading or closed by an empty-truck event · scale weight, not dry"
          action={
            <div className="flex items-end gap-2">
              <div className="w-44">
                <Label>Truck</Label>
                <Select value={truckFilter} onChange={(e) => setTruckFilter(e.target.value)}>
                  <option value="">All trucks</option>
                  {truckNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              </div>
              <Button onClick={() => setCreating(true)}>New truckload</Button>
              <Button variant="primary" onClick={exportCsv} disabled={shown.length === 0}>
                Export CSV
              </Button>
            </div>
          }
        />

        {shown.length === 0 ? (
          <EmptyState
            title="No completed truckloads"
            hint="A truckload appears once a truck is emptied at a destination in the app."
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map((t) => (
              <TruckloadRow
                key={t.key}
                load={t}
                unit={unit}
                ticketKg={ticketKgById.get(t.closedBy?.id ?? '') ?? null}
                saving={savingId === t.closedBy?.id}
                onSaveTicket={(raw) => void saveTicket(t.closedBy!.id, raw)}
                onEditLoad={setEditingLoad}
                locked={locked}
                onRemoveLoad={
                  frozenTruckloads.has(t.closedBy?.id ?? '') ? null : (w) => void removeLoad(w)
                }
                busyLoadId={busyLoadId}
                onDelete={
                  t.manual && !frozenTruckloads.has(t.closedBy?.id ?? '')
                    ? () => setDeleting(t)
                    : null
                }
                onFinish={null}
                expanded={expanded === t.key}
                onToggle={() => setExpanded(expanded === t.key ? null : t.key)}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TruckloadRow({
  load,
  unit,
  ticketKg,
  saving,
  onSaveTicket,
  onEditLoad,
  locked,
  onRemoveLoad,
  busyLoadId,
  onDelete,
  onFinish,
  expanded,
  onToggle,
}: {
  load: Truckload;
  unit: 'kg' | 'lb' | 't';
  onEditLoad: (w: Weighing) => void;
  locked: Set<string>;
  /** Null when the truckload's membership is fixed — filed, or still loading. */
  onRemoveLoad: ((w: Weighing) => void) | null;
  busyLoadId: string | null;
  /** Only console-made truckloads can be deleted; a driver's cannot. */
  onDelete: (() => void) | null;
  /** Visible action for the currently open bundle. */
  onFinish: (() => void) | null;
  /** Buyer's weight in kg, or null when no ticket has been entered. */
  ticketKg: number | null;
  saving: boolean;
  /** Null for still-loaded trucks — grain that hasn't been delivered has no ticket. */
  onSaveTicket: ((raw: string) => void) | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { remisiones, emisor } = useData();
  const remission = remisiones.find(r => r.closing_weighing_id === load.closedBy?.id);
  const isOpen = load.closedBy === null;
  const variance = ticketKg != null && load.kg > 0 ? ((ticketKg - load.kg) / load.kg) * 100 : null;

  return (
    <li>
      <div className="flex items-stretch">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40"
      >
        <span
          className={cx('h-2 w-2 shrink-0 rounded-full', isOpen ? 'bg-amber-500' : 'bg-brand-500')}
          aria-hidden
        />

        <div className="min-w-48 flex-1">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {load.truck}
            {load.destination && (
              <span className="font-normal text-slate-500 dark:text-slate-400">
                {' '}→ {load.destination}
              </span>
            )}
            {isOpen && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                still loaded
              </span>
            )}
            {emisor?.remision_enabled && remission && <span className="ml-2 text-xs text-amber-700">{remisionLabels[remisionState(remission)]}</span>}
            {load.manual && (
              <span
                title="Assembled in the console, not closed off in the field."
                className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200"
              >
                added here
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {load.loads.length} load{load.loads.length === 1 ? '' : 's'}
            {load.crops.length > 0 && ` · ${load.crops.join(', ')}`}
            {load.fields.length > 0 && ` · ${load.fields.join(', ')}`}
          </p>
          {truckloadCropError(load.loads) && <p className="mt-1 text-xs text-red-600">{truckloadCropError(load.loads)}</p>}
        </div>

        <div className="shrink-0 text-right">
          <p className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-50">
            {formatWeight(load.kg, unit)}
          </p>
          {variance != null ? (
            <p
              className={cx(
                'text-xs font-medium tabular-nums',
                Math.abs(variance) < 1
                  ? 'text-slate-500 dark:text-slate-400'
                  : variance < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400',
              )}
              title={`Ticket ${formatWeight(ticketKg as number, unit)} vs field scale ${formatWeight(load.kg, unit)}`}
            >
              ticket {variance > 0 ? '+' : ''}
              {variance.toFixed(1)}%
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isOpen
                ? `last load ${relativeTime(load.lastLoadAt)}`
                : load.finishedLoading
                  ? `finished ${relativeTime(load.emptiedAt)}`
                  : `emptied ${relativeTime(load.emptiedAt)}`}
            </p>
          )}
        </div>

        <span aria-hidden className="shrink-0 text-xs text-slate-400">
          {expanded ? '▲' : '▼'}
        </span>
      </button>
      {onFinish && (
        <div className="flex items-center pr-4">
          <Button variant="primary" onClick={onFinish}>Finish loading</Button>
        </div>
      )}
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/40">
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-1 font-medium">When</th>
                <th className="py-1 font-medium">Field</th>
                <th className="py-1 font-medium">Crop</th>
                <th className="py-1 font-medium">Operator</th>
                <th className="py-1 text-right font-medium">Weight</th>
                <th className="py-1 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {load.loads.map((w) => (
                <tr key={w.id} className="text-slate-700 dark:text-slate-200">
                  <td className="py-1 whitespace-nowrap">{formatDateTime(w.timestamp)}</td>
                  <td className="py-1">{w.zone || '—'}</td>
                  <td className="py-1">{w.crop || '—'}</td>
                  <td className="py-1">{w.worker || '—'}</td>
                  <td className="py-1 text-right tabular-nums">{formatWeight(wetKg(w), unit)}</td>
                  <td className="py-1 text-right whitespace-nowrap">
                    {locked.has(w.id) ? (
                      <span title={LOCK_REASON} className="px-1.5 text-xs text-slate-400" aria-label="Filed">
                        filed
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => onEditLoad(w)}
                          className="rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                        >
                          Edit
                        </button>
                        {onRemoveLoad && (
                          <button
                            onClick={() => onRemoveLoad(w)}
                            disabled={busyLoadId === w.id}
                            title="Take this load off the truckload. It becomes available for a new one."
                            className="ml-1 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-red-100 hover:text-red-700 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-red-900/40 dark:hover:text-red-300"
                          >
                            {busyLoadId === w.id ? 'Removing…' : 'Remove'}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {load.loads.length === 0 && (
            <p className="py-2 text-xs text-slate-500 dark:text-slate-400">
              No loads on this truckload. Add some by removing them from wherever they sit
              now and building a new truckload, or delete this one.
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {load.emptiedAt ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {load.finishedLoading ? 'Loading finished' : 'Truck emptied'} {formatDateTime(load.emptiedAt)}
                {load.destination ? ` at ${load.destination}` : ''}.
              </p>
            ) : (
              <span />
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/40"
              >
                Delete truckload
              </button>
            )}
          </div>

          <ErrorBoundary label="The remisión section">
            <RemisionPanel load={load} />
          </ErrorBoundary>

          {onSaveTicket && (
            <TicketEntry
              unit={unit}
              fieldKg={load.kg}
              ticketKg={ticketKg}
              saving={saving}
              onSave={onSaveTicket}
            />
          )}
        </div>
      )}
    </li>
  );
}

function localDateTimeValue(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function FinishLoadingModal({
  load,
  destinations,
  userId,
  onClose,
  onFinished,
}: {
  load: Truckload;
  destinations: string[];
  userId: string;
  onClose: () => void;
  onFinished: () => Promise<void>;
}) {
  const { unit } = usePrefs();
  const [destination, setDestination] = useState('');
  const [finishedAt, setFinishedAt] = useState(() => localDateTimeValue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    if (!destination) { setError('Choose the destination before finishing the truckload.'); return; }
    const when = new Date(finishedAt);
    if (Number.isNaN(when.getTime())) { setError('Enter a valid completion time.'); return; }
    const cropError = truckloadCropError(load.loads);
    if (cropError) { setError(cropError); return; }
    setSaving(true);
    setError(null);
    try {
      await createTruckload(userId, {
        truck: load.truck,
        destination,
        emptiedAt: when.toISOString(),
        seasonId: load.loads[0]?.season_id ?? null,
        loadIds: load.loads.map((row) => row.id),
        reason: 'finished-loading',
      });
      await onFinished();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not finish this truckload.');
      setSaving(false);
    }
  }

  return (
    <Modal title="Finish loading" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          <p className="font-medium text-slate-900 dark:text-slate-100">{load.truck}</p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            {load.loads.length} transaction{load.loads.length === 1 ? '' : 's'} · {load.crops.join(', ')} ·{' '}
            <strong>{formatWeight(load.kg, unit)}</strong>
          </p>
        </div>
        {error && <ErrorNote message={error} />}
        <div>
          <Label>Destination</Label>
          <Select value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="">Choose a destination…</option>
            {[...new Set(destinations)].sort((a, b) => a.localeCompare(b)).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Loading completed at</Label>
          <Input type="datetime-local" value={finishedAt} onChange={(e) => setFinishedAt(e.target.value)} />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Confirming closes these transactions as one truckload. New transactions will start the next load.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" disabled={saving || !destination} onClick={() => void finish()}>
            {saving ? 'Finishing…' : 'Confirm finished'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The buyer's scale weight for one delivered truckload. Entered in whatever
 * unit the header is showing; the unit is stored with the number so a later
 * switch to lb doesn't silently reinterpret it.
 */
function TicketEntry({
  unit,
  fieldKg,
  ticketKg,
  saving,
  onSave,
}: {
  unit: 'kg' | 'lb' | 't';
  fieldKg: number;
  ticketKg: number | null;
  saving: boolean;
  onSave: (raw: string) => void;
}) {
  const [draft, setDraft] = useState(
    ticketKg == null ? '' : String(weightValue(ticketKg, unit)),
  );
  const dirty = draft.trim() !== (ticketKg == null ? '' : String(weightValue(ticketKg, unit)));
  const difference = ticketKg == null ? null : ticketKg - fieldKg;

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <div className="w-40">
        <Label>Buyer&rsquo;s ticket ({UNIT_LABEL[unit]})</Label>
        <Input
          type="number"
          step="0.1"
          min="0"
          value={draft}
          placeholder="not entered"
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>
      <Button
        variant={dirty ? 'primary' : 'secondary'}
        disabled={saving || !dirty}
        onClick={() => onSave(draft)}
      >
        {saving ? 'Saving…' : draft.trim() === '' && ticketKg != null ? 'Clear ticket' : 'Save ticket'}
      </Button>
      {difference != null && (
        <p className="pb-1.5 text-xs text-slate-500 dark:text-slate-400">
          {difference >= 0 ? 'Over' : 'Short'} by{' '}
          <strong className="text-slate-700 dark:text-slate-200">
            {formatWeight(Math.abs(difference), unit)}
          </strong>{' '}
          against the field scale.
        </p>
      )}
    </div>
  );
}

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
  Select,
  Spinner,
  Stat,
  cx,
} from '../components/ui';
import RemisionPanel from '../components/RemisionPanel';
import { buildTruckloads } from '../lib/truckloads';
import type { Truckload } from '../lib/truckloads';
import { formatWeight, weightValue, toKg, UNIT_LABEL } from '../lib/units';
import { downloadCsv, formatDateTime, relativeTime, toCsv } from '../lib/format';
import { filterBySeason, netKg } from '../lib/selectors';

export default function Truckloads() {
  const { user } = useAuth();
  const { weighings, trucks, tickets, loading, error, refresh } = useData();
  const { unit, seasonId } = usePrefs();

  const [truckFilter, setTruckFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    const { error: err } =
      value == null
        ? await supabase
            .from('ht_truckloads')
            .delete()
            .eq('closing_weighing_id', closingId)
            .eq('user_id', user.id)
        : await supabase.from('ht_truckloads').upsert(
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

  const { completed, open } = useMemo(() => buildTruckloads(seasonRows), [seasonRows]);

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
                expanded={expanded === t.key}
                onToggle={() => setExpanded(expanded === t.key ? null : t.key)}
              />
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Delivered truckloads"
          subtitle="Every load bundled between one empty-truck and the next"
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
  expanded,
  onToggle,
}: {
  load: Truckload;
  unit: 'kg' | 'lb' | 't';
  /** Buyer's weight in kg, or null when no ticket has been entered. */
  ticketKg: number | null;
  saving: boolean;
  /** Null for still-loaded trucks — grain that hasn't been delivered has no ticket. */
  onSaveTicket: ((raw: string) => void) | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isOpen = load.closedBy === null;
  const variance = ticketKg != null && load.kg > 0 ? ((ticketKg - load.kg) / load.kg) * 100 : null;

  return (
    <li>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40"
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
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {load.loads.length} load{load.loads.length === 1 ? '' : 's'}
            {load.crops.length > 0 && ` · ${load.crops.join(', ')}`}
            {load.fields.length > 0 && ` · ${load.fields.join(', ')}`}
          </p>
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
                : `emptied ${relativeTime(load.emptiedAt)}`}
            </p>
          )}
        </div>

        <span aria-hidden className="shrink-0 text-xs text-slate-400">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

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
              </tr>
            </thead>
            <tbody>
              {load.loads.map((w) => (
                <tr key={w.id} className="text-slate-700 dark:text-slate-200">
                  <td className="py-1 whitespace-nowrap">{formatDateTime(w.timestamp)}</td>
                  <td className="py-1">{w.zone || '—'}</td>
                  <td className="py-1">{w.crop || '—'}</td>
                  <td className="py-1">{w.worker || '—'}</td>
                  <td className="py-1 text-right tabular-nums">{formatWeight(netKg(w), unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {load.emptiedAt && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Truck emptied {formatDateTime(load.emptiedAt)}
              {load.destination ? ` at ${load.destination}` : ''}.
            </p>
          )}

          <RemisionPanel load={load} />

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

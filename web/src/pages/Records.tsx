import { useMemo, useState } from 'react';
import { useData } from '../state/DataProvider';
import { usePrefs } from '../state/PrefsProvider';
import { supabase } from '../lib/supabase';
import type { Weighing } from '../lib/types';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  Modal,
  Select,
  Spinner,
  cx,
} from '../components/ui';
import { downloadCsv, formatDateTime, toCsv } from '../lib/format';
import { formatWeight, weightValue, UNIT_LABEL } from '../lib/units';
import { distinct, filterBySeason, netKg, totalKg, wetKg } from '../lib/selectors';
import { calcDryWeight } from '../lib/moisture';
import { fieldLabels } from '../lib/fields';

type SortKey = 'timestamp' | 'weight' | 'zone' | 'crop' | 'worker' | 'buggy' | 'unload';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

export default function Records() {
  const { weighings, crops, fields, operators, trucks, loading, error, refresh } = useData();
  const { unit, seasonId } = usePrefs();

  const [search, setSearch] = useState('');
  const [fCrop, setFCrop] = useState('');
  const [fField, setFField] = useState('');
  const [fWorker, setFWorker] = useState('');
  const [fTruck, setFTruck] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [includeEmpties, setIncludeEmpties] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const [editing, setEditing] = useState<Weighing | null>(null);
  const [deleting, setDeleting] = useState<Weighing | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const seasonRows = useMemo(() => filterBySeason(weighings, seasonId), [weighings, seasonId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Date inputs are local calendar days; widen `to` to the end of that day
    // so a range of 5th–5th includes everything recorded on the 5th.
    const from = fFrom ? new Date(`${fFrom}T00:00:00`).getTime() : null;
    const to = fTo ? new Date(`${fTo}T23:59:59.999`).getTime() : null;

    return seasonRows.filter((w) => {
      if (!includeEmpties && w.is_truck_empty) return false;
      if (fCrop && w.crop !== fCrop) return false;
      if (fField && w.zone !== fField) return false;
      if (fWorker && w.worker !== fWorker) return false;
      if (fTruck && w.buggy !== fTruck) return false;

      if (from != null || to != null) {
        const t = w.timestamp ? new Date(w.timestamp).getTime() : NaN;
        if (Number.isNaN(t)) return false;
        if (from != null && t < from) return false;
        if (to != null && t > to) return false;
      }

      if (q) {
        const haystack = [w.worker, w.farm, w.buggy, w.crop, w.zone, w.unload, w.delivered_to, w.notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [seasonRows, search, fCrop, fField, fWorker, fTruck, fFrom, fTo, includeEmpties]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'weight') return (netKg(a) - netKg(b)) * dir;
      if (sortKey === 'timestamp') return ((a.timestamp ?? '') < (b.timestamp ?? '') ? -1 : 1) * dir;
      return ((a[sortKey] ?? '').localeCompare(b[sortKey] ?? '')) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  /**
   * Quick-access sort presets. The column headers stay the source of truth —
   * this select just reads and writes the same sortKey/sortDir pair, so the
   * two controls can never disagree.
   */
  const SORT_PRESETS: { value: string; label: string }[] = [
    { value: 'timestamp:desc', label: 'Newest first' },
    { value: 'timestamp:asc', label: 'Oldest first' },
    { value: 'zone:asc', label: 'Field A–Z' },
    { value: 'zone:desc', label: 'Field Z–A' },
    { value: 'crop:asc', label: 'Crop A–Z' },
    { value: 'worker:asc', label: 'Operator A–Z' },
    { value: 'weight:desc', label: 'Heaviest first' },
    { value: 'weight:asc', label: 'Lightest first' },
  ];

  const sortValue = `${sortKey}:${sortDir}`;
  const isPreset = SORT_PRESETS.some((p) => p.value === sortValue);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'timestamp' || key === 'weight' ? 'desc' : 'asc');
    }
    setPage(0);
  }

  // Shown on the Filters button so a collapsed panel can never hide the fact
  // that the table is filtered.
  const activeFilterCount =
    [search, fCrop, fField, fWorker, fTruck, fFrom, fTo].filter((v) => v !== '').length +
    (includeEmpties ? 1 : 0);

  function resetFilters() {
    setSearch('');
    setFCrop('');
    setFField('');
    setFWorker('');
    setFTruck('');
    setFFrom('');
    setFTo('');
    setIncludeEmpties(false);
    setPage(0);
  }

  function exportCsv() {
    // Exports what is on screen after filtering, not the whole account —
    // otherwise the file wouldn't match the totals shown above it.
    const headers = [
      'Timestamp',
      'Operator',
      'Farm',
      'Field',
      'Crop',
      'Truck',
      'Destination',
      `Net (${UNIT_LABEL[unit]})`,
      `Wet (${UNIT_LABEL[unit]})`,
      'Moisture %',
      'Latitude',
      'Longitude',
      'Truck empty',
      'Auto detected',
      'Notes',
      'ID',
    ];
    const rows = sorted.map((w) => [
      w.timestamp ?? '',
      w.worker ?? '',
      w.farm ?? '',
      w.zone ?? '',
      w.crop ?? '',
      w.buggy ?? '',
      w.delivered_to ?? w.unload ?? '',
      weightValue(netKg(w), unit),
      weightValue(wetKg(w), unit),
      w.moisture ?? '',
      w.lat ?? '',
      w.lng ?? '',
      w.is_truck_empty ? 'yes' : 'no',
      w.auto_detected ? 'yes' : 'no',
      w.notes ?? '',
      w.id,
    ]);
    downloadCsv(`virtus-harvest-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
  }

  async function saveEdit(patch: Partial<Weighing>) {
    if (!editing) return;
    setBusy(true);
    setActionError(null);
    const { error: err } = await supabase.from('weighings').update(patch).eq('id', editing.id);
    setBusy(false);
    if (err) {
      setActionError(err.message);
      return;
    }
    setEditing(null);
    await refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setActionError(null);
    const { error: err } = await supabase.from('weighings').delete().eq('id', deleting.id);
    setBusy(false);
    if (err) {
      setActionError(err.message);
      return;
    }
    setDeleting(null);
    await refresh();
  }

  if (loading) return <Spinner label="Loading records…" />;
  if (error) return <ErrorNote message={error} />;

  // The fallback lists come from the setup tables, where names can repeat —
  // two fields are both called "Field A". These filter by name, so duplicates
  // are collapsed rather than offered twice.
  const uniq = (names: string[]) => [...new Set(names.filter(Boolean))];
  const filterOptions = {
    crops: distinct(seasonRows, (w) => w.crop).length
      ? distinct(seasonRows, (w) => w.crop)
      : uniq(crops.map((c) => c.name)),
    fields: distinct(seasonRows, (w) => w.zone).length
      ? distinct(seasonRows, (w) => w.zone)
      : uniq(fields.map((f) => f.name)),
    workers: distinct(seasonRows, (w) => w.worker).length
      ? distinct(seasonRows, (w) => w.worker)
      : uniq(operators.map((o) => o.name)),
    trucks: distinct(seasonRows, (w) => w.buggy).length
      ? distinct(seasonRows, (w) => w.buggy)
      : uniq(trucks.map((t) => t.name)),
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <Button
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="record-filters"
          >
            <span aria-hidden>⚲</span>
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 rounded-full bg-gold-500 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                {activeFilterCount}
              </span>
            )}
            <span aria-hidden className="text-[10px] opacity-60">
              {showFilters ? '▲' : '▼'}
            </span>
          </Button>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Sort</span>
            <select
              aria-label="Sort records"
              value={sortValue}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(':');
                setSortKey(key as SortKey);
                setSortDir(dir as SortDir);
                setPage(0);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              {SORT_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
              {/* A column-header click can land outside the presets; keep the
                  select honest instead of showing an unrelated preset. */}
              {!isPreset && <option value={sortValue}>Custom ({sortKey})</option>}
            </select>
          </div>

          <div className="ml-auto flex gap-2">
            {activeFilterCount > 0 && <Button onClick={resetFilters}>Clear filters</Button>}
            <Button variant="primary" onClick={exportCsv} disabled={sorted.length === 0}>
              Export CSV
            </Button>
          </div>
        </div>

        {showFilters && (
        <div
          id="record-filters"
          className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800"
        >
          <div className="sm:col-span-2">
            <Label>Search</Label>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Operator, farm, notes…"
            />
          </div>
          <div>
            <Label>Field</Label>
            <Select value={fField} onChange={(e) => { setFField(e.target.value); setPage(0); }}>
              <option value="">All fields</option>
              {filterOptions.fields.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Crop</Label>
            <Select value={fCrop} onChange={(e) => { setFCrop(e.target.value); setPage(0); }}>
              <option value="">All crops</option>
              {filterOptions.crops.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Operator</Label>
            <Select value={fWorker} onChange={(e) => { setFWorker(e.target.value); setPage(0); }}>
              <option value="">All operators</option>
              {filterOptions.workers.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Truck</Label>
            <Select value={fTruck} onChange={(e) => { setFTruck(e.target.value); setPage(0); }}>
              <option value="">All trucks</option>
              {filterOptions.trucks.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>From</Label>
            <Input type="date" value={fFrom} onChange={(e) => { setFFrom(e.target.value); setPage(0); }} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={fTo} onChange={(e) => { setFTo(e.target.value); setPage(0); }} />
          </div>
          <label className="flex items-end gap-2 pb-1.5 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={includeEmpties}
              onChange={(e) => { setIncludeEmpties(e.target.checked); setPage(0); }}
              className="h-4 w-4 rounded border-slate-300 accent-brand-500"
            />
            Show truck-empty events
          </label>
        </div>
        )}
      </Card>

      {actionError && <ErrorNote message={actionError} />}

      <Card>
        <CardHeader
          title={`${sorted.length} record${sorted.length === 1 ? '' : 's'}`}
          subtitle={`Total ${formatWeight(totalKg(sorted.filter((w) => !w.is_truck_empty)), unit)} of harvested grain`}
        />

        {sorted.length === 0 ? (
          <EmptyState title="No records match these filters" hint="Try widening the date range or clearing a filter." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    {(
                      [
                        ['timestamp', 'When'],
                        ['zone', 'Field'],
                        ['crop', 'Crop'],
                        ['worker', 'Operator'],
                        ['buggy', 'Truck'],
                        ['unload', 'Destination'],
                        ['weight', `Net (${UNIT_LABEL[unit]})`],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th key={key} className="px-3 py-2 font-medium">
                        <button
                          onClick={() => toggleSort(key)}
                          className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-300"
                        >
                          {label}
                          <span className={cx('text-[10px]', sortKey === key ? 'opacity-100' : 'opacity-25')}>
                            {sortKey === key && sortDir === 'asc' ? '▲' : '▼'}
                          </span>
                        </button>
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">Moisture</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((w) => (
                    <tr
                      key={w.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {formatDateTime(w.timestamp)}
                        {w.is_truck_empty && (
                          <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                            empty
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{w.zone || '—'}</td>
                      <td className="px-3 py-2">{w.crop || '—'}</td>
                      <td className="px-3 py-2">{w.worker || '—'}</td>
                      <td className="px-3 py-2">{w.buggy || '—'}</td>
                      <td className="px-3 py-2">{w.delivered_to || w.unload || '—'}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap">
                        {formatWeight(netKg(w), unit)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {w.moisture != null && w.moisture > 0 ? `${w.moisture.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {w.lat != null && w.lng != null ? (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${w.lat},${w.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open ${w.lat.toFixed(5)}, ${w.lng.toFixed(5)} in Google Maps`}
                            aria-label="Open this load's location in Google Maps"
                            className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            ◉
                          </a>
                        ) : (
                          // Kept as a spacer so the action columns stay aligned
                          // down the table when some loads have no GPS fix.
                          <span
                            className="inline-flex items-center px-2.5 py-1.5 text-sm text-slate-300 dark:text-slate-700"
                            title="No location recorded for this load"
                            aria-hidden
                          >
                            ◌
                          </span>
                        )}
                        <Button variant="ghost" onClick={() => { setActionError(null); setEditing(w); }}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          className="text-red-600 dark:text-red-400"
                          onClick={() => { setActionError(null); setDeleting(w); }}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Page {safePage + 1} of {pageCount}
                </span>
                <div className="flex gap-2">
                  <Button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                    Previous
                  </Button>
                  <Button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {editing && (
        <EditRecordModal
          record={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}

      {deleting && (
        <Modal title="Delete this record?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {formatDateTime(deleting.timestamp)} — {deleting.zone || 'no field'} —{' '}
            <strong>{formatWeight(netKg(deleting), unit)}</strong>
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            This removes the record from the cloud database for every device on this account. It cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => void confirmDelete()}>
              {busy ? 'Deleting…' : 'Delete record'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EditRecordModal({
  record,
  busy,
  onClose,
  onSave,
}: {
  record: Weighing;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Weighing>) => void;
}) {
  const { crops, fields, farms, operators, trucks, destinations, seasons } = useData();

  /**
   * Sentinel for "the field this record already points at". Records can carry a
   * zone name that no longer matches any field (renamed or deleted), and
   * defaulting those to blank would quietly wipe the attribution on save.
   */
  const KEEP = '__keep__';

  const [form, setForm] = useState({
    crop: record.crop ?? '',
    fieldId: record.field_id && fields.some((f) => f.id === record.field_id) ? record.field_id : KEEP,
    worker: record.worker ?? '',
    buggy: record.buggy ?? '',
    unload: record.delivered_to ?? record.unload ?? '',
    weight: record.weight?.toString() ?? '',
    seasonId: record.season_id ?? '',
    moisture: record.moisture?.toString() ?? '',
    notes: record.notes ?? '',
  });
  const [localError, setLocalError] = useState<string | null>(null);

  // Weight is edited in the unit the row was recorded in, not the unit the
  // header happens to be showing — converting on the way in and out would
  // round the scale's own reading.
  const rowUnit = record.unit ?? 'kg';

  const parsedWeight = form.weight.trim() === '' ? null : Number(form.weight);
  const parsedMoisture = form.moisture.trim() === '' ? null : Number(form.moisture);
  const previewDry =
    parsedWeight != null && Number.isFinite(parsedWeight)
      ? calcDryWeight(parsedWeight, parsedMoisture, form.crop)
      : null;

  /**
   * Two fields can share a name — the account has two called "Field A" on
   * different farms. The picker is therefore keyed by id, not name, and
   * duplicated names are qualified by their farm so they can be told apart.
   */
  const labels = useMemo(() => fieldLabels(fields, farms), [fields, farms]);

  function submit() {
    if (parsedWeight == null || !Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      setLocalError('Enter a weight greater than zero.');
      return;
    }
    if (
      parsedMoisture != null &&
      (!Number.isFinite(parsedMoisture) || parsedMoisture < 0 || parsedMoisture > 100)
    ) {
      setLocalError('Moisture must be between 0 and 100.');
      return;
    }
    setLocalError(null);

    // Resolving by id keeps zone and field_id describing the same field. Doing
    // it by name would pick whichever duplicate came first in the list.
    const chosen = form.fieldId === KEEP ? null : fields.find((f) => f.id === form.fieldId);
    const fieldPatch =
      form.fieldId === KEEP
        ? { zone: record.zone, field_id: record.field_id }
        : { zone: chosen ? chosen.name : null, field_id: chosen ? chosen.id : null };

    onSave({
      ...fieldPatch,
      crop: form.crop || null,
      season_id: form.seasonId || null,
      worker: form.worker || null,
      buggy: form.buggy || null,
      unload: form.unload || null,
      delivered_to: form.unload || null,
      // All three weights move together: wet_weight mirrors the scale reading
      // (as the app writes it), and dry_weight is recomputed from the crop's
      // base moisture. Every total reads dry_weight ?? weight, so leaving the
      // dry figure stale would keep reports on the old number.
      weight: parsedWeight,
      wet_weight: parsedWeight,
      dry_weight: calcDryWeight(parsedWeight, parsedMoisture, form.crop),
      moisture: parsedMoisture,
      notes: form.notes || null,
    });
  }

  /** Name-keyed pickers: dedupe, since these columns store only a name. */
  const pick = (label: string, key: 'crop' | 'worker' | 'buggy' | 'unload', names: string[]) => {
    const options = [...new Set(names.filter(Boolean))];
    const current = form[key];
    return (
      <div>
        <Label>{label}</Label>
        <Select value={current} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
          <option value="">—</option>
          {/* The stored value may predate the current list, so keep it selectable. */}
          {(current && !options.includes(current) ? [current, ...options] : options).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
      </div>
    );
  };

  return (
    <Modal title="Edit record" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Field</Label>
          <Select
            value={form.fieldId}
            onChange={(e) => setForm({ ...form, fieldId: e.target.value })}
          >
            {form.fieldId === KEEP && (
              <option value={KEEP}>
                {record.zone ? `${record.zone} (as recorded)` : '—'}
              </option>
            )}
            <option value="">—</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>{labels.get(f.id) ?? f.name}</option>
            ))}
          </Select>
        </div>

        {pick('Crop', 'crop', crops.map((c) => c.name))}
        {pick('Operator', 'worker', operators.map((o) => o.name))}
        {pick('Truck', 'buggy', trucks.map((t) => t.name))}
        {pick('Destination', 'unload', destinations.map((d) => d.name))}

        <div>
          <Label>Season</Label>
          <Select
            value={form.seasonId}
            onChange={(e) => setForm({ ...form, seasonId: e.target.value })}
          >
            <option value="">No season</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Weight ({rowUnit})</Label>
          <Input
            type="number"
            step="0.1"
            min="0"
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: e.target.value })}
          />
        </div>

        <div>
          <Label>Moisture %</Label>
          <Input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={form.moisture}
            onChange={(e) => setForm({ ...form, moisture: e.target.value })}
          />
        </div>

        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>

      {previewDry != null && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Net weight after moisture shrink:{' '}
          <strong className="text-slate-700 dark:text-slate-200">
            {previewDry.toFixed(1)} {rowUnit}
          </strong>
          {parsedMoisture != null && parsedMoisture > 0 && previewDry === parsedWeight && (
            <> — at or below this crop&rsquo;s base moisture, so nothing is docked.</>
          )}
        </p>
      )}

      {localError && (
        <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{localError}</p>
      )}

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        The timestamp is recorded by the scale and is not editable here.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Modal>
  );
}

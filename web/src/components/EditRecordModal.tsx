import { useMemo, useState } from 'react';
import { useData } from '../state/DataProvider';
import { supabase } from '../lib/supabase';
import type { Weighing } from '../lib/types';
import { Button, Input, Label, Modal, Select } from './ui';
import { calcDryWeight } from '../lib/moisture';
import { fieldLabels } from '../lib/fields';

/**
 * Editing one weighing. Used from the records table and from inside a
 * truckload, so the moisture recalculation and the field-id resolution live in
 * one place — two copies of this would drift, and the drift would be silent.
 */
export default function EditRecordModal({
  record,
  onClose,
  onSaved,
}: {
  record: Weighing;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
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
  const [busy, setBusy] = useState(false);

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

  async function submit() {
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

    const patch: Partial<Weighing> = {
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
    };

    setBusy(true);
    const { error } = await supabase.from('weighings').update(patch).eq('id', record.id);
    setBusy(false);
    if (error) {
      setLocalError(error.message);
      return;
    }
    await onSaved();
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
        <Button variant="primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Modal>
  );
}

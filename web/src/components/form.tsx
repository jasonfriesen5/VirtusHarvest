import { useState } from 'react';
import { useT } from '../state/PrefsProvider';
import type { ReactNode } from 'react';
import { Button, ErrorNote, Input, Label, Modal, Select, Switch, cx } from './ui';

/**
 * A description-driven form, so adding an entity to the console is a list of
 * fields rather than another hand-written modal. The app's `openEntitySheet()`
 * works the same way and for the same reason.
 *
 * Its one hard rule is carried over verbatim: **a save handler that returns an
 * error message VETOES the close.** Without that, a failed validation shows a
 * message and still throws away everything typed, which reads as the console
 * losing the entry instead of rejecting it.
 */

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea';

export interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  hint?: string;
  /** Half-width on wide screens; two of them share a row. */
  half?: boolean;
}

export type FormValues = Record<string, string | boolean>;

export function EntityForm({
  title,
  fields,
  initial,
  onSave,
  onClose,
  onDelete,
  deleteLabel = 'Eliminar',
  deleteWarning,
  extra,
  wide,
}: {
  title: string;
  fields: FieldDef[];
  initial: FormValues;
  /** Return null on success, or a message to show and keep the form open. */
  onSave: (values: FormValues) => Promise<string | null>;
  onClose: () => void;
  onDelete?: () => Promise<string | null>;
  deleteLabel?: string;
  deleteWarning?: string;
  /** Rendered under the fields — membership pickers, ration builders, notes. */
  extra?: ReactNode;
  wide?: boolean;
}) {
  const t = useT();
  const [values, setValues] = useState<FormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const set = (key: string, v: string | boolean) => setValues((prev) => ({ ...prev, [key]: v }));

  function validate(): string | null {
    for (const f of fields) {
      const raw = values[f.key];
      if (f.required && (raw === '' || raw == null)) return t('Falta {v1}.', { v1: f.label.toLowerCase() });
      if (f.type === 'number' && raw !== '' && raw != null) {
        const n = parseFloat(String(raw));
        if (!Number.isFinite(n)) return t('{v1} debe ser un número.', { v1: f.label });
        if (f.min != null && n < f.min) return t('{v1} no puede ser menor que {v2}.', { v1: f.label, v2: f.min });
        if (f.max != null && n > f.max) return t('{v1} no puede ser mayor que {v2}.', { v1: f.label, v2: f.max });
      }
    }
    return null;
  }

  async function submit() {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    const err = await onSave(values);
    setBusy(false);
    if (err) setError(err); // veto: the form stays open with everything typed
    else onClose();
  }

  async function remove() {
    if (!onDelete) return;
    setBusy(true);
    const err = await onDelete();
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <Modal title={title} onClose={onClose} wide={wide}>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={cx(f.half ? 'sm:col-span-1' : 'sm:col-span-2')}>
            {f.type === 'checkbox' ? (
              // A switch rather than a checkbox: every one of these is an
              // on/off setting, and it is the same control the app shows for
              // the same fields. Label on the left, switch on the right, so a
              // column of them reads down the page.
              <div className="flex items-center justify-between gap-3 pt-5">
                <div>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{f.label}</p>
                  {/* A switch with no explanation is a mystery flag; the app's
                      equivalent carries the same line under it. */}
                  {f.hint && (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{f.hint}</p>
                  )}
                </div>
                <Switch
                  checked={Boolean(values[f.key])}
                  onChange={(next) => set(f.key, next)}
                  label={f.label}
                />
              </div>
            ) : (
              <>
                <Label>
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </Label>
                {f.type === 'select' ? (
                  <Select value={String(values[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : f.type === 'textarea' ? (
                  <textarea
                    value={String(values[f.key] ?? '')}
                    onChange={(e) => set(f.key, e.target.value)}
                    rows={3}
                    placeholder={f.placeholder}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                ) : (
                  <Input
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    inputMode={f.type === 'number' ? 'decimal' : undefined}
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    placeholder={f.placeholder}
                    value={String(values[f.key] ?? '')}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </>
            )}
            {f.hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{f.hint}</p>}
          </div>
        ))}
      </div>

      {extra && <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">{extra}</div>}

      {error && (
        <div className="mt-3">
          <ErrorNote message={error} />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <div>
          {onDelete &&
            (confirmingDelete ? (
              <div className="flex items-center gap-2">
                <Button variant="danger" disabled={busy} onClick={() => void remove()}>
                  {t('Confirmar')}
                </Button>
                <Button onClick={() => setConfirmingDelete(false)}>{t('Cancelar')}</Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmingDelete(true)} className="text-red-600">
                {deleteLabel}
              </Button>
            ))}
        </div>
        <div className="flex gap-2">
          <Button onClick={onClose}>{t('Cancelar')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>

      {confirmingDelete && deleteWarning && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {deleteWarning}
        </p>
      )}
    </Modal>
  );
}

/** Reads a form value as a number, treating blank as null. */
export const fnum = (v: string | boolean | undefined): number | null => {
  if (v === '' || v == null || typeof v === 'boolean') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Reads a form value as trimmed text, treating blank as null. */
export const fstr = (v: string | boolean | undefined): string | null => {
  if (v == null || typeof v === 'boolean') return null;
  const s = v.trim();
  return s === '' ? null : s;
};

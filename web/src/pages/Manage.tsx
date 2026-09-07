import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../state/DataProvider';
import { useAuth } from '../state/AuthProvider';
import { supabase } from '../lib/supabase';
import { fenexProducts } from '../lib/fenexClient';
import type { FenexProduct } from '../lib/fenexClient';
import {
  ENTITIES,
  GEOGRAPHY_KEYS,
  countAffected,
  entityByKind,
  newId,
  renameWithBackfill,
  visibleFields,
} from '../lib/entities';
import type { EntityConfig, EntityFieldSpec } from '../lib/entities';
import GeographyPicker from '../components/GeographyPicker';
import type { EntityKind } from '../lib/types';
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

type Row = Record<string, unknown> & { id: string; name: string };

export default function Manage() {
  const { user } = useAuth();
  const data = useData();
  const [kind, setKind] = useState<EntityKind>('farms');
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const config = entityByKind(kind);
  const remisionOn = data.emisor?.remision_enabled ?? false;
  const shownFields = useMemo(() => visibleFields(config, remisionOn), [config, remisionOn]);
  const rows = useMemo(() => (data[kind] ?? []) as unknown as Row[], [data, kind]);

  /** Live count of weighings each entity name appears on, for the list badge. */
  const usageByName = useMemo(() => {
    const map = new Map<string, number>();
    if (config.backfillColumns.length === 0) return map;
    for (const w of data.weighings) {
      const seen = new Set<string>();
      for (const col of config.backfillColumns) {
        const v = (w[col] as string | null | undefined)?.trim();
        // A destination sits in two columns of the same row; count the row once.
        if (v && !seen.has(v)) {
          seen.add(v);
          map.set(v, (map.get(v) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [data.weighings, config]);

  async function handleDelete() {
    if (!deleting || !user) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from(config.table)
      .delete()
      .eq('id', deleting.id)
      .eq('user_id', user.id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDeleting(null);
    setNotice(`Deleted ${deleting.name}.`);
    await data.refresh();
  }

  if (data.loading) return <Spinner label="Loading your setup…" />;
  if (data.error) return <ErrorNote message={data.error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {ENTITIES.map((e) => (
          <button
            key={e.kind}
            onClick={() => {
              setKind(e.kind);
              setNotice(null);
              setError(null);
            }}
            className={cx(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              kind === e.kind
                ? 'bg-gold-500 text-ink'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            {e.label}
          </button>
        ))}
      </div>

      {error && <ErrorNote message={error} />}
      {notice && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100">
          {notice}
        </div>
      )}

      <Card>
        <CardHeader
          title={config.label}
          subtitle={`${rows.length} item${rows.length === 1 ? '' : 's'}`}
          action={
            <Button
              variant="primary"
              onClick={() => {
                setNotice(null);
                setError(null);
                setCreating(true);
              }}
            >
              Add {config.singular}
            </Button>
          }
        />

        {rows.length === 0 ? (
          <EmptyState title={`No ${config.label.toLowerCase()} yet`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  {shownFields.map((f) => (
                    <th key={f.key} className="px-3 py-2 font-medium">
                      {f.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Records</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2 font-medium">{row.name}</td>
                    {shownFields.map((f) => (
                      <td key={f.key} className="px-3 py-2 text-slate-600 dark:text-slate-300">
                        {displayCell(f, row, data.farms)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                      {config.backfillColumns.length === 0 ? '—' : (usageByName.get(row.name) ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setNotice(null);
                          setError(null);
                          setEditing(row);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-red-600 dark:text-red-400"
                        onClick={() => {
                          setNotice(null);
                          setError(null);
                          setDeleting(row);
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(editing || creating) && (
        <EntityModal
          config={config}
          fields={shownFields}
          row={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onDone={(message) => {
            setEditing(null);
            setCreating(false);
            setNotice(message);
            void data.refresh();
          }}
          onError={setError}
        />
      )}

      {deleting && (
        <Modal title={`Delete ${config.singular}?`} onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Delete <strong>{deleting.name}</strong>?
          </p>
          {config.backfillColumns.length > 0 && (usageByName.get(deleting.name) ?? 0) > 0 && (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {usageByName.get(deleting.name)} weighing record
              {usageByName.get(deleting.name) === 1 ? '' : 's'} still reference this name. Those records keep
              the name as text and are not deleted — but it will no longer appear in the app's pick lists.
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => void handleDelete()}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EntityModal({
  config,
  fields,
  row,
  onClose,
  onDone,
  onError,
}: {
  config: EntityConfig;
  fields: EntityFieldSpec[];
  row: Row | null;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { user } = useAuth();
  const { farms, refresh } = useData();
  const navigate = useNavigate();
  const isEdit = row !== null;
  const originalName = (row?.name as string) ?? '';

  const [name, setName] = useState(originalName);
  const [extra, setExtra] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === 'geography') {
        for (const k of GEOGRAPHY_KEYS) {
          const v = row?.[k];
          init[k] = v == null ? '' : String(v);
        }
        continue;
      }
      const stored = row?.[f.key];
      init[f.key] =
        stored == null || stored === ''
          ? (f.type === 'select' ? (f.defaultValue ?? '') : '')
          : String(stored);
    }
    return init;
  });
  const [affected, setAffected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const renaming = isEdit && name.trim() !== '' && name.trim() !== originalName;

  // Counted server-side so the warning reflects the database, not just the
  // rows this browser happens to have cached.
  useEffect(() => {
    if (!renaming || !user) {
      setAffected(null);
      return;
    }
    let active = true;
    void countAffected(config, originalName, user.id).then((n) => {
      if (active) setAffected(n);
    });
    return () => {
      active = false;
    };
  }, [renaming, config, originalName, user]);

  function buildExtraPatch(): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === 'geography') {
        for (const k of GEOGRAPHY_KEYS) patch[k] = extra[k]?.trim() || null;
        continue;
      }
      const raw = extra[f.key]?.trim() ?? '';
      if (f.type === 'number') patch[f.key] = raw === '' ? null : Number(raw);
      // The column is NOT NULL with a default, so an unticked box is false.
      else if (f.type === 'boolean') patch[f.key] = raw === 'true';
      else patch[f.key] = raw === '' ? null : raw;
    }
    return patch;
  }

  /**
   * `thenDraw` saves and hands off to the map with this field selected and
   * drawing armed. The refresh before navigating is required, not tidiness:
   * the map only honours the deep link once the field exists in the shared
   * store, and a freshly inserted row is not there yet.
   */
  async function submit(thenDraw = false) {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) {
      onError('Name cannot be empty.');
      return;
    }

    setBusy(true);

    if (isEdit && row) {
      const { error, updated } = await renameWithBackfill(
        config,
        row.id,
        originalName,
        trimmed,
        user.id,
        buildExtraPatch(),
      );
      setBusy(false);
      if (error) {
        onError(error);
        return;
      }
      if (thenDraw) {
        await refresh();
        navigate(`/map?field=${encodeURIComponent(row.id)}&draw=1`);
        return;
      }
      onDone(
        updated > 0
          ? `Renamed to ${trimmed} and updated ${updated} historic record${updated === 1 ? '' : 's'}.`
          : `Saved ${trimmed}.`,
      );
      return;
    }

    // Minted here rather than inside the insert call so the new row can be
    // handed straight to the map.
    const id = newId();
    const { error } = await supabase.from(config.table).insert({
      id,
      user_id: user.id,
      name: trimmed,
      ...buildExtraPatch(),
    });
    setBusy(false);
    if (error) {
      onError(error.message);
      return;
    }
    if (thenDraw) {
      await refresh();
      navigate(`/map?field=${encodeURIComponent(id)}&draw=1`);
      return;
    }
    onDone(`Added ${trimmed}.`);
  }

  return (
    <Modal title={isEdit ? `Edit ${config.singular}` : `Add ${config.singular}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        {fields.map((f) => (
          <div key={f.key} className={f.type === 'geography' ? 'sm:col-span-2' : undefined}>
            {f.type !== 'geography' && <Label>{f.label}</Label>}
            {f.type === 'geography' ? (
              <GeographyPicker
                value={{
                  departmentCode: extra.department_code ?? '',
                  departmentName: extra.department ?? '',
                  districtCode: extra.district_code ?? '',
                  districtName: extra.district ?? '',
                  cityCode: extra.city_code ?? '',
                  cityName: extra.city_name ?? '',
                }}
                onChange={(v) =>
                  setExtra({
                    ...extra,
                    department_code: v.departmentCode,
                    department: v.departmentName,
                    district_code: v.districtCode,
                    district: v.districtName,
                    city_code: v.cityCode,
                    city_name: v.cityName,
                  })
                }
              />
            ) : f.type === 'boolean' ? (
              <label className="flex items-center gap-2 py-1.5 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={extra[f.key] === 'true'}
                  onChange={(e) => setExtra({ ...extra, [f.key]: e.target.checked ? 'true' : 'false' })}
                  className="h-4 w-4 rounded border-slate-300 accent-gold-500"
                />
                Yes
              </label>
            ) : f.type === 'reference' ? (
              <Select
                value={extra[f.key] ?? ''}
                onChange={(e) => setExtra({ ...extra, [f.key]: e.target.value })}
              >
                <option value="">No farm</option>
                {farms.map((farm) => (
                  <option key={farm.id} value={farm.id}>{farm.name}</option>
                ))}
              </Select>
            ) : f.type === 'fenexProduct' ? (
              <FenexProductPicker
                value={extra[f.key] ?? ''}
                onChange={(code, name) =>
                  setExtra({
                    ...extra,
                    [f.key]: code,
                    // The catalogue name is what should print, so it comes
                    // along — but only to fill a blank, never overwriting a
                    // description someone has deliberately worded.
                    fiscal_description: extra.fiscal_description || name,
                  })
                }
              />
            ) : f.type === 'select' ? (
              <Select
                value={extra[f.key] ?? ''}
                onChange={(e) => setExtra({ ...extra, [f.key]: e.target.value })}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            ) : (
              <Input
                type={f.type === 'number' ? 'number' : 'text'}
                step={f.type === 'number' ? 'any' : undefined}
                value={extra[f.key] ?? ''}
                onChange={(e) => setExtra({ ...extra, [f.key]: e.target.value })}
              />
            )}
          </div>
        ))}

        {renaming && config.backfillColumns.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            {affected === null ? (
              'Checking how many records use the old name…'
            ) : affected === 0 ? (
              'No historic records use the old name.'
            ) : (
              <>
                <strong>{affected}</strong> historic record{affected === 1 ? '' : 's'} store “{originalName}” as
                text. Saving rewrites {affected === 1 ? 'it' : 'them'} to “{name.trim()}” so reports stay
                together. This cannot be undone automatically.
              </>
            )}
          </div>
        )}

        {renaming && config.backfillColumns.length === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Weighings reference {config.label.toLowerCase()} by id, so no historic records need updating.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        {config.kind === 'fields' && (
          <Button disabled={busy} onClick={() => void submit(true)}>
            {isEdit ? 'Save & draw on map' : 'Add & draw on map'}
          </Button>
        )}
        <Button variant="primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Saving…' : isEdit ? 'Save changes' : `Add ${config.singular}`}
        </Button>
      </div>
    </Modal>
  );
}

/** Farm references store an id; the table has to show the name behind it. */
function displayCell(spec: EntityFieldSpec, row: Row, farms: { id: string; name: string }[]): string {
  const value = row[spec.key];
  if (spec.type === 'geography') {
    const parts = [row.department, row.district, row.city_name].filter(Boolean).map(String);
    return parts.length > 0 ? parts.join(' / ') : '—';
  }
  if (spec.type === 'boolean') return value === true ? 'Yes' : 'No';
  if (value == null || value === '') return '—';
  if (spec.type === 'reference') {
    return farms.find((f) => f.id === value)?.name ?? 'unknown farm';
  }
  if (spec.type === 'select') {
    return spec.options.find((o) => o.value === value)?.label ?? String(value);
  }
  return String(value);
}

/**
 * Picks a product from the linked issuer's Fenex catalogue.
 *
 * A dropdown rather than a text box because `productCode` is the buyer's own
 * code: one typed by hand is a document Fenex rejects, and there is no sandbox
 * to discover that in. Picking the same product for a crop called "Soybeans"
 * and one called "Soja" is also what makes two names carry one code.
 *
 * Falls back to a plain input when the catalogue cannot be read — no Fenex
 * account linked yet, or the network is down. Config editing must not be
 * blocked by a call to someone else's server.
 */
function FenexProductPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string, name: string) => void;
}) {
  const [products, setProducts] = useState<FenexProduct[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fenexProducts()
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setFailed(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed || (products && products.length === 0)) {
    return (
      <>
        <Input value={value} onChange={(e) => onChange(e.target.value, '')} />
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          {failed
            ? `Could not read the Fenex catalogue (${failed}). Type the code the buyer uses.`
            : 'That Fenex account has no products yet. Type the code the buyer uses.'}
        </p>
      </>
    );
  }

  if (!products) return <Input value={value} disabled placeholder="Loading products…" />;

  // A code already saved that is no longer in the catalogue must stay visible,
  // or opening the sheet would silently blank it.
  const known = products.some((p) => String(p.code ?? p.id) === value);

  return (
    <>
      <Select
        value={value}
        onChange={(e) => {
          const p = products.find((x) => String(x.code ?? x.id) === e.target.value);
          onChange(e.target.value, String(p?.name ?? p?.description ?? ''));
        }}
      >
        <option value="">— not set —</option>
        {!known && value && <option value={value}>{value} (not in the catalogue)</option>}
        {products.map((p) => (
          <option key={p.id} value={String(p.code ?? p.id)}>
            {String(p.name ?? p.description ?? p.id)}
            {p.code ? ` · ${p.code}` : ''}
          </option>
        ))}
      </Select>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        From your Fenex products. Two crops may point at the same one.
      </p>
    </>
  );
}

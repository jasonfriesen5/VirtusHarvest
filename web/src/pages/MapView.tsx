import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { APIProvider, Map as GoogleMap } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_KEY, supabase } from '../lib/supabase';
import { useAuth } from '../state/AuthProvider';
import { useData } from '../state/DataProvider';
import { usePrefs } from '../state/PrefsProvider';
import {
  BoundaryLayer,
  DrawLayer,
  EditableRing,
  MapController,
  MarkerLayer,
  UserLocationLayer,
} from '../components/mapLayers';
import type { FieldShape, MapPin, UserPosition } from '../components/mapLayers';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Label,
  Modal,
  Select,
  Spinner,
  cx,
} from '../components/ui';
import {
  nextRingId,
  parseRings,
  ringAreaHectares,
  ringsAreaHectares,
  saveFieldRings,
} from '../lib/boundaries';
import type { Ring } from '../lib/boundaries';
import type { BoundaryPoint } from '../lib/types';
import { formatWeight, formatArea, fromHa, areaValue, AREA_LABEL, UNIT_LABEL } from '../lib/units';
import { formatDateTime } from '../lib/format';
import { filterBySeason, isHarvestLoad, netKg, totalKg } from '../lib/selectors';
import { fieldLabels } from '../lib/fields';

/** Falls back to roughly the farm's neighbourhood until data sets real bounds. */
const FALLBACK_CENTER = { lat: 42.6785, lng: -80.7965 };

/**
 * Business names clutter a field map — shop and restaurant labels sit on top of
 * boundaries and pins without telling you anything about the harvest. Roads stay:
 * they are how you actually describe where a field is.
 *
 * Note this only applies because the map has no Cloud `mapId`. Adding one moves
 * styling to the Cloud console and silently ignores this array.
 */
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.attraction', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.place_of_worship', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.sports_complex', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

type Mode = 'view' | 'draw' | 'edit';

export default function MapView() {
  const { user } = useAuth();
  const { weighings, fields, farms, boundaries, loading, error, refresh } = useData();
  const { unit, areaUnit, seasonId } = usePrefs();

  const [selectedField, setSelectedField] = useState('');
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState<BoundaryPoint[]>([]);
  const [editingRingId, setEditingRingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Ring | null>(null);
  const [showOrphanCleanup, setShowOrphanCleanup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [userPos, setUserPos] = useState<UserPosition | null>(null);
  const [locating, setLocating] = useState(false);

  const mapRef = useRef<google.maps.Map | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const handledParams = useRef(false);

  // The reshaped geometry lives in a ref, not state: routing every vertex drag
  // through React would rebuild the polygon under the cursor.
  const editedPoints = useRef<BoundaryPoint[] | null>(null);

  const loads = useMemo(
    () => filterBySeason(weighings, seasonId).filter(isHarvestLoad),
    [weighings, seasonId],
  );

  /**
   * Manage links here as /map?field=<id>&draw=1 to pick up drawing straight
   * after creating a field. It waits for the field list to arrive, applies the
   * selection once, then strips the query so a later refresh doesn't silently
   * re-arm drawing under someone who just wanted to look at the map.
   */
  useEffect(() => {
    if (handledParams.current || fields.length === 0) return;
    const wantedField = searchParams.get('field');
    if (!wantedField) return;

    handledParams.current = true;
    if (fields.some((f) => f.id === wantedField)) {
      setSelectedField(wantedField);
      if (searchParams.get('draw') === '1') {
        setDraft([]);
        setMode('draw');
      }
    }
    setSearchParams({}, { replace: true });
  }, [fields, searchParams, setSearchParams]);

  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f] as const)), [fields]);
  const labels = useMemo(() => fieldLabels(fields, farms), [fields, farms]);

  const ringsByFieldId = useMemo(() => {
    const map = new Map<string, Ring[]>();
    for (const b of boundaries) map.set(b.field_id, parseRings(b));
    return map;
  }, [boundaries]);

  /**
   * Boundary rows whose field has been deleted. The phone app drops the local
   * copy but leaves the cloud row behind, so these accumulate and would
   * otherwise render as anonymous polygons stacked over real fields.
   */
  const orphanFieldIds = useMemo(
    () => boundaries.map((b) => b.field_id).filter((id) => !fieldById.has(id)),
    [boundaries, fieldById],
  );

  /** Per-field totals, keyed by field id so renames can't split a total. */
  const totalsByFieldId = useMemo(() => {
    const map = new Map<string, { kg: number; loads: number }>();
    for (const w of loads) {
      if (!w.field_id) continue;
      const entry = map.get(w.field_id) ?? { kg: 0, loads: 0 };
      entry.kg += netKg(w);
      entry.loads += 1;
      map.set(w.field_id, entry);
    }
    return map;
  }, [loads]);

  const selectedRings = selectedField ? (ringsByFieldId.get(selectedField) ?? []) : [];

  const shapes = useMemo<FieldShape[]>(() => {
    const out: FieldShape[] = [];
    for (const [fieldId, rings] of ringsByFieldId) {
      const field = fieldById.get(fieldId);
      if (!field || rings.length === 0) continue; // orphans are never drawn
      const totals = totalsByFieldId.get(fieldId);
      const hectares = ringsAreaHectares(rings);
      out.push({
        fieldId,
        name: field.name,
        rings,
        summary: totals
          ? `${formatWeight(totals.kg, unit)} · ${totals.loads} load${totals.loads === 1 ? '' : 's'} · ${formatArea(hectares, areaUnit)}`
          : `No loads recorded · ${formatArea(hectares, areaUnit)}`,
        highlighted: selectedField === fieldId,
      });
    }
    return out;
  }, [ringsByFieldId, fieldById, totalsByFieldId, unit, areaUnit, selectedField]);

  const pins = useMemo<MapPin[]>(
    () =>
      loads
        .filter(
          (w) =>
            w.lat != null &&
            w.lng != null &&
            Number.isFinite(w.lat) &&
            Number.isFinite(w.lng) &&
            (!selectedField || w.field_id === selectedField),
        )
        .map((w) => ({
          id: w.id,
          lat: w.lat as number,
          lng: w.lng as number,
          title: `${w.zone || 'No field'} — ${formatWeight(netKg(w), unit)}`,
          lines: [
            [w.crop, formatDateTime(w.timestamp)].filter(Boolean).join(' · '),
            [w.worker, w.buggy].filter(Boolean).join(' · '),
          ].filter((l) => l !== ''),
        })),
    [loads, selectedField, unit],
  );

  /**
   * What the map should frame on open. Drawn field boundaries win over load
   * pins: a stray GPS reading (a device that reported a default location, say)
   * would otherwise drag the viewport hundreds of miles to take it in.
   * Falls back to pins when nothing is mapped yet.
   */
  const fitPoints = useMemo(() => {
    const fromShapes = shapes.flatMap((s) => s.rings.flatMap((r) => r.points));
    if (fromShapes.length > 0) return fromShapes;
    return pins.map((p) => ({ lat: p.lat, lng: p.lng }));
  }, [shapes, pins]);

  const fieldRows = useMemo(
    () =>
      fields
        .map((f) => {
          const totals = totalsByFieldId.get(f.id);
          const rings = ringsByFieldId.get(f.id) ?? [];
          return {
            id: f.id,
            name: f.name,
            kg: totals?.kg ?? 0,
            loads: totals?.loads ?? 0,
            hectares: ringsAreaHectares(rings),
            rings: rings.length,
          };
        })
        .sort((a, b) => b.kg - a.kg),
    [fields, totalsByFieldId, ringsByFieldId],
  );

  // Polygons are non-clickable outside view mode, so this can never fire
  // mid-edit and pull the selection out from under the editor.
  const onSelectShape = useCallback((fieldId: string) => setSelectedField(fieldId), []);

  const onMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  function locateMe() {
    if (!navigator.geolocation) {
      setActionError('This browser cannot report a location.');
      return;
    }
    setLocating(true);
    setActionError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setUserPos(next);
        mapRef.current?.panTo({ lat: next.lat, lng: next.lng });
        mapRef.current?.setZoom(17);
        // Stating the accuracy explains the size of the circle — on a laptop
        // the browser locates by Wi-Fi, not GPS, so it can be 100 m wide.
        setNotice(`Located to within ${Math.round(next.accuracy)} m.`);
      },
      (err) => {
        setLocating(false);
        setActionError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Allow it for this site in your browser settings.'
            : `Could not get your location: ${err.message}`,
        );
      },
      // Worth the wait and the battery on a phone standing in a field.
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  const onDrawPoint = useCallback((p: BoundaryPoint) => setDraft((d) => [...d, p]), []);
  const onRingEdited = useCallback((points: BoundaryPoint[]) => {
    editedPoints.current = points;
  }, []);

  function cancelEditing() {
    setMode('view');
    setDraft([]);
    setEditingRingId(null);
    editedPoints.current = null;
  }

  async function persist(rings: Ring[], successMessage: string) {
    if (!user || !selectedField) return;
    setBusy(true);
    setActionError(null);
    const { error: err } = await saveFieldRings(selectedField, user.id, rings);
    setBusy(false);
    if (err) {
      setActionError(err);
      return;
    }
    cancelEditing();
    setNotice(successMessage);
    await refresh();
  }

  async function saveDraft() {
    if (draft.length < 3) return;
    await persist(
      [...selectedRings, { id: nextRingId(selectedField, selectedRings), points: draft }],
      `Boundary added — ${formatArea(ringAreaHectares(draft), areaUnit)}. Field area updated.`,
    );
  }

  async function saveEdit() {
    const points = editedPoints.current;
    if (!editingRingId || !points || points.length < 3) {
      cancelEditing();
      return;
    }
    await persist(
      selectedRings.map((r) => (r.id === editingRingId ? { ...r, points } : r)),
      `Boundary reshaped — ${formatArea(ringAreaHectares(points), areaUnit)}. Field area updated.`,
    );
  }

  async function confirmDeleteRing() {
    if (!deleteTarget) return;
    const remaining = selectedRings.filter((r) => r.id !== deleteTarget.id);
    setDeleteTarget(null);
    await persist(
      remaining,
      remaining.length === 0
        ? 'Boundary deleted. This field no longer has a drawn area.'
        : 'Boundary deleted. Field area updated.',
    );
  }

  async function cleanUpOrphans() {
    if (!user || orphanFieldIds.length === 0) return;
    setBusy(true);
    setActionError(null);
    const { error: err } = await supabase
      .from('ht_boundaries')
      .delete()
      .eq('user_id', user.id)
      .in('field_id', orphanFieldIds);
    setBusy(false);
    setShowOrphanCleanup(false);
    if (err) {
      setActionError(err.message);
      return;
    }
    setNotice(`Removed ${orphanFieldIds.length} boundaries belonging to deleted fields.`);
    await refresh();
  }

  if (loading) return <Spinner label="Loading fields and boundaries…" />;
  if (error) return <ErrorNote message={error} />;

  if (!GOOGLE_MAPS_KEY) {
    return (
      <ErrorNote message="VITE_GOOGLE_MAPS_KEY is not set, so the map cannot load. Add it to web/.env locally, or to the Netlify environment variables." />
    );
  }

  const selectedFieldName = selectedField ? (fieldById.get(selectedField)?.name ?? '') : '';

  return (
    <div className="space-y-4">
      {actionError && <ErrorNote message={actionError} />}
      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-100">
          {notice}
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-60">
            ✕
          </button>
        </div>
      )}

      {orphanFieldIds.length > 0 && mode === 'view' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <span>
            <strong>{orphanFieldIds.length} boundaries</strong> belong to fields that were deleted. They are
            hidden from the map and count toward nothing.
          </span>
          <Button onClick={() => setShowOrphanCleanup(true)}>Review and remove</Button>
        </div>
      )}

      <Card>
        <CardHeader
          title="Field map"
          subtitle={`${shapes.length} mapped field${shapes.length === 1 ? '' : 's'} · ${pins.length} located load${pins.length === 1 ? '' : 's'}`}
          action={
            <div className="w-52">
              <Label>Focus field</Label>
              <Select
                value={selectedField}
                disabled={mode !== 'view'}
                onChange={(e) => setSelectedField(e.target.value)}
              >
                <option value="">All fields</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {labels.get(f.id) ?? f.name}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {/* ── Boundary toolbar ── */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          {mode === 'view' && (
            <>
              <Button
                variant="primary"
                disabled={!selectedField}
                onClick={() => {
                  setNotice(null);
                  setDraft([]);
                  setMode('draw');
                }}
              >
                Draw new boundary
              </Button>
              <Button disabled={locating} onClick={locateMe}>
                {locating ? 'Locating…' : '◎ My location'}
              </Button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {selectedField
                  ? `Drawing for ${selectedFieldName}`
                  : 'Choose a field above to draw, edit or delete its boundaries.'}
              </span>
            </>
          )}

          {mode === 'draw' && (
            <>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Click the map to place points
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {draft.length} point{draft.length === 1 ? '' : 's'}
                {draft.length >= 3 && ` · ${formatArea(ringAreaHectares(draft), areaUnit)}`}
                {draft.length < 3 && ' · need at least 3'}
              </span>
              <div className="ml-auto flex gap-2">
                <Button disabled={locating} onClick={locateMe}>
                  {locating ? 'Locating…' : '◎ My location'}
                </Button>
                <Button disabled={draft.length === 0} onClick={() => setDraft((d) => d.slice(0, -1))}>
                  Undo point
                </Button>
                <Button onClick={cancelEditing}>Cancel</Button>
                <Button
                  variant="primary"
                  disabled={draft.length < 3 || busy}
                  onClick={() => void saveDraft()}
                >
                  {busy ? 'Saving…' : 'Save boundary'}
                </Button>
              </div>
            </>
          )}

          {mode === 'edit' && (
            <>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Drag the handles to reshape
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Drag a midpoint to add a corner · right-click a corner to remove it
              </span>
              <div className="ml-auto flex gap-2">
                <Button onClick={cancelEditing}>Cancel</Button>
                <Button variant="primary" disabled={busy} onClick={() => void saveEdit()}>
                  {busy ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="h-[520px] w-full overflow-hidden">
          <APIProvider apiKey={GOOGLE_MAPS_KEY}>
            <GoogleMap
              defaultCenter={FALLBACK_CENTER}
              defaultZoom={14}
              mapTypeId="hybrid"
              styles={MAP_STYLES}
              gestureHandling="greedy"
              streetViewControl={false}
              fullscreenControl
              style={{ width: '100%', height: '100%' }}
            >
              <MapController fitPoints={fitPoints} onReady={onMapReady} />
              <UserLocationLayer position={userPos} />

              <BoundaryLayer
                shapes={shapes}
                onSelect={onSelectShape}
                hiddenRingId={mode === 'edit' ? editingRingId : null}
                interactive={mode === 'view'}
              />

              {mode === 'edit' && editingRingId && (
                <EditableRing
                  key={editingRingId}
                  initialPoints={selectedRings.find((r) => r.id === editingRingId)?.points ?? []}
                  onChange={onRingEdited}
                />
              )}

              {mode === 'draw' && <DrawLayer points={draft} onAddPoint={onDrawPoint} />}

              <MarkerLayer pins={pins} interactive={mode === 'view'} />
            </GoogleMap>
          </APIProvider>
        </div>

        {/* ── Rings of the selected field ── */}
        {selectedField && mode === 'view' && (
          <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">
              Boundaries for {selectedFieldName}
            </p>
            {selectedRings.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                None drawn yet. Use “Draw new boundary” above.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {selectedRings.map((ring, i) => (
                  <li
                    key={ring.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
                  >
                    <span className="text-sm text-slate-700 dark:text-slate-200">
                      Boundary {i + 1}
                      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                        {formatArea(ringAreaHectares(ring.points), areaUnit)} · {ring.points.length} points
                      </span>
                    </span>
                    <span className="flex gap-1">
                      <Button
                        onClick={() => {
                          setNotice(null);
                          editedPoints.current = ring.points;
                          setEditingRingId(ring.id);
                          setMode('edit');
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-red-600 dark:text-red-400"
                        onClick={() => {
                          setNotice(null);
                          setDeleteTarget(ring);
                        }}
                      >
                        Delete
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Fields" subtitle={`Total ${formatWeight(totalKg(loads), unit)} across all fields`} />
        {fieldRows.length === 0 ? (
          <EmptyState title="No fields yet" hint="Add fields in Manage, or draw them in the mobile app." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium">Boundaries</th>
                  <th className="px-3 py-2 text-right font-medium">Area ({AREA_LABEL[areaUnit]})</th>
                  <th className="px-3 py-2 text-right font-medium">Loads</th>
                  <th className="px-3 py-2 text-right font-medium">Harvested</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Yield ({UNIT_LABEL[unit]}/{AREA_LABEL[areaUnit]})
                  </th>
                </tr>
              </thead>
              <tbody>
                {fieldRows.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => mode === 'view' && setSelectedField(f.id === selectedField ? '' : f.id)}
                    className={cx(
                      'border-b border-slate-100 last:border-0 dark:border-slate-800/70',
                      mode === 'view' && 'cursor-pointer',
                      f.id === selectedField
                        ? 'bg-brand-50 dark:bg-brand-900/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
                    )}
                  >
                    <td className="px-3 py-2 font-medium">{f.name}</td>
                    <td className="px-3 py-2">
                      {f.rings > 0 ? (
                        <span className="text-brand-600 dark:text-brand-300">
                          {f.rings} drawn
                        </span>
                      ) : (
                        <span className="text-slate-400">not drawn</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {f.hectares > 0 ? areaValue(f.hectares, areaUnit).toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.loads || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {f.kg > 0 ? formatWeight(f.kg, unit) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {f.hectares > 0 && f.kg > 0
                        ? formatWeight(f.kg / fromHa(f.hectares, areaUnit), unit).replace(
                            ` ${UNIT_LABEL[unit]}`,
                            '',
                          )
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {deleteTarget && (
        <Modal title="Delete this boundary?" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {formatArea(ringAreaHectares(deleteTarget.points), areaUnit)} on <strong>{selectedFieldName}</strong>.
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            The field's area will be recalculated from whatever boundaries remain. Weighing records are not
            affected. This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => void confirmDeleteRing()}>
              {busy ? 'Deleting…' : 'Delete boundary'}
            </Button>
          </div>
        </Modal>
      )}

      {showOrphanCleanup && (
        <Modal title="Remove abandoned boundaries?" onClose={() => setShowOrphanCleanup(false)} wide>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            These {orphanFieldIds.length} boundary records point at fields that no longer exist. Deleting a
            field in the mobile app removes its local copy but leaves the cloud row behind, so they build up
            over time.
          </p>
          <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-800">
            {orphanFieldIds.map((id) => (
              <li key={id} className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {id}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No weighing records reference them and nothing else reads them. This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setShowOrphanCleanup(false)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => void cleanUpOrphans()}>
              {busy ? 'Removing…' : `Remove ${orphanFieldIds.length} boundaries`}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

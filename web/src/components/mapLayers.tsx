import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import type { BoundaryPoint } from '../lib/types';
import type { Ring } from '../lib/boundaries';

/**
 * Every overlay here is created imperatively against the Google Maps instance
 * rather than as React children, because the maps API owns their lifecycle —
 * there are no declarative Polygon/Polyline/Marker components, and the classic
 * Marker (unlike AdvancedMarker) needs no Cloud-configured mapId.
 */

const BRAND = '#c47d00';
const GOLD = '#f5c842';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

// ── Field boundaries (read-only) ────────────────────────────────────────────

export interface FieldShape {
  fieldId: string;
  name: string;
  rings: Ring[];
  summary: string;
  highlighted: boolean;
}

export function BoundaryLayer({
  shapes,
  onSelect,
  hiddenRingId,
  interactive,
}: {
  shapes: FieldShape[];
  onSelect: (fieldId: string) => void;
  /** The ring currently being reshaped, drawn by EditableRing instead. */
  hiddenRingId?: string | null;
  /** False while drawing, so a polygon cannot swallow a point-placing click. */
  interactive: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const polygons: google.maps.Polygon[] = [];
    const info = new google.maps.InfoWindow();

    for (const shape of shapes) {
      for (const ring of shape.rings) {
        if (hiddenRingId && ring.id === hiddenRingId) continue;

        const polygon = new google.maps.Polygon({
          paths: ring.points,
          map,
          // One hue for every field; selection is carried by stroke weight and
          // fill opacity, so it still reads without colour vision.
          strokeColor: '#ffffff',
          strokeOpacity: 0.95,
          strokeWeight: shape.highlighted ? 4 : 2,
          fillColor: BRAND,
          fillOpacity: shape.highlighted ? 0.45 : 0.18,
          clickable: interactive,
        });

        polygon.addListener('click', (e: google.maps.PolyMouseEvent) => {
          onSelect(shape.fieldId);
          if (!e.latLng) return;
          info.setContent(
            `<div style="font:600 13px Inter,sans-serif;color:#111">${escapeHtml(shape.name)}</div>` +
              `<div style="font:400 12px Inter,sans-serif;color:#555;margin-top:2px">${escapeHtml(shape.summary)}</div>`,
          );
          info.setPosition(e.latLng);
          info.open({ map });
        });

        polygons.push(polygon);
      }
    }

    return () => {
      info.close();
      for (const p of polygons) p.setMap(null);
    };
  }, [map, shapes, onSelect, hiddenRingId]);

  return null;
}

// ── Reshaping one existing ring ─────────────────────────────────────────────

/**
 * Renders a single ring with draggable vertices. The initial geometry is
 * captured once at mount: feeding the live path back in as a prop would
 * rebuild the polygon mid-drag and drop the handle out from under the cursor.
 * Remount it (via a React `key`) to switch to a different ring.
 */
export function EditableRing({
  initialPoints,
  onChange,
}: {
  initialPoints: BoundaryPoint[];
  onChange: (points: BoundaryPoint[]) => void;
}) {
  const map = useMap();
  const startRef = useRef(initialPoints);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!map) return;

    const polygon = new google.maps.Polygon({
      paths: startRef.current,
      map,
      strokeColor: GOLD,
      strokeOpacity: 1,
      strokeWeight: 3,
      fillColor: GOLD,
      fillOpacity: 0.3,
      editable: true,
      draggable: false,
      zIndex: 10,
    });

    const path = polygon.getPath();
    const emit = () =>
      onChangeRef.current(path.getArray().map((ll) => ({ lat: ll.lat(), lng: ll.lng() })));

    // set_at fires on drag, insert_at when a midpoint handle is pulled out,
    // remove_at on right-click delete — all three change the shape.
    const listeners = [
      path.addListener('set_at', emit),
      path.addListener('insert_at', emit),
      path.addListener('remove_at', emit),
    ];

    return () => {
      for (const l of listeners) l.remove();
      polygon.setMap(null);
    };
  }, [map]);

  return null;
}

// ── Drawing a new ring ──────────────────────────────────────────────────────

export function DrawLayer({
  points,
  onAddPoint,
}: {
  points: BoundaryPoint[];
  onAddPoint: (p: BoundaryPoint) => void;
}) {
  const map = useMap();
  const onAddRef = useRef(onAddPoint);
  onAddRef.current = onAddPoint;

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) onAddRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
    // The crosshair is the only affordance telling the user the map is armed.
    const previousCursor = map.get('draggableCursor') as string | undefined;
    map.setOptions({ draggableCursor: 'crosshair' });

    return () => {
      listener.remove();
      map.setOptions({ draggableCursor: previousCursor ?? null });
    };
  }, [map]);

  useEffect(() => {
    if (!map || points.length === 0) return;

    const overlays: { setMap: (m: google.maps.Map | null) => void }[] = [];

    for (const [i, p] of points.entries()) {
      overlays.push(
        new google.maps.Marker({
          position: p,
          map,
          // The first vertex is emphasised: it is the one you close the shape on.
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: i === 0 ? '#ffffff' : GOLD,
            fillOpacity: 1,
            strokeColor: i === 0 ? GOLD : '#ffffff',
            strokeWeight: 2,
            scale: i === 0 ? 7 : 5,
          },
          zIndex: 20,
        }),
      );
    }

    if (points.length >= 2) {
      overlays.push(
        new google.maps.Polyline({
          path: points,
          map,
          strokeColor: GOLD,
          strokeOpacity: 1,
          strokeWeight: 3,
          zIndex: 15,
        }),
      );
    }

    if (points.length >= 3) {
      overlays.push(
        new google.maps.Polygon({
          paths: points,
          map,
          strokeOpacity: 0,
          fillColor: GOLD,
          fillOpacity: 0.22,
          clickable: false,
          zIndex: 12,
        }),
      );
    }

    return () => {
      for (const o of overlays) o.setMap(null);
    };
  }, [map, points]);

  return null;
}

// ── Weighing pins ───────────────────────────────────────────────────────────

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  lines: string[];
}

export function MarkerLayer({ pins, interactive }: { pins: MapPin[]; interactive: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const info = new google.maps.InfoWindow();
    const markers = pins.map((pin) => {
      const marker = new google.maps.Marker({
        position: { lat: pin.lat, lng: pin.lng },
        map,
        title: pin.title,
        // Clicks belong to the map while drawing, or the first tap would open
        // a popup instead of placing a point.
        clickable: interactive,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: BRAND,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 6,
        },
      });

      if (interactive) {
        marker.addListener('click', () => {
          info.setContent(
            `<div style="font:600 13px Inter,sans-serif;color:#111">${escapeHtml(pin.title)}</div>` +
              pin.lines
                .map(
                  (l) =>
                    `<div style="font:400 12px Inter,sans-serif;color:#555;margin-top:2px">${escapeHtml(l)}</div>`,
                )
                .join(''),
          );
          info.open({ map, anchor: marker });
        });
      }
      return marker;
    });

    return () => {
      info.close();
      for (const m of markers) m.setMap(null);
    };
  }, [map, pins, interactive]);

  return null;
}

// ── Map controller: exposes the instance and frames the data once ───────────

export interface UserPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * Hands the map instance back to the page (so toolbar buttons outside the map
 * can pan it) and frames the supplied points on first load.
 *
 * The fit runs once. Re-fitting whenever data changes would yank the viewport
 * out from under someone mid-edit, and re-centre the map every time a load
 * arrives over Realtime.
 */
export function MapController({
  fitPoints,
  onReady,
}: {
  fitPoints: BoundaryPoint[];
  onReady: (map: google.maps.Map) => void;
}) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (map) onReady(map);
  }, [map, onReady]);

  useEffect(() => {
    if (!map || fitted.current || fitPoints.length === 0) return;
    fitted.current = true;
    const bounds = new google.maps.LatLngBounds();
    for (const p of fitPoints) bounds.extend(p);
    map.fitBounds(bounds, 48);
  }, [map, fitPoints]);

  return null;
}

export function UserLocationLayer({ position }: { position: UserPosition | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !position) return;
    const center = { lat: position.lat, lng: position.lng };

    // The circle is the honest part: GPS accuracy on a phone in a field is
    // often tens of metres, and a bare dot would imply precision it lacks.
    const circle = new google.maps.Circle({
      map,
      center,
      radius: Math.max(position.accuracy, 5),
      strokeColor: '#2a78d6',
      strokeOpacity: 0.6,
      strokeWeight: 1,
      fillColor: '#2a78d6',
      fillOpacity: 0.15,
      clickable: false,
      zIndex: 30,
    });

    const dot = new google.maps.Marker({
      map,
      position: center,
      title: 'Your location',
      clickable: false,
      zIndex: 31,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: '#2a78d6',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2.5,
        scale: 7,
      },
    });

    return () => {
      circle.setMap(null);
      dot.setMap(null);
    };
  }, [map, position]);

  return null;
}

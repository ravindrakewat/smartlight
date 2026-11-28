'use client';

import type { LightStatusName, PoleMapItemDto } from '@smart-light/shared';
import { cn } from '@smart-light/ui';
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';

/** Free dark vector tiles with no API key (OpenFreeMap), matching the console's midnight theme. Replace with own tiles for production scale. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
const INDIA_CENTER: [number, number] = [78.9629, 22.5937];

/** Map colours come from the design tokens so the map matches the rest of the console. */
const STATUS_TOKEN: Record<LightStatusName, string> = {
  ON: '--color-success',
  DIMMED: '--color-info',
  OFF: '--color-neutral',
  FAULT: '--color-danger',
  OFFLINE: '--color-warning',
  UNKNOWN: '--color-muted-foreground',
};

function tokenColor(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#64748b';
}

/** How strongly each status glows: lit and faulty lights shine, dark ones barely. */
const GLOW_LEVEL: Record<LightStatusName, number> = {
  ON: 0.9,
  DIMMED: 0.75,
  FAULT: 0.9,
  OFFLINE: 0.7,
  OFF: 0.2,
  UNKNOWN: 0.12,
};

/** Glow opacity per status, multiplied by `pulse` (0–1) for the gentle breathing effect. */
function glowOpacity(pulse: number): unknown[] {
  const expression: unknown[] = ['match', ['get', 'status']];
  for (const [status, level] of Object.entries(GLOW_LEVEL)) {
    expression.push(status, Number((level * pulse).toFixed(3)));
  }
  expression.push(0.08);
  return expression;
}

const GLOW_OPACITY = glowOpacity(1);
/** One slow breath of the glow, in milliseconds. */
const PULSE_MS = 2400;

/**
 * Let the halo breathe slowly (between 55 % and 100 % of its strength). Skipped when
 * the user asks for reduced motion. Returns a function that stops it.
 */
function startGlowPulse(instance: MapLibreMap): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  let frame = 0;
  let last = 0;
  const tick = (time: number) => {
    // About 15 updates a second is smooth enough and keeps the map light.
    if (time - last > 66 && instance.getLayer('pole-glow')) {
      last = time;
      const pulse = 0.775 + 0.225 * Math.sin((time / PULSE_MS) * 2 * Math.PI);
      instance.setPaintProperty('pole-glow', 'circle-opacity', glowOpacity(pulse) as never);
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

function toGeoJson(poles: PoleMapItemDto[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: poles.map((pole) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pole.longitude, pole.latitude] },
      properties: { id: pole.id, code: pole.code, status: pole.lightStatus },
    })),
  };
}

export interface PoleMapProps {
  poles: PoleMapItemDto[];
  label: string;
  statusLabel: (status: LightStatusName) => string;
  openLabel: string;
  onOpen: (poleId: string) => void;
  /** Height and other layout classes; defaults to a large map. */
  className?: string;
  /** Called with the pole's id when a dot is clicked (e.g. to show it in a side panel). */
  onSelect?: (poleId: string) => void;
  /** Pole drawn with a ring. */
  selectedId?: string | null;
  /** Change it (e.g. the zone filter) to zoom to the poles shown again. */
  fitKey?: string;
}

/**
 * Every pole as a dot coloured by its light status. Clicking a dot shows the
 * pole code and status with a link to the pole page. The data is also
 * available as text (legend counts and the poles list) for screen readers.
 */
export function PoleMap({
  poles,
  label,
  statusLabel,
  openLabel,
  onOpen,
  className,
  onSelect,
  selectedId = null,
  fitKey,
}: PoleMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const fitted = useRef(false);
  const stopPulse = useRef<() => void>(() => {});
  const latest = useRef({ poles, statusLabel, openLabel, onOpen, onSelect, selectedId });
  latest.current = { poles, statusLabel, openLabel, onOpen, onSelect, selectedId };

  useEffect(() => {
    let cancelled = false;
    void import('maplibre-gl').then(({ Map, NavigationControl, Popup }) => {
      if (cancelled || !container.current) return;
      const instance = new Map({
        container: container.current,
        style: STYLE_URL,
        center: INDIA_CENTER,
        zoom: 4,
        attributionControl: { compact: true },
      });
      map.current = instance;
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');

      instance.on('load', () => {
        const colorByStatus: unknown[] = ['match', ['get', 'status']];
        for (const [status, token] of Object.entries(STATUS_TOKEN)) {
          colorByStatus.push(status, tokenColor(token));
        }
        colorByStatus.push(tokenColor('--color-muted-foreground'));

        instance.addSource('poles', { type: 'geojson', data: toGeoJson(latest.current.poles) });
        // Soft halo in the status colour, like light on the street (decorative).
        instance.addLayer({
          id: 'pole-glow',
          type: 'circle',
          source: 'poles',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 11, 13, 15, 15, 22, 18, 30],
            'circle-color': colorByStatus as never,
            'circle-blur': 0.85,
            'circle-opacity': GLOW_OPACITY as never,
          },
        });
        instance.addLayer({
          id: 'poles',
          type: 'circle',
          source: 'poles',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 15, 7, 18, 10],
            'circle-color': colorByStatus as never,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255, 255, 255, 0.75)',
          },
        });
        // Bright core on lights that are lit.
        instance.addLayer({
          id: 'pole-core',
          type: 'circle',
          source: 'poles',
          filter: ['in', ['get', 'status'], ['literal', ['ON', 'DIMMED']]],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 15, 2.6, 18, 3.6],
            'circle-color': '#ffffff',
          },
        });
        stopPulse.current = startGlowPulse(instance);
        // Ring around the selected pole.
        instance.addLayer({
          id: 'pole-selected',
          type: 'circle',
          source: 'poles',
          filter: ['==', ['get', 'id'], latest.current.selectedId ?? ''],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 7, 15, 12, 18, 15],
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-width': 3,
            'circle-stroke-color': tokenColor('--color-ring'),
          },
        });

        instance.on('click', 'poles', (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (!feature || feature.geometry.type !== 'Point') return;
          const { id, code, status } = feature.properties as {
            id: string;
            code: string;
            status: LightStatusName;
          };
          latest.current.onSelect?.(id);
          // Built with DOM APIs (no HTML strings): codes come from the database.
          const content = document.createElement('div');
          content.className = 'grid gap-1 text-sm';
          const title = document.createElement('strong');
          title.className = 'font-mono';
          title.textContent = code;
          const state = document.createElement('span');
          state.textContent = latest.current.statusLabel(status);
          const open = document.createElement('button');
          open.type = 'button';
          open.className = 'text-left font-semibold text-primary underline';
          open.textContent = latest.current.openLabel;
          open.addEventListener('click', () => latest.current.onOpen(id));
          content.append(title, state, open);
          new Popup({ closeButton: true })
            .setLngLat(feature.geometry.coordinates as [number, number])
            .setDOMContent(content)
            .addTo(instance);
        });
        instance.on('mouseenter', 'poles', () => (instance.getCanvas().style.cursor = 'pointer'));
        instance.on('mouseleave', 'poles', () => (instance.getCanvas().style.cursor = ''));
        fitToPoles();
      });
    });
    return () => {
      cancelled = true;
      stopPulse.current();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  function fitToPoles() {
    const instance = map.current;
    const current = latest.current.poles;
    if (!instance || fitted.current || current.length === 0) return;
    let [west, south, east, north] = [180, 90, -180, -90];
    for (const pole of current) {
      west = Math.min(west, pole.longitude);
      east = Math.max(east, pole.longitude);
      south = Math.min(south, pole.latitude);
      north = Math.max(north, pole.latitude);
    }
    instance.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 48, maxZoom: 16, duration: 0 },
    );
    fitted.current = true;
  }

  useEffect(() => {
    const instance = map.current;
    if (instance?.getLayer('pole-selected')) {
      instance.setFilter('pole-selected', ['==', ['get', 'id'], selectedId ?? '']);
    }
  }, [selectedId]);

  useEffect(() => {
    fitted.current = false;
  }, [fitKey]);

  useEffect(() => {
    const source = map.current?.getSource('poles') as GeoJSONSource | undefined;
    if (source) {
      source.setData(toGeoJson(poles));
      fitToPoles();
    }
  }, [poles]);

  return (
    <div
      ref={container}
      role="region"
      aria-label={label}
      className={cn(
        'h-[65vh] min-h-96 w-full overflow-hidden rounded-xl border border-border',
        className,
      )}
    />
  );
}

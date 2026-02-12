'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { loadLandData } from '@/components/maps/landData';
import type { FigureEvidenceTimelineEvent } from '@/types';

function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === 'boolean') setIsDark(detail);
    };
    window.addEventListener('historyrank:theme', handler as EventListener);
    return () => window.removeEventListener('historyrank:theme', handler as EventListener);
  }, []);
  return isDark;
}

interface FigureTimelineMapProps {
  events: FigureEvidenceTimelineEvent[];
}

type TimelineMapEvent = {
  id: number;
  label: string;
  description: string | null;
  placeLabel: string | null;
  lat: number;
  lon: number;
  year: number | null;
  dateLabel: string;
  order: number;
};

type ProjectedEvent = TimelineMapEvent & {
  x: number;
  y: number;
};

type LocationPoint = {
  key: string;
  lat: number;
  lon: number;
  x: number;
  y: number;
  placeLabel: string | null;
  events: TimelineMapEvent[];
  firstOrder: number;
  lastOrder: number;
};

type TooltipState = {
  location: LocationPoint;
  x: number;
  y: number;
};

type SpanMode = 'world' | 'regional' | 'local';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatYear(year: number | null): string {
  if (year === null) return 'Unknown';
  return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
}

function formatEventDateLabel(event: FigureEvidenceTimelineEvent): string {
  const metadata = event.metadata as Record<string, unknown>;
  const precision = typeof metadata?.date_precision === 'string' ? metadata.date_precision : null;
  const isEstimated = metadata?.date_is_estimated === true;

  const yearRaw = metadata?.event_year;
  const monthRaw = metadata?.event_month;
  const dayRaw = metadata?.event_day;

  const year =
    typeof yearRaw === 'number' && Number.isFinite(yearRaw)
      ? yearRaw
      : event.eventStartYear ?? event.eventEndYear ?? null;
  const month = typeof monthRaw === 'number' && Number.isFinite(monthRaw) ? monthRaw : null;
  const day = typeof dayRaw === 'number' && Number.isFinite(dayRaw) ? dayRaw : null;

  if (year === null) return 'Date unknown';

  let label: string;
  if (precision === 'day' && month !== null && day !== null && month >= 1 && month <= 12) {
    label = `${day} ${MONTH_NAMES[month - 1]} ${formatYear(year)}`;
  } else if (precision === 'month' && month !== null && month >= 1 && month <= 12) {
    label = `${MONTH_NAMES[month - 1]} ${formatYear(year)}`;
  } else {
    label = formatYear(year);
  }

  return isEstimated ? `c. ${label}` : label;
}

function clampLat(lat: number): number {
  return Math.max(-85, Math.min(85, lat));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveSpanMode(points: TimelineMapEvent[]): SpanMode {
  if (points.length <= 1) return 'local';
  const lonValues = points.map((p) => p.lon);
  const latValues = points.map((p) => p.lat);
  const lonSpan = Math.max(...lonValues) - Math.min(...lonValues);
  const latSpan = Math.max(...latValues) - Math.min(...latValues);
  if (lonSpan >= 80 || latSpan >= 45) return 'world';
  if (lonSpan >= 6 || latSpan >= 4.5) return 'regional';
  return 'local';
}

function buildProjection(
  width: number,
  height: number,
  points: TimelineMapEvent[],
  mode: SpanMode
): d3.GeoProjection {
  const padding = 18;

  if (mode === 'world') {
    const projection = d3.geoNaturalEarth1();
    const sphere = { type: 'Sphere' } as const;
    projection.fitExtent(
      [
        [padding, padding],
        [width - padding, height - padding],
      ],
      sphere as unknown as d3.GeoPermissibleObjects
    );
    return projection;
  }

  const lonValues = points.map((p) => p.lon);
  const latValues = points.map((p) => p.lat);

  const minLon = Math.min(...lonValues);
  const maxLon = Math.max(...lonValues);
  const minLat = Math.min(...latValues);
  const maxLat = Math.max(...latValues);

  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;

  const minLonSpan = mode === 'local' ? 0.45 : 6;
  const minLatSpan = mode === 'local' ? 0.35 : 4;

  const lonHalf = Math.max((maxLon - minLon) / 2, minLonSpan / 2);
  const latHalf = Math.max((maxLat - minLat) / 2, minLatSpan / 2);

  const paddedMinLon = centerLon - lonHalf;
  const paddedMaxLon = centerLon + lonHalf;
  const paddedMinLat = clampLat(centerLat - latHalf);
  const paddedMaxLat = clampLat(centerLat + latHalf);

  const bboxFeature = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [paddedMinLon, paddedMinLat],
        [paddedMaxLon, paddedMinLat],
        [paddedMaxLon, paddedMaxLat],
        [paddedMinLon, paddedMaxLat],
        [paddedMinLon, paddedMinLat],
      ]],
    },
    properties: {},
  } as const;

  const projection = d3.geoMercator();
  projection.fitExtent(
    [
      [padding, padding],
      [width - padding, height - padding],
    ],
    bboxFeature as unknown as d3.GeoPermissibleObjects
  );
  return projection;
}

function groupLocations(projectedEvents: ProjectedEvent[]): LocationPoint[] {
  const groups = new Map<string, LocationPoint>();

  for (const event of projectedEvents) {
    const key = `${event.lat.toFixed(4)}|${event.lon.toFixed(4)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.events.push(event);
      existing.firstOrder = Math.min(existing.firstOrder, event.order);
      existing.lastOrder = Math.max(existing.lastOrder, event.order);
      if (!existing.placeLabel && event.placeLabel) existing.placeLabel = event.placeLabel;
    } else {
      groups.set(key, {
        key,
        lat: event.lat,
        lon: event.lon,
        x: event.x,
        y: event.y,
        placeLabel: event.placeLabel,
        events: [event],
        firstOrder: event.order,
        lastOrder: event.order,
      });
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      events: group.events.sort((a, b) => {
        const aYear = a.year ?? Number.POSITIVE_INFINITY;
        const bYear = b.year ?? Number.POSITIVE_INFINITY;
        if (aYear !== bYear) return aYear - bYear;
        return a.order - b.order;
      }),
    }))
    .sort((a, b) => a.firstOrder - b.firstOrder);
}

const THEME = {
  light: {
    bgGradient: ['#faf8f4', '#f2ede5'],
    land: { fill: 'rgba(214, 207, 196, 0.6)', stroke: 'rgba(120, 113, 108, 0.3)', strokeWidth: 0.65 },
    hudBracket: 'rgba(120, 113, 108, 0.2)',
    path: 'rgba(245, 158, 11, 0.5)',
    dotStroke: 'rgba(255, 255, 255, 0.95)',
    colorRange: ['#3b82f6', '#3b82f6'] as [string, string],
    labelFill: 'rgba(87, 83, 78, 0.85)',
  },
  dark: {
    bgGradient: ['#232831', '#141821'],
    land: { fill: 'rgba(200, 180, 150, 0.1)', stroke: 'rgba(200, 180, 150, 0.18)', strokeWidth: 0.65 },
    hudBracket: 'rgba(200, 180, 150, 0.3)',
    path: 'rgba(200, 170, 120, 0.7)',
    dotStroke: 'rgba(255, 255, 255, 0.9)',
    colorRange: ['#60a5fa', '#60a5fa'] as [string, string],
    labelFill: 'rgba(220, 200, 160, 0.9)',
  },
} as const;

export function FigureTimelineMap({ events }: FigureTimelineMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const uid = useId().replace(/:/g, '');
  const isDark = useIsDark();

  const points = useMemo(() => {
    const parsed = events
      .map((event, index): TimelineMapEvent | null => {
        const lat = toNumber(event.placeLat);
        const lon = toNumber(event.placeLon);
        if (lat === null || lon === null) return null;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

        const metadata = event.metadata as Record<string, unknown>;
        const metadataYear = toNumber(metadata?.event_year);
        const year = metadataYear ?? event.eventStartYear ?? event.eventEndYear ?? null;

        return {
          id: event.id,
          label: event.eventLabel,
          description: event.eventDescription,
          placeLabel: event.placeLabel,
          lat,
          lon,
          year,
          dateLabel: formatEventDateLabel(event),
          order: index,
        };
      })
      .filter((point): point is TimelineMapEvent => point !== null);

    return parsed.sort((a, b) => {
      const aYear = a.year ?? Number.POSITIVE_INFINITY;
      const bYear = b.year ?? Number.POSITIVE_INFINITY;
      if (aYear !== bYear) return aYear - bYear;
      return a.order - b.order;
    });
  }, [events]);

  const spanMode = useMemo(() => resolveSpanMode(points), [points]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDimensions({
        width,
        height: Math.max(230, Math.min(380, width * 0.56)),
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return;

    const theme = isDark ? THEME.dark : THEME.light;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = dimensions.width;
    const height = dimensions.height;
    svg.attr('width', width).attr('height', height);

    const bgGradientId = `${uid}-timeline-map-bg`;
    const markerGlowId = `${uid}-timeline-map-glow`;

    const defs = svg.append('defs');
    const bgGradient = defs
      .append('linearGradient')
      .attr('id', bgGradientId)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '100%');
    bgGradient.append('stop').attr('offset', '0%').attr('stop-color', theme.bgGradient[0]);
    bgGradient.append('stop').attr('offset', '100%').attr('stop-color', theme.bgGradient[1]);

    const glowFilter = defs
      .append('filter')
      .attr('id', markerGlowId)
      .attr('x', '-80%')
      .attr('y', '-80%')
      .attr('width', '260%')
      .attr('height', '260%');
    glowFilter.append('feGaussianBlur').attr('stdDeviation', isDark ? 3 : 2.5).attr('result', 'blur');
    const merge = glowFilter.append('feMerge');
    merge.append('feMergeNode').attr('in', 'blur');
    merge.append('feMergeNode').attr('in', 'SourceGraphic');

    svg.append('rect').attr('width', width).attr('height', height).attr('fill', `url(#${bgGradientId})`);

    const hudLayer = svg.append('g').attr('class', 'hud-layer');
    const bracket = 16;
    const inset = 10;
    const corners = [
      `M ${inset + bracket} ${inset} L ${inset} ${inset} L ${inset} ${inset + bracket}`,
      `M ${width - inset - bracket} ${inset} L ${width - inset} ${inset} L ${width - inset} ${inset + bracket}`,
      `M ${width - inset} ${height - inset - bracket} L ${width - inset} ${height - inset} L ${width - inset - bracket} ${height - inset}`,
      `M ${inset} ${height - inset - bracket} L ${inset} ${height - inset} L ${inset + bracket} ${height - inset}`,
    ];
    corners.forEach((path) => {
      hudLayer
        .append('path')
        .attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', theme.hudBracket)
        .attr('stroke-width', 1.3);
    });

    if (points.length === 0) return;

    const projection = buildProjection(width, height, points, spanMode);
    const geoPath = d3.geoPath(projection);

    const viewport = svg.append('g').attr('class', 'timeline-map-viewport');
    const landGroup = viewport.append('g').attr('class', 'land');
    const pathGroup = viewport.append('g').attr('class', 'timeline-path');
    const pointsGroup = viewport.append('g').attr('class', 'timeline-points');
    const labelsGroup = viewport.append('g').attr('class', 'timeline-labels');

    const projectedEvents = points
      .map((point) => {
        const coords = projection([point.lon, point.lat]);
        if (!coords) return null;
        return { ...point, x: coords[0], y: coords[1] };
      })
      .filter((point): point is ProjectedEvent => point !== null);

    const locations = groupLocations(projectedEvents);

    const pathCoordinates = projectedEvents
      .map((p) => [p.x, p.y] as [number, number])
      .filter((coord, index, arr) => {
        if (index === 0) return true;
        const prev = arr[index - 1];
        return Math.hypot(coord[0] - prev[0], coord[1] - prev[1]) > 0.2;
      });

    const lineBuilder = d3
      .line<[number, number]>()
      .x((d) => d[0])
      .y((d) => d[1])
      .curve(d3.curveCatmullRom.alpha(0.5));

    let pathSelection: d3.Selection<SVGPathElement, unknown, null, undefined> | null = null;
    if (pathCoordinates.length > 1) {
      pathSelection = pathGroup
        .append('path')
        .attr('d', lineBuilder(pathCoordinates) || '')
        .attr('fill', 'none')
        .attr('stroke', theme.path)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round');
    }

    const colorScale = d3
      .scaleLinear<string>()
      .domain([0, Math.max(1, points.length - 1)])
      .range(theme.colorRange);

    let hoveredKey: string | null = null;
    let currentK = 1;

    const circles = pointsGroup
      .selectAll<SVGCircleElement, LocationPoint>('circle')
      .data(locations, (d) => d.key)
      .enter()
      .append('circle')
      .attr('class', 'timeline-location-dot')
      .attr('cx', (d) => d.x)
      .attr('cy', (d) => d.y)
      .attr('fill', (d) => colorScale(d.firstOrder))
      .attr('fill-opacity', 0.96)
      .attr('stroke', theme.dotStroke)
      .attr('filter', `url(#${markerGlowId})`)
      .on('mouseenter', function (event: MouseEvent, d: LocationPoint) {
        hoveredKey = d.key;
        updateZoomSensitiveStyles(currentK);
        if (!containerRef.current) return;
        const bounds = containerRef.current.getBoundingClientRect();
        setTooltip({
          location: d,
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        });
      })
      .on('mousemove', (event: MouseEvent, d: LocationPoint) => {
        if (!containerRef.current) return;
        const bounds = containerRef.current.getBoundingClientRect();
        setTooltip({
          location: d,
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        });
      })
      .on('mouseleave', () => {
        hoveredKey = null;
        updateZoomSensitiveStyles(currentK);
        setTooltip(null);
      });

    const labels = labelsGroup
      .selectAll<SVGTextElement, LocationPoint>('text')
      .data(locations, (d) => d.key)
      .enter()
      .append('text')
      .attr('class', 'timeline-location-label')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y)
      .attr('fill', theme.labelFill)
      .attr('font-weight', 700)
      .text((d) => {
        if (d.events.length === 1) return `${d.firstOrder + 1}`;
        return `${d.firstOrder + 1}-${d.lastOrder + 1}`;
      });

    function baseRadiusForLocation(location: LocationPoint): number {
      return 7 + Math.min(4, (location.events.length - 1) * 0.8);
    }

    function updateZoomSensitiveStyles(k: number) {
      const inv = 1 / Math.max(1, k);
      circles
        .attr('r', (d) => {
          const base = baseRadiusForLocation(d);
          const hoveredBoost = hoveredKey === d.key ? 1.2 : 1;
          return base * hoveredBoost * inv;
        })
        .attr('stroke-width', 1.2 * inv);

      labels
        .attr('dx', (d) => (d.events.length > 1 ? 9 : 8) * inv)
        .attr('dy', -7 * inv)
        .attr('font-size', `${10 * inv}px`);

      if (pathSelection) {
        pathSelection.attr('stroke-width', 2.1 * inv);
      }
    }

    updateZoomSensitiveStyles(1);

    loadLandData().then((land) => {
      if (!land) return;
      const features = land.type === 'FeatureCollection' ? land.features : [land];
      landGroup
        .selectAll<SVGPathElement, unknown>('path')
        .data(features as unknown[])
        .enter()
        .append('path')
        .attr('d', (feature) => geoPath(feature as d3.GeoPermissibleObjects) || '')
        .attr('fill', theme.land.fill)
        .attr('stroke', theme.land.stroke)
        .attr('stroke-width', theme.land.strokeWidth)
        .attr('vector-effect', 'non-scaling-stroke');
    });

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent(spanMode === 'world' ? [1, 12] : spanMode === 'regional' ? [1, 36] : [1, 80])
      .translateExtent([
        [-width * 6, -height * 6],
        [width * 7, height * 7],
      ])
      .on('start', () => {
        svg.style('cursor', 'grabbing');
      })
      .on('zoom', (event) => {
        currentK = event.transform.k;
        viewport.attr('transform', event.transform.toString());
        updateZoomSensitiveStyles(currentK);
      })
      .on('end', () => {
        svg.style('cursor', 'grab');
      });

    svg.style('cursor', 'grab');
    svg.call(zoom);
    svg.on('dblclick.zoom', null);

    if (locations.length > 0) {
      const xs = locations.map((p) => p.x);
      const ys = locations.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const clusterWidth = Math.max(10, maxX - minX);
      const clusterHeight = Math.max(10, maxY - minY);

      const desiredScale = Math.min((width * 0.9) / clusterWidth, (height * 0.9) / clusterHeight);
      const startScale =
        spanMode === 'local'
          ? clamp(desiredScale, 10, 46)
          : spanMode === 'regional'
            ? clamp(desiredScale, 1.8, 14)
            : clamp(desiredScale, 1, 2.6);

      const translateX = width / 2 - centerX * startScale;
      const translateY = height / 2 - centerY * startScale;

      svg.call(zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(startScale));
    }
  }, [dimensions.height, dimensions.width, points, spanMode, uid, isDark]);

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200/70 bg-white/90 p-4 text-sm text-stone-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300">
        No mappable event coordinates yet.
      </div>
    );
  }

  const modeLabel = spanMode === 'world' ? 'World scale' : spanMode === 'regional' ? 'Regional scale' : 'Local scale';

  return (
    <div className="rounded-xl border border-stone-200/75 bg-white p-4 shadow-sm dark:border-amber-900/30 dark:bg-slate-900/95">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-stone-500 dark:text-amber-200/80">
          Event map
        </div>
        <div className="text-xs text-stone-400 dark:text-amber-100/70">{modeLabel}</div>
      </div>

      <div ref={containerRef} className="relative w-full">
        <svg ref={svgRef} className="h-auto w-full rounded-lg border border-stone-200 dark:border-amber-900/35" />

        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 w-72 rounded-xl border border-stone-200 bg-white/96 p-3 text-xs text-stone-700 shadow-lg backdrop-blur-sm dark:border-amber-800/55 dark:bg-slate-950/96 dark:text-slate-200"
            style={{
              left: Math.min(tooltip.x + 14, dimensions.width - 292),
              top: Math.max(tooltip.y - 12, 10),
            }}
          >
            <div className="text-sm font-semibold text-stone-900 dark:text-amber-200">
              {tooltip.location.placeLabel || 'Mapped location'}
            </div>
            {tooltip.location.events.length === 1 ? (
              <div className="mt-2 space-y-1.5">
                <div className="text-[11px] text-stone-500 dark:text-amber-100/75">{tooltip.location.events[0].dateLabel}</div>
                <div className="text-[12px] font-medium text-stone-800 dark:text-slate-100">{tooltip.location.events[0].label}</div>
                {tooltip.location.events[0].description && (
                  <div className="text-[11px] leading-relaxed text-stone-600 dark:text-slate-300/95">
                    {tooltip.location.events[0].description}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                <div className="text-[11px] text-stone-500 dark:text-amber-100/75">
                  {tooltip.location.events.length} events at this location
                </div>
                {tooltip.location.events.slice(0, 8).map((event) => (
                  <div key={event.id} className="text-[11px] text-stone-700 dark:text-slate-200/95">
                    <span className="font-medium text-amber-700 dark:text-amber-200/85">{event.dateLabel}</span>
                    {' \u00b7 '}
                    {event.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-stone-500 dark:text-amber-100/70">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500 dark:bg-blue-400" />
          Events
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-4 bg-amber-500/50 dark:bg-amber-300/90" />
          Chronological path
        </span>
        <span className="text-stone-400 dark:text-amber-100/60">Markers are plotted at true coordinates</span>
      </div>
    </div>
  );
}

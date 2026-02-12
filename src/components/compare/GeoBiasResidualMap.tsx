'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { loadLandData } from '@/components/maps/landData';

type ResidualPoint = {
  region: string;
  lat: number;
  lon: number;
  diffPct: number;
  modelPct: number;
  baselinePct: number;
  zScore: number;
};

type TooltipState = {
  point: ResidualPoint;
  x: number;
  y: number;
};

interface GeoBiasResidualMapProps {
  modelLabel: string;
  points: ResidualPoint[];
}

function formatSigned(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}

function bubbleColor(diffPct: number) {
  if (diffPct > 0) return '#10b981';
  if (diffPct < 0) return '#f43f5e';
  return '#78716c';
}

export function GeoBiasResidualMap({ modelLabel, points }: GeoBiasResidualMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const maxAbsDiff = useMemo(
    () => points.reduce((max, point) => Math.max(max, Math.abs(point.diffPct)), 0),
    [points]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width,
        height: Math.max(360, height),
      });
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', dimensions.width).attr('height', dimensions.height);

    const width = dimensions.width;
    const height = dimensions.height;

    const projection = d3.geoNaturalEarth1();
    projection.fitSize([width, height], { type: 'Sphere' });
    const path = d3.geoPath(projection);

    const defs = svg.append('defs');
    const bgGradient = defs
      .append('linearGradient')
      .attr('id', 'geo-bias-map-bg')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '100%');

    bgGradient.append('stop').attr('offset', '0%').attr('stop-color', '#faf8f2');
    bgGradient.append('stop').attr('offset', '100%').attr('stop-color', '#f1ece3');

    svg
      .append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'url(#geo-bias-map-bg)');

    const graticule = d3.geoGraticule().step([30, 30]);
    svg
      .append('path')
      .datum(graticule())
      .attr('d', path as any)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(120,113,108,0.11)')
      .attr('stroke-width', 0.6);

    const landGroup = svg.append('g');
    const bubblesGroup = svg.append('g');

    loadLandData().then((land) => {
      if (land) {
        landGroup
          .selectAll('path')
          .data(land.type === 'FeatureCollection' ? land.features : [land])
          .enter()
          .append('path')
          .attr('d', path as any)
          .attr('fill', 'rgba(214, 207, 196, 0.72)')
          .attr('stroke', 'rgba(120, 113, 108, 0.28)')
          .attr('stroke-width', 0.6)
          .attr('vector-effect', 'non-scaling-stroke');
      }

      const radiusScale = d3
        .scaleSqrt()
        .domain([0, Math.max(maxAbsDiff, 1)])
        .range([5, 26]);

      bubblesGroup
        .selectAll('circle')
        .data(points, (d: any) => d.region)
        .enter()
        .append('circle')
        .attr('r', (d) => radiusScale(Math.abs(d.diffPct)))
        .attr('fill', (d) => bubbleColor(d.diffPct))
        .attr('fill-opacity', 0.78)
        .attr('stroke', 'rgba(255,255,255,0.9)')
        .attr('stroke-width', 1)
        .attr('transform', (d) => {
          const coords = projection([d.lon, d.lat]);
          return coords ? `translate(${coords[0]}, ${coords[1]})` : '';
        })
        .on('mouseenter', function (event: MouseEvent, d: ResidualPoint) {
          d3.select(this).attr('stroke-width', 1.8);
          if (!containerRef.current) return;
          const bounds = containerRef.current.getBoundingClientRect();
          setTooltip({
            point: d,
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          });
        })
        .on('mousemove', (event: MouseEvent, d: ResidualPoint) => {
          if (!containerRef.current) return;
          const bounds = containerRef.current.getBoundingClientRect();
          setTooltip({
            point: d,
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          });
        })
        .on('mouseleave', function () {
          d3.select(this).attr('stroke-width', 1);
          setTooltip(null);
        });
    });
  }, [dimensions.height, dimensions.width, maxAbsDiff, points]);

  return (
    <div className="relative h-full w-full" ref={containerRef}>
      <svg ref={svgRef} className="h-full w-full rounded-xl border border-stone-200/70 dark:border-slate-700" />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 w-64 rounded-xl border border-stone-200/80 bg-white/95 p-3 text-xs text-stone-700 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200"
          style={{
            left: Math.min(tooltip.x + 14, dimensions.width - 276),
            top: Math.max(tooltip.y - 10, 10),
          }}
        >
          <div className="text-sm font-semibold text-stone-900 dark:text-amber-100">{tooltip.point.region}</div>
          <div className="mt-1 text-[11px] text-stone-500 dark:text-slate-400">{modelLabel}</div>
          <div className="mt-2 space-y-1.5 text-[11px]">
            <div className="flex justify-between gap-3">
              <span>Delta</span>
              <span className="font-mono">{formatSigned(tooltip.point.diffPct)} pp</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Model share</span>
              <span className="font-mono">{tooltip.point.modelPct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Baseline share</span>
              <span className="font-mono">{tooltip.point.baselinePct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>z-score</span>
              <span className="font-mono">{tooltip.point.zScore.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

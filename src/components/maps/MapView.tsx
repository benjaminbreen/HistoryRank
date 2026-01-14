'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { loadLandData } from './landData';
import { REGION_COLORS, type MapPoint } from '@/types';

type MapViewProps = {
  points: MapPoint[];
  onSelect: (point: MapPoint) => void;
};

type TooltipState = {
  point: MapPoint;
  x: number;
  y: number;
};

export function MapView({ points, onSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width,
        height: Math.max(420, height),
      });
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = dimensions.width;
    const height = dimensions.height;
    svg.attr('width', width).attr('height', height);

    const projection = d3.geoNaturalEarth1();
    const path = d3.geoPath(projection);
    projection.fitSize([width, height], { type: 'Sphere' });

    const defs = svg.append('defs');
    const bgGradient = defs.append('linearGradient')
      .attr('id', 'map-bg-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '100%');

    bgGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#fbf8f2');
    bgGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#f4efe6');

    svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'url(#map-bg-gradient)');

    const graticule = d3.geoGraticule().step([30, 30]);
    const graticulePath = svg.append('path')
      .datum(graticule())
      .attr('d', path as any)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(120, 113, 108, 0.12)')
      .attr('stroke-width', 0.6);

    const landGroup = svg.append('g').attr('class', 'land');
    const pointsGroup = svg.append('g').attr('class', 'points');

    loadLandData().then((land) => {
      if (land) {
        landGroup
          .selectAll('path')
          .data(land.type === 'FeatureCollection' ? land.features : [land])
          .enter()
          .append('path')
          .attr('d', path as any)
          .attr('fill', 'rgba(214, 207, 196, 0.7)')
          .attr('stroke', 'rgba(120, 113, 108, 0.28)')
          .attr('stroke-width', 0.6)
          .attr('vector-effect', 'non-scaling-stroke');
      }

      const circles = pointsGroup
        .selectAll('circle')
        .data(points, (d: any) => d.id)
        .enter()
        .append('circle')
        .attr('r', 3.1)
        .attr('fill', (d: any) => REGION_COLORS[d.regionSub || ''] || '#9ca3af')
        .attr('fill-opacity', 0.7)
        .attr('stroke', 'rgba(255, 255, 255, 0.65)')
        .attr('stroke-width', 0.6)
        .attr('transform', (d: any) => {
          const coords = projection([d.lon, d.lat]);
          return coords ? `translate(${coords[0]}, ${coords[1]})` : '';
        })
        .style('transition', 'transform 180ms ease, r 180ms ease, fill-opacity 180ms ease');

      circles
        .on('mouseenter', function (event: MouseEvent, d: any) {
          d3.select(this).attr('r', 5).attr('fill-opacity', 0.95);
          if (!containerRef.current) return;
          const bounds = containerRef.current.getBoundingClientRect();
          setTooltip({
            point: d,
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          });
        })
        .on('mousemove', (event: MouseEvent, d: any) => {
          if (!containerRef.current) return;
          const bounds = containerRef.current.getBoundingClientRect();
          setTooltip({
            point: d,
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          });
        })
        .on('mouseleave', function () {
          d3.select(this).attr('r', 3.1).attr('fill-opacity', 0.7);
          setTooltip(null);
        })
        .on('click', (_event: MouseEvent, d: any) => {
          onSelect(d);
        });
    });

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 6])
      .on('zoom', (event) => {
        const transform = event.transform;
        landGroup.attr('transform', transform.toString());
        pointsGroup.attr('transform', transform.toString());
        graticulePath.attr('transform', transform.toString());
      });

    svg.call(zoom as any);
  }, [dimensions.height, dimensions.width, onSelect, points]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <svg ref={svgRef} className="h-full w-full" />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-2xl border border-stone-200/70 bg-white/95 p-3 text-xs text-stone-700 shadow-lg backdrop-blur-sm"
          style={{
            left: Math.min(tooltip.x + 14, dimensions.width - 240),
            top: Math.max(tooltip.y - 12, 12),
          }}
        >
          <div className="text-sm font-semibold text-stone-900">{tooltip.point.name}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-stone-500">
            <span>{tooltip.point.regionSub || '—'}</span>
            <span>{tooltip.point.domain || '—'}</span>
            <span>{tooltip.point.era || '—'}</span>
          </div>
          {tooltip.point.rank && (
            <div className="mt-2 text-[11px] text-stone-500">
              Rank {tooltip.point.rank}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

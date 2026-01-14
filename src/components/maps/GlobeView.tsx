'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { loadLandData } from './landData';
import { REGION_COLORS, type MapPoint } from '@/types';

type GlobeViewProps = {
  points: MapPoint[];
  onSelect: (point: MapPoint) => void;
};

type TooltipState = {
  point: MapPoint;
  x: number;
  y: number;
};

export function GlobeView({ points, onSelect }: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const isDraggingRef = useRef(false);
  const timerRef = useRef<d3.Timer | null>(null);

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

    const baseScale = Math.min(width, height) / 2.15;
    const projection = d3.geoOrthographic()
      .scale(baseScale)
      .translate([width / 2, height / 2])
      .rotate([0, -8])
      .clipAngle(90);

    const path = d3.geoPath(projection);

    const defs = svg.append('defs');
    const glow = defs.append('radialGradient')
      .attr('id', 'globe-glow')
      .attr('cx', '35%')
      .attr('cy', '30%');

    glow.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#fefcf6');
    glow.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#f1e9dc');

    const globeShell = svg.append('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', projection.scale())
      .attr('fill', 'url(#globe-glow)')
      .attr('stroke', 'rgba(120, 113, 108, 0.25)')
      .attr('stroke-width', 1);

    const graticule = d3.geoGraticule().step([20, 20]);
    const graticulePath = svg.append('path')
      .datum(graticule())
      .attr('fill', 'none')
      .attr('stroke', 'rgba(120, 113, 108, 0.12)')
      .attr('stroke-width', 0.6);

    const landGroup = svg.append('g').attr('class', 'land');
    const pointsGroup = svg.append('g').attr('class', 'points');

    let landFeature: any = null;

    const update = () => {
      globeShell.attr('r', projection.scale());
      graticulePath.attr('d', path as any);
      if (landFeature) {
        landGroup.selectAll('path').attr('d', path as any);
      }

      pointsGroup.selectAll('circle')
        .attr('transform', (d: any) => {
          const coords = projection([d.lon, d.lat]);
          return coords ? `translate(${coords[0]}, ${coords[1]})` : '';
        })
        .attr('opacity', (d: any) => {
          const r = projection.rotate();
          const center: [number, number] = [-r[0], -r[1]];
          const distance = d3.geoDistance([d.lon, d.lat], center);
          return distance < Math.PI / 2 ? 0.85 : 0;
        });
    };

    loadLandData().then((land) => {
      landFeature = land;
      if (landFeature) {
        landGroup
          .selectAll('path')
          .data(landFeature.type === 'FeatureCollection' ? landFeature.features : [landFeature])
          .enter()
          .append('path')
          .attr('fill', 'rgba(214, 207, 196, 0.6)')
          .attr('stroke', 'rgba(120, 113, 108, 0.28)')
          .attr('stroke-width', 0.6);
      }

      pointsGroup
        .selectAll('circle')
        .data(points, (d: any) => d.id)
        .enter()
        .append('circle')
        .attr('r', 3.1)
        .attr('fill', (d: any) => REGION_COLORS[d.regionSub || ''] || '#9ca3af')
        .attr('fill-opacity', 0.9)
        .attr('stroke', 'rgba(255, 255, 255, 0.75)')
        .attr('stroke-width', 0.6)
        .style('transition', 'transform 200ms ease, r 200ms ease, opacity 200ms ease')
        .on('mouseenter', function (event: MouseEvent, d: any) {
          d3.select(this).attr('r', 5.1);
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
          d3.select(this).attr('r', 3.1);
          setTooltip(null);
        })
        .on('click', (_event: MouseEvent, d: any) => {
          onSelect(d);
        });

      update();
    });

    const drag = d3.drag<SVGSVGElement, unknown>()
      .on('start', () => {
        isDraggingRef.current = true;
      })
      .on('drag', (event) => {
        const rotate = projection.rotate();
        const k = 1 / projection.scale();
        projection.rotate([
          rotate[0] + event.dx * k * 120,
          rotate[1] - event.dy * k * 120,
          rotate[2],
        ]);
        update();
      })
      .on('end', () => {
        isDraggingRef.current = false;
      });

    svg.call(drag as any);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.8, 2.2])
      .filter((event) => event.type === 'wheel' || event.type === 'dblclick')
      .on('zoom', (event) => {
        projection.scale(baseScale * event.transform.k);
        update();
      });

    svg.call(zoom as any);

    timerRef.current?.stop();
    timerRef.current = d3.timer(() => {
      if (isDraggingRef.current) return;
      const rotate = projection.rotate();
      projection.rotate([rotate[0] + 0.02, rotate[1], rotate[2]]);
      update();
    });

    return () => {
      timerRef.current?.stop();
      timerRef.current = null;
    };
  }, [dimensions.height, dimensions.width, onSelect, points]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <svg ref={svgRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
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

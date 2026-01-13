'use client';

import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';

interface BirthplaceGlobeProps {
  lat: number;
  lon: number;
  placeName?: string;
}

export function BirthplaceGlobe({ lat, lon, placeName }: BirthplaceGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDimensions({ width, height: width }); // Square aspect ratio
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = dimensions.width;
    const height = dimensions.height;
    const sensitivity = 75;

    // Create projection centered on the birthplace
    const projection = d3.geoOrthographic()
      .scale(width / 2.3)
      .center([0, 0])
      .rotate([-lon, -lat])
      .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);
    const initialScale = projection.scale();
    let rotation = projection.rotate();

    // Defs for gradients and filters
    const defs = svg.append('defs');

    // Globe gradient
    const globeGradient = defs.append('radialGradient')
      .attr('id', 'globe-gradient')
      .attr('cx', '30%')
      .attr('cy', '30%');

    globeGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#1a1f2e');

    globeGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#0d1117');

    // Glow filter for the marker
    const glowFilter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');

    glowFilter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');

    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Outer glow filter
    const outerGlow = defs.append('filter')
      .attr('id', 'outer-glow')
      .attr('x', '-100%')
      .attr('y', '-100%')
      .attr('width', '300%')
      .attr('height', '300%');

    outerGlow.append('feGaussianBlur')
      .attr('stdDeviation', '8')
      .attr('result', 'blur');

    outerGlow.append('feComposite')
      .attr('in', 'blur')
      .attr('in2', 'SourceGraphic')
      .attr('operator', 'out');

    // HUD grid pattern
    const gridPattern = defs.append('pattern')
      .attr('id', 'hud-grid')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 20)
      .attr('height', 20);

    gridPattern.append('path')
      .attr('d', 'M 20 0 L 0 0 0 20')
      .attr('fill', 'none')
      .attr('stroke', 'rgba(245, 158, 11, 0.05)')
      .attr('stroke-width', 0.5);

    // Background with HUD elements
    const bgGroup = svg.append('g').attr('class', 'background');

    // Outer ring
    bgGroup.append('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', width / 2.1)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(245, 158, 11, 0.2)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 2');

    // HUD corner brackets
    const bracketSize = 20;
    const bracketOffset = 15;
    const corners = [
      { x: bracketOffset, y: bracketOffset, rot: 0 },
      { x: width - bracketOffset, y: bracketOffset, rot: 90 },
      { x: width - bracketOffset, y: height - bracketOffset, rot: 180 },
      { x: bracketOffset, y: height - bracketOffset, rot: 270 },
    ];

    corners.forEach(({ x, y, rot }) => {
      bgGroup.append('path')
        .attr('d', `M 0 ${bracketSize} L 0 0 L ${bracketSize} 0`)
        .attr('transform', `translate(${x}, ${y}) rotate(${rot})`)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(245, 158, 11, 0.4)')
        .attr('stroke-width', 1.5);
    });

    // Globe group
    const globeGroup = svg.append('g').attr('class', 'globe');

    // Globe sphere
    globeGroup.append('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', projection.scale())
      .attr('fill', 'url(#globe-gradient)')
      .attr('stroke', 'rgba(245, 158, 11, 0.3)')
      .attr('stroke-width', 1);

    // Graticule (grid lines)
    const graticule = d3.geoGraticule().step([15, 15]);

    globeGroup.append('path')
      .datum(graticule())
      .attr('class', 'graticule')
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', 'rgba(245, 158, 11, 0.08)')
      .attr('stroke-width', 0.5);

    // Land masses
    const landGroup = globeGroup.append('g').attr('class', 'land');

    // Load world data
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json').then((world: any) => {
      if (!world || !world.objects || !world.objects.land) {
        updateMarker();
        return;
      }

      const land = topojson.feature(world, world.objects.land) as any;

      landGroup.selectAll('path')
        .data(land.type === 'FeatureCollection' ? land.features : [land])
        .enter()
        .append('path')
        .attr('d', path as any)
        .attr('fill', 'rgba(245, 158, 11, 0.15)')
        .attr('stroke', 'rgba(245, 158, 11, 0.3)')
        .attr('stroke-width', 0.5);

      updateMarker();
    }).catch(() => {
      // Fallback: draw simple continent outlines if CDN fails
      updateMarker();
    });

    // Marker group
    const markerGroup = svg.append('g').attr('class', 'marker');

    function updateMarker() {
      markerGroup.selectAll('*').remove();

      const coords = projection([lon, lat]);
      if (!coords) return;

      // Check if point is on visible side of globe
      const r = projection.rotate();
      const center: [number, number] = [-r[0], -r[1]];
      const distance = d3.geoDistance([lon, lat] as [number, number], center);
      const isVisible = distance < Math.PI / 2;

      if (!isVisible) return;

      const [x, y] = coords;

      // Outer pulse ring
      markerGroup.append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 20)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(245, 158, 11, 0.4)')
        .attr('stroke-width', 1)
        .attr('class', 'globe-marker-pulse');

      // Middle ring
      markerGroup.append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 12)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(245, 158, 11, 0.6)')
        .attr('stroke-width', 1);

      // Glowing core
      markerGroup.append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 6)
        .attr('fill', '#f59e0b')
        .attr('filter', 'url(#glow)');

      // Inner bright dot
      markerGroup.append('circle')
        .attr('cx', x)
        .attr('cy', y)
        .attr('r', 3)
        .attr('fill', '#fbbf24');

      // Crosshairs
      const crosshairLength = 25;
      const crosshairGap = 15;

      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
        markerGroup.append('line')
          .attr('x1', x + dx * crosshairGap)
          .attr('y1', y + dy * crosshairGap)
          .attr('x2', x + dx * crosshairLength)
          .attr('y2', y + dy * crosshairLength)
          .attr('stroke', 'rgba(245, 158, 11, 0.5)')
          .attr('stroke-width', 1);
      });
    }

    // Drag behavior for rotation
    const drag = d3.drag<SVGSVGElement, unknown>()
      .on('drag', (event) => {
        const rotate = projection.rotate();
        const k = sensitivity / projection.scale();
        projection.rotate([
          rotate[0] + event.dx * k,
          rotate[1] - event.dy * k
        ]);
        rotation = projection.rotate();

        // Update all paths
        svg.selectAll('.graticule').attr('d', path as any);
        svg.selectAll('.land path').attr('d', path as any);
        updateMarker();
      });

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 4])
      .on('zoom', (event) => {
        const newScale = initialScale * event.transform.k;
        projection.scale(newScale);

        // Update globe size
        svg.select('.globe circle')
          .attr('r', newScale);

        // Update all paths
        svg.selectAll('.graticule').attr('d', path as any);
        svg.selectAll('.land path').attr('d', path as any);
        updateMarker();
      });

    svg.call(drag as any).call(zoom as any);

    // Double-click to reset
    svg.on('dblclick.zoom', () => {
      projection.rotate([-lon, -lat]);
      projection.scale(initialScale);
      rotation = projection.rotate();

      svg.select('.globe circle').attr('r', initialScale);
      svg.selectAll('.graticule').attr('d', path as any);
      svg.selectAll('.land path').attr('d', path as any);
      updateMarker();
    });

  }, [dimensions, lat, lon]);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* HUD frame */}
      <div className="relative bg-[#0a0d14] rounded-xl overflow-hidden border border-amber-500/20">
        {/* Top HUD bar */}
        <div className="absolute top-0 left-0 right-0 z-10 px-3 py-2 bg-gradient-to-b from-[#0a0d14] to-transparent">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
            <span className="text-amber-500/60 font-mono">Birthplace Location</span>
            <span className="text-amber-500/40 font-mono">
              {lat.toFixed(2)}° {lat >= 0 ? 'N' : 'S'}, {Math.abs(lon).toFixed(2)}° {lon >= 0 ? 'E' : 'W'}
            </span>
          </div>
        </div>

        {/* Globe SVG */}
        <svg
          ref={svgRef}
          width={dimensions.width || '100%'}
          height={dimensions.height || 250}
          className="cursor-grab active:cursor-grabbing"
          style={{ minHeight: 250 }}
        />

        {/* Bottom HUD bar */}
        <div className="absolute bottom-0 left-0 right-0 z-10 px-3 py-2 bg-gradient-to-t from-[#0a0d14] to-transparent">
          <div className="flex items-center justify-between text-[10px] text-amber-500/50">
            <span className="font-mono">DRAG TO ROTATE</span>
            {placeName && (
              <span className="text-amber-500/70 truncate max-w-[60%] text-right">{placeName}</span>
            )}
            <span className="font-mono">SCROLL TO ZOOM</span>
          </div>
        </div>

        {/* Scan line effect */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(245, 158, 11, 0.02) 2px, rgba(245, 158, 11, 0.02) 4px)'
          }}
        />
      </div>
    </div>
  );
}

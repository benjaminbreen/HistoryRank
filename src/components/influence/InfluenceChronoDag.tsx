'use client';

import {
  useEffect,
  useMemo,
  useState,
  type WheelEventHandler,
} from 'react';
import { formatYearAlways } from '@/lib/utils/figureFormatters';
import type { InfluenceNetworkEdge, InfluenceNetworkNode } from '@/types';

interface InfluenceChronoDagProps {
  nodes: InfluenceNetworkNode[];
  edges: InfluenceNetworkEdge[];
  showUndirectedLinks?: boolean;
  onEdgeSelect?: (edgeId: number) => void;
  selectedEdgeId?: number | null;
}

type PositionedNode = InfluenceNetworkNode & {
  yearValue: number;
  x: number;
  y: number;
};

const DOMAIN_COLORS = [
  '#ba8f44',
  '#3f7f99',
  '#7e6bb2',
  '#7a9f58',
  '#b56d5c',
  '#4f6b8a',
  '#96724e',
  '#5f8f7d',
];

function hashToIndex(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getDomainColor(domain: string | null): string {
  if (!domain) return '#9ca3af';
  return DOMAIN_COLORS[hashToIndex(domain) % DOMAIN_COLORS.length];
}

function pickTickStep(yearRange: number): number {
  if (yearRange >= 4200) return 500;
  if (yearRange >= 2400) return 250;
  if (yearRange >= 1200) return 100;
  if (yearRange >= 700) return 50;
  return 25;
}


function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Density-adaptive year-to-normalized-position mapping.
 * Blends linear chronological position with CDF (cumulative distribution)
 * of actual birth years so dense eras get more vertical space.
 */
function buildYearScale(sortedYears: number[], blend: number = 0.55) {
  const n = sortedYears.length;
  if (n === 0) return (_year: number) => 0;
  const minY = sortedYears[0];
  const maxY = sortedYears[n - 1];
  const range = maxY - minY;
  if (range === 0) return (_year: number) => 0.5;

  return (year: number): number => {
    const linear = (year - minY) / range;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedYears[mid] < year) lo = mid + 1;
      else hi = mid;
    }
    const cdf = lo / Math.max(1, n - 1);
    return linear * (1 - blend) + cdf * blend;
  };
}

export function InfluenceChronoDag({
  nodes,
  edges,
  showUndirectedLinks = true,
  onEdgeSelect,
  selectedEdgeId = null,
}: InfluenceChronoDagProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    // Also check if the html element has the dark class (next-themes)
    const check = () => setIsDark(document.documentElement.classList.contains('dark') || mq.matches);
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    mq.addEventListener('change', check);
    return () => { observer.disconnect(); mq.removeEventListener('change', check); };
  }, []);

  const {
    worldWidth,
    worldHeight,
    positionedNodes,
    directedEdges,
    undirectedEdges,
    yearTicks,
    degreeById,
    yearScale,
    topPad,
    bottomPad,
  } = useMemo(() => {
    const directed = edges.filter((edge) => edge.direction === 'directed');
    const undirected = edges.filter((edge) => edge.direction === 'undirected');
    const workingEdges = directed.length > 0 ? directed : edges;

    const connectedIds = new Set<string>();
    for (const edge of workingEdges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }

    const topPad = 70;
    const bottomPad = 80;

    const relevantNodes = nodes.filter((node) => connectedIds.has(node.id));
    if (relevantNodes.length === 0) {
      return {
        worldWidth: 1000,
        worldHeight: 900,
        positionedNodes: [] as PositionedNode[],
        directedEdges: directed,
        undirectedEdges: undirected,
        yearTicks: [] as number[],
        degreeById: new Map<string, number>(),
        yearScale: buildYearScale([]),
        topPad,
        bottomPad,
      };
    }

    const knownYears = relevantNodes
      .map((node) => node.birthYear ?? (node.deathYear !== null ? node.deathYear - 35 : null))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const fallbackYear =
      knownYears.length > 0 ? knownYears[Math.floor(knownYears.length / 2)] : 1800;

    const nodesWithYears = relevantNodes.map((node) => ({
      ...node,
      yearValue: node.birthYear ?? (node.deathYear !== null ? node.deathYear - 35 : fallbackYear),
    }));

    const minYear = Math.min(...nodesWithYears.map((node) => node.yearValue));
    const maxYear = Math.max(...nodesWithYears.map((node) => node.yearValue));
    const yearRange = Math.max(1, maxYear - minYear);
    const tickStep = pickTickStep(yearRange);

    const sortedNodeYears = nodesWithYears.map((n) => n.yearValue).sort((a, b) => a - b);
    const yearScale = buildYearScale(sortedNodeYears, 0.55);

    const pixelsPerYear = 1.5;
    const worldHeight = Math.max(1400, Math.min(5500, Math.round(yearRange * pixelsPerYear) + topPad + bottomPad));

    const bucketSize = Math.max(20, Math.round(tickStep * 0.5));
    const buckets = new Map<number, PositionedNode[]>();
    for (const node of nodesWithYears) {
      const bucket = Math.floor((node.yearValue - minYear) / bucketSize);
      const row = buckets.get(bucket) || [];
      row.push({ ...node, x: 0, y: 0 });
      buckets.set(bucket, row);
    }

    const maxBucketSize = Math.max(...Array.from(buckets.values()).map((items) => items.length));
    const worldWidth = Math.max(900, Math.min(1400, 260 + maxBucketSize * 100));
    const sidePad = 80;

    const parentsById = new Map<string, string[]>();
    const childrenById = new Map<string, string[]>();
    for (const edge of directed) {
      const parents = parentsById.get(edge.target) || [];
      parents.push(edge.source);
      parentsById.set(edge.target, parents);
      const children = childrenById.get(edge.source) || [];
      children.push(edge.target);
      childrenById.set(edge.source, children);
    }

    const xById = new Map<string, number>();
    const positioned: PositionedNode[] = [];
    const orderedBucketKeys = Array.from(buckets.keys()).sort((a, b) => a - b);

    for (const bucketKey of orderedBucketKeys) {
      const row = buckets.get(bucketKey) || [];
      row.sort((a, b) => {
        const aParentXs = (parentsById.get(a.id) || []).map((id) => xById.get(id)).filter((x): x is number => x !== undefined);
        const bParentXs = (parentsById.get(b.id) || []).map((id) => xById.get(id)).filter((x): x is number => x !== undefined);
        const aAvg = average(aParentXs);
        const bAvg = average(bParentXs);
        if (aAvg !== null && bAvg !== null && aAvg !== bAvg) return aAvg - bAvg;
        if (aAvg !== null && bAvg === null) return -1;
        if (aAvg === null && bAvg !== null) return 1;
        if (b.degree !== a.degree) return b.degree - a.degree;
        return a.name.localeCompare(b.name);
      });

      const step = (worldWidth - sidePad * 2) / (row.length + 1);
      for (let i = 0; i < row.length; i += 1) {
        const node = row[i];
        const jitter = ((hashToIndex(node.id) % 11) - 5) * 2;
        const x = sidePad + step * (i + 1) + jitter;
        const y = topPad + yearScale(node.yearValue) * (worldHeight - topPad - bottomPad);
        xById.set(node.id, x);
        positioned.push({ ...node, x, y });
      }
    }

    const firstTick = Math.floor(minYear / tickStep) * tickStep;
    const ticks: number[] = [];
    for (let tick = firstTick; tick <= maxYear + tickStep; tick += tickStep) {
      ticks.push(tick);
    }

    const degreeById = new Map<string, number>();
    for (const edge of edges) {
      degreeById.set(edge.source, (degreeById.get(edge.source) || 0) + 1);
      degreeById.set(edge.target, (degreeById.get(edge.target) || 0) + 1);
    }

    return {
      worldWidth,
      worldHeight,
      positionedNodes: positioned,
      directedEdges: directed,
      undirectedEdges: undirected,
      yearTicks: ticks,
      degreeById,
      yearScale,
      topPad,
      bottomPad,
    };
  }, [edges, nodes]);

  const nodeById = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    for (const node of positionedNodes) {
      map.set(node.id, node);
    }
    return map;
  }, [positionedNodes]);

  const highlightedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!hoveredNodeId) return ids;
    ids.add(hoveredNodeId);
    for (const edge of directedEdges) {
      if (edge.source === hoveredNodeId) ids.add(edge.target);
      if (edge.target === hoveredNodeId) ids.add(edge.source);
    }
    if (showUndirectedLinks) {
      for (const edge of undirectedEdges) {
        if (edge.source === hoveredNodeId) ids.add(edge.target);
        if (edge.target === hoveredNodeId) ids.add(edge.source);
      }
    }
    return ids;
  }, [hoveredNodeId, directedEdges, undirectedEdges, showUndirectedLinks]);

  // Portrait nodes = top 50 by degree, get thumbnail images
  const portraitIds = useMemo(() => {
    return new Set(
      [...positionedNodes]
        .sort((a, b) => (degreeById.get(b.id) || 0) - (degreeById.get(a.id) || 0))
        .slice(0, 50)
        .map((n) => n.id),
    );
  }, [positionedNodes, degreeById]);

  // Label nodes = portrait nodes (they get labels below their portrait)
  const labelNodeIds = portraitIds;

  const yFromYear = (year: number) => {
    if (positionedNodes.length === 0) return topPad;
    return topPad + yearScale(year) * (worldHeight - topPad - bottomPad);
  };

  // Ctrl/Cmd + wheel to zoom
  const handleWheel: WheelEventHandler<SVGSVGElement> = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom((prev) => clamp(prev * (event.deltaY < 0 ? 1.12 : 0.9), 0.4, 3));
  };

  const svgW = worldWidth * zoom;
  const svgH = worldHeight * zoom;

  return (
    <div className="relative w-full overflow-x-auto rounded-2xl border border-stone-200/70 dark:border-slate-700 bg-stone-50 dark:bg-slate-900">
      {/* Zoom controls — sticky as user scrolls */}
      <div className="sticky top-[60px] z-20 float-right mr-3 mt-3 flex items-center gap-1 rounded-lg border border-stone-200/80 dark:border-slate-600 bg-white/95 dark:bg-slate-800/95 px-1.5 py-1 shadow-sm">
        <button
          type="button"
          className="h-6 w-6 rounded text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700 text-sm"
          onClick={() => setZoom((z) => clamp(z * 1.2, 0.4, 3))}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="h-6 w-6 rounded text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700 text-sm"
          onClick={() => setZoom((z) => clamp(z / 1.2, 0.4, 3))}
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[11px] text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700"
          onClick={() => setZoom(1)}
        >
          Reset
        </button>
      </div>

      <svg
        width={svgW}
        height={svgH}
        className="block"
        onWheel={handleWheel}
      >
        <defs>
          <marker id="dag-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="rgba(117,88,40,0.7)" />
          </marker>
        </defs>

        <g transform={`scale(${zoom})`}>
          {/* Year grid lines + labels */}
          {yearTicks.map((year) => {
            const y = yFromYear(year);
            if (y < 16 || y > worldHeight - 16) return null;
            return (
              <g key={`tick-${year}`}>
                <line x1={60} x2={worldWidth - 24} y1={y} y2={y} stroke={isDark ? 'rgba(148,163,184,0.15)' : 'rgba(120,126,140,0.2)'} strokeWidth={1} />
                <text x={8} y={y + 4} fontSize={11} fill={isDark ? 'rgba(148,163,184,0.6)' : 'rgba(88,93,105,0.7)'} className="select-none">
                  {formatYearAlways(year)}
                </text>
              </g>
            );
          })}

          {/* Undirected edges */}
          {showUndirectedLinks && undirectedEdges.length > 0 && (
            <g>
              {undirectedEdges.map((edge) => {
                const source = nodeById.get(edge.source);
                const target = nodeById.get(edge.target);
                if (!source || !target) return null;
                const selected = selectedEdgeId === edge.id;
                const active = hoveredNodeId === null || source.id === hoveredNodeId || target.id === hoveredNodeId;
                return (
                  <line
                    key={`u-${edge.id}`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={selected ? 'rgba(180,83,9,0.95)' : 'rgba(107,114,128,0.3)'}
                    strokeWidth={selected ? 2.3 : 0.9}
                    strokeDasharray="4 3"
                    opacity={selected ? 1 : active ? 0.45 : 0.1}
                    className={onEdgeSelect ? 'cursor-pointer' : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onEdgeSelect?.(edge.id);
                    }}
                  >
                    <title>{`${source.name} ↔ ${target.name} (undirected)`}</title>
                  </line>
                );
              })}
            </g>
          )}

          {/* Directed edges */}
          <g>
            {directedEdges.map((edge) => {
              const source = nodeById.get(edge.source);
              const target = nodeById.get(edge.target);
              if (!source || !target) return null;

              const controlY = source.y + (target.y - source.y) * 0.46;
              const d = `M ${source.x} ${source.y} C ${source.x} ${controlY}, ${target.x} ${controlY}, ${target.x} ${target.y}`;
              const backward = target.y < source.y;
              const selected = selectedEdgeId === edge.id;
              const active =
                selected || hoveredNodeId === null || source.id === hoveredNodeId || target.id === hoveredNodeId;
              return (
                <path
                  key={`d-${edge.id}`}
                  d={d}
                  fill="none"
                  stroke={
                    selected
                      ? 'rgba(180,83,9,0.95)'
                      : backward
                      ? 'rgba(196,72,72,0.78)'
                      : edge.status === 'approved'
                        ? 'rgba(117,88,40,0.64)'
                        : 'rgba(106,112,124,0.5)'
                  }
                  strokeWidth={selected ? 2.9 : 1 + edge.confidence * 1.5}
                  strokeDasharray={backward ? '3 2' : undefined}
                  markerEnd="url(#dag-arrow)"
                  opacity={selected ? 1 : active ? 0.9 : 0.14}
                  className={onEdgeSelect ? 'cursor-pointer' : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onEdgeSelect?.(edge.id);
                  }}
                >
                  <title>
                    {`${source.name} -> ${target.name} | confidence ${edge.confidence.toFixed(3)} | evidence ${edge.supportCount}/${edge.sourceFamilyCount}`}
                  </title>
                </path>
              );
            })}
          </g>

          {/* Nodes — small circles for regular, portrait thumbnails for top 50 */}
          <g>
            {positionedNodes.map((node) => {
              const degree = degreeById.get(node.id) || 0;
              const isPortrait = portraitIds.has(node.id);
              const radius = isPortrait
                ? 14 + Math.min(10, degree * 0.6)
                : 3.8 + Math.min(7, degree * 0.75);
              const active = hoveredNodeId === null || highlightedNodeIds.has(node.id);
              const color = getDomainColor(node.domain);

              return (
                <a key={node.id} href={`/figure/${node.id}`} className="cursor-pointer">
                  <g
                    opacity={active ? 1 : 0.2}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                  >
                    {/* Background circle (visible as ring or fallback) */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={radius}
                      fill={color}
                      stroke={node.status === 'approved' ? 'rgba(27,30,36,0.75)' : 'rgba(90,96,106,0.5)'}
                      strokeWidth={hoveredNodeId === node.id ? 2.2 : 1}
                    />

                    {/* Portrait thumbnail for top nodes */}
                    {isPortrait && (
                      <>
                        <clipPath id={`clip-${node.id}`}>
                          <circle cx={node.x} cy={node.y} r={radius - 1.5} />
                        </clipPath>
                        <image
                          href={`/thumbnails/${node.id}.jpg`}
                          x={node.x - radius + 1.5}
                          y={node.y - radius + 1.5}
                          width={(radius - 1.5) * 2}
                          height={(radius - 1.5) * 2}
                          clipPath={`url(#clip-${node.id})`}
                          preserveAspectRatio="xMidYMid slice"
                        />
                        {/* Ring around portrait */}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={radius}
                          fill="none"
                          stroke={hoveredNodeId === node.id ? 'rgba(180,130,40,0.9)' : 'rgba(27,30,36,0.6)'}
                          strokeWidth={hoveredNodeId === node.id ? 2.5 : 1.8}
                        />
                      </>
                    )}
                  </g>

                  <title>
                    {`${node.name} (${formatYearAlways(node.yearValue)}) · rank ${node.llmRank ? Math.round(node.llmRank) : 'n/a'} · degree ${degree}`}
                  </title>
                </a>
              );
            })}
          </g>

          {/* Name labels for portrait nodes */}
          <g>
            {positionedNodes.map((node) => {
              if (!labelNodeIds.has(node.id)) return null;
              const degree = degreeById.get(node.id) || 0;
              const radius = 14 + Math.min(10, degree * 0.6);
              const active = hoveredNodeId === null || highlightedNodeIds.has(node.id);
              return (
                <g key={`label-${node.id}`} opacity={active ? 1 : 0.25}>
                  {/* Text shadow for readability */}
                  <text
                    x={node.x}
                    y={node.y + radius + 13}
                    fontSize={10.5}
                    fontWeight={500}
                    fill={isDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.85)'}
                    stroke={isDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.85)'}
                    strokeWidth={3}
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    {node.name}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + radius + 13}
                    fontSize={10.5}
                    fontWeight={500}
                    fill={active
                      ? (isDark ? 'rgba(226,232,240,0.95)' : 'rgba(27,31,38,0.9)')
                      : (isDark ? 'rgba(148,163,184,0.5)' : 'rgba(128,132,142,0.5)')
                    }
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    {node.name}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}

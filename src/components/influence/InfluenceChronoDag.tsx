'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
  type WheelEventHandler,
} from 'react';
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

function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BCE`;
  if (year === 0) return '0';
  return `${year} CE`;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function InfluenceChronoDag({
  nodes,
  edges,
  showUndirectedLinks = true,
  onEdgeSelect,
  selectedEdgeId = null,
}: InfluenceChronoDagProps) {
  const isPanningRef = useRef(false);
  const panLastRef = useRef({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [viewport, setViewport] = useState({ scale: 1, tx: 0, ty: 0 });

  const {
    width,
    height,
    positionedNodes,
    directedEdges,
    undirectedEdges,
    yearTicks,
    degreeById,
  } = useMemo(() => {
    const directed = edges.filter((edge) => edge.direction === 'directed');
    const undirected = edges.filter((edge) => edge.direction === 'undirected');
    const workingEdges = directed.length > 0 ? directed : edges;

    const connectedIds = new Set<string>();
    for (const edge of workingEdges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }

    const relevantNodes = nodes.filter((node) => connectedIds.has(node.id));
    if (relevantNodes.length === 0) {
      return {
        width: 1000,
        height: 900,
        positionedNodes: [] as PositionedNode[],
        directedEdges: directed,
        undirectedEdges: undirected,
        yearTicks: [] as number[],
        degreeById: new Map<string, number>(),
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

    const topPad = 70;
    const bottomPad = 80;
    const pixelsPerYear = 0.34;
    const height = Math.max(880, Math.min(2800, Math.round(yearRange * pixelsPerYear) + topPad + bottomPad));

    const bucketSize = Math.max(20, Math.round(tickStep * 0.5));
    const buckets = new Map<number, PositionedNode[]>();
    for (const node of nodesWithYears) {
      const bucket = Math.floor((node.yearValue - minYear) / bucketSize);
      const row = buckets.get(bucket) || [];
      row.push({ ...node, x: 0, y: 0 });
      buckets.set(bucket, row);
    }

    const maxBucketSize = Math.max(...Array.from(buckets.values()).map((items) => items.length));
    const width = Math.max(980, Math.min(2400, 260 + maxBucketSize * 120));
    const sidePad = 90;

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

      const step = (width - sidePad * 2) / (row.length + 1);
      for (let i = 0; i < row.length; i += 1) {
        const node = row[i];
        const jitter = ((hashToIndex(node.id) % 11) - 5) * 2;
        const x = sidePad + step * (i + 1) + jitter;
        const y =
          topPad +
          ((node.yearValue - minYear) / yearRange) * (height - topPad - bottomPad);
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
      width,
      height,
      positionedNodes: positioned,
      directedEdges: directed,
      undirectedEdges: undirected,
      yearTicks: ticks,
      degreeById,
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

  const minNodeYear = positionedNodes.length > 0 ? Math.min(...positionedNodes.map((node) => node.yearValue)) : 0;
  const maxNodeYear = positionedNodes.length > 0 ? Math.max(...positionedNodes.map((node) => node.yearValue)) : 1;
  const topPad = 70;
  const bottomPad = 80;

  const yFromYear = (year: number) => {
    if (maxNodeYear === minNodeYear) return topPad;
    return topPad + ((year - minNodeYear) / (maxNodeYear - minNodeYear)) * (height - topPad - bottomPad);
  };

  const labelNodes = [...positionedNodes]
    .sort((a, b) => (degreeById.get(b.id) || 0) - (degreeById.get(a.id) || 0))
    .slice(0, 24);

  useEffect(() => {
    setViewport({ scale: 1, tx: 0, ty: 0 });
  }, [nodes.length, edges.length]);

  const applyScaleAt = (factor: number, centerX: number, centerY: number) => {
    setViewport((prev) => {
      const nextScale = clamp(prev.scale * factor, 0.3, 4.2);
      const worldX = (centerX - prev.tx) / prev.scale;
      const worldY = (centerY - prev.ty) / prev.scale;
      return {
        scale: nextScale,
        tx: centerX - worldX * nextScale,
        ty: centerY - worldY * nextScale,
      };
    });
  };

  const handleWheel: WheelEventHandler<SVGSVGElement> = (event) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    applyScaleAt(event.deltaY < 0 ? 1.12 : 0.9, x, y);
  };

  const startPan: MouseEventHandler<SVGRectElement> = (event) => {
    if (event.button !== 0) return;
    isPanningRef.current = true;
    setIsPanning(true);
    panLastRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleMouseMove: MouseEventHandler<SVGSVGElement> = (event) => {
    if (!isPanningRef.current) return;
    const dx = event.clientX - panLastRef.current.x;
    const dy = event.clientY - panLastRef.current.y;
    panLastRef.current = { x: event.clientX, y: event.clientY };
    setViewport((prev) => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }));
  };

  const stopPan = () => {
    isPanningRef.current = false;
    setIsPanning(false);
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-stone-200/70 dark:border-slate-700 bg-white/85 dark:bg-slate-800/80 p-2">
      <div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-lg border border-stone-200/80 dark:border-slate-600 bg-white/95 dark:bg-slate-800/95 px-1.5 py-1 shadow-sm">
        <button
          type="button"
          className="h-6 w-6 rounded text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700"
          onClick={() => applyScaleAt(1.15, width / 2, height / 2)}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="h-6 w-6 rounded text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700"
          onClick={() => applyScaleAt(0.87, width / 2, height / 2)}
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[11px] text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700"
          onClick={() => setViewport({ scale: 1, tx: 0, ty: 0 })}
        >
          Reset
        </button>
      </div>
      <svg
        width={width}
        height={height}
        className="block"
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseUp={stopPan}
        onMouseLeave={stopPan}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <defs>
          <marker id="dag-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="rgba(117,88,40,0.7)" />
          </marker>
          <linearGradient id="dag-bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(201,165,92,0.08)" />
            <stop offset="100%" stopColor="rgba(122,143,168,0.08)" />
          </linearGradient>
        </defs>

        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          rx={12}
          onMouseDown={startPan}
        />

        <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
          <rect x={0} y={0} width={width} height={height} fill="url(#dag-bg)" rx={12} />
          {yearTicks.map((year) => {
            const y = yFromYear(year);
            if (y < 16 || y > height - 16) return null;
            return (
              <g key={`tick-${year}`}>
                <line x1={48} x2={width - 24} y1={y} y2={y} stroke="rgba(120,126,140,0.25)" strokeWidth={1} />
                <text x={10} y={y + 4} fontSize={11} fill="rgba(88,93,105,0.8)">
                  {formatYear(year)}
                </text>
              </g>
            );
          })}
        </g>

        <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
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

          <g>
            {positionedNodes.map((node) => {
              const degree = degreeById.get(node.id) || 0;
              const radius = 3.8 + Math.min(7, degree * 0.75);
              const active = hoveredNodeId === null || highlightedNodeIds.has(node.id);
              return (
                <a key={node.id} href={`/figure/${node.id}`} className="cursor-pointer">
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={radius}
                    fill={getDomainColor(node.domain)}
                    stroke={node.status === 'approved' ? 'rgba(27,30,36,0.75)' : 'rgba(90,96,106,0.5)'}
                    strokeWidth={hoveredNodeId === node.id ? 2.2 : 1}
                    opacity={active ? 0.94 : 0.2}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                  >
                    <title>
                      {`${node.name} (${formatYear(node.yearValue)}) · rank ${node.llmRank ? Math.round(node.llmRank) : 'n/a'} · degree ${degree}`}
                    </title>
                  </circle>
                </a>
              );
            })}
          </g>

          <g>
            {labelNodes.map((node) => {
              const active = hoveredNodeId === null || highlightedNodeIds.has(node.id);
              return (
                <text
                  key={`label-${node.id}`}
                  x={node.x + 9}
                  y={node.y - 7}
                  fontSize={11}
                  fill={active ? 'rgba(27,31,38,0.9)' : 'rgba(128,132,142,0.38)'}
                  style={{ pointerEvents: 'none' }}
                >
                  {node.name}
                </text>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}

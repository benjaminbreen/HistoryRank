'use client';

import {
  useMemo,
  useRef,
  useState,
  useEffect,
  type MouseEventHandler,
  type TouchEventHandler,
  type WheelEventHandler,
} from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from 'd3-force';
import type { InfluenceNetworkEdge, InfluenceNetworkNode } from '@/types';

interface InfluenceGraphProps {
  nodes: InfluenceNetworkNode[];
  edges: InfluenceNetworkEdge[];
  onEdgeSelect?: (edgeId: number) => void;
  selectedEdgeId?: number | null;
}

type LayoutNode = InfluenceNetworkNode & SimulationNodeDatum;
type LayoutEdge = {
  id: number;
  source: string | LayoutNode;
  target: string | LayoutNode;
  confidence: number;
  status: 'approved' | 'candidate';
  supportCount: number;
  sourceFamilyCount: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function InfluenceGraph({
  nodes,
  edges,
  onEdgeSelect,
  selectedEdgeId = null,
}: InfluenceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const panLastRef = useRef({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 960, height: 620 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [viewport, setViewport] = useState({ scale: 1, tx: 0, ty: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = () => {
      const width = Math.max(680, node.clientWidth);
      const height = Math.max(520, Math.round(width * 0.62));
      setSize({ width, height });
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setViewport({ scale: 1, tx: 0, ty: 0 });
  }, [nodes.length, edges.length]);

  const { layoutNodes, layoutEdges, degreeById } = useMemo(() => {
    const degreeMap = new Map<string, number>();
    for (const edge of edges) {
      degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
      degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
    }

    const layoutNodeList: LayoutNode[] = nodes.map((node, index) => ({
      ...node,
      x: (index % 10) * 30 + size.width * 0.4,
      y: Math.floor(index / 10) * 30 + size.height * 0.4,
    }));

    const layoutEdgeList: LayoutEdge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      confidence: edge.confidence,
      status: edge.status,
      supportCount: edge.supportCount,
      sourceFamilyCount: edge.sourceFamilyCount,
    }));

    const linkForce = forceLink<LayoutNode, LayoutEdge>(layoutEdgeList)
      .id((d) => d.id)
      .distance((d) => 55 + (1 - d.confidence) * 75)
      .strength((d) => 0.3 + d.confidence * 0.4);

    const simulation = forceSimulation(layoutNodeList)
      .force('center', forceCenter(size.width / 2, size.height / 2))
      .force('charge', forceManyBody().strength(-130))
      .force('link', linkForce)
      .force('collision', forceCollide<LayoutNode>().radius((d) => 4 + (degreeMap.get(d.id) || 0) * 0.9));

    for (let i = 0; i < 280; i += 1) {
      simulation.tick();
    }
    simulation.stop();

    return {
      layoutNodes: layoutNodeList,
      layoutEdges: layoutEdgeList,
      degreeById: degreeMap,
    };
  }, [nodes, edges, size.height, size.width]);

  const highlighted = new Set<string>();
  if (hoveredId) {
    highlighted.add(hoveredId);
    for (const edge of layoutEdges) {
      const source = typeof edge.source === 'string' ? edge.source : edge.source.id;
      const target = typeof edge.target === 'string' ? edge.target : edge.target.id;
      if (source === hoveredId) highlighted.add(target);
      if (target === hoveredId) highlighted.add(source);
    }
  }

  const labelNodes = [...layoutNodes]
    .sort((a, b) => (degreeById.get(b.id) || 0) - (degreeById.get(a.id) || 0))
    .slice(0, 18);

  const applyScaleAt = (factor: number, centerX: number, centerY: number) => {
    setViewport((prev) => {
      const nextScale = clamp(prev.scale * factor, 0.35, 4);
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

  const dragDistRef = useRef(0);

  const startPan: MouseEventHandler<SVGSVGElement> = (event) => {
    if (event.button !== 0) return;
    isPanningRef.current = true;
    dragDistRef.current = 0;
    setIsPanning(true);
    panLastRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleMouseMove: MouseEventHandler<SVGSVGElement> = (event) => {
    if (!isPanningRef.current) return;
    const dx = event.clientX - panLastRef.current.x;
    const dy = event.clientY - panLastRef.current.y;
    dragDistRef.current += Math.abs(dx) + Math.abs(dy);
    panLastRef.current = { x: event.clientX, y: event.clientY };
    setViewport((prev) => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }));
  };

  const stopPan = () => {
    isPanningRef.current = false;
    setTimeout(() => { dragDistRef.current = 0; }, 0);
    setIsPanning(false);
  };

  const handleTouchStart: TouchEventHandler<SVGSVGElement> = (event) => {
    if (event.touches.length !== 1) return;
    isPanningRef.current = true;
    dragDistRef.current = 0;
    setIsPanning(true);
    panLastRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };

  const handleTouchMove: TouchEventHandler<SVGSVGElement> = (event) => {
    if (!isPanningRef.current || event.touches.length !== 1) return;
    event.preventDefault();
    const dx = event.touches[0].clientX - panLastRef.current.x;
    const dy = event.touches[0].clientY - panLastRef.current.y;
    dragDistRef.current += Math.abs(dx) + Math.abs(dy);
    panLastRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    setViewport((prev) => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }));
  };

  const handleTouchEnd: TouchEventHandler<SVGSVGElement> = () => {
    stopPan();
  };

  const handleNodeClick = (event: React.MouseEvent) => {
    if (dragDistRef.current > 5) event.preventDefault();
  };

  return (
    <div ref={containerRef} className="relative w-full h-[70vh] overflow-hidden rounded-2xl border border-stone-200/70 dark:border-slate-700 bg-stone-50 dark:bg-slate-900">
      <div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-lg border border-stone-200/80 dark:border-slate-600 bg-white/95 dark:bg-slate-800/95 px-1.5 py-1 shadow-sm">
        <button
          type="button"
          className="h-6 w-6 rounded text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700"
          onClick={() => applyScaleAt(1.15, size.width / 2, size.height / 2)}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="h-6 w-6 rounded text-stone-700 dark:text-slate-200 hover:bg-stone-100 dark:hover:bg-slate-700"
          onClick={() => applyScaleAt(0.87, size.width / 2, size.height / 2)}
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
        width="100%"
        height="100%"
        className="block"
        style={{ cursor: isPanning ? 'grabbing' : 'grab', touchAction: 'none' }}
        onWheel={handleWheel}
        onMouseDown={startPan}
        onMouseMove={handleMouseMove}
        onMouseUp={stopPan}
        onMouseLeave={stopPan}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <defs>
          <linearGradient id="influence-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(201,165,92,0.09)" />
            <stop offset="100%" stopColor="rgba(122,143,168,0.08)" />
          </linearGradient>
        </defs>

        <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
          {layoutEdges.map((edge) => {
            const source = typeof edge.source === 'string' ? null : edge.source;
            const target = typeof edge.target === 'string' ? null : edge.target;
            if (!source || !target) return null;
            const connectedToHover =
              hoveredId && (source.id === hoveredId || target.id === hoveredId);
            const selected = selectedEdgeId === edge.id;

            return (
              <line
                key={edge.id}
                x1={source.x ?? 0}
                y1={source.y ?? 0}
                x2={target.x ?? 0}
                y2={target.y ?? 0}
                stroke={
                  selected
                    ? 'rgba(180,83,9,0.95)'
                    : edge.status === 'approved'
                      ? 'rgba(141,105,45,0.45)'
                      : 'rgba(107,114,128,0.32)'
                }
                strokeWidth={selected ? 2.8 : edge.status === 'approved' ? 1.2 + edge.confidence * 1.4 : 1}
                opacity={selected ? 1 : hoveredId ? (connectedToHover ? 0.92 : 0.16) : 0.52}
                className={onEdgeSelect ? 'cursor-pointer' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onEdgeSelect?.(edge.id);
                }}
              >
                <title>
                  {`${source.name} ↔ ${target.name} | confidence ${edge.confidence.toFixed(3)} | evidence ${edge.supportCount} items/${edge.sourceFamilyCount} families`}
                </title>
              </line>
            );
          })}
        </g>

        <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
          {layoutNodes.map((node) => {
            const degree = degreeById.get(node.id) || 0;
            const radius = 3.8 + Math.min(8, degree * 0.9);
            const active = hoveredId === null || highlighted.has(node.id);
            return (
              <a key={node.id} href={`/figure/${node.id}`} className="cursor-pointer" onClick={handleNodeClick}>
                <circle
                  cx={node.x ?? 0}
                  cy={node.y ?? 0}
                  r={radius}
                  fill={getDomainColor(node.domain)}
                  stroke={node.status === 'approved' ? 'rgba(36,38,45,0.65)' : 'rgba(90,94,104,0.45)'}
                  strokeWidth={hoveredId === node.id ? 2.2 : 1}
                  opacity={active ? 0.93 : 0.17}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <title>{`${node.name} (rank ${node.llmRank ? Math.round(node.llmRank) : 'n/a'}) • degree ${degree}`}</title>
                </circle>
              </a>
            );
          })}
        </g>

        <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
          {labelNodes.map((node) => {
            const active = hoveredId === null || highlighted.has(node.id);
            return (
              <text
                key={`label-${node.id}`}
                x={(node.x ?? 0) + 8}
                y={(node.y ?? 0) - 8}
                fontSize={11}
                fill={active ? 'rgba(28,30,36,0.9)' : 'rgba(128,132,142,0.4)'}
                style={{ pointerEvents: 'none' }}
              >
                {node.name}
              </text>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

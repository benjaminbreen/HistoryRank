'use client';

import { useMemo, useCallback, useRef } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  ZAxis,
} from 'recharts';
import {
  DOMAIN_COLORS,
  ERA_COLORS,
  AXIS_LABELS,
  type ScatterDataPoint,
  type ScatterPlotConfig,
  type AxisOption,
} from '@/types';

interface ScatterPlotChartProps {
  data: ScatterDataPoint[];
  config: ScatterPlotConfig;
  onPointClick: (point: ScatterDataPoint) => void;
  onPointHover: (point: ScatterDataPoint | null) => void;
}

// Get value for axis from data point
function getAxisValue(point: ScatterDataPoint, axis: AxisOption): number | null {
  switch (axis) {
    case 'hpiRank':
      return point.hpiRank;
    case 'llmConsensusRank':
      return point.llmConsensusRank;
    case 'pageviews':
      return point.pageviews;
    default:
      // Individual model ranks are stored directly on the point
      const value = point[axis];
      return typeof value === 'number' ? value : null;
  }
}

// Get color for a point based on color mode
function getPointColor(point: ScatterDataPoint, colorMode: ScatterPlotConfig['colorMode']): string {
  switch (colorMode) {
    case 'domain':
      return DOMAIN_COLORS[point.domain || 'Other'] || DOMAIN_COLORS['Other'];
    case 'era':
      return ERA_COLORS[point.era || 'Modern'] || ERA_COLORS['Modern'];
    case 'variance':
      const v = point.varianceScore || 0;
      if (v < 0.15) return '#22c55e'; // green
      if (v < 0.3) return '#eab308';  // yellow
      return '#ef4444';                // red
    case 'solid':
    default:
      return '#6366f1'; // indigo
  }
}

// Get point size based on size mode
function getPointSize(point: ScatterDataPoint, sizeMode: ScatterPlotConfig['sizeMode']): number {
  const baseSize = 60;
  switch (sizeMode) {
    case 'pageviews':
      const views = point.pageviews || 0;
      // Scale logarithmically
      return Math.max(30, Math.min(200, baseSize + Math.log10(views + 1) * 15));
    case 'variance':
      const v = point.varianceScore || 0;
      return baseSize + v * 150;
    case 'fixed':
    default:
      return baseSize;
  }
}

// Custom tooltip component
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterDataPoint & { xVal: number; yVal: number } }> }) {
  if (!active || !payload || !payload.length) return null;

  const point = payload[0].payload;

  return (
    <div className="bg-white/95 backdrop-blur-sm border border-stone-200 rounded-lg shadow-lg p-3 max-w-xs">
      <div className="font-serif font-semibold text-stone-900">{point.name}</div>
      {point.birthYear && (
        <div className="text-xs text-stone-500 mb-2">
          {point.birthYear < 0 ? `${Math.abs(point.birthYear)} BCE` : point.birthYear}
        </div>
      )}
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-stone-500">Domain:</span>
          <span className="font-medium">{point.domain || '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-stone-500">Era:</span>
          <span className="font-medium">{point.era || '—'}</span>
        </div>
        <div className="border-t border-stone-100 my-2" />
        <div className="flex justify-between gap-4">
          <span className="text-stone-500">Pantheon:</span>
          <span className="font-mono">#{point.hpiRank || '—'}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-stone-500">LLM Consensus:</span>
          <span className="font-mono">#{Math.round(point.llmConsensusRank || 0) || '—'}</span>
        </div>
        {point.pageviews && (
          <div className="flex justify-between gap-4">
            <span className="text-stone-500">Pageviews:</span>
            <span className="font-mono">{(point.pageviews / 1000000).toFixed(1)}M</span>
          </div>
        )}
      </div>
      <div className="mt-2 text-xs text-stone-400 text-center">Click for details</div>
    </div>
  );
}

export function ScatterPlotChart({
  data,
  config,
  onPointClick,
  onPointHover,
}: ScatterPlotChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Transform data for the chart
  const chartData = useMemo(() => {
    return data
      .map(point => {
        const xVal = getAxisValue(point, config.xAxis);
        const yVal = getAxisValue(point, config.yAxis);

        // Filter out points without both values
        if (xVal === null || yVal === null) return null;

        // Apply rank range filter
        const minRank = Math.min(xVal, yVal);
        if (minRank < config.rankRange[0] || minRank > config.rankRange[1]) return null;

        // Apply domain filter
        if (config.domains.length > 0 && !config.domains.includes(point.domain || '')) return null;

        // Apply era filter
        if (config.eras.length > 0 && !config.eras.includes(point.era || '')) return null;

        return {
          ...point,
          xVal,
          yVal,
          color: getPointColor(point, config.colorMode),
          size: getPointSize(point, config.sizeMode),
          isHighlighted: config.highlightSearch
            ? point.name.toLowerCase().includes(config.highlightSearch.toLowerCase())
            : false,
        };
      })
      .filter(Boolean) as Array<ScatterDataPoint & { xVal: number; yVal: number; color: string; size: number; isHighlighted: boolean }>;
  }, [data, config]);

  // Calculate domain for axes (inverted for ranks - lower is better)
  const isXAxisRank = config.xAxis !== 'pageviews';
  const isYAxisRank = config.yAxis !== 'pageviews';

  const xDomain = useMemo(() => {
    const values = chartData.map(d => d.xVal).filter(v => v !== null) as number[];
    if (values.length === 0) return [0, 1000];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return isXAxisRank ? [1, max] : [min, max];
  }, [chartData, isXAxisRank]);

  const yDomain = useMemo(() => {
    const values = chartData.map(d => d.yVal).filter(v => v !== null) as number[];
    if (values.length === 0) return [0, 1000];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return isYAxisRank ? [1, max] : [min, max];
  }, [chartData, isYAxisRank]);

  // Calculate outlier distance from diagonal
  const getOutlierScore = useCallback((point: { xVal: number; yVal: number }) => {
    if (!isXAxisRank || !isYAxisRank) return 0;
    return Math.abs(point.xVal - point.yVal);
  }, [isXAxisRank, isYAxisRank]);

  // Get top outliers for labeling
  const outlierLabels = useMemo(() => {
    if (!config.showOutlierLabels) return [];
    return [...chartData]
      .sort((a, b) => getOutlierScore(b) - getOutlierScore(a))
      .slice(0, 10);
  }, [chartData, config.showOutlierLabels, getOutlierScore]);

  return (
    <div ref={chartRef} className="w-full h-full min-h-[500px]">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={{ top: 20, right: 30, bottom: 60, left: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />

          <XAxis
            type="number"
            dataKey="xVal"
            name={AXIS_LABELS[config.xAxis]}
            domain={xDomain}
            reversed={isXAxisRank}
            tick={{ fontSize: 12, fill: '#78716c' }}
            tickLine={{ stroke: '#d6d3d1' }}
            axisLine={{ stroke: '#d6d3d1' }}
            label={{
              value: AXIS_LABELS[config.xAxis],
              position: 'bottom',
              offset: 40,
              style: { fontSize: 13, fill: '#57534e', fontWeight: 500 },
            }}
          />

          <YAxis
            type="number"
            dataKey="yVal"
            name={AXIS_LABELS[config.yAxis]}
            domain={yDomain}
            reversed={isYAxisRank}
            tick={{ fontSize: 12, fill: '#78716c' }}
            tickLine={{ stroke: '#d6d3d1' }}
            axisLine={{ stroke: '#d6d3d1' }}
            label={{
              value: AXIS_LABELS[config.yAxis],
              angle: -90,
              position: 'left',
              offset: 40,
              style: { fontSize: 13, fill: '#57534e', fontWeight: 500 },
            }}
          />

          <ZAxis type="number" dataKey="size" range={[30, 200]} />

          {/* Reference diagonal line (perfect agreement) */}
          {config.showDiagonal && isXAxisRank && isYAxisRank && (
            <ReferenceLine
              segment={[
                { x: 1, y: 1 },
                { x: Math.max(xDomain[1], yDomain[1]), y: Math.max(xDomain[1], yDomain[1]) },
              ]}
              stroke="#a8a29e"
              strokeDasharray="5 5"
              strokeWidth={1}
            />
          )}

          <Tooltip
            content={<CustomTooltip />}
            cursor={{ strokeDasharray: '3 3', stroke: '#a8a29e' }}
          />

          <Scatter
            data={chartData}
            onClick={(data) => onPointClick(data as unknown as ScatterDataPoint)}
            onMouseEnter={(data) => onPointHover(data as unknown as ScatterDataPoint)}
            onMouseLeave={() => onPointHover(null)}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={entry.id}
                fill={entry.isHighlighted ? '#fbbf24' : entry.color}
                fillOpacity={entry.isHighlighted ? 1 : 0.7}
                stroke={entry.isHighlighted ? '#92400e' : entry.color}
                strokeWidth={entry.isHighlighted ? 2 : 1}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Outlier labels overlay */}
      {config.showOutlierLabels && outlierLabels.length > 0 && (
        <div className="absolute top-4 right-4 bg-white/90 rounded-lg border border-stone-200 p-3 text-xs">
          <div className="font-medium text-stone-700 mb-2">Top Outliers</div>
          {outlierLabels.slice(0, 5).map(point => (
            <div key={point.id} className="text-stone-600 truncate max-w-[150px]">
              {point.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

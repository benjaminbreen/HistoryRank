'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Model {
  source: string;
  label: string;
}

interface Correlation {
  source1: string;
  source2: string;
  correlation: number;
  commonFigures: number;
}

interface PairwiseScatterProps {
  models: Model[];
  correlations: Correlation[];
  selectedModel1: string | null;
  selectedModel2: string | null;
  onModel1Change: (source: string) => void;
  onModel2Change: (source: string) => void;
  onFigureClick: (id: string) => void;
}

interface ScatterPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  diff: number;
}

export function PairwiseScatter({
  models,
  correlations,
  selectedModel1,
  selectedModel2,
  onModel1Change,
  onModel2Change,
  onFigureClick,
}: PairwiseScatterProps) {
  const [scatterData, setScatterData] = useState<ScatterPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showOutliers, setShowOutliers] = useState(false);

  // Get correlation for selected pair
  const pairCorrelation = useMemo(() => {
    if (!selectedModel1 || !selectedModel2) return null;
    return correlations.find(
      c => c.source1 === selectedModel1 && c.source2 === selectedModel2
    );
  }, [correlations, selectedModel1, selectedModel2]);

  // Fetch scatter data for the selected models
  useEffect(() => {
    if (!selectedModel1 || !selectedModel2 || selectedModel1 === selectedModel2) {
      setScatterData([]);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/scatter');
        if (!res.ok) {
          setScatterData([]);
          return;
        }
        const data = await res.json();
        const points: ScatterPoint[] = [];

        for (const point of data.points) {
          const x = point[selectedModel1];
          const y = point[selectedModel2];
          if (x != null && y != null) {
            points.push({
              id: point.id,
              name: point.name,
              x: Math.round(x),
              y: Math.round(y),
              diff: Math.abs(x - y),
            });
          }
        }

        setScatterData(points);
      } catch (error) {
        console.error('Failed to fetch scatter data:', error);
        setScatterData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedModel1, selectedModel2]);

  // Find top outliers
  const topOutliers = useMemo(() => {
    return [...scatterData]
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 10);
  }, [scatterData]);

  // Get model labels
  const model1Label = models.find(m => m.source === selectedModel1)?.label || selectedModel1;
  const model2Label = models.find(m => m.source === selectedModel2)?.label || selectedModel2;

  // Calculate domain for axes
  const maxRank = useMemo(() => {
    if (scatterData.length === 0) return 500;
    return Math.max(...scatterData.map(p => Math.max(p.x, p.y))) + 50;
  }, [scatterData]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload;

    return (
      <div className="bg-white/95 backdrop-blur-sm border border-stone-200 rounded-lg shadow-lg p-3 max-w-xs">
        <div className="font-serif font-semibold text-stone-900">{point.name}</div>
        <div className="space-y-1 text-sm mt-2">
          <div className="flex justify-between gap-4">
            <span className="text-stone-500">{model1Label}:</span>
            <span className="font-mono">#{point.x}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-stone-500">{model2Label}:</span>
            <span className="font-mono">#{point.y}</span>
          </div>
          <div className="flex justify-between gap-4 border-t border-stone-100 pt-1 mt-1">
            <span className="text-stone-500">Difference:</span>
            <span className={`font-mono ${point.diff > 50 ? 'text-amber-600' : 'text-stone-600'}`}>
              {point.diff}
            </span>
          </div>
        </div>
        <div className="mt-2 text-xs text-stone-400 text-center">Click for details</div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-6">
      <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100 mb-4">
        Pairwise Model Comparison
      </h2>

      {/* Model selectors */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm text-stone-600 dark:text-slate-400 min-w-[60px] sm:min-w-0">Model 1:</label>
          <select
            value={selectedModel1 || ''}
            onChange={(e) => onModel1Change(e.target.value)}
            className="flex-1 sm:flex-none px-3 py-2.5 sm:py-1.5 rounded-lg border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-stone-700 dark:text-slate-300"
          >
            {models.map((m) => (
              <option key={m.source} value={m.source}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <span className="text-stone-400 hidden sm:inline">vs</span>
        <div className="flex items-center gap-2">
          <label className="text-sm text-stone-600 dark:text-slate-400 min-w-[60px] sm:min-w-0">Model 2:</label>
          <select
            value={selectedModel2 || ''}
            onChange={(e) => onModel2Change(e.target.value)}
            className="flex-1 sm:flex-none px-3 py-2.5 sm:py-1.5 rounded-lg border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-stone-700 dark:text-slate-300"
          >
            {models.map((m) => (
              <option key={m.source} value={m.source}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {pairCorrelation && (
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm sm:ml-auto pt-2 sm:pt-0 border-t sm:border-0 border-stone-100 dark:border-slate-700">
            <span className="text-stone-500 dark:text-slate-400">
              Correlation: <strong className="text-stone-700 dark:text-slate-200">{Math.round(pairCorrelation.correlation * 100)}%</strong>
            </span>
            <span className="text-stone-500 dark:text-slate-400">
              Common: <strong className="text-stone-700 dark:text-slate-200">{pairCorrelation.commonFigures}</strong>
            </span>
          </div>
        )}
      </div>

      {selectedModel1 === selectedModel2 ? (
        <div className="h-[300px] sm:h-[400px] lg:h-[500px] flex items-center justify-center text-stone-400 dark:text-slate-500">
          Select two different models to compare
        </div>
      ) : isLoading ? (
        <Skeleton className="h-[300px] sm:h-[400px] lg:h-[500px] w-full rounded-lg" />
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* Chart */}
          <div className="flex-1 h-[300px] sm:h-[400px] lg:h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 10, bottom: 50, left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[1, maxRank]}
                  reversed
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  label={{
                    value: model1Label || 'Model 1',
                    position: 'bottom',
                    offset: 30,
                    style: { fontSize: 12, fill: '#57534e', fontWeight: 500 },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={[1, maxRank]}
                  reversed
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  label={{
                    value: model2Label || 'Model 2',
                    angle: -90,
                    position: 'left',
                    offset: 25,
                    style: { fontSize: 12, fill: '#57534e', fontWeight: 500 },
                  }}
                />
                <ReferenceLine
                  segment={[{ x: 1, y: 1 }, { x: maxRank, y: maxRank }]}
                  stroke="#a8a29e"
                  strokeDasharray="5 5"
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Scatter
                  data={scatterData}
                  onClick={(data) => onFigureClick((data as unknown as ScatterPoint).id)}
                >
                  {scatterData.map((entry) => (
                    <Cell
                      key={entry.id}
                      fill={entry.diff > 100 ? '#ef4444' : entry.diff > 50 ? '#f59e0b' : '#6366f1'}
                      fillOpacity={0.7}
                      style={{ cursor: 'pointer' }}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Legend - visible on mobile, hidden on desktop (shown in sidebar instead) */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-stone-500 dark:text-slate-400 lg:hidden">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <span>Small diff</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span>Medium</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span>Large</span>
            </div>
          </div>

          {/* Mobile: Collapsible outliers */}
          <div className="lg:hidden">
            <button
              onClick={() => setShowOutliers(!showOutliers)}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-stone-50 dark:bg-slate-700/50 text-sm font-medium text-stone-700 dark:text-slate-300"
            >
              <span>Top Disagreements ({topOutliers.length})</span>
              {showOutliers ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showOutliers && (
              <div className="mt-2 space-y-1 max-h-[300px] overflow-y-auto">
                {topOutliers.map((point, i) => (
                  <button
                    key={point.id}
                    onClick={() => onFigureClick(point.id)}
                    className="w-full text-left p-3 rounded-lg hover:bg-stone-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-stone-400 dark:text-slate-500 w-5">
                        {i + 1}.
                      </span>
                      <span className="text-sm text-stone-700 dark:text-slate-300 truncate flex-1">
                        {point.name}
                      </span>
                      <span className={`text-xs font-medium ${
                        point.diff > 100 ? 'text-red-500' : point.diff > 50 ? 'text-amber-500' : 'text-stone-400'
                      }`}>
                        Δ{point.diff}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Desktop: Outliers sidebar */}
          <div className="hidden lg:block w-64 flex-shrink-0">
            <h4 className="text-sm font-semibold text-stone-700 dark:text-slate-300 mb-3">
              Top Disagreements
            </h4>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {topOutliers.map((point, i) => (
                <button
                  key={point.id}
                  onClick={() => onFigureClick(point.id)}
                  className="w-full text-left p-2 rounded-lg hover:bg-stone-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-400 dark:text-slate-500 w-4">
                      {i + 1}.
                    </span>
                    <span className="text-sm text-stone-700 dark:text-slate-300 truncate flex-1">
                      {point.name}
                    </span>
                  </div>
                  <div className="ml-6 text-xs text-stone-500 dark:text-slate-400">
                    #{point.x} vs #{point.y}
                    <span className={`ml-2 font-medium ${
                      point.diff > 100 ? 'text-red-500' : point.diff > 50 ? 'text-amber-500' : 'text-stone-400'
                    }`}>
                      (Δ{point.diff})
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-4 pt-4 border-t border-stone-200 dark:border-slate-700">
              <h5 className="text-xs font-medium text-stone-600 dark:text-slate-400 mb-2">
                How to read
              </h5>
              <div className="text-[11px] text-stone-500 dark:text-slate-500 space-y-1">
                <p><strong>On diagonal:</strong> Models agree</p>
                <p><strong>Above line:</strong> Model 2 ranks lower</p>
                <p><strong>Below line:</strong> Model 1 ranks lower</p>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <div className="w-3 h-3 rounded-full bg-indigo-500" />
                <span className="text-[11px] text-stone-500">Small diff (&lt;50)</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-[11px] text-stone-500">Medium (50-100)</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-[11px] text-stone-500">Large (&gt;100)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

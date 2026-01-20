'use client';

import { useMemo } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface ModelBias {
  source: string;
  label: string;
  domainBias: Array<{ domain: string; avgRank: number; diff: number; figureCount: number }>;
  eraBias: Array<{ era: string; avgRank: number; diff: number; figureCount: number }>;
}

interface BiasRadarGridProps {
  models: ModelBias[];
  onModelClick?: (source: string) => void;
}

// Official brand colors (matching ModelProfileCard)
const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4.5': '#da7756',
  'claude-sonnet-4.5': '#da7756',
  'gemini-flash-3-preview': '#078EFA',
  'gemini-pro-3': '#4285F4',
  'gpt-5.2-thinking': '#10A37F',
  'deepseek-v3.2': '#4D6BFE',
  'qwen3-235b-a22b': '#615EFF',
  'glm-4.7': '#2563eb',
  'grok-4': '#1a1a1a',
  'grok-4.1-fast': '#1a1a1a',
  'mistral-large-3': '#FF8205',
};

// Key domains to show (most interesting for comparison)
const KEY_DOMAINS = ['Science', 'Philosophy', 'Politics', 'Arts', 'Religion', 'Military'];

// Key eras to show
const KEY_ERAS = ['Ancient', 'Classical', 'Medieval', 'Early Modern', 'Modern', 'Contemporary'];

function normalizeValue(diff: number, maxDiff: number): number {
  // Normalize to 0-100 scale, with 50 being neutral
  // Positive diff = model favors this category
  const normalized = 50 + (diff / maxDiff) * 50;
  return Math.max(0, Math.min(100, normalized));
}

interface SingleRadarProps {
  model: ModelBias;
  maxDiff: number;
  type: 'domain' | 'era';
  onClick?: () => void;
}

function SingleRadar({ model, maxDiff, type, onClick }: SingleRadarProps) {
  const color = MODEL_COLORS[model.source] || '#6b7280';

  const data = useMemo(() => {
    const categories = type === 'domain' ? KEY_DOMAINS : KEY_ERAS;

    return categories.map(cat => {
      let bias: { avgRank: number; diff: number; figureCount: number } | undefined;
      if (type === 'domain') {
        bias = model.domainBias.find(b => b.domain === cat);
      } else {
        bias = model.eraBias.find(b => b.era === cat);
      }
      return {
        category: cat.length > 10 ? cat.slice(0, 8) + '…' : cat,
        fullCategory: cat,
        value: bias ? normalizeValue(bias.diff, maxDiff) : 50,
        diff: bias?.diff || 0,
        figureCount: bias?.figureCount || 0,
      };
    });
  }, [model, maxDiff, type]);

  return (
    <button
      onClick={onClick}
      className="group relative rounded-xl border border-stone-200/70 bg-white p-4 transition-all hover:border-stone-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
      style={{ borderColor: `${color}30` }}
    >
      {/* Model icon and name */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}20` }}
        >
          <img
            src={`/icons/models/${model.source.split('-')[0]}.svg`}
            alt={model.label}
            className="w-4 h-4"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        <span
          className="text-sm font-semibold leading-tight"
          style={{ color }}
        >
          {model.label}
        </span>
      </div>

      {/* Radar chart */}
      <div className="h-36 sm:h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <PolarGrid
              stroke="#e5e7eb"
              strokeDasharray="2 2"
            />
            <PolarAngleAxis
              dataKey="category"
              tick={{ fontSize: 9, fill: '#57534e', fontWeight: 500 }}
              tickLine={false}
            />
            <Radar
              name={model.label}
              dataKey="value"
              stroke={color}
              fill={color}
              fillOpacity={0.3}
              strokeWidth={2}
            />
            <Tooltip
              content={({ payload }) => {
                if (!payload?.[0]?.payload) return null;
                const item = payload[0].payload;
                const diffLabel = item.diff > 0 ? `+${item.diff}` : item.diff;
                return (
                  <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    <div className="font-medium text-stone-900 dark:text-slate-100">
                      {item.fullCategory}
                    </div>
                    <div className="text-xs text-stone-500 dark:text-slate-400">
                      {diffLabel} vs avg ({item.figureCount} figures)
                    </div>
                  </div>
                );
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Hover indicator */}
      <div className="absolute inset-0 rounded-xl opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, ${color}08 0%, transparent 70%)`
        }}
      />
    </button>
  );
}

export function BiasRadarGrid({ models, onModelClick }: BiasRadarGridProps) {
  // Calculate max diff for normalization across all models
  const maxDiff = useMemo(() => {
    let max = 1;
    for (const model of models) {
      for (const bias of model.domainBias) {
        max = Math.max(max, Math.abs(bias.diff));
      }
      for (const bias of model.eraBias) {
        max = Math.max(max, Math.abs(bias.diff));
      }
    }
    return max;
  }, [models]);

  return (
    <div className="space-y-6">
      {/* Domain biases */}
      <div>
        <h3 className="text-sm font-medium text-stone-600 dark:text-slate-400 mb-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <span className="uppercase tracking-wider text-xs">Domain Preferences</span>
          <span className="text-stone-400 dark:text-slate-500 font-normal text-xs sm:text-sm">
            How each model weights different fields
          </span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {models.map(model => (
            <SingleRadar
              key={`domain-${model.source}`}
              model={model}
              maxDiff={maxDiff}
              type="domain"
              onClick={() => onModelClick?.(model.source)}
            />
          ))}
        </div>
      </div>

      {/* Era biases */}
      <div>
        <h3 className="text-sm font-medium text-stone-600 dark:text-slate-400 mb-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
          <span className="uppercase tracking-wider text-xs">Era Preferences</span>
          <span className="text-stone-400 dark:text-slate-500 font-normal text-xs sm:text-sm">
            Historical periods each model emphasizes
          </span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {models.map(model => (
            <SingleRadar
              key={`era-${model.source}`}
              model={model}
              maxDiff={maxDiff}
              type="era"
              onClick={() => onModelClick?.(model.source)}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:gap-6 text-[11px] sm:text-xs text-stone-500 dark:text-slate-400 pt-3 border-t border-stone-200/70 dark:border-slate-700/70">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-stone-300 dark:bg-slate-600" />
          <span>Center = average</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500" />
          <span>Outward = favors</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-500" />
          <span>Inward = underweights</span>
        </div>
      </div>
    </div>
  );
}

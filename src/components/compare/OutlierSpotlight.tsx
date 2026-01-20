'use client';

import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { MODEL_ICONS } from '@/types';

interface OutlierReference {
  id: string;
  name: string;
  diff: number;
  modelRank: number;
  consensusRank: number;
  direction: 'higher' | 'lower';
}

interface ModelWithOutliers {
  source: string;
  label: string;
  outliers: OutlierReference[];
}

interface OutlierSpotlightProps {
  models: ModelWithOutliers[];
  onFigureClick?: (figureId: string) => void;
}

// Official brand colors
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

interface FlatOutlier extends OutlierReference {
  source: string;
  label: string;
  absDiff: number;
}

function FigureThumbnail({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const [imgSrc, setImgSrc] = useState(`/thumbnails/${id}.jpg`);

  if (failed) {
    return (
      <div className="w-10 h-10 rounded-full bg-stone-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-serif text-stone-500 dark:text-slate-400">
          {name.charAt(0)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={name}
      loading="lazy"
      className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-2 ring-white dark:ring-slate-700"
      onError={() => {
        if (imgSrc.endsWith('.jpg')) {
          setImgSrc(`/thumbnails/${id}.png`);
        } else if (imgSrc.endsWith('.png')) {
          setImgSrc(`/thumbnails/${id}.webp`);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

function OutlierCard({
  outlier,
  onClick,
}: {
  outlier: FlatOutlier;
  onClick?: () => void;
}) {
  const color = MODEL_COLORS[outlier.source] || '#6b7280';
  const isHigher = outlier.direction === 'higher';

  // Calculate bar width (max 100%)
  const barWidth = Math.min(100, Math.abs(outlier.diff) / 5);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3.5 sm:p-3 rounded-xl border border-stone-200/70 bg-white transition-all hover:border-stone-300 hover:shadow-md active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 w-full text-left"
    >
      {/* Figure thumbnail */}
      <FigureThumbnail id={outlier.id} name={outlier.name} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Figure name and model badge */}
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-stone-900 dark:text-slate-100 truncate">
            {outlier.name}
          </span>
          <span
            className="flex items-center gap-1 text-[11px] sm:text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
            style={{
              backgroundColor: `${color}15`,
              color: color,
            }}
          >
            {MODEL_ICONS[outlier.source] && (
              <img
                src={MODEL_ICONS[outlier.source]}
                alt=""
                className="w-3 h-3 opacity-70"
              />
            )}
            {outlier.label}
          </span>
        </div>

        {/* Rank comparison bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-stone-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isHigher ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <div className="flex items-center gap-1 text-xs">
            {isHigher ? (
              <TrendingUp className="w-3 h-3 text-emerald-500" />
            ) : (
              <TrendingDown className="w-3 h-3 text-amber-500" />
            )}
            <span className={isHigher ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
              {isHigher ? '+' : ''}{Math.abs(outlier.diff)}
            </span>
          </div>
        </div>

        {/* Rank numbers */}
        <div className="flex items-center gap-2 mt-1 text-[11px] sm:text-[10px] text-stone-500 dark:text-slate-400">
          <span>
            Model: <span className="font-medium">#{outlier.modelRank}</span>
          </span>
          <span className="text-stone-300 dark:text-slate-600">→</span>
          <span>
            Consensus: <span className="font-medium">#{outlier.consensusRank}</span>
          </span>
        </div>
      </div>
    </button>
  );
}

export function OutlierSpotlight({ models, onFigureClick }: OutlierSpotlightProps) {
  const [showAll, setShowAll] = useState(false);

  // Flatten all outliers and sort by absolute difference
  const allOutliers = useMemo(() => {
    const flat: FlatOutlier[] = [];
    for (const model of models) {
      for (const outlier of model.outliers) {
        flat.push({
          ...outlier,
          source: model.source,
          label: model.label,
          absDiff: Math.abs(outlier.diff),
        });
      }
    }
    // Sort by absolute difference, then dedupe by figure (keep biggest)
    flat.sort((a, b) => b.absDiff - a.absDiff);

    // Remove duplicates (same figure from different models), keep the most extreme
    const seen = new Set<string>();
    return flat.filter(o => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
  }, [models]);

  // Split into "ranks higher" and "ranks lower"
  const ranksHigher = allOutliers.filter(o => o.direction === 'higher');
  const ranksLower = allOutliers.filter(o => o.direction === 'lower');

  const displayCount = showAll ? 8 : 4;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ranks Higher than Consensus */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-medium text-stone-700 dark:text-slate-300">
              Ranked Higher Than Consensus
            </h3>
          </div>
          <p className="text-xs text-stone-500 dark:text-slate-400 mb-3">
            Figures one model values much more than others
          </p>
          <div className="space-y-2">
            {ranksHigher.slice(0, displayCount).map(outlier => (
              <OutlierCard
                key={`${outlier.source}-${outlier.id}`}
                outlier={outlier}
                onClick={() => onFigureClick?.(outlier.id)}
              />
            ))}
          </div>
        </div>

        {/* Ranks Lower than Consensus */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-medium text-stone-700 dark:text-slate-300">
              Ranked Lower Than Consensus
            </h3>
          </div>
          <p className="text-xs text-stone-500 dark:text-slate-400 mb-3">
            Figures one model undervalues compared to others
          </p>
          <div className="space-y-2">
            {ranksLower.slice(0, displayCount).map(outlier => (
              <OutlierCard
                key={`${outlier.source}-${outlier.id}`}
                outlier={outlier}
                onClick={() => onFigureClick?.(outlier.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Show more/less button */}
      {(ranksHigher.length > 4 || ranksLower.length > 4) && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full py-3 sm:py-2 text-sm text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 active:bg-stone-50 dark:active:bg-slate-700/50 flex items-center justify-center gap-1 border-t border-stone-200/70 dark:border-slate-700/70 pt-4 rounded-b-lg"
        >
          {showAll ? (
            <>
              Show less <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              Show more outliers <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

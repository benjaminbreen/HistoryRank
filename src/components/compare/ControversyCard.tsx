'use client';

import { Tooltip } from '@/components/ui/tooltip';

interface ControversialFigure {
  id: string;
  name: string;
  domain: string | null;
  era: string | null;
  birthYear: number | null;
  varianceScore: number;
  modelRanks: Array<{ source: string; label: string; rank: number }>;
}

interface ControversyCardProps {
  figure: ControversialFigure;
  rank: number;
  onClick: () => void;
}

// Model-specific colors for markers
const MODEL_MARKER_COLORS: Record<string, string> = {
  'claude-opus-4.5': 'bg-violet-500',
  'claude-sonnet-4.5': 'bg-purple-500',
  'gemini-flash-3-preview': 'bg-teal-500',
  'gemini-pro-3': 'bg-cyan-500',
  'gpt-5.2-thinking': 'bg-green-500',
};

export function ControversyCard({ figure, rank, onClick }: ControversyCardProps) {
  // Calculate scale for visualization
  const ranks = figure.modelRanks.map(m => m.rank);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const range = maxRank - minRank;

  // Add padding to range for visualization
  const scaleMin = Math.max(1, minRank - Math.ceil(range * 0.1));
  const scaleMax = maxRank + Math.ceil(range * 0.1);
  const scaleRange = scaleMax - scaleMin;

  const getPosition = (rank: number) => {
    return ((rank - scaleMin) / scaleRange) * 100;
  };

  // Find the model with extreme rankings
  const lowestRanker = figure.modelRanks[0]; // Already sorted by rank
  const highestRanker = figure.modelRanks[figure.modelRanks.length - 1];

  const formatYear = (year: number | null) => {
    if (year === null) return '';
    return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
  };

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-lg bg-stone-50 dark:bg-slate-700/50 hover:bg-stone-100 dark:hover:bg-slate-700 border border-stone-200 dark:border-slate-600 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-stone-400 dark:text-slate-500">
              {rank}.
            </span>
            <h4 className="font-semibold text-stone-900 dark:text-amber-100 truncate">
              {figure.name}
            </h4>
          </div>

          {/* Metadata */}
          <div className="text-xs text-stone-500 dark:text-slate-400 mb-3">
            {figure.domain && <span>{figure.domain}</span>}
            {figure.domain && figure.birthYear && <span> · </span>}
            {figure.birthYear && <span>{formatYear(figure.birthYear)}</span>}
            {(figure.domain || figure.birthYear) && figure.era && <span> · </span>}
            {figure.era && <span>{figure.era}</span>}
          </div>

          {/* Rank visualization */}
          <div className="relative h-6 mb-2">
            {/* Track */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 bg-stone-200 dark:bg-slate-600 rounded-full" />

            {/* Model markers */}
            {figure.modelRanks.map((m) => (
              <Tooltip
                key={m.source}
                content={
                  <span>
                    <strong>{m.label}</strong>
                    <br />
                    Rank: #{m.rank}
                  </span>
                }
                align="center"
              >
                <div
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full ${
                    MODEL_MARKER_COLORS[m.source] || 'bg-stone-400'
                  } ring-2 ring-white dark:ring-slate-800 cursor-help transition-transform hover:scale-125`}
                  style={{ left: `${getPosition(m.rank)}%` }}
                />
              </Tooltip>
            ))}
          </div>

          {/* Rank labels */}
          <div className="flex justify-between text-[10px] text-stone-400 dark:text-slate-500">
            <span>#{minRank}</span>
            <span>#{maxRank}</span>
          </div>
        </div>

        {/* Variance badge */}
        <div className="flex-shrink-0 text-right">
          <div className="text-xs text-stone-400 dark:text-slate-500 mb-1">Variance</div>
          <div className="flex items-center gap-1">
            <div className="w-16 h-2 bg-stone-200 dark:bg-slate-600 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  figure.varianceScore > 0.3 ? 'bg-red-500' :
                  figure.varianceScore > 0.2 ? 'bg-amber-500' :
                  'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, figure.varianceScore * 200)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-stone-600 dark:text-slate-400">
              {Math.round(figure.varianceScore * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Insight */}
      <div className="mt-2 text-[10px] text-stone-500 dark:text-slate-400">
        <span className={MODEL_MARKER_COLORS[lowestRanker.source]?.replace('bg-', 'text-') || 'text-stone-500'}>
          {lowestRanker.label.split(' ').slice(-1)[0]}
        </span>
        {' ranks highest (#{0}), '.replace('{0}', String(lowestRanker.rank))}
        <span className={MODEL_MARKER_COLORS[highestRanker.source]?.replace('bg-', 'text-') || 'text-stone-500'}>
          {highestRanker.label.split(' ').slice(-1)[0]}
        </span>
        {' ranks lowest (#{0})'.replace('{0}', String(highestRanker.rank))}
      </div>
    </button>
  );
}

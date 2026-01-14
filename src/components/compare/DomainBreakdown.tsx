'use client';

import { useMemo, useState } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Model {
  source: string;
  label: string;
}

interface DomainData {
  domain: string;
  models: Array<{ source: string; label: string; avgRank: number }>;
}

interface DomainBreakdownProps {
  data: DomainData[];
  models: Model[];
  title: string;
  description: string;
}

// Model-specific colors
const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4.5': 'bg-violet-500',
  'claude-sonnet-4.5': 'bg-purple-500',
  'gemini-flash-3-preview': 'bg-teal-500',
  'gemini-pro-3': 'bg-cyan-500',
  'gpt-5.2-thinking': 'bg-green-500',
};

const MODEL_TEXT_COLORS: Record<string, string> = {
  'claude-opus-4.5': 'text-violet-600 dark:text-violet-400',
  'claude-sonnet-4.5': 'text-purple-600 dark:text-purple-400',
  'gemini-flash-3-preview': 'text-teal-600 dark:text-teal-400',
  'gemini-pro-3': 'text-cyan-600 dark:text-cyan-400',
  'gpt-5.2-thinking': 'text-green-600 dark:text-green-400',
};

export function DomainBreakdown({ data, models, title, description }: DomainBreakdownProps) {
  const [showAll, setShowAll] = useState(false);

  // Calculate max rank for scaling
  const maxRank = useMemo(() => {
    let max = 0;
    for (const d of data) {
      for (const m of d.models) {
        if (m.avgRank > max) max = m.avgRank;
      }
    }
    return max;
  }, [data]);

  // Sort domains by average rank across all models
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const avgA = a.models.reduce((s, m) => s + m.avgRank, 0) / a.models.length;
      const avgB = b.models.reduce((s, m) => s + m.avgRank, 0) / b.models.length;
      return avgA - avgB;
    });
  }, [data]);

  const displayedData = showAll ? sortedData : sortedData.slice(0, 6);

  // Get short label for model
  const getShortLabel = (source: string) => {
    if (source.includes('opus')) return 'Opus';
    if (source.includes('sonnet')) return 'Sonnet';
    if (source.includes('flash')) return 'Flash';
    if (source.includes('pro-3')) return 'Pro';
    if (source.includes('gpt')) return 'GPT';
    return source.slice(0, 6);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-6">
      <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100 mb-2">
        {title}
      </h2>
      <p className="text-sm text-stone-500 dark:text-slate-400 mb-6">
        {description}
      </p>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-6 pb-4 border-b border-stone-200 dark:border-slate-700">
        {models.map((m) => (
          <div key={m.source} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${MODEL_COLORS[m.source] || 'bg-stone-400'}`} />
            <span className="text-xs text-stone-600 dark:text-slate-400">{m.label}</span>
          </div>
        ))}
      </div>

      {/* Breakdown bars */}
      <div className="space-y-6">
        {displayedData.map((item) => {
          // Find lowest (best) rank for this domain
          const lowestRank = Math.min(...item.models.map(m => m.avgRank));
          const lowestModel = item.models.find(m => m.avgRank === lowestRank);

          return (
            <div key={item.domain}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-stone-700 dark:text-slate-300">
                  {item.domain}
                </h4>
                {lowestModel && (
                  <span className={`text-[10px] ${MODEL_TEXT_COLORS[lowestModel.source] || 'text-stone-500'}`}>
                    {getShortLabel(lowestModel.source)} ranks highest
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {item.models
                  .sort((a, b) => a.avgRank - b.avgRank)
                  .map((m) => {
                    const isLowest = m.avgRank === lowestRank;
                    return (
                      <Tooltip
                        key={m.source}
                        content={
                          <span>
                            <strong>{m.label}</strong>
                            <br />
                            Average rank: #{m.avgRank}
                            {isLowest && <><br /><span className="text-emerald-400">Ranks this domain highest</span></>}
                          </span>
                        }
                        align="left"
                      >
                        <div className="flex items-center gap-2 cursor-help">
                          <span className="text-[10px] text-stone-500 dark:text-slate-500 w-12 text-right flex-shrink-0">
                            {getShortLabel(m.source)}
                          </span>
                          <div className="flex-1 h-4 bg-stone-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                MODEL_COLORS[m.source] || 'bg-stone-400'
                              } ${isLowest ? 'opacity-100' : 'opacity-60'}`}
                              style={{ width: `${(m.avgRank / maxRank) * 100}%` }}
                            />
                          </div>
                          <span className={`text-xs font-mono w-10 text-right flex-shrink-0 ${
                            isLowest ? 'font-semibold text-stone-900 dark:text-amber-100' : 'text-stone-500 dark:text-slate-400'
                          }`}>
                            #{m.avgRank}
                          </span>
                        </div>
                      </Tooltip>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more/less */}
      {sortedData.length > 6 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-6 w-full py-2 text-sm text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 flex items-center justify-center gap-1 border-t border-stone-200 dark:border-slate-700 pt-4"
        >
          {showAll ? (
            <>
              Show less <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              Show {sortedData.length - 6} more <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

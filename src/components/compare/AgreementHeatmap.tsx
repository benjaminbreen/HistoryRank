'use client';

import { useMemo } from 'react';
import { Tooltip } from '@/components/ui/tooltip';

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

interface AgreementHeatmapProps {
  correlations: Correlation[];
  models: Model[];
  onCellClick: (source1: string, source2: string) => void;
}

export function AgreementHeatmap({ correlations, models, onCellClick }: AgreementHeatmapProps) {
  // Build correlation lookup
  const correlationMap = useMemo(() => {
    const map = new Map<string, Correlation>();
    for (const c of correlations) {
      map.set(`${c.source1}:${c.source2}`, c);
    }
    return map;
  }, [correlations]);

  // Get color for correlation value
  const getColor = (correlation: number, isDiagonal: boolean) => {
    if (isDiagonal) return 'bg-stone-200 dark:bg-slate-600';

    if (correlation >= 0.85) return 'bg-emerald-500 dark:bg-emerald-600';
    if (correlation >= 0.8) return 'bg-emerald-400 dark:bg-emerald-500';
    if (correlation >= 0.7) return 'bg-lime-400 dark:bg-lime-500';
    if (correlation >= 0.62) return 'bg-amber-400 dark:bg-amber-500';
    if (correlation >= 0.55) return 'bg-orange-400 dark:bg-orange-500';
    if (correlation >= 0.48) return 'bg-rose-400 dark:bg-rose-500';
    return 'bg-red-400 dark:bg-red-500';
  };

  // Get short label for model
  const getShortLabel = (label: string) => {
    if (label.includes('Opus')) return 'Opus';
    if (label.includes('Sonnet')) return 'Sonnet';
    if (label.includes('Flash')) return 'Flash';
    if (label.includes('Pro')) return 'Pro';
    if (label.includes('GPT')) return 'GPT';
    return label.slice(0, 6);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      {/* Heatmap grid */}
      <div className="overflow-x-auto flex-1">
        <div className="inline-block min-w-[320px]">
          {/* Header row */}
          <div className="flex">
            <div className="w-20 flex-shrink-0" /> {/* Empty corner */}
            {models.map((m) => (
              <div
                key={m.source}
                className="w-16 h-12 flex items-end justify-center pb-1"
              >
                <span className="text-[10px] sm:text-xs font-medium text-stone-600 dark:text-slate-400 text-center leading-tight">
                  {getShortLabel(m.label)}
                </span>
              </div>
            ))}
          </div>

          {/* Data rows */}
          {models.map((rowModel, rowIndex) => (
            <div key={rowModel.source} className="flex">
              {/* Row label */}
              <div className="w-20 flex-shrink-0 h-14 flex items-center pr-2">
                <span className="text-[10px] sm:text-xs font-medium text-stone-600 dark:text-slate-400 text-right w-full truncate">
                  {getShortLabel(rowModel.label)}
                </span>
              </div>

              {/* Cells */}
              {models.map((colModel, colIndex) => {
                const key = `${rowModel.source}:${colModel.source}`;
                const correlation = correlationMap.get(key);
                const isDiagonal = rowIndex === colIndex;
                const value = correlation?.correlation ?? 1;

                return (
                  <Tooltip
                    key={colModel.source}
                    content={
                      isDiagonal ? (
                        <span>{rowModel.label}</span>
                      ) : (
                        <span>
                          <strong>{rowModel.label}</strong> vs <strong>{colModel.label}</strong>
                          <br />
                          Correlation: {Math.round(value * 100)}%
                          <br />
                          Common figures: {correlation?.commonFigures || 0}
                          <br />
                          <span className="text-stone-400 text-[10px]">Click to compare</span>
                        </span>
                      )
                    }
                    align="center"
                  >
                    <button
                      onClick={() => !isDiagonal && onCellClick(rowModel.source, colModel.source)}
                      disabled={isDiagonal}
                      className={`w-14 h-14 sm:w-16 sm:h-14 m-0.5 rounded-md flex items-center justify-center transition-all ${
                        getColor(value, isDiagonal)
                      } ${
                        isDiagonal
                          ? 'cursor-default'
                          : 'cursor-pointer hover:scale-105 hover:shadow-md'
                      }`}
                    >
                      <span className={`text-xs sm:text-sm font-semibold ${
                        isDiagonal ? 'text-stone-400 dark:text-slate-500' : 'text-white'
                      }`}>
                        {isDiagonal ? '—' : `${Math.round(value * 100)}%`}
                      </span>
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

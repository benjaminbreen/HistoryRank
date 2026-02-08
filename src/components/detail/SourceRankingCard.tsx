'use client';

import { useState, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import { SOURCE_LABELS, MODEL_ICONS } from '@/types';

export interface SourceRankingCardProps {
  source: string;
  avgRank: number;
  sampleCount: number;
  contributions: string[];
}

export function SourceRankingCard({ source, avgRank, sampleCount, contributions }: SourceRankingCardProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const hasMultiple = contributions.length > 1;

  const cycleNext = useCallback(() => {
    if (!hasMultiple || isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % contributions.length);
      setIsAnimating(false);
    }, 150);
  }, [contributions.length, hasMultiple, isAnimating]);

  const currentContribution = contributions[activeIndex] || null;

  return (
    <div
      className={`p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700 ${
        hasMultiple ? 'cursor-pointer hover:ring-stone-300 dark:hover:ring-slate-600 transition-all' : ''
      }`}
      onClick={hasMultiple ? cycleNext : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
          {MODEL_ICONS[source] && (
            <img
              src={MODEL_ICONS[source]}
              alt=""
              className="w-4 h-4 opacity-70 dark:invert dark:opacity-60"
            />
          )}
          {SOURCE_LABELS[source] || source}
        </span>
        <div className="text-right">
          <span className="font-mono text-stone-900 dark:text-slate-100 font-medium">
            #{avgRank}
          </span>
          {sampleCount > 1 && (
            <span className="text-[10px] text-stone-400 dark:text-slate-500 ml-1">
              avg of {sampleCount}
            </span>
          )}
        </div>
      </div>

      {currentContribution && (
        <div className="relative overflow-hidden mt-2">
          <p
            className={`text-xs text-stone-500 dark:text-slate-400 leading-relaxed transition-all duration-150 ease-out ${
              isAnimating
                ? 'opacity-0 translate-x-4'
                : 'opacity-100 translate-x-0'
            }`}
          >
            {currentContribution}
          </p>
        </div>
      )}

      {hasMultiple && (
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-stone-100 dark:border-slate-700">
          <div className="flex items-center gap-1.5">
            {contributions.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  if (idx !== activeIndex && !isAnimating) {
                    setIsAnimating(true);
                    setTimeout(() => {
                      setActiveIndex(idx);
                      setIsAnimating(false);
                    }, 150);
                  }
                }}
                className={`transition-all ${
                  idx === activeIndex
                    ? 'w-4 h-1.5 bg-stone-400 dark:bg-slate-400 rounded-full'
                    : 'w-1.5 h-1.5 bg-stone-200 dark:bg-slate-600 rounded-full hover:bg-stone-300 dark:hover:bg-slate-500'
                }`}
                aria-label={`View quote ${idx + 1}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-stone-400 dark:text-slate-500">
            <span className="tabular-nums">{activeIndex + 1}/{contributions.length}</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>
      )}
    </div>
  );
}

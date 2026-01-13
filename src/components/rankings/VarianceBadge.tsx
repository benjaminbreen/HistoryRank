'use client';

import { cn } from '@/lib/utils';

interface VarianceBadgeProps {
  level: 'low' | 'medium' | 'high';
  score?: number | null;
  showScore?: boolean;
}

export function VarianceBadge({ level, score, showScore = false }: VarianceBadgeProps) {
  const styles = {
    low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-red-50 text-red-700 border-red-200',
  };

  const labels = {
    low: 'Consensus',
    medium: 'Mixed',
    high: 'Controversial',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded',
        styles[level]
      )}
    >
      {labels[level]}
      {showScore && score !== null && score !== undefined && (
        <span className="opacity-60">({(score * 100).toFixed(0)}%)</span>
      )}
    </span>
  );
}

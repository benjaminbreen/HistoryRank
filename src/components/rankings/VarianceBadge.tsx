'use client';

import { cn } from '@/lib/utils';
import { VarianceLevel, VARIANCE_LABELS, VARIANCE_COLORS } from '@/types';

interface VarianceBadgeProps {
  level: VarianceLevel;
  score?: number | null;
  showScore?: boolean;
  compact?: boolean;
}

export function VarianceBadge({ level, score, showScore = false, compact = false }: VarianceBadgeProps) {
  const colors = VARIANCE_COLORS[level];
  const label = VARIANCE_LABELS[level];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium border rounded',
        colors.bg,
        colors.text,
        colors.border,
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      )}
    >
      {label}
      {showScore && score !== null && score !== undefined && (
        <span className="opacity-60">({(score * 100).toFixed(0)}%)</span>
      )}
    </span>
  );
}

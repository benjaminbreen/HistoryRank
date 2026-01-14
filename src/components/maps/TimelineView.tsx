'use client';

import { useMemo } from 'react';
import { REGION_COLORS, type MapPoint } from '@/types';

const ERA_ORDER = ['Ancient', 'Classical', 'Late Antiquity', 'Medieval', 'Early Modern', 'Industrial', 'Modern', 'Contemporary'];

const ERA_RANGES: Record<string, string> = {
  Ancient: '3000 BCE–600 BCE',
  Classical: '600 BCE–200 CE',
  'Late Antiquity': '200–800',
  Medieval: '800–1500',
  'Early Modern': '1500–1800',
  Industrial: '1800–1914',
  Modern: '1914–1945',
  Contemporary: '1945–present',
};

const BIN_SIZE = 50;

type TimelineViewProps = {
  points: MapPoint[];
};

export function TimelineView({ points }: TimelineViewProps) {
  const counts = useMemo(() => {
    const tally = new Map<string, number>();
    for (const era of ERA_ORDER) {
      tally.set(era, 0);
    }
    for (const point of points) {
      if (point.era) {
        tally.set(point.era, (tally.get(point.era) || 0) + 1);
      }
    }
    return tally;
  }, [points]);

  const maxCount = Math.max(...Array.from(counts.values()), 1);

  const { minYear, maxYear, yearPoints, maxBinCount } = useMemo(() => {
    const years = points
      .map((point) => point.birthYear)
      .filter((year): year is number => typeof year === 'number');
    const minRaw = years.length ? Math.min(...years) : -1000;
    const maxRaw = years.length ? Math.max(...years) : 2000;
    const min = Math.floor(minRaw / BIN_SIZE) * BIN_SIZE;
    const max = Math.ceil(maxRaw / BIN_SIZE) * BIN_SIZE;
    const bins = Math.max(Math.ceil((max - min) / BIN_SIZE), 1);
    const counts = new Array(bins).fill(0);

    const hashOffset = (id: string) => {
      let hash = 0;
      for (let i = 0; i < id.length; i += 1) {
        hash = (hash * 31 + id.charCodeAt(i)) % 1000;
      }
      return (hash % 8) - 4;
    };

    const dots = points
      .filter((point) => typeof point.birthYear === 'number')
      .sort((a, b) => (a.birthYear ?? 0) - (b.birthYear ?? 0))
      .map((point) => {
        const year = point.birthYear as number;
        const binIndex = Math.min(
          bins - 1,
          Math.max(0, Math.floor((year - min) / BIN_SIZE))
        );
        const stackIndex = counts[binIndex];
        counts[binIndex] += 1;
        return {
          id: point.id,
          name: point.name,
          region: point.regionSub,
          left: (binIndex + 0.5) / bins,
          stackIndex,
          offset: hashOffset(point.id),
        };
      });

    const maxCount = counts.reduce((acc, value) => Math.max(acc, value), 1);

    return { minYear: min, maxYear: max, yearPoints: dots, maxBinCount: maxCount };
  }, [points]);

  const formatYear = (year: number) => {
    if (year < 0) return `${Math.abs(year)} BCE`;
    return `${year}`;
  };

  return (
    <div className="relative h-full w-full overflow-y-auto">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,248,235,0.9),_rgba(243,236,224,0.9))]" />
      <div className="relative z-10 h-full w-full p-10 pb-12">
        <div className="mb-5 text-sm text-stone-600">
          Distribution of top figures by era
        </div>
        <div className="mb-10 rounded-3xl border border-stone-200/70 bg-white/80 p-7 shadow-sm">
          <div className="text-xs uppercase tracking-[0.3em] text-stone-400">Timeline</div>
          <div className="mt-3 text-sm text-stone-600">
            Birth years for the current selection
          </div>
          <div className="mt-8 relative h-48">
            <div className="absolute left-14 right-8 top-6 bottom-12 rounded-2xl bg-stone-50/60" />
            <div className="absolute left-14 top-6 bottom-12 w-px bg-stone-300/60" />
            <div className="absolute left-14 right-8 bottom-12 h-px bg-stone-300/60" />
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <div
                key={fraction}
                className="absolute left-0 right-4 h-px bg-stone-200/60"
                style={{ top: `${36 + (1 - fraction) * 104}px` }}
              >
                <span className="absolute left-4 -translate-y-1/2 text-[11px] text-stone-400">
                  {Math.round(maxBinCount * fraction)}
                </span>
              </div>
            ))}
            {yearPoints.map((dot) => (
              <span
                key={dot.id}
                title={dot.name}
                className="absolute h-2 w-2 -translate-x-1/2 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.9)] transition-transform duration-200 ease-out hover:scale-125"
                style={{
                  left: `${14 + Math.min(1, Math.max(0, dot.left)) * 86}%`,
                  top: `${Math.max(28, 152 - dot.stackIndex * 6 + dot.offset)}px`,
                  backgroundColor: REGION_COLORS[dot.region || ''] || '#f59e0b',
                }}
              />
            ))}
            <div className="absolute left-14 top-full mt-3 text-xs text-stone-500">
              {formatYear(minYear)}
            </div>
            <div className="absolute right-8 top-full mt-3 text-xs text-stone-500">
              {formatYear(maxYear)}
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ERA_ORDER.map((era) => {
            const count = counts.get(era) || 0;
            const widthPercent = Math.min(100, Math.round((count / maxCount) * 100));
            return (
              <div
                key={era}
                className="rounded-2xl border border-stone-200/70 bg-white/80 p-3 shadow-sm"
              >
                <div className="flex items-center justify-between text-sm font-medium text-stone-800">
                  <span>{era}</span>
                  <span className="text-stone-500">{count}</span>
                </div>
                <div className="mt-1 text-[11px] text-stone-500">{ERA_RANGES[era]}</div>
                <div className="mt-3 h-2 w-full rounded-full bg-stone-200/70">
                  <div
                    className="h-full rounded-full bg-amber-400/70 transition-all duration-500 ease-out"
                    style={{ width: `${widthPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-6 text-xs text-stone-500">
          Counts update with the current model, era, and domain filters.
        </div>
      </div>
    </div>
  );
}

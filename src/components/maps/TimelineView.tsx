'use client';

import { useMemo, useState } from 'react';
import { REGION_COLORS, DOMAIN_COLORS, type MapPoint } from '@/types';

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

type TimelineDot = {
  id: string;
  name: string;
  region: string | null;
  domain: string | null;
  birthYear: number;
  rank: number | null;
  left: number;
  stackIndex: number;
  offset: number;
};

type TimelineViewProps = {
  points: MapPoint[];
};

export function TimelineView({ points }: TimelineViewProps) {
  const [hoveredDot, setHoveredDot] = useState<TimelineDot | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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
    const binCounts = new Array(bins).fill(0);

    const hashOffset = (id: string) => {
      let hash = 0;
      for (let i = 0; i < id.length; i += 1) {
        hash = (hash * 31 + id.charCodeAt(i)) % 1000;
      }
      return (hash % 8) - 4;
    };

    const dots: TimelineDot[] = points
      .filter((point) => typeof point.birthYear === 'number')
      .sort((a, b) => (a.birthYear ?? 0) - (b.birthYear ?? 0))
      .map((point) => {
        const year = point.birthYear as number;
        const binIndex = Math.min(
          bins - 1,
          Math.max(0, Math.floor((year - min) / BIN_SIZE))
        );
        const stackIndex = binCounts[binIndex];
        binCounts[binIndex] += 1;
        return {
          id: point.id,
          name: point.name,
          region: point.regionSub,
          domain: point.domain,
          birthYear: year,
          rank: point.rank,
          left: (binIndex + 0.5) / bins,
          stackIndex,
          offset: hashOffset(point.id),
        };
      });

    const maxBin = binCounts.reduce((acc, value) => Math.max(acc, value), 1);

    return { minYear: min, maxYear: max, yearPoints: dots, maxBinCount: maxBin };
  }, [points]);

  const formatYear = (year: number) => {
    if (year < 0) return `${Math.abs(year)} BCE`;
    return `${year}`;
  };

  const handleDotHover = (dot: TimelineDot, event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const containerRect = event.currentTarget.closest('.timeline-chart')?.getBoundingClientRect();
    if (containerRect) {
      setTooltipPos({
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top,
      });
    }
    setHoveredDot(dot);
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
          <div className="timeline-chart mt-8 relative" style={{ height: `${Math.max(400, maxBinCount * 10 + 80)}px` }}>
            <div className="absolute left-14 right-8 top-6 bottom-12 rounded-2xl bg-stone-50/60" />
            <div className="absolute left-14 top-6 bottom-12 w-px bg-stone-300/60" />
            <div className="absolute left-14 right-8 bottom-12 h-px bg-stone-300/60" />
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
              const chartHeight = Math.max(400, maxBinCount * 10 + 80);
              const topOffset = 24;
              const bottomOffset = 48;
              const availableHeight = chartHeight - topOffset - bottomOffset;
              return (
                <div
                  key={fraction}
                  className="absolute left-0 right-4 h-px bg-stone-200/60"
                  style={{ top: `${topOffset + (1 - fraction) * availableHeight}px` }}
                >
                  <span className="absolute left-4 -translate-y-1/2 text-[11px] text-stone-400">
                    {Math.round(maxBinCount * fraction)}
                  </span>
                </div>
              );
            })}
            {yearPoints.map((dot) => {
              const chartHeight = Math.max(400, maxBinCount * 10 + 80);
              const bottomOffset = 48;
              const dotY = chartHeight - bottomOffset - (dot.stackIndex * 10 + 16) + dot.offset;
              return (
                <span
                  key={dot.id}
                  className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.9)] transition-all duration-200 ease-out hover:scale-150 hover:z-50 cursor-pointer"
                  style={{
                    left: `${14 + Math.min(1, Math.max(0, dot.left)) * 86}%`,
                    top: `${Math.max(20, dotY)}px`,
                    backgroundColor: REGION_COLORS[dot.region || ''] || '#f59e0b',
                  }}
                  onMouseEnter={(e) => handleDotHover(dot, e)}
                  onMouseLeave={() => setHoveredDot(null)}
                />
              );
            })}
            {/* Tooltip */}
            {hoveredDot && (
              <div
                className="absolute z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full"
                style={{
                  left: tooltipPos.x,
                  top: tooltipPos.y - 8,
                }}
              >
                <div className="bg-stone-900/95 text-white rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm min-w-[200px] max-w-[280px]">
                  <div className="font-medium text-sm">{hoveredDot.name}</div>
                  <div className="mt-2 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-stone-400">Born:</span>
                      <span className="text-stone-200">{formatYear(hoveredDot.birthYear)}</span>
                    </div>
                    {hoveredDot.domain && (
                      <div className="flex items-center gap-2">
                        <span className="text-stone-400">Domain:</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{
                            backgroundColor: `${DOMAIN_COLORS[hoveredDot.domain] || '#6b7280'}20`,
                            color: DOMAIN_COLORS[hoveredDot.domain] || '#e5e7eb'
                          }}
                        >
                          {hoveredDot.domain}
                        </span>
                      </div>
                    )}
                    {hoveredDot.region && (
                      <div className="flex items-center gap-2">
                        <span className="text-stone-400">Region:</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{
                            backgroundColor: `${REGION_COLORS[hoveredDot.region] || '#6b7280'}20`,
                            color: REGION_COLORS[hoveredDot.region] || '#e5e7eb'
                          }}
                        >
                          {hoveredDot.region}
                        </span>
                      </div>
                    )}
                    {hoveredDot.rank && (
                      <div className="flex items-center gap-2">
                        <span className="text-stone-400">Avg. Rank:</span>
                        <span className="text-amber-400 font-medium">#{hoveredDot.rank}</span>
                      </div>
                    )}
                  </div>
                  <div
                    className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-stone-900/95"
                  />
                </div>
              </div>
            )}
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

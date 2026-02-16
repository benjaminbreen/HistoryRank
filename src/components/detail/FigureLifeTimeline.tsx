'use client';

import { useMemo, useState } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { formatYearAlways } from '@/lib/utils/figureFormatters';
import type { FigureEvidenceTimelineEvent } from '@/types';

interface FigureLifeTimelineProps {
  birthYear: number | null;
  deathYear: number | null;
  events: FigureEvidenceTimelineEvent[];
}

type EventPoint = {
  id: number;
  label: string;
  description: string | null;
  place: string | null;
  startYear: number | null;
  endYear: number | null;
  dateLabel: string;
  yearForPosition: number;
  x: number;
  influence: number | null;
  visibility: number | null;
  controversy: number | null;
  reputation: number | null;
  contested: number | null;
  scope: number | null;
  confidencePercent: number | null;
};

type AxisMode = 'influence' | 'reputation' | 'contested';

const AXIS_OPTIONS: Array<{ id: AxisMode; label: string; hint: string }> = [
  { id: 'influence', label: 'Influence', hint: 'Estimated historical impact intensity.' },
  { id: 'reputation', label: 'Reputation', hint: 'Public visibility adjusted by controversy.' },
  { id: 'contested', label: 'Contested', hint: 'How visible and disputed an event was.' },
];

function formatEventYears(startYear: number | null, endYear: number | null): string {
  if (startYear === null && endYear === null) return 'Date unknown';
  if (startYear !== null && endYear !== null && startYear !== endYear) {
    return `${formatYearAlways(startYear)} - ${formatYearAlways(endYear)}`;
  }
  return formatYearAlways(startYear ?? endYear);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function formatEventDateLabel(event: FigureEvidenceTimelineEvent): string {
  const metadata = event.metadata as Record<string, unknown>;
  const precision = typeof metadata?.date_precision === 'string' ? metadata.date_precision : null;
  const isEstimated = metadata?.date_is_estimated === true;

  const yearRaw = metadata?.event_year;
  const monthRaw = metadata?.event_month;
  const dayRaw = metadata?.event_day;

  const year =
    typeof yearRaw === 'number' && Number.isFinite(yearRaw)
      ? yearRaw
      : event.eventStartYear ?? event.eventEndYear ?? null;
  const month = typeof monthRaw === 'number' && Number.isFinite(monthRaw) ? monthRaw : null;
  const day = typeof dayRaw === 'number' && Number.isFinite(dayRaw) ? dayRaw : null;

  if (year === null) return formatEventYears(event.eventStartYear, event.eventEndYear);

  let label: string;
  if (precision === 'day' && month !== null && day !== null && month >= 1 && month <= 12) {
    label = `${day} ${MONTH_NAMES[month - 1]} ${formatYearAlways(year)}`;
  } else if (precision === 'month' && month !== null && month >= 1 && month <= 12) {
    label = `${MONTH_NAMES[month - 1]} ${formatYearAlways(year)}`;
  } else {
    label = formatYearAlways(year);
  }

  return isEstimated ? `c. ${label}` : label;
}

function clampPosition(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readMetric(
  event: FigureEvidenceTimelineEvent,
  key: string,
  min: number,
  max: number
): number | null {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>)[key];
  const value = toNumber(raw);
  if (value === null) return null;
  return clampRange(value, min, max);
}

function metricByMode(point: EventPoint, mode: AxisMode): number | null {
  if (mode === 'influence') return point.influence;
  if (mode === 'reputation') return point.reputation;
  return point.contested;
}

export function FigureLifeTimeline({ birthYear, deathYear, events }: FigureLifeTimelineProps) {
  const [axisMode, setAxisMode] = useState<AxisMode>('influence');

  const timeline = useMemo(() => {
    const eventYears = events.flatMap((event) => {
      const years: number[] = [];
      if (event.eventStartYear !== null) years.push(event.eventStartYear);
      if (event.eventEndYear !== null) years.push(event.eventEndYear);
      return years;
    });

    const candidateYears: number[] = [];
    if (birthYear !== null) candidateYears.push(birthYear);
    if (deathYear !== null) candidateYears.push(deathYear);
    candidateYears.push(...eventYears);

    if (candidateYears.length === 0) return null;

    const domainStart = Math.min(...candidateYears);
    let domainEnd = Math.max(...candidateYears);
    if (domainStart === domainEnd) {
      domainEnd = domainStart + 1;
    }

    const domainSpan = domainEnd - domainStart;
    const toX = (year: number) => clampPosition(((year - domainStart) / domainSpan) * 100);

    const lifeStartYear = birthYear ?? domainStart;
    const lifeEndYear = deathYear ?? domainEnd;

    const points: EventPoint[] = events
      .filter((event) => event.eventStartYear !== null || event.eventEndYear !== null)
      .map((event) => {
        const yearForPosition = event.eventStartYear ?? event.eventEndYear ?? lifeStartYear;
        const influence = readMetric(event, 'influence_intensity', 0, 100);
        const visibility = readMetric(event, 'public_visibility', 0, 100);
        const controversy = readMetric(event, 'controversy', 0, 100);
        const scope = readMetric(event, 'geographic_scope', 1, 5);

        const reputation =
          visibility !== null || controversy !== null
            ? clampRange((visibility ?? 0) - 0.6 * (controversy ?? 0), 0, 100)
            : null;
        const contested =
          visibility !== null && controversy !== null ? clampRange((visibility * controversy) / 100, 0, 100) : null;
        const confidenceRaw = event.confidence;
        const confidencePercent =
          typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
            ? clampRange(confidenceRaw <= 1 ? confidenceRaw * 100 : confidenceRaw, 0, 100)
            : null;

        return {
          id: event.id,
          label: event.eventLabel,
          description: event.eventDescription,
          place: event.placeLabel,
          startYear: event.eventStartYear,
          endYear: event.eventEndYear,
          dateLabel: formatEventDateLabel(event),
          yearForPosition,
          x: toX(yearForPosition),
          influence,
          visibility,
          controversy,
          reputation,
          contested,
          scope,
          confidencePercent,
        };
      })
      .sort((a, b) => a.yearForPosition - b.yearForPosition);

    return {
      domainStart,
      domainEnd,
      lifeStartYear,
      lifeEndYear,
      lifeStartX: toX(lifeStartYear),
      lifeEndX: toX(lifeEndYear),
      points,
    };
  }, [birthYear, deathYear, events]);

  if (!timeline) {
    return (
      <div className="rounded-xl border border-stone-200/70 bg-white/95 p-4 text-sm text-stone-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300">
        Timeline data is not available yet.
      </div>
    );
  }

  const axisOption = AXIS_OPTIONS.find((option) => option.id === axisMode) ?? AXIS_OPTIONS[0];
  const lifeWidth = Math.max(0.8, timeline.lifeEndX - timeline.lifeStartX);
  const lifeSpanYears = birthYear !== null && deathYear !== null ? deathYear - birthYear : null;
  const plottedPoints = timeline.points.map((point) => {
    const metric = metricByMode(point, axisMode);
    const age = birthYear !== null ? point.yearForPosition - birthYear : null;
    return {
      ...point,
      metric,
      hasMetric: metric !== null,
      y: metric !== null ? 100 - metric : 50,
      age,
    };
  });
  const pointsWithMetric = plottedPoints.filter((point) => point.hasMetric);
  const trendLinePoints = pointsWithMetric
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
  // Build area fill polygon: trend line points + close along bottom
  const areaFillPoints = pointsWithMetric.length > 0
    ? `${pointsWithMetric.map((p) => `${p.x},${p.y}`).join(' ')} ${pointsWithMetric[pointsWithMetric.length - 1].x},100 ${pointsWithMetric[0].x},100`
    : '';
  const axisTicks = [100, 50, 0];

  // Generate intermediate x-axis labels with overlap prevention
  const xAxisLabels = useMemo(() => {
    const span = timeline.domainEnd - timeline.domainStart;
    if (span <= 0) return [timeline.domainStart];
    // Aim for 4-5 labels
    const step = span <= 20 ? 5 : span <= 50 ? 10 : span <= 200 ? 25 : span <= 500 ? 100 : 250;
    const labels: number[] = [];
    const firstTick = Math.ceil(timeline.domainStart / step) * step;
    for (let y = firstTick; y <= timeline.domainEnd; y += step) {
      labels.push(y);
    }
    // Always include start and end
    if (labels.length === 0 || labels[0] !== timeline.domainStart) labels.unshift(timeline.domainStart);
    if (labels[labels.length - 1] !== timeline.domainEnd) labels.push(timeline.domainEnd);
    // Filter out labels that would overlap (~8% of chart width per label)
    if (labels.length > 2) {
      const minPctGap = 8;
      const filtered: number[] = [labels[0]];
      for (let i = 1; i < labels.length - 1; i++) {
        const pct = ((labels[i] - timeline.domainStart) / span) * 100;
        const prevPct = ((filtered[filtered.length - 1] - timeline.domainStart) / span) * 100;
        const endPct = ((labels[labels.length - 1] - timeline.domainStart) / span) * 100;
        if (pct - prevPct >= minPctGap && endPct - pct >= minPctGap) {
          filtered.push(labels[i]);
        }
      }
      filtered.push(labels[labels.length - 1]);
      return filtered;
    }
    return labels;
  }, [timeline.domainStart, timeline.domainEnd]);

  return (
    <div className="rounded-xl border border-stone-200/75 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/85">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-500 dark:text-slate-400">Life timeline</div>
        <div className="text-[11px] text-stone-500 dark:text-slate-400">
          <span className="font-semibold text-stone-600 dark:text-slate-300">{formatYearAlways(timeline.lifeStartYear)}</span>
          {' to '}
          {deathYear !== null ? (
            <span className="font-semibold text-stone-600 dark:text-slate-300">{formatYearAlways(timeline.lifeEndYear)}</span>
          ) : (
            'Death year unavailable'
          )}
          {lifeSpanYears !== null && (
            <span className="ml-1 text-stone-400 dark:text-slate-500">&middot; {Math.abs(lifeSpanYears)} years</span>
          )}
        </div>
      </div>

      <div className="mb-2.5 inline-flex rounded-full border border-stone-200 bg-stone-50 p-0.5 dark:border-slate-700 dark:bg-slate-800/80">
        {AXIS_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setAxisMode(option.id)}
            className={[
              'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
              axisMode === option.id
                ? 'bg-white text-stone-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                : 'text-stone-600 hover:text-stone-900 dark:text-slate-300 dark:hover:text-slate-100',
            ].join(' ')}
            aria-pressed={axisMode === option.id}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-1.5">
        <div className="relative h-52 text-[10px] text-stone-400 dark:text-slate-500">
          {axisTicks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 tabular-nums"
              style={{ top: `${100 - tick}%` }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="relative h-52 rounded-lg border border-stone-200 bg-stone-50/50 dark:border-slate-700 dark:bg-slate-800/45">
          <div className="absolute inset-x-3 bottom-1.5 flex items-center justify-between text-[9px] tabular-nums text-stone-400 dark:text-slate-500">
            {xAxisLabels.map((year) => {
              const xPct = ((year - timeline.domainStart) / (timeline.domainEnd - timeline.domainStart)) * 100;
              return (
                <span
                  key={year}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${clampPosition(xPct)}%` }}
                >
                  {formatYearAlways(year)}
                </span>
              );
            })}
          </div>

          <div className="absolute inset-x-3 top-2 bottom-6.5">
            {axisTicks.map((tick) => (
              <div
                key={tick}
                className={[
                  'absolute left-0 right-0 border-t',
                  tick === 50
                    ? 'border-dashed border-stone-300/70 dark:border-slate-600/70'
                    : 'border-stone-200/80 dark:border-slate-700/80',
                ].join(' ')}
                style={{ top: `${100 - tick}%` }}
              />
            ))}

            <div
              className="absolute bottom-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-400"
              style={{
                left: `${timeline.lifeStartX}%`,
                width: `${lifeWidth}%`,
              }}
            />

            <div
              className="absolute bottom-0 h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white bg-amber-500 shadow-sm dark:border-slate-900"
              style={{ left: `${timeline.lifeStartX}%` }}
              aria-label="Birth marker"
              title={`Born ${formatYearAlways(birthYear)}`}
            />

            {deathYear !== null && (
              <div
                className="absolute bottom-0 h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white bg-stone-700 shadow-sm dark:border-slate-900 dark:bg-slate-300"
                style={{ left: `${timeline.lifeEndX}%` }}
                aria-label="Death marker"
                title={`Died ${formatYearAlways(deathYear)}`}
              />
            )}

            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="timeline-area-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              {areaFillPoints && (
                <polygon
                  points={areaFillPoints}
                  fill="url(#timeline-area-fill)"
                  className="text-blue-500 dark:text-blue-400"
                />
              )}
              {trendLinePoints.length > 0 && (
                <polyline
                  points={trendLinePoints}
                  fill="none"
                  stroke="currentColor"
                  className="text-blue-500/60 dark:text-blue-400/55"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>

            {plottedPoints.map((point) => (
              <Tooltip
                key={point.id}
                align="center"
                content={
                  <div className="max-w-[240px]">
                    <div className="font-semibold text-stone-900 dark:text-slate-100">{point.label}</div>
                    <div className="mt-0.5 text-[11px] text-stone-500 dark:text-slate-400">
                      {point.dateLabel}
                      {point.age !== null && ` \u00b7 age ${point.age}`}
                      {point.place && ` \u00b7 ${point.place}`}
                    </div>
                    {point.description && (
                      <div className="mt-1.5 text-[11px] leading-relaxed text-stone-600 dark:text-slate-300">{point.description}</div>
                    )}
                    <div className="mt-1.5 text-[10px] tabular-nums text-stone-400 dark:text-slate-500">
                      {axisOption.label}: {point.metric !== null ? Math.round(point.metric) : 'N/A'}
                      {point.scope !== null ? ` \u00b7 Scope ${point.scope}/5` : ''}
                      {point.confidencePercent !== null ? ` \u00b7 ${Math.round(point.confidencePercent)}% conf.` : ''}
                    </div>
                  </div>
                }
              >
                <button
                  type="button"
                  className={[
                    'absolute h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm transition-all duration-150 hover:scale-150 hover:shadow-md focus-visible:scale-150 focus-visible:outline-none focus-visible:ring-4 dark:border-slate-900',
                    point.hasMetric
                      ? 'bg-blue-500 focus-visible:ring-blue-400/30 dark:bg-blue-400'
                      : 'bg-stone-300 focus-visible:ring-stone-300/30 dark:bg-slate-500',
                  ].join(' ')}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  aria-label={`${point.label} (${point.dateLabel})`}
                />
              </Tooltip>
            ))}

            {plottedPoints.map((point) =>
              point.age !== null ? (
                <div
                  key={`age-${point.id}`}
                  className="pointer-events-none absolute -translate-x-1/2 flex flex-col items-center"
                  style={{
                    left: `${point.x}%`,
                    top: point.y < 50 ? `${point.y + 5}%` : undefined,
                    bottom: point.y >= 50 ? `${100 - point.y + 5}%` : undefined,
                  }}
                >
                  {point.y >= 50 && (
                    <span className="rounded-full bg-amber-100/80 px-1.5 py-px text-[9px] font-semibold tabular-nums text-amber-800 ring-1 ring-amber-200/60 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-700/40">
                      {point.age}
                    </span>
                  )}
                  <div className="h-1 w-px bg-stone-300/60 dark:bg-slate-600/60" />
                  {point.y < 50 && (
                    <span className="rounded-full bg-amber-100/80 px-1.5 py-px text-[9px] font-semibold tabular-nums text-amber-800 ring-1 ring-amber-200/60 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-700/40">
                      {point.age}
                    </span>
                  )}
                </div>
              ) : null,
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-stone-400 dark:text-slate-500">
        Y-axis: <span className="text-stone-500 dark:text-slate-400">{axisOption.label}</span>. {axisOption.hint}
        {birthYear !== null && ' Age shown at each event.'}
      </div>
    </div>
  );
}

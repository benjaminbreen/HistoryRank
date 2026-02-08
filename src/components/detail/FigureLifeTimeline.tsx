'use client';

import { useMemo, useState } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
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

function formatYear(year: number | null): string {
  if (year === null) return 'Unknown';
  return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
}

function formatEventYears(startYear: number | null, endYear: number | null): string {
  if (startYear === null && endYear === null) return 'Date unknown';
  if (startYear !== null && endYear !== null && startYear !== endYear) {
    return `${formatYear(startYear)} - ${formatYear(endYear)}`;
  }
  return formatYear(startYear ?? endYear);
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
    label = `${day} ${MONTH_NAMES[month - 1]} ${formatYear(year)}`;
  } else if (precision === 'month' && month !== null && month >= 1 && month <= 12) {
    label = `${MONTH_NAMES[month - 1]} ${formatYear(year)}`;
  } else {
    label = formatYear(year);
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
  const plottedPoints = timeline.points.map((point) => {
    const metric = metricByMode(point, axisMode);
    return {
      ...point,
      metric,
      hasMetric: metric !== null,
      y: metric !== null ? 100 - metric : 50,
    };
  });
  const trendLinePoints = plottedPoints
    .filter((point) => point.hasMetric)
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
  const axisTicks = [100, 50, 0];

  return (
    <div className="rounded-xl border border-stone-200/75 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/85">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-500 dark:text-slate-400">Life timeline</div>
        <div className="text-[11px] text-stone-500 dark:text-slate-400">
          {formatYear(timeline.lifeStartYear)} to {deathYear !== null ? formatYear(timeline.lifeEndYear) : 'Death year unavailable'}
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
        <div className="relative h-48 text-[10px] text-stone-400 dark:text-slate-500">
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

        <div className="relative h-48 rounded-lg border border-stone-200 bg-stone-50/50 dark:border-slate-700 dark:bg-slate-800/45">
          <div className="absolute inset-x-3 bottom-1.5 flex items-center justify-between text-[10px] text-stone-500 dark:text-slate-400">
            <span>{formatYear(timeline.domainStart)}</span>
            <span>{formatYear(timeline.domainEnd)}</span>
          </div>

          <div className="absolute inset-x-3 top-2 bottom-6.5">
            {axisTicks.map((tick) => (
              <div
                key={tick}
                className="absolute left-0 right-0 border-t border-stone-200/80 dark:border-slate-700/80"
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
              title={`Born ${formatYear(birthYear)}`}
            />

            {deathYear !== null && (
              <div
                className="absolute bottom-0 h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white bg-stone-700 shadow-sm dark:border-slate-900 dark:bg-slate-300"
                style={{ left: `${timeline.lifeEndX}%` }}
                aria-label="Death marker"
                title={`Died ${formatYear(deathYear)}`}
              />
            )}

            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {trendLinePoints.length > 0 && (
                <polyline
                  points={trendLinePoints}
                  fill="none"
                  stroke="currentColor"
                  className="text-blue-400/80 dark:text-blue-400/70"
                  strokeWidth="1.15"
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
                  <div>
                    <div className="font-semibold text-stone-900 dark:text-slate-100">{point.label}</div>
                    <div className="mt-0.5 text-stone-600 dark:text-slate-300">
                      {point.dateLabel}
                      {point.place ? ` - ${point.place}` : ''}
                    </div>
                    <div className="mt-1 text-stone-600 dark:text-slate-300">
                      {axisOption.label}: {point.metric !== null ? Math.round(point.metric) : 'N/A'}
                      {point.scope !== null ? ` | Scope ${point.scope}/5` : ''}
                      {point.confidencePercent !== null ? ` | Confidence ${Math.round(point.confidencePercent)}%` : ''}
                    </div>
                    {point.description && (
                      <div className="mt-1.5 text-stone-600 dark:text-slate-300">{point.description}</div>
                    )}
                  </div>
                }
              >
                <button
                  type="button"
                  className={[
                    'absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-sm transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:outline-none focus-visible:ring-2 dark:border-slate-900',
                    point.hasMetric
                      ? 'bg-blue-500 focus-visible:ring-blue-400 dark:bg-blue-400'
                      : 'bg-stone-300 focus-visible:ring-stone-300 dark:bg-slate-500',
                  ].join(' ')}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  aria-label={`${point.label} (${point.dateLabel})`}
                />
              </Tooltip>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-stone-500 dark:text-slate-400">
        Y-axis: {axisOption.label}. {axisOption.hint}
      </div>
    </div>
  );
}

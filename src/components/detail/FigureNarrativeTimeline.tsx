'use client';

import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { FigureLifeTimeline } from './FigureLifeTimeline';
import { FigureTimelineMap } from './FigureTimelineMap';
import type {
  FigureEvidenceTimelineEvent,
  FigureEvidenceAssessment,
  FigureEvidenceSource,
  FigureEvidenceQuote,
  FigureEvidenceSnippet,
} from '@/types';
import { formatEventYears, formatEvidenceYear } from '@/lib/utils/figureFormatters';

interface FigureNarrativeTimelineProps {
  birthYear: number | null;
  deathYear: number | null;
  events: FigureEvidenceTimelineEvent[];
  assessment: FigureEvidenceAssessment | null;
  sources: FigureEvidenceSource[];
  quotes: FigureEvidenceQuote[];
  snippets: FigureEvidenceSnippet[];
  isLoading: boolean;
  error: string | null;
}

function matchQuotesToEvent(
  event: FigureEvidenceTimelineEvent,
  quotes: FigureEvidenceQuote[],
  yearProximity: number = 5,
): FigureEvidenceQuote[] {
  if (!event.eventStartYear) return [];
  return quotes.filter((q) => {
    if (q.quoteYear === null) return false;
    return Math.abs(q.quoteYear - (event.eventStartYear ?? 0)) <= yearProximity;
  });
}

function matchSourcesToEvent(
  event: FigureEvidenceTimelineEvent,
  sources: FigureEvidenceSource[],
): FigureEvidenceSource[] {
  if (!event.sourceIds || event.sourceIds.length === 0) return [];
  const idSet = new Set(event.sourceIds);
  return sources.filter((s) => idSet.has(s.id));
}

export function FigureNarrativeTimeline({
  birthYear,
  deathYear,
  events,
  assessment,
  sources,
  quotes,
  snippets,
  isLoading,
  error,
}: FigureNarrativeTimelineProps) {
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.sortIndex - b.sortIndex),
    [events],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Biographical overview */}
      {assessment?.assessmentText && (
        <div className="rounded-xl border border-stone-200/70 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-stone-500 dark:text-slate-400">
            Biographical overview
          </div>
          <p className="text-sm leading-relaxed text-stone-700 dark:text-slate-200">
            {assessment.assessmentText}
          </p>
        </div>
      )}

      {/* Life timeline chart */}
      <FigureLifeTimeline
        birthYear={birthYear}
        deathYear={deathYear}
        events={events}
      />

      {/* Vertical narrative spine */}
      {sortedEvents.length > 0 ? (
        <div className="relative pl-6 md:pl-12">
          {/* Vertical line */}
          <div className="absolute left-[11px] md:left-[23px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-amber-400 via-stone-300 to-stone-200 dark:from-amber-500 dark:via-slate-600 dark:to-slate-700" />

          <div className="space-y-6">
            {sortedEvents.map((event, idx) => {
              const matchedSources = matchSourcesToEvent(event, sources);
              const matchedQuotes = matchQuotesToEvent(event, quotes);

              return (
                <div key={event.id} className="relative">
                  {/* Circle marker */}
                  <div className="absolute -left-6 md:-left-12 top-1 flex items-center justify-center">
                    <div
                      className={`w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 shadow-sm ${
                        idx === 0
                          ? 'bg-amber-500'
                          : idx === sortedEvents.length - 1
                          ? 'bg-stone-700 dark:bg-slate-300'
                          : 'bg-blue-400 dark:bg-blue-500'
                      }`}
                    />
                  </div>

                  {/* Event card */}
                  <div className="rounded-xl border border-stone-200/70 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-100">
                          {event.eventLabel}
                        </h3>
                        {event.eventDescription && (
                          <p className="mt-1.5 text-sm leading-relaxed text-stone-600 dark:text-slate-300">
                            {event.eventDescription}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-stone-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        {formatEventYears(event.eventStartYear, event.eventEndYear, event.metadata)}
                      </span>
                    </div>

                    {event.placeLabel && (
                      <div className="mt-2 text-xs text-stone-500 dark:text-slate-400 flex items-center gap-1">
                        <span className="text-stone-400 dark:text-slate-500">&#x1F4CD;</span>
                        {event.placeLabel}
                      </div>
                    )}

                    {/* Inline sources */}
                    {matchedSources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-stone-100 dark:border-slate-700 space-y-2">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-stone-400 dark:text-slate-500 font-medium">
                          Primary sources
                        </div>
                        {matchedSources.slice(0, 3).map((source) => (
                          <a
                            key={source.id}
                            href={source.accessUrl || source.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-lg border border-stone-200/60 bg-stone-50/70 px-3 py-2 text-xs transition-colors hover:border-stone-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
                          >
                            <div className="font-medium text-stone-700 dark:text-slate-200 truncate">
                              {source.title}
                            </div>
                            <div className="text-stone-500 dark:text-slate-400 mt-0.5">
                              {[source.author, formatEvidenceYear(source.publicationYear)]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Inline quotes (matched by year proximity) */}
                    {matchedQuotes.length > 0 && (
                      <div className={`mt-3 ${matchedSources.length === 0 ? 'pt-3 border-t border-stone-100 dark:border-slate-700' : ''} space-y-2`}>
                        {matchedQuotes.slice(0, 2).map((quote) => (
                          <blockquote
                            key={quote.id}
                            className="rounded-lg border-l-2 border-amber-300 bg-amber-50/50 px-3 py-2 text-xs italic leading-relaxed text-stone-700 dark:border-amber-500/60 dark:bg-amber-950/20 dark:text-slate-200"
                          >
                            &ldquo;{quote.quoteText}&rdquo;
                            {quote.attributedTo && (
                              <span className="not-italic text-stone-500 dark:text-slate-400 ml-1">
                                — {quote.attributedTo}
                                {quote.quoteYear !== null && `, ${formatEvidenceYear(quote.quoteYear)}`}
                              </span>
                            )}
                          </blockquote>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-stone-200/70 bg-white/90 p-5 text-sm text-stone-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300">
          No timeline events generated yet.
        </div>
      )}

      {/* Event map */}
      <FigureTimelineMap events={events} />
    </div>
  );
}

'use client';

import { ExternalLink, AlertTriangle, HelpCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import type {
  FigureEvidenceSource,
  FigureEvidenceQuote,
  FigureEvidenceSnippet,
} from '@/types';
import { formatCorpusLabel, formatEvidenceYear } from '@/lib/utils/figureFormatters';

interface FigureResearchTabProps {
  sources: FigureEvidenceSource[];
  quotes: FigureEvidenceQuote[];
  snippets: FigureEvidenceSnippet[];
  figureName: string;
  isLoading: boolean;
  error: string | null;
}

export function FigureResearchTab({
  sources,
  quotes,
  snippets,
  figureName,
  isLoading,
  error,
}: FigureResearchTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
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

  if (sources.length === 0 && quotes.length === 0 && snippets.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200/70 bg-white/90 p-5 text-sm text-stone-600 shadow-sm dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300">
        No research evidence has been ingested for this figure yet.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Source Leads */}
      {sources.length > 0 && (
        <div className="rounded-xl border border-stone-200/70 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-stone-500 dark:text-slate-400">
            Source leads
          </div>
          <div className="space-y-2.5">
            {sources.slice(0, 12).map((source) => (
              <a
                key={source.id}
                href={source.accessUrl || source.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-stone-200 bg-stone-50/70 p-3 transition-colors hover:border-stone-300 hover:bg-stone-100/70 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-stone-800 dark:text-slate-100">
                      {source.title}
                    </div>
                    <div className="mt-1 text-xs text-stone-500 dark:text-slate-400">
                      {[source.author, formatEvidenceYear(source.publicationYear)]
                        .filter(Boolean)
                        .join(' · ') || 'Author/date unknown'}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-stone-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">
                      {formatCorpusLabel(source.sourceCorpus)}
                    </span>
                    <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white dark:bg-amber-500 dark:text-stone-900">
                      {source.sourceRole}
                    </span>
                  </div>
                </div>
                {source.snippet && (
                  <p className="mt-2 text-xs leading-relaxed text-stone-600 dark:text-slate-300">
                    {source.snippet}
                  </p>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Quotes */}
      {quotes.length > 0 && (
        <div className="rounded-xl border border-stone-200/70 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-stone-500 dark:text-slate-400">
            Quotes
          </div>
          <div className="space-y-3">
            {quotes.slice(0, 6).map((quote) => (
              <div
                key={quote.id}
                className="rounded-lg border border-stone-200 bg-stone-50/70 p-3 dark:border-slate-700 dark:bg-slate-800"
              >
                <p className="text-sm leading-relaxed text-stone-700 dark:text-slate-200">
                  &ldquo;{quote.quoteText}&rdquo;
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-slate-400">
                  <span>{quote.attributedTo || figureName || 'Unknown attribution'}</span>
                  {quote.quoteYear !== null && <span>&middot; {formatEvidenceYear(quote.quoteYear)}</span>}
                  {(quote.verificationStatus !== 'verified' || quote.warningShort) && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      {quote.warningShort || 'Quote not fully verified'}
                    </span>
                  )}
                  {quote.sourceUrl && (
                    <a
                      href={quote.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400"
                    >
                      Source <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historical Encyclopedia Snippets */}
      {snippets.length > 0 && (
        <div className="rounded-xl border border-stone-200/70 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-stone-500 dark:text-slate-400">
            <span>Historical encyclopedia snippets</span>
            <Tooltip
              content="Auto-extracted from the 1911 Encyclopaedia Britannica and shown as a historical reference point for how this figure was described over a century ago."
              align="left"
            >
              <HelpCircle className="h-3.5 w-3.5 cursor-help text-stone-300 transition-colors hover:text-stone-500 dark:text-slate-600 dark:hover:text-slate-400" />
            </Tooltip>
          </div>
          <div className="space-y-3">
            {snippets.slice(0, 4).map((snippet) => (
              <div
                key={snippet.id}
                className="rounded-xl border border-stone-200 bg-stone-50/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/80"
              >
                <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500 dark:text-slate-400">
                  {formatCorpusLabel(snippet.corpus)}
                  {snippet.editionYear !== null && ` · ${snippet.editionYear}`}
                  {snippet.sourceTitle ? ` · ${snippet.sourceTitle}` : ''}
                </div>
                <blockquote className="rounded-lg border-l-2 border-amber-300 bg-white/75 px-4 py-3 text-base italic leading-relaxed text-stone-800 dark:border-amber-500/60 dark:bg-slate-900/40 dark:text-slate-100">
                  <span className="mr-1 text-lg leading-none text-amber-700/70 dark:text-amber-400/80">&ldquo;</span>
                  {snippet.snippet}
                  <span className="ml-1 text-lg leading-none text-amber-700/70 dark:text-amber-400/80">&rdquo;</span>
                </blockquote>
                {snippet.sourceUrl && (
                  <a
                    href={snippet.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400"
                  >
                    Open source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

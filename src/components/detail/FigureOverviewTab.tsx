'use client';

import { lazy, Suspense } from 'react';
import { ExternalLink, MapPin, HelpCircle, Link2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { VarianceBadge } from '@/components/rankings/VarianceBadge';
import { Tooltip } from '@/components/ui/tooltip';
import { SourceRankingCard } from './SourceRankingCard';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';
import {
  getVarianceLevel,
  SOURCE_LABELS,
  LANGUAGE_NAMES,
  LANGUAGE_FLAGS,
  REGION_COLORS,
} from '@/types';
import type { Figure, WikipediaData, RelatedMediaItem, FigureEvidenceTimelineEvent } from '@/types';
import type { GroupedSourceRanking, AttentionGap } from '@/lib/utils/figureFormatters';
import {
  formatViews,
  getExtractParagraphs,
  formatAlias,
} from '@/lib/utils/figureFormatters';

const BirthplaceGlobe = lazy(() => import('./BirthplaceGlobe').then(m => ({ default: m.BirthplaceGlobe })));
const NgramSparkline = lazy(() => import('./NgramSparkline').then(m => ({ default: m.NgramSparkline })));
const PageviewsSparkline = lazy(() => import('./PageviewsSparkline').then(m => ({ default: m.PageviewsSparkline })));
const FigureTimelineMap = lazy(() => import('./FigureTimelineMap').then(m => ({ default: m.FigureTimelineMap })));

// Official brand colors
const modelColors: Record<string, string> = {
  'claude-sonnet-4.5': '#da7756',
  'claude-opus-4.5': '#da7756',
  'claude-opus-4.6': '#da7756',
  'deepseek-v3.2': '#4D6BFE',
  'gemini-flash-3': '#078EFA',
  'gemini-flash-3-preview': '#078EFA',
  'gemini-pro-3': '#4285F4',
  'gpt-4o': '#10A37F',
  'gpt-5.2-thinking': '#10A37F',
  'gpt-5.3-thinking': '#10A37F',
  'grok-4': '#1a1a1a',
  'grok-4.1-fast': '#1a1a1a',
  'mistral-large-3': '#FF8205',
  'qwen3': '#615EFF',
  'qwen3-235b-a22b': '#615EFF',
};

interface FigureOverviewTabProps {
  figure: Figure;
  wiki: WikipediaData | null;
  wikiLoading: boolean;
  sourceRankings: GroupedSourceRanking[];
  attentionGap: AttentionGap | null;
  llmRank?: number | null;
  relatedMedia: RelatedMediaItem[];
  mediaLoading: boolean;
  aliases: string[];
  includeSidebarContent?: boolean;
  timelineEvents?: FigureEvidenceTimelineEvent[];
}

export function FigureOverviewTab({
  figure,
  wiki,
  wikiLoading,
  sourceRankings,
  attentionGap,
  llmRank,
  relatedMedia,
  mediaLoading,
  aliases,
  includeSidebarContent = false,
  timelineEvents = [],
}: FigureOverviewTabProps) {
  return (
    <div className="space-y-5">
      {/* Related Media (shown in sidebar on desktop, here on mobile with includeSidebarContent) */}
      {includeSidebarContent && (mediaLoading || relatedMedia.length > 0) && (
        <div className="rounded-xl border border-stone-200/70 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-slate-400">Related media</div>
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">
              <Link2 className="h-3 w-3" />
              Media Atlas
            </span>
          </div>
          {mediaLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {relatedMedia.map((media) => (
                <a
                  key={media.id}
                  href={`/media?media=${encodeURIComponent(media.id)}`}
                  className="flex items-center gap-3 rounded-xl border border-stone-200/60 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-left transition-colors hover:border-stone-300 dark:hover:border-slate-600"
                >
                  <MediaThumbnail
                    mediaId={media.id}
                    wikipediaSlug={media.wikipedia_slug}
                    title={media.title}
                    size={44}
                    className="border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-700"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-stone-800 dark:text-slate-200">{media.title}</div>
                    <div className="text-xs text-stone-500 dark:text-slate-400">
                      {media.release_year ?? '—'} · {media.type}
                    </div>
                  </div>
                  <span className="rounded-full border border-stone-200 dark:border-slate-600 bg-stone-50 dark:bg-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-stone-500 dark:text-slate-400">
                    {media.relation}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Wikipedia Extract */}
      {wikiLoading && !wiki?.extract && (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6 mt-3" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
      {(() => {
        // Prefer full MediaWiki extract_paragraphs over short REST extract
        const paragraphs = wiki?.extract_paragraphs && wiki.extract_paragraphs.length > 0
          ? wiki.extract_paragraphs.slice(0, 2)
          : wiki?.extract
            ? getExtractParagraphs(wiki.extract)
            : null;
        if (!paragraphs) return null;
        return (
          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
            {paragraphs.map((paragraph, index) => (
              <p
                key={`${figure.id}-extract-${index}`}
                className={`text-[15px] text-stone-600 dark:text-slate-300 leading-relaxed ${index === 0 ? '' : 'mt-3'}`}
              >
                {paragraph}
              </p>
            ))}
            {figure.wikipediaSlug && (
              <a
                href={`https://en.wikipedia.org/wiki/${figure.wikipediaSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-xs text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors font-medium"
              >
                Read more on Wikipedia <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        );
      })()}

      {/* Event Map — directly below excerpt */}
      {timelineEvents && timelineEvents.length > 0 && timelineEvents.some(e => e.placeLat != null) && (
        <Suspense fallback={
          <div className="w-full h-[250px] rounded-xl bg-stone-100 dark:bg-slate-800 animate-pulse flex items-center justify-center">
            <span className="text-xs text-stone-400 dark:text-slate-500">Loading map...</span>
          </div>
        }>
          <FigureTimelineMap events={timelineEvents} />
        </Suspense>
      )}

      {/* Ngram Chart */}
      {figure.ngramData && (
        <Suspense fallback={
          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
            <Skeleton className="h-[120px] w-full" />
          </div>
        }>
          <NgramSparkline
            data={figure.ngramData}
            percentile={figure.ngramPercentile}
          />
        </Suspense>
      )}

      {/* Key Stats: Wikipedia Views, Source Variance, Attention Gap */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700 text-center">
          <div className="text-xs text-stone-400 dark:text-slate-500 uppercase tracking-wide mb-1">Wikipedia Views</div>
          <div className="text-lg font-semibold text-stone-900 dark:text-slate-100">
            {formatViews(figure.pageviewsGlobal ?? figure.pageviews2025 ?? null)}
          </div>
          <div className="text-[10px] text-stone-400 dark:text-slate-500">2025 (all languages)</div>
        </div>
        {figure.varianceScore !== null && (
          <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
            <div className="text-xs text-stone-400 dark:text-slate-500 uppercase tracking-wide mb-1">Source Variance</div>
            <VarianceBadge
              level={getVarianceLevel(figure.varianceScore)}
              score={figure.varianceScore}
              showScore
            />
          </div>
        )}
        {attentionGap && (
          <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
            <div className="text-xs text-stone-400 dark:text-slate-500 uppercase tracking-wide mb-1">Attention Gap</div>
            <div className={`text-lg font-semibold ${
              attentionGap.direction === 'up'
                ? 'text-emerald-700 dark:text-emerald-400'
                : attentionGap.direction === 'down'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-stone-600 dark:text-slate-400'
            }`}>
              {attentionGap.ratio > 1 ? '\u2191' : attentionGap.ratio < 1 ? '\u2193' : ''}{attentionGap.ratio.toFixed(1)}x
            </div>
            <div className="text-[10px] text-stone-400 dark:text-slate-500 mt-0.5">
              HPI #{figure.hpiRank} vs LLM #{llmRank}
            </div>
          </div>
        )}
      </div>

      {/* Rankings by Source */}
      {sourceRankings.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs uppercase tracking-wide text-stone-400 dark:text-slate-500 font-medium">
              Rankings by Source
            </span>
            {sourceRankings.some(sr => sr.contributions.length > 1) && (
              <span className="text-[10px] text-stone-300 dark:text-slate-600 italic">
                Click cards to see more quotes
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {sourceRankings.map((sr) => (
              <SourceRankingCard
                key={sr.source}
                source={sr.source}
                avgRank={sr.avgRank}
                sampleCount={sr.sampleCount}
                contributions={sr.contributions}
              />
            ))}
          </div>
        </div>
      )}


      {/* Rank Comparison Visual */}
      {figure.hpiRank && sourceRankings.filter(sr => sr.source !== 'pantheon').length > 0 && (() => {
        const hpiRankVal = figure.hpiRank || 1;
        const modelRanks = sourceRankings
          .filter(sr => sr.source !== 'pantheon')
          .map(sr => sr.avgRank);
        const llmAvgRank = Math.round(modelRanks.reduce((a, b) => a + b, 0) / modelRanks.length);
        const allRanks = [hpiRankVal, ...modelRanks];
        const minRank = Math.min(...allRanks);
        const maxRank = Math.max(...allRanks);
        const padding = Math.max(20, Math.ceil((maxRank - minRank) * 0.1));
        const rangeStart = Math.max(1, Math.floor((minRank - padding) / 100) * 100);
        const rangeEnd = Math.ceil((maxRank + padding) / 100) * 100;
        const effectiveEnd = Math.max(rangeEnd, rangeStart + 100);
        const rangeSpan = effectiveEnd - rangeStart;
        const getPosition = (rank: number) => {
          const pos = ((rank - rangeStart) / rangeSpan) * 100;
          return Math.max(2, Math.min(pos, 98));
        };
        const midPoint = Math.round((rangeStart + effectiveEnd) / 2 / 50) * 50;

        return (
          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs uppercase tracking-wide text-stone-400 dark:text-slate-500 font-medium">
                Rank Comparison
              </span>
              <Tooltip
                content="Scale adjusts to show the relevant range. Large markers show HPI (blue) and LLM consensus (amber). Small markers show individual model rankings."
                align="center"
              >
                <HelpCircle className="w-3.5 h-3.5 text-stone-300 dark:text-slate-600 hover:text-stone-500 dark:hover:text-slate-400 cursor-help transition-colors" />
              </Tooltip>
            </div>
            <div className="relative h-10 bg-gradient-to-r from-stone-100 to-stone-50 dark:from-slate-700 dark:to-slate-600 rounded-full overflow-hidden">
              <div className="absolute inset-0 flex justify-between items-center px-3 text-[10px] text-stone-300 dark:text-slate-500">
                <span>{rangeStart === 0 ? 1 : rangeStart}</span>
                <span>{midPoint}</span>
                <span>{effectiveEnd}</span>
              </div>
              {sourceRankings
                .filter(sr => sr.source !== 'pantheon')
                .map((sr) => {
                  const color = modelColors[sr.source] || '#9ca3af';
                  const position = getPosition(sr.avgRank);
                  return (
                    <Tooltip
                      key={sr.source}
                      content={
                        <span>
                          <strong>{SOURCE_LABELS[sr.source] || sr.source}</strong>
                          <br />
                          Rank: #{sr.avgRank}
                          {sr.sampleCount > 1 && ` (avg of ${sr.sampleCount} lists)`}
                        </span>
                      }
                      align="center"
                    >
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full shadow-sm ring-1 ring-white/80 cursor-help opacity-80 hover:opacity-100 hover:scale-125 transition-all z-10"
                        style={{ left: `${position}%`, backgroundColor: color }}
                      />
                    </Tooltip>
                  );
                })}
              <Tooltip
                content={
                  <span>
                    <strong>MIT Pantheon HPI</strong><br />
                    Rank: #{hpiRankVal}<br />
                    <span className="text-stone-400">Academic measure based on Wikipedia metrics</span>
                  </span>
                }
                align="center"
              >
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-blue-500 rounded-full shadow-md ring-2 ring-white cursor-help z-20 hover:scale-110 transition-transform"
                  style={{ left: `${getPosition(hpiRankVal)}%` }}
                />
              </Tooltip>
              <Tooltip
                content={
                  <span>
                    <strong>LLM Average Rank</strong><br />
                    Rank: #{llmAvgRank}<br />
                    <span className="text-stone-400">Average of {modelRanks.length} model rankings</span>
                  </span>
                }
                align="center"
              >
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-amber-500 rounded-full shadow-md ring-2 ring-white cursor-help z-20 hover:scale-110 transition-transform"
                  style={{ left: `${getPosition(llmAvgRank)}%` }}
                />
              </Tooltip>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-3 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                <span className="text-stone-500 dark:text-slate-400">Pantheon</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
                <span className="text-stone-500 dark:text-slate-400">LLM Avg</span>
              </span>
            </div>
          </div>
        );
      })()}

      {/* Geography section on mobile */}
      {includeSidebarContent && figure.birthPlace && (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-stone-400 dark:text-slate-500" />
            <span className="text-xs uppercase tracking-wide text-stone-400 dark:text-slate-500 font-medium">
              Geography
            </span>
          </div>
          <div className="space-y-2 text-sm">
            {figure.birthPlace && (
              <div className="flex justify-between gap-4">
                <span className="text-stone-400 dark:text-slate-500">Birthplace</span>
                <span className="text-stone-700 dark:text-slate-300 text-right">{figure.birthPlace}</span>
              </div>
            )}
            {figure.birthPolity && (
              <div className="flex justify-between gap-4">
                <span className="text-stone-400 dark:text-slate-500">Polity</span>
                <span className="text-stone-700 dark:text-slate-300 text-right">{figure.birthPolity}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {includeSidebarContent && figure.birthLat !== null && figure.birthLon !== null && (
        <Suspense fallback={
          <div className="w-full h-[250px] rounded-xl bg-stone-100 dark:bg-slate-800 animate-pulse flex items-center justify-center">
            <span className="text-xs text-stone-400 dark:text-slate-500">Loading globe...</span>
          </div>
        }>
          <BirthplaceGlobe
            lat={figure.birthLat}
            lon={figure.birthLon}
            placeName={figure.birthPlace || undefined}
          />
        </Suspense>
      )}

      {/* Language Views */}
      {figure.pageviewsByLanguage && Object.keys(figure.pageviewsByLanguage).length > 0 && (() => {
        const langData = figure.pageviewsByLanguage as Record<string, number>;
        const total = Object.values(langData).reduce((sum, v) => sum + v, 0);
        const sortedLangs = Object.entries(langData).sort(([, a], [, b]) => b - a);
        const maxViews = sortedLangs[0]?.[1] || 1;
        return (
          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-stone-400 dark:text-slate-500 font-medium">
                  Wikipedia Views by Language
                </span>
                <Tooltip content="Pageviews from top 10 Wikipedia language editions (Jan 2025 to present)" align="center">
                  <HelpCircle className="w-3.5 h-3.5 text-stone-300 dark:text-slate-600 hover:text-stone-500 dark:hover:text-slate-400 cursor-help transition-colors" />
                </Tooltip>
              </div>
              <span className="text-xs text-stone-500 dark:text-slate-400 font-medium">
                {formatViews(total)} total
              </span>
            </div>
            <div className="space-y-2">
              {sortedLangs.map(([langCode, views]) => {
                const percentage = ((views / total) * 100).toFixed(1);
                const barWidth = (views / maxViews) * 100;
                const flag = LANGUAGE_FLAGS[langCode] || '';
                const langName = LANGUAGE_NAMES[langCode] || langCode.toUpperCase();
                return (
                  <div key={langCode} className="group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 text-stone-600 dark:text-slate-400">
                        <span className="text-sm">{flag}</span>
                        <span className="font-medium">{langName}</span>
                      </span>
                      <span className="text-stone-500 dark:text-slate-400 tabular-nums">
                        {formatViews(views)} <span className="text-stone-400 dark:text-slate-500">({percentage}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-stone-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600 rounded-full transition-all group-hover:from-amber-500 group-hover:to-amber-600"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {sortedLangs[0] && sortedLangs[0][0] !== 'en' && sortedLangs[0][1] > (langData['en'] || 0) * 1.2 && (
              <div className="mt-3 pt-3 border-t border-stone-100 dark:border-slate-700">
                <p className="text-xs text-amber-600 dark:text-amber-500 flex items-center gap-1.5">
                  <span className="text-sm">{LANGUAGE_FLAGS[sortedLangs[0][0]]}</span>
                  <span>
                    Most popular in {LANGUAGE_NAMES[sortedLangs[0][0]] || sortedLangs[0][0]} Wikipedia
                  </span>
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Pageviews Sparkline */}
      {figure.wikipediaSlug && (
        <Suspense fallback={
          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
            <Skeleton className="h-[100px] w-full" />
          </div>
        }>
          <PageviewsSparkline
            wikipediaSlug={figure.wikipediaSlug}
            figureName={figure.canonicalName}
          />
        </Suspense>
      )}
    </div>
  );
}

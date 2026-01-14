'use client';

import { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { VarianceBadge } from '@/components/rankings/VarianceBadge';
import { BadgeDisplay } from '@/components/rankings/BadgeDisplay';
import { getVarianceLevel, SOURCE_LABELS, REGION_COLORS, LANGUAGE_NAMES, LANGUAGE_FLAGS } from '@/types';
import type { BadgeType } from '@/types';
import { X, ExternalLink, TrendingUp, TrendingDown, Minus, MapPin, HelpCircle, ChevronRight, Share2 } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { ShareDialog } from '@/components/share/ShareDialog';
import type { Figure, Ranking, FigureRow } from '@/types';

// Lazy load the heavy globe component
const BirthplaceGlobe = lazy(() => import('./BirthplaceGlobe').then(m => ({ default: m.BirthplaceGlobe })));

// Component for individual source ranking with cycling contributions
interface SourceRankingCardProps {
  source: string;
  avgRank: number;
  sampleCount: number;
  contributions: string[];
  ranks: number[];
}

function SourceRankingCard({ source, avgRank, sampleCount, contributions, ranks }: SourceRankingCardProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left');

  const hasMultiple = contributions.length > 1;

  const cycleNext = useCallback(() => {
    if (!hasMultiple || isAnimating) return;
    setSlideDirection('left');
    setIsAnimating(true);
    setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % contributions.length);
      setIsAnimating(false);
    }, 150);
  }, [contributions.length, hasMultiple, isAnimating]);

  // Reset index when source changes
  useEffect(() => {
    setActiveIndex(0);
  }, [source]);

  const currentContribution = contributions[activeIndex] || null;
  const currentRank = ranks[activeIndex] ?? avgRank;

  return (
    <div
      className={`p-3 rounded-lg bg-white shadow-sm ring-1 ring-stone-900/5 ${
        hasMultiple ? 'cursor-pointer hover:ring-stone-300 transition-all' : ''
      }`}
      onClick={hasMultiple ? cycleNext : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-stone-700">
          {SOURCE_LABELS[source] || source}
        </span>
        <div className="text-right">
          <span className="font-mono text-stone-900 font-medium">
            #{avgRank}
          </span>
          {sampleCount > 1 && (
            <span className="text-[10px] text-stone-400 ml-1">
              avg of {sampleCount}
            </span>
          )}
        </div>
      </div>

      {/* Contribution text with slide animation */}
      {currentContribution && (
        <div className="relative overflow-hidden mt-2">
          <p
            className={`text-xs text-stone-500 leading-relaxed transition-all duration-150 ease-out ${
              isAnimating
                ? 'opacity-0 translate-x-4'
                : 'opacity-100 translate-x-0'
            }`}
          >
            {currentContribution}
          </p>
        </div>
      )}

      {/* Navigation dots and indicator */}
      {hasMultiple && (
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-stone-100">
          <div className="flex items-center gap-1.5">
            {contributions.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  if (idx !== activeIndex && !isAnimating) {
                    setSlideDirection(idx > activeIndex ? 'left' : 'right');
                    setIsAnimating(true);
                    setTimeout(() => {
                      setActiveIndex(idx);
                      setIsAnimating(false);
                    }, 150);
                  }
                }}
                className={`transition-all ${
                  idx === activeIndex
                    ? 'w-4 h-1.5 bg-stone-400 rounded-full'
                    : 'w-1.5 h-1.5 bg-stone-200 rounded-full hover:bg-stone-300'
                }`}
                aria-label={`View quote ${idx + 1}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-stone-400">
            <span className="tabular-nums">{activeIndex + 1}/{contributions.length}</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>
      )}
    </div>
  );
}

// Simple client-side cache for Wikipedia data
const wikiCache = new Map<string, WikipediaData>();

interface WikipediaData {
  thumbnail: {
    source: string;
    width: number;
    height: number;
  } | null;
  extract: string | null;
  title: string | null;
}


interface FigureDetailPanelProps {
  figure: Figure | null;
  previewRow?: FigureRow | null;
  rankings: Ranking[];
  aliases?: string[];
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
  llmRank?: number | null;
}

export function FigureDetailPanel({
  figure,
  previewRow,
  rankings,
  aliases,
  isOpen,
  onClose,
  isLoading,
  llmRank,
}: FigureDetailPanelProps) {
  const [wikiData, setWikiData] = useState<WikipediaData | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [localThumbExt, setLocalThumbExt] = useState<number>(0); // 0=jpg, 1=png, 2=webp, 3=failed
  const [localThumbFailed, setLocalThumbFailed] = useState(false);
  const [shareOrigin, setShareOrigin] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  // Use previewRow or figure for display data
  const displayData = figure || previewRow;
  const figureId = figure?.id || previewRow?.id;
  const wikiSlug = figure?.wikipediaSlug || previewRow?.wikipediaSlug;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareOrigin(window.location.origin);
    }
  }, []);

  // Reset local thumb state when figure changes
  useEffect(() => {
    setLocalThumbExt(0);
    setLocalThumbFailed(false);
  }, [figureId]);

  // Get local thumbnail URL based on current extension attempt
  const localThumbExts = ['jpg', 'png', 'webp'];
  const localThumbUrl = figureId && !localThumbFailed
    ? `/thumbnails/${figureId}.${localThumbExts[localThumbExt]}`
    : null;

  // Fetch Wikipedia data (for extract, and as fallback for thumbnail)
  useEffect(() => {
    if (!wikiSlug) {
      setWikiData(null);
      return;
    }

    // Check cache first
    if (wikiCache.has(wikiSlug)) {
      setWikiData(wikiCache.get(wikiSlug)!);
      return;
    }

    const fetchWikiData = async () => {
      setWikiLoading(true);
      try {
        const res = await fetch(`/api/wikipedia/${encodeURIComponent(wikiSlug)}`);
        const data = await res.json();
        wikiCache.set(wikiSlug, data); // Cache it
        setWikiData(data);
      } catch (error) {
        console.error('Failed to fetch Wikipedia data:', error);
        setWikiData(null);
      } finally {
        setWikiLoading(false);
      }
    };

    fetchWikiData();
  }, [wikiSlug]);

  const shareUrl = useMemo(() => {
    if (!figureId || !shareOrigin) return '';
    return `${shareOrigin}/figure/${figureId}`;
  }, [figureId, shareOrigin]);

  // Group rankings by source
  const rankingsBySource = rankings.reduce((acc, r) => {
    if (!acc[r.source]) {
      acc[r.source] = { ranks: [], contributions: [] };
    }
    acc[r.source].ranks.push(r.rank);
    if (r.contribution) {
      acc[r.source].contributions.push(r.contribution);
    }
    return acc;
  }, {} as Record<string, { ranks: number[]; contributions: string[] }>);

  const sourceRankings = Object.entries(rankingsBySource)
    .map(([source, data]) => ({
      source,
      avgRank: Math.round(data.ranks.reduce((a, b) => a + b, 0) / data.ranks.length),
      sampleCount: data.ranks.length,
      contributions: data.contributions,
      ranks: data.ranks,
    }))
    .sort((a, b) => a.avgRank - b.avgRank);

  const formatYear = (year: number | null) => {
    if (year === null) return null;
    return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
  };

  const formatViews = (n: number | null) => {
    if (n === null) return '—';
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
    return n.toLocaleString();
  };

  const formatAlias = (alias: string) => {
    const lowerWords = new Set(['of', 'the', 'and', 'al', 'ibn', 'von', 'de', 'da', 'di']);
    const roman = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']);
    return alias
      .split(' ')
      .map((word) => {
        if (roman.has(word)) return word.toUpperCase();
        if (word === 'st') return 'St.';
        if (lowerWords.has(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  };

  // Calculate attention gap (ratio of HPI rank to LLM rank)
  const getAttentionGap = () => {
    const hpiRank = figure?.hpiRank || previewRow?.hpiRank;
    if (!hpiRank || !llmRank) return null;
    const ratio = hpiRank / llmRank;
    return {
      ratio,
      direction: ratio > 1.15 ? 'up' : ratio < 0.85 ? 'down' : 'neutral',
      label: ratio > 1.15
        ? 'AI ranks higher than academics'
        : ratio < 0.85
        ? 'Academics rank higher than AI'
        : 'Similar rankings across sources'
    };
  };

  const attentionGap = getAttentionGap();

  // Get first few sentences of extract for summary
  const getExtractSummary = (text: string | null, maxLength: number = 350) => {
    if (!text) return null;
    // Get first 2-3 sentences or up to maxLength chars
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    if (!sentences) return text.slice(0, maxLength) + '...';

    let result = '';
    for (const sentence of sentences) {
      if (result.length + sentence.length > maxLength) break;
      result += sentence;
    }
    return result || sentences[0];
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-[#faf9f7] dark:bg-slate-900 border-l border-stone-200 dark:border-amber-900/30 p-0">
        {/* Accessibility: visually hidden title and description */}
        <SheetTitle className="sr-only">
          {displayData ? `${figure?.canonicalName || previewRow?.name} - Figure Details` : 'Figure Details'}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Detailed information about this historical figure including rankings, biography, and geographic data.
        </SheetDescription>

        {/* Show content immediately if we have any data (previewRow or figure) */}
        {displayData ? (
          <div className="flex flex-col min-h-full">
            {/* Close button */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
              <button
                onClick={() => setShareOpen(true)}
                className="p-2 rounded-full hover:bg-stone-200/50 dark:hover:bg-slate-700/50 transition-colors"
                aria-label="Share figure"
              >
                <Share2 className="w-4 h-4 text-stone-500 dark:text-slate-400" />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-stone-200/50 dark:hover:bg-slate-700/50 transition-colors"
                aria-label="Close panel"
              >
                <X className="w-5 h-5 text-stone-500 dark:text-slate-400" />
              </button>
            </div>

            {/* Header Section */}
            <div className="p-6 pb-5 bg-gradient-to-b from-white to-[#faf9f7] dark:from-slate-800 dark:to-slate-900 border-b border-stone-200/60 dark:border-amber-900/30">
              <div className="flex gap-5">
                {/* Portrait - local thumbnail first (instant), then Wikipedia fallback */}
                <div className="flex-shrink-0">
                  {localThumbUrl && !localThumbFailed ? (
                    <div className="relative">
                      <img
                        src={localThumbUrl}
                        alt={figure?.canonicalName || previewRow?.name || ''}
                        className="w-32 h-40 object-cover rounded-lg shadow-lg ring-1 ring-stone-200/50"
                        onError={() => {
                          if (localThumbExt < 2) {
                            setLocalThumbExt(localThumbExt + 1);
                          } else {
                            setLocalThumbFailed(true);
                          }
                        }}
                      />
                    </div>
                  ) : wikiData?.thumbnail ? (
                    <div className="relative">
                      <img
                        src={wikiData.thumbnail.source}
                        alt={figure?.canonicalName || previewRow?.name || ''}
                        className="w-32 h-40 object-cover rounded-lg shadow-lg ring-1 ring-stone-200/50"
                      />
                    </div>
                  ) : wikiLoading ? (
                    <div className="w-32 h-40 rounded-lg bg-stone-100 dark:bg-slate-700 animate-pulse" />
                  ) : (
                    <div className="w-32 h-40 rounded-lg bg-gradient-to-br from-stone-100 to-stone-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center shadow-inner">
                      <span className="text-4xl font-serif text-stone-400 dark:text-slate-500">
                        {(figure?.canonicalName || previewRow?.name || '?').charAt(0)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Name and metadata */}
                <div className="flex-1 min-w-0 pt-1">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-stone-400 dark:text-amber-600 font-medium mb-1">
                    Figure Details
                  </div>
                  <h2 className="font-serif text-3xl font-semibold text-stone-900 dark:text-amber-100 leading-tight mb-2">
                    {figure?.canonicalName || previewRow?.name}
                  </h2>
                  {previewRow?.badges && previewRow.badges.length > 0 && (
                    <div className="mb-3">
                      <BadgeDisplay badges={previewRow.badges} maxVisible={4} />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-stone-600 dark:text-slate-400">
                    {figure?.occupation && (
                      <>
                        <span className="font-medium">{figure.occupation}</span>
                        <span className="text-stone-300 dark:text-slate-600">/</span>
                      </>
                    )}
                    {formatYear(displayData?.birthYear ?? null) && (
                      <>
                        <span>
                          {formatYear(displayData?.birthYear ?? null)}
                          {figure?.deathYear && `–${formatYear(figure.deathYear)}`}
                        </span>
                        {displayData?.regionSub && <span className="text-stone-300 dark:text-stone-600">/</span>}
                      </>
                    )}
                    {displayData?.regionSub && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: REGION_COLORS[displayData.regionSub] || '#9ca3af' }}
                      >
                        {displayData.regionSub}
                      </span>
                    )}
                    {aliases && aliases.length > 0 && (
                      <span className="text-xs text-stone-500 dark:text-slate-500">
                        Also known as: {aliases.slice(0, 4).map(formatAlias).join(', ')}
                        {aliases.length > 4 ? ` +${aliases.length - 4}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Loading indicator for full data */}
            {!figure && previewRow && (
              <div className="mx-6 mt-2 mb-0 p-2 rounded-lg bg-amber-50/80 border border-amber-200/50">
                <div className="flex items-center gap-2 text-xs text-amber-700">
                  <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  Loading full details...
                </div>
              </div>
            )}

            {/* Content */}
            <div className="p-6 space-y-5 flex-1">
              {/* Attention Gap - Featured Metric */}
              {attentionGap && (
                <div className="p-4 rounded-xl bg-white shadow-sm ring-1 ring-stone-900/5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {attentionGap.direction === 'up' ? (
                          <TrendingUp className="w-5 h-5 text-emerald-600" />
                        ) : attentionGap.direction === 'down' ? (
                          <TrendingDown className="w-5 h-5 text-amber-600" />
                        ) : (
                          <Minus className="w-5 h-5 text-stone-400" />
                        )}
                        <span className="text-xs uppercase tracking-wide text-stone-500 font-medium">
                          Attention Gap
                        </span>
                      </div>
                      <div className={`text-3xl font-semibold tracking-tight ${
                        attentionGap.direction === 'up'
                          ? 'text-emerald-700'
                          : attentionGap.direction === 'down'
                          ? 'text-amber-700'
                          : 'text-stone-600'
                      }`}>
                        {attentionGap.ratio > 1 ? '↑' : attentionGap.ratio < 1 ? '↓' : ''}
                        {' '}{attentionGap.ratio.toFixed(1)}x
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-stone-400 mb-0.5">Pantheon</div>
                      <div className="font-mono text-sm text-stone-600">#{figure?.hpiRank || previewRow?.hpiRank}</div>
                      <div className="text-xs text-stone-400 mt-2 mb-0.5">LLM</div>
                      <div className="font-mono text-sm text-stone-900 font-medium">#{llmRank}</div>
                    </div>
                  </div>
                  <p className="text-xs text-stone-500 mt-3 leading-relaxed">
                    {attentionGap.label}
                  </p>
                </div>
              )}

              {/* Wikipedia Extract */}
              {wikiData?.extract && (
                <div className="p-4 rounded-xl bg-white shadow-sm ring-1 ring-stone-900/5">
                  <p className="text-sm text-stone-600 leading-relaxed">
                    {getExtractSummary(wikiData.extract)}
                  </p>
                  {wikiSlug && (
                    <a
                      href={`https://en.wikipedia.org/wiki/${wikiSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-3 text-xs text-amber-600 hover:text-amber-700 transition-colors font-medium"
                    >
                      Read more on Wikipedia <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {/* Key Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-white shadow-sm ring-1 ring-stone-900/5">
                  <div className="text-xs text-stone-400 uppercase tracking-wide mb-1">Views</div>
                  <div className="text-lg font-semibold text-stone-900">
                    {formatViews(figure?.pageviewsGlobal ?? figure?.pageviews2025 ?? previewRow?.pageviews ?? null)}
                  </div>
                  <div className="text-[10px] text-stone-400">2025 (all languages)</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-white shadow-sm ring-1 ring-stone-900/5">
                  <div className="text-xs text-stone-400 uppercase tracking-wide mb-1">Era</div>
                  <div className="text-sm font-medium text-stone-700 mt-1">
                    {displayData?.era || '—'}
                  </div>
                </div>
                <div className="text-center p-3 rounded-lg bg-white shadow-sm ring-1 ring-stone-900/5">
                  <div className="text-xs text-stone-400 uppercase tracking-wide mb-1">Region</div>
                  <div className="text-sm font-medium text-stone-700 mt-1 truncate" title={displayData?.regionSub || undefined}>
                    {displayData?.regionSub || '—'}
                  </div>
                </div>
              </div>

              {/* Variance Badge */}
              {(figure?.varianceScore !== null || previewRow?.varianceScore !== null) && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-white shadow-sm ring-1 ring-stone-900/5">
                  <div>
                    <div className="text-xs text-stone-400 uppercase tracking-wide mb-0.5">Source Variance</div>
                    <p className="text-xs text-stone-500">How much sources disagree</p>
                  </div>
                  <VarianceBadge
                    level={getVarianceLevel(figure?.varianceScore ?? previewRow?.varianceScore ?? null)}
                    score={figure?.varianceScore ?? previewRow?.varianceScore ?? null}
                    showScore
                  />
                </div>
              )}

              {/* Geography Section - only shown when full figure data is loaded */}
              {figure && (figure.birthPlace || figure.birthPolity || figure.birthLat !== null) && (
                <div className="p-4 rounded-xl bg-white shadow-sm ring-1 ring-stone-900/5">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-stone-400" />
                    <span className="text-xs uppercase tracking-wide text-stone-400 font-medium">
                      Geography
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    {figure.birthPlace && (
                      <div className="flex justify-between gap-4">
                        <span className="text-stone-400">Birthplace</span>
                        <span className="text-stone-700 text-right">{figure.birthPlace}</span>
                      </div>
                    )}
                    {figure.birthPolity && (
                      <div className="flex justify-between gap-4">
                        <span className="text-stone-400">Polity</span>
                        <span className="text-stone-700 text-right">{figure.birthPolity}</span>
                      </div>
                    )}
                    {figure.regionSub && (
                      <div className="flex justify-between gap-4">
                        <span className="text-stone-400">Region</span>
                        <span className="text-stone-700 text-right">{figure.regionSub}</span>
                      </div>
                    )}
                    {figure.birthLat !== null && figure.birthLon !== null && (
                      <div className="flex justify-between gap-4">
                        <span className="text-stone-400">Coordinates</span>
                        <span className="text-stone-700 font-mono text-xs">
                          {Math.abs(figure.birthLat).toFixed(2)}° {figure.birthLat >= 0 ? 'N' : 'S'},{' '}
                          {Math.abs(figure.birthLon!).toFixed(2)}° {figure.birthLon! >= 0 ? 'E' : 'W'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Rankings by Source */}
              {sourceRankings.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs uppercase tracking-wide text-stone-400 font-medium">
                      Rankings by Source
                    </span>
                    {sourceRankings.some(sr => sr.contributions.length > 1) && (
                      <span className="text-[10px] text-stone-300 italic">
                        Click cards to see more quotes
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {sourceRankings.map((sr) => (
                      <SourceRankingCard
                        key={sr.source}
                        source={sr.source}
                        avgRank={sr.avgRank}
                        sampleCount={sr.sampleCount}
                        contributions={sr.contributions}
                        ranks={sr.ranks}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Rank Comparison Visual */}
              {(figure?.hpiRank || previewRow?.hpiRank) && sourceRankings.filter(sr => sr.source !== 'pantheon').length > 0 && (() => {
                // Collect all ranks to determine dynamic scale
                const hpiRankVal = figure?.hpiRank || previewRow?.hpiRank || 1;
                const modelRanks = sourceRankings
                  .filter(sr => sr.source !== 'pantheon')
                  .map(sr => sr.avgRank);

                // Calculate actual average of model ranks (not the position-based llmRank)
                const llmAvgRank = Math.round(modelRanks.reduce((a, b) => a + b, 0) / modelRanks.length);

                const allRanks = [hpiRankVal, ...modelRanks];

                const minRank = Math.min(...allRanks);
                const maxRank = Math.max(...allRanks);

                // Calculate nice boundaries in increments of 100
                // Add padding so markers aren't right at the edges
                const padding = Math.max(20, Math.ceil((maxRank - minRank) * 0.1));
                const rangeStart = Math.max(1, Math.floor((minRank - padding) / 100) * 100);
                const rangeEnd = Math.ceil((maxRank + padding) / 100) * 100;

                // Ensure minimum range of 100
                const effectiveEnd = Math.max(rangeEnd, rangeStart + 100);
                const rangeSpan = effectiveEnd - rangeStart;

                // Calculate position as percentage within the dynamic range
                const getPosition = (rank: number) => {
                  const pos = ((rank - rangeStart) / rangeSpan) * 100;
                  return Math.max(2, Math.min(pos, 98)); // Keep 2% padding on edges
                };

                // Generate scale markers (start, middle, end)
                const midPoint = Math.round((rangeStart + effectiveEnd) / 2 / 50) * 50; // Round to nearest 50

                const modelColors: Record<string, string> = {
                  'claude-sonnet-4.5': '#a855f7',  // purple
                  'claude-opus-4.5': '#7c3aed',    // violet
                  'gemini-flash-3': '#14b8a6',     // teal
                  'gemini-pro-3': '#0d9488',       // darker teal
                  'gpt-4o': '#22c55e',             // green
                };

                return (
                  <div className="p-4 rounded-xl bg-white shadow-sm ring-1 ring-stone-900/5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs uppercase tracking-wide text-stone-400 font-medium">
                        Rank Comparison
                      </span>
                      <Tooltip
                        content="Scale adjusts to show the relevant range. Large markers show HPI (blue) and LLM consensus (amber). Small markers show individual model rankings."
                        align="center"
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-stone-300 hover:text-stone-500 cursor-help transition-colors" />
                      </Tooltip>
                    </div>
                    <div className="relative h-10 bg-gradient-to-r from-stone-100 to-stone-50 rounded-full overflow-hidden">
                      {/* Scale markers */}
                      <div className="absolute inset-0 flex justify-between items-center px-3 text-[10px] text-stone-300">
                        <span>{rangeStart === 0 ? 1 : rangeStart}</span>
                        <span>{midPoint}</span>
                        <span>{effectiveEnd}</span>
                      </div>

                      {/* Individual model markers (smaller, semi-transparent) */}
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
                                style={{
                                  left: `${position}%`,
                                  backgroundColor: color,
                                }}
                              />
                            </Tooltip>
                          );
                        })}

                      {/* HPI marker (larger, prominent) */}
                      <Tooltip
                        content={
                          <span>
                            <strong>MIT Pantheon HPI</strong>
                            <br />
                            Rank: #{hpiRankVal}
                            <br />
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

                      {/* LLM consensus marker (larger, prominent) */}
                      <Tooltip
                        content={
                          <span>
                            <strong>LLM Average Rank</strong>
                            <br />
                            Rank: #{llmAvgRank}
                            <br />
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

                    {/* Legend */}
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-3 text-[10px]">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                        <span className="text-stone-500">Pantheon</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
                        <span className="text-stone-500">LLM Avg</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
                        <span className="text-stone-400">Claude</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-teal-500 rounded-full" />
                        <span className="text-stone-400">Gemini</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                        <span className="text-stone-400">GPT</span>
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Birthplace Globe - only shown when full figure data is loaded */}
              {figure && figure.birthLat !== null && figure.birthLon !== null && (
                <div className="pt-2">
                  <Suspense fallback={
                    <div className="w-full h-[250px] rounded-xl bg-stone-100 animate-pulse flex items-center justify-center">
                      <span className="text-xs text-stone-400">Loading globe...</span>
                    </div>
                  }>
                    <BirthplaceGlobe
                      lat={figure.birthLat}
                      lon={figure.birthLon}
                      placeName={figure.birthPlace || undefined}
                    />
                  </Suspense>
                </div>
              )}

              {/* Wikipedia Pageviews by Language - only shown when data is available */}
              {figure?.pageviewsByLanguage && Object.keys(figure.pageviewsByLanguage).length > 0 && (() => {
                const langData = figure.pageviewsByLanguage as Record<string, number>;
                const total = Object.values(langData).reduce((sum, v) => sum + v, 0);
                const sortedLangs = Object.entries(langData)
                  .sort(([, a], [, b]) => b - a);
                const maxViews = sortedLangs[0]?.[1] || 1;

                return (
                  <div className="p-4 rounded-xl bg-white shadow-sm ring-1 ring-stone-900/5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-stone-400 font-medium">
                          Wikipedia Views by Language
                        </span>
                        <Tooltip
                          content="Pageviews from top 10 Wikipedia language editions (Jan 2025 to present)"
                          align="center"
                        >
                          <HelpCircle className="w-3.5 h-3.5 text-stone-300 hover:text-stone-500 cursor-help transition-colors" />
                        </Tooltip>
                      </div>
                      <span className="text-xs text-stone-500 font-medium">
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
                              <span className="flex items-center gap-1.5 text-stone-600">
                                <span className="text-sm">{flag}</span>
                                <span className="font-medium">{langName}</span>
                              </span>
                              <span className="text-stone-500 tabular-nums">
                                {formatViews(views)} <span className="text-stone-400">({percentage}%)</span>
                              </span>
                            </div>
                            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all group-hover:from-amber-500 group-hover:to-amber-600"
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Notable insight if non-English language dominates */}
                    {sortedLangs[0] && sortedLangs[0][0] !== 'en' && sortedLangs[0][1] > (langData['en'] || 0) * 1.2 && (
                      <div className="mt-3 pt-3 border-t border-stone-100">
                        <p className="text-xs text-amber-600 flex items-center gap-1.5">
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
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-stone-400 text-sm">Select a figure to view details</p>
          </div>
        )}
      </SheetContent>
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={shareUrl}
        title={figure?.canonicalName || previewRow?.name || 'HistoryRank figure'}
      />
    </Sheet>
  );
}

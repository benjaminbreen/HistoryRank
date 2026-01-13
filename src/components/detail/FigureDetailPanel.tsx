'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { VarianceBadge } from '@/components/rankings/VarianceBadge';
import { getVarianceLevel, SOURCE_LABELS, REGION_COLORS } from '@/types';
import { X, ExternalLink, TrendingUp, TrendingDown, Minus, MapPin } from 'lucide-react';
import type { Figure, Ranking, FigureRow } from '@/types';

// Lazy load the heavy globe component
const BirthplaceGlobe = lazy(() => import('./BirthplaceGlobe').then(m => ({ default: m.BirthplaceGlobe })));

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
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
  llmRank?: number | null;
}

export function FigureDetailPanel({
  figure,
  previewRow,
  rankings,
  isOpen,
  onClose,
  isLoading,
  llmRank,
}: FigureDetailPanelProps) {
  const [wikiData, setWikiData] = useState<WikipediaData | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [localThumbExt, setLocalThumbExt] = useState<number>(0); // 0=jpg, 1=png, 2=webp, 3=failed
  const [localThumbFailed, setLocalThumbFailed] = useState(false);

  // Use previewRow or figure for display data
  const displayData = figure || previewRow;
  const figureId = figure?.id || previewRow?.id;
  const wikiSlug = figure?.wikipediaSlug || previewRow?.wikipediaSlug;

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
      contribution: data.contributions[0] || null,
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
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-stone-200/50 dark:hover:bg-slate-700/50 transition-colors"
              aria-label="Close panel"
            >
              <X className="w-5 h-5 text-stone-500 dark:text-slate-400" />
            </button>

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
                  <h2 className="font-serif text-3xl font-semibold text-stone-900 dark:text-amber-100 leading-tight mb-3">
                    {figure?.canonicalName || previewRow?.name}
                  </h2>
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
                    {formatViews(figure?.pageviews2025 ?? previewRow?.pageviews ?? null)}
                  </div>
                  <div className="text-[10px] text-stone-400">2025</div>
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
                  <div className="text-xs uppercase tracking-wide text-stone-400 font-medium mb-3">
                    Rankings by Source
                  </div>
                  <div className="space-y-2">
                    {sourceRankings.map(({ source, avgRank, sampleCount, contribution }) => (
                      <div
                        key={source}
                        className="p-3 rounded-lg bg-white shadow-sm ring-1 ring-stone-900/5"
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
                        {contribution && (
                          <p className="text-xs text-stone-500 mt-2 leading-relaxed line-clamp-2">
                            {contribution}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rank Comparison Visual */}
              {(figure?.hpiRank || previewRow?.hpiRank) && llmRank && (
                <div className="p-4 rounded-xl bg-white shadow-sm ring-1 ring-stone-900/5">
                  <div className="text-xs uppercase tracking-wide text-stone-400 font-medium mb-3">
                    Rank Comparison
                  </div>
                  <div className="relative h-8 bg-gradient-to-r from-stone-100 to-stone-50 rounded-full overflow-hidden">
                    {/* Scale markers */}
                    <div className="absolute inset-0 flex justify-between items-center px-3 text-[10px] text-stone-300">
                      <span>1</span>
                      <span>250</span>
                      <span>500</span>
                    </div>
                    {/* HPI marker */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full shadow-md ring-2 ring-white"
                      style={{ left: `${Math.min(((figure?.hpiRank || previewRow?.hpiRank || 1) / 535) * 100, 98)}%` }}
                      title={`Pantheon: #${figure?.hpiRank || previewRow?.hpiRank}`}
                    />
                    {/* LLM marker */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-amber-500 rounded-full shadow-md ring-2 ring-white"
                      style={{ left: `${Math.min((llmRank / 535) * 100, 98)}%` }}
                      title={`LLM: #${llmRank}`}
                    />
                  </div>
                  <div className="flex justify-center gap-6 mt-3 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                      <span className="text-stone-500">Pantheon</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
                      <span className="text-stone-500">LLM</span>
                    </span>
                  </div>
                </div>
              )}

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
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-stone-400 text-sm">Select a figure to view details</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

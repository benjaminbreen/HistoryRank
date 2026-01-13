'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { VarianceBadge } from '@/components/rankings/VarianceBadge';
import { getVarianceLevel, SOURCE_LABELS } from '@/types';
import type { Figure, Ranking } from '@/types';

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
  rankings: Ranking[];
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
  llmRank?: number | null; // Position 1-535 based on LLM consensus
}

export function FigureDetailPanel({
  figure,
  rankings,
  isOpen,
  onClose,
  isLoading,
  llmRank,
}: FigureDetailPanelProps) {
  const [wikiData, setWikiData] = useState<WikipediaData | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);

  // Fetch Wikipedia data when figure changes
  useEffect(() => {
    if (!figure?.wikipediaSlug) {
      setWikiData(null);
      return;
    }

    const fetchWikiData = async () => {
      setWikiLoading(true);
      try {
        const res = await fetch(`/api/wikipedia/${encodeURIComponent(figure.wikipediaSlug!)}`);
        const data = await res.json();
        setWikiData(data);
      } catch (error) {
        console.error('Failed to fetch Wikipedia data:', error);
        setWikiData(null);
      } finally {
        setWikiLoading(false);
      }
    };

    fetchWikiData();
  }, [figure?.wikipediaSlug]);
  // Group rankings by source and average samples
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
    return n.toLocaleString();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-stone-50">
        {isLoading ? (
          <div className="space-y-4 pt-6">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : figure ? (
          <>
            <SheetHeader className="pb-4 border-b border-stone-200">
              <SheetTitle className="text-2xl font-serif text-stone-900">
                {figure.canonicalName}
              </SheetTitle>
              <div className="flex flex-wrap gap-2 text-sm text-stone-600">
                {formatYear(figure.birthYear) && (
                  <span>
                    {formatYear(figure.birthYear)}
                    {figure.deathYear && ` – ${formatYear(figure.deathYear)}`}
                  </span>
                )}
                {figure.occupation && (
                  <>
                    <span className="text-stone-300">•</span>
                    <span>{figure.occupation}</span>
                  </>
                )}
              </div>
            </SheetHeader>

            <div className="py-6 space-y-6">
              {/* Wikipedia Image and Extract */}
              {wikiLoading ? (
                <div className="flex gap-4">
                  <Skeleton className="w-24 h-32 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              ) : wikiData?.thumbnail || wikiData?.extract ? (
                <div className="p-4 bg-white rounded-lg border border-stone-200">
                  <div className="flex gap-4">
                    {wikiData.thumbnail && (
                      <div className="flex-shrink-0">
                        <img
                          src={wikiData.thumbnail.source}
                          alt={figure.canonicalName}
                          className="w-24 h-auto rounded shadow-sm object-cover"
                          style={{ maxHeight: '160px' }}
                        />
                      </div>
                    )}
                    {wikiData.extract && (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-stone-700 leading-relaxed line-clamp-6">
                          {wikiData.extract}
                        </p>
                        {figure.wikipediaSlug && (
                          <a
                            href={`https://en.wikipedia.org/wiki/${figure.wikipediaSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-2 text-xs text-blue-600 hover:underline"
                          >
                            Read more on Wikipedia →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Key Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-lg border border-stone-200">
                  <div className="text-xs text-stone-500 uppercase tracking-wide mb-1">
                    Pantheon Rank
                  </div>
                  <div className="text-2xl font-mono text-stone-900">
                    #{figure.hpiRank || '—'}
                  </div>
                  {figure.hpiScore && (
                    <div className="text-xs text-stone-400 mt-1">
                      HPI Score: {figure.hpiScore.toFixed(2)}
                    </div>
                  )}
                </div>

                <div className="p-4 bg-white rounded-lg border border-stone-200">
                  <div className="text-xs text-stone-500 uppercase tracking-wide mb-1">
                    LLM Rank
                  </div>
                  <div className="text-2xl font-mono text-stone-900">
                    {llmRank ? `#${llmRank}` : '—'}
                  </div>
                  {figure.llmConsensusRank && (
                    <div className="text-xs text-stone-400 mt-1">
                      Avg score: {figure.llmConsensusRank.toFixed(1)}
                    </div>
                  )}
                  <div className="mt-1">
                    <VarianceBadge
                      level={getVarianceLevel(figure.varianceScore)}
                      score={figure.varianceScore}
                      showScore
                    />
                  </div>
                </div>
              </div>

              {/* Wikipedia Stats */}
              {(figure.pageviews2024 || figure.pageviews2025) && (
                <div className="p-4 bg-white rounded-lg border border-stone-200">
                  <div className="text-xs text-stone-500 uppercase tracking-wide mb-2">
                    Wikipedia Pageviews
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-lg font-mono text-stone-900">
                        {formatViews(figure.pageviews2025)}
                      </div>
                      <div className="text-xs text-stone-400">2025</div>
                    </div>
                    <div>
                      <div className="text-lg font-mono text-stone-900">
                        {formatViews(figure.pageviews2024)}
                      </div>
                      <div className="text-xs text-stone-400">2024</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Rankings by Source */}
              {sourceRankings.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-stone-700 mb-3">
                    Rankings by Source
                  </h3>
                  <div className="space-y-2">
                    {sourceRankings.map(({ source, avgRank, sampleCount, contribution }) => (
                      <div
                        key={source}
                        className="p-3 bg-white rounded-lg border border-stone-200"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-stone-700">
                            {SOURCE_LABELS[source] || source}
                          </span>
                          <span className="font-mono text-stone-900">
                            #{avgRank}
                            {sampleCount > 1 && (
                              <span className="text-xs text-stone-400 ml-1">
                                (avg of {sampleCount})
                              </span>
                            )}
                          </span>
                        </div>
                        {contribution && (
                          <p className="text-xs text-stone-500 mt-1 line-clamp-2">
                            {contribution}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rank Comparison Bar */}
              {figure.hpiRank && figure.llmConsensusRank && (
                <div>
                  <h3 className="text-sm font-medium text-stone-700 mb-3">
                    Rank Comparison
                  </h3>
                  <div className="p-4 bg-white rounded-lg border border-stone-200">
                    <div className="flex items-center gap-4 text-xs text-stone-500 mb-2">
                      <span>1</span>
                      <div className="flex-1 h-2 bg-stone-100 rounded relative">
                        {/* HPI marker */}
                        <div
                          className="absolute top-0 w-2 h-2 bg-blue-500 rounded-full -translate-x-1/2"
                          style={{ left: `${(figure.hpiRank / 1000) * 100}%` }}
                          title={`Pantheon: #${figure.hpiRank}`}
                        />
                        {/* LLM marker */}
                        <div
                          className="absolute top-0 w-2 h-2 bg-amber-500 rounded-full -translate-x-1/2"
                          style={{ left: `${(figure.llmConsensusRank / 1000) * 100}%` }}
                          title={`LLM: #${Math.round(figure.llmConsensusRank)}`}
                        />
                      </div>
                      <span>1000</span>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-blue-500 rounded-full" /> Pantheon
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 bg-amber-500 rounded-full" /> LLM Consensus
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-stone-500">
            Select a figure to view details
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

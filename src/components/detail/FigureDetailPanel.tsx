'use client';

import { useState, useEffect, lazy, Suspense, useMemo } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { VarianceBadge } from '@/components/rankings/VarianceBadge';
import { BadgeDisplay } from '@/components/rankings/BadgeDisplay';
import { getVarianceLevel, SOURCE_LABELS, MODEL_ICONS, REGION_COLORS, LANGUAGE_NAMES, LANGUAGE_FLAGS, DOMAIN_COLORS } from '@/types';
import type { FigureEvidenceResponse } from '@/types';
import { X, ExternalLink, TrendingUp, TrendingDown, Minus, MapPin, HelpCircle, ChevronRight, ChevronLeft, Share2, Link2, LayoutGrid, BookOpen, Clock3, Maximize2 } from 'lucide-react';
import Link from 'next/link';
import { Tooltip } from '@/components/ui/tooltip';
import { ShareDialog } from '@/components/share/ShareDialog';
import type { Figure, Ranking, FigureRow, WikipediaData, RelatedMediaItem, DetailTab } from '@/types';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';
import { FigureResearchTab } from './FigureResearchTab';
import { FigureLifeTimeline } from './FigureLifeTimeline';
import { FigureTimelineMap } from './FigureTimelineMap';
import { SourceRankingCard } from './SourceRankingCard';
import {
  formatYear,
  formatViews,
  formatAlias,
  formatEventYears,
  getExtractParagraphs,
  groupRankingsBySource,
  getAttentionGap,
} from '@/lib/utils/figureFormatters';

// Lazy load heavy components
const BirthplaceGlobe = lazy(() => import('./BirthplaceGlobe').then(m => ({ default: m.BirthplaceGlobe })));
const NgramSparkline = lazy(() => import('./NgramSparkline').then(m => ({ default: m.NgramSparkline })));
const PageviewsSparkline = lazy(() => import('./PageviewsSparkline').then(m => ({ default: m.PageviewsSparkline })));

// Simple client-side cache for Wikipedia data
const wikiCache = new Map<string, WikipediaData>();

const TAB_LABELS: Array<{ id: DetailTab; label: string; icon: typeof LayoutGrid }> = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'research', label: 'Research', icon: BookOpen },
  { id: 'timeline', label: 'Timeline', icon: Clock3 },
];

interface FigureDetailPanelProps {
  figure: Figure | null;
  previewRow?: FigureRow | null;
  figureSlug?: string | null; // Direct ID, available immediately on click (before API fetch)
  rankings: Ranking[];
  aliases?: string[];
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
  isFullDataLoading?: boolean; // True when minimal data loaded but full data still fetching
  llmRank?: number | null;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onNavigate?: (figureId: string) => void;
}

function wikipediaArticleUrlFromTitle(title: string): string {
  const article = title.trim().replace(/\s+/g, '_');
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(article)}`;
}

type WaxSealPalette = {
  border: string;
  highlight: string;
  outer: string;
  mid: string;
  inner: string;
  ring: string;
  text: string;
};

const DOMAIN_WAX_PALETTES: Record<string, WaxSealPalette> = {
  Science: {
    border: '#234b88',
    highlight: '#9dc4ff',
    outer: '#5f95e3',
    mid: '#3d6fbe',
    inner: '#294b86',
    ring: 'rgba(214,232,255,0.38)',
    text: '#eef5ff',
  },
  Religion: {
    border: '#5f3e84',
    highlight: '#d6b4ff',
    outer: '#9a72cc',
    mid: '#7654aa',
    inner: '#523875',
    ring: 'rgba(244,223,255,0.34)',
    text: '#f8efff',
  },
  Philosophy: {
    border: '#3f4e92',
    highlight: '#b7c6ff',
    outer: '#6b7dd8',
    mid: '#4f60b5',
    inner: '#35407f',
    ring: 'rgba(226,233,255,0.34)',
    text: '#f2f6ff',
  },
  Politics: {
    border: '#7f111f',
    highlight: '#ffc3cc',
    outer: '#be2a43',
    mid: '#931a2f',
    inner: '#641220',
    ring: 'rgba(255,220,225,0.32)',
    text: '#fff1f3',
  },
  Military: {
    border: '#7f3e13',
    highlight: '#ffd1ad',
    outer: '#cf6b29',
    mid: '#a14d1f',
    inner: '#6f3313',
    ring: 'rgba(255,224,197,0.32)',
    text: '#fff3e8',
  },
  Arts: {
    border: '#17664f',
    highlight: '#b6f6de',
    outer: '#33ab86',
    mid: '#248366',
    inner: '#195d48',
    ring: 'rgba(215,255,241,0.3)',
    text: '#ebfff8',
  },
  Exploration: {
    border: '#1c5f67',
    highlight: '#b8eef7',
    outer: '#3ca9bb',
    mid: '#2f8390',
    inner: '#1f5f68',
    ring: 'rgba(214,247,255,0.3)',
    text: '#ebfbff',
  },
  Economics: {
    border: '#7a4b10',
    highlight: '#ffe1a7',
    outer: '#cf9230',
    mid: '#9f6f22',
    inner: '#704d18',
    ring: 'rgba(255,236,202,0.32)',
    text: '#fff8e8',
  },
  Medicine: {
    border: '#7a1f57',
    highlight: '#ffd0ec',
    outer: '#c85a9b',
    mid: '#9a3f77',
    inner: '#6d2c56',
    ring: 'rgba(255,225,244,0.34)',
    text: '#fff1f8',
  },
};

const DEFAULT_WAX_PALETTE: WaxSealPalette = {
  border: '#7f111f',
  highlight: '#ffc3cc',
  outer: '#be2a43',
  mid: '#931a2f',
  inner: '#641220',
  ring: 'rgba(255,220,225,0.32)',
  text: '#fff1f3',
};

function getWaxSealPalette(domain: string | null): WaxSealPalette {
  if (!domain) return DEFAULT_WAX_PALETTE;
  const direct = DOMAIN_WAX_PALETTES[domain];
  if (direct) return direct;
  const domainColor = DOMAIN_COLORS[domain];
  if (!domainColor) return DEFAULT_WAX_PALETTE;
  return DEFAULT_WAX_PALETTE;
}

export function FigureDetailPanel({
  figure,
  previewRow,
  figureSlug,
  rankings,
  aliases,
  isOpen,
  onClose,
  isFullDataLoading = false,
  llmRank,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  onNavigate,
}: FigureDetailPanelProps) {
  const [wikiData, setWikiData] = useState<WikipediaData | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [localThumbExt, setLocalThumbExt] = useState<number>(0); // 0=jpg, 1=png, 2=webp, 3=failed
  const [localThumbFailed, setLocalThumbFailed] = useState(false);
  const [shareOrigin, setShareOrigin] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [relatedMedia, setRelatedMedia] = useState<RelatedMediaItem[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [evidenceData, setEvidenceData] = useState<FigureEvidenceResponse | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  // Use previewRow or figure for display data
  const displayData = figure || previewRow;
  const figureId = figureSlug || figure?.id || previewRow?.id;
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
        const res = await fetch(`/api/wikipedia?slug=${encodeURIComponent(wikiSlug)}`);
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

  useEffect(() => {
    if (!figureId) {
      setRelatedMedia([]);
      return;
    }
    const controller = new AbortController();
    const fetchLinks = async () => {
      setLinksLoading(true);
      try {
        const res = await fetch(`/api/media?mode=links&figureId=${encodeURIComponent(figureId)}`, { signal: controller.signal });
        if (!res.ok) {
          setRelatedMedia([]);
          return;
        }
        const data = await res.json();
        setRelatedMedia(Array.isArray(data?.items) ? data.items : []);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('Failed to load related media:', error);
        setRelatedMedia([]);
      } finally {
        setLinksLoading(false);
      }
    };

    fetchLinks();
    return () => controller.abort();
  }, [figureId]);

  useEffect(() => {
    if (!isOpen || !figureId) {
      setEvidenceData(null);
      setEvidenceError(null);
      setEvidenceLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchEvidence = async () => {
      setEvidenceData(null);
      setEvidenceLoading(true);
      setEvidenceError(null);
      try {
        const res = await fetch(`/api/figures/${encodeURIComponent(figureId)}/evidence`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const message =
            (payload && typeof payload.error === 'string' && payload.error) || 'Failed to load evidence';
          setEvidenceError(message);
          setEvidenceData(null);
          return;
        }

        const data = (await res.json()) as FigureEvidenceResponse;
        setEvidenceData(data);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setEvidenceError('Failed to load evidence');
        setEvidenceData(null);
      } finally {
        setEvidenceLoading(false);
      }
    };

    fetchEvidence();

    return () => controller.abort();
  }, [figureId, isOpen]);

  const shareUrl = useMemo(() => {
    if (!figureId || !shareOrigin) return '';
    return `${shareOrigin}/figure/${figureId}`;
  }, [figureId, shareOrigin]);

  const sourceRankings = groupRankingsBySource(rankings);

  const attentionGap = getAttentionGap(figure?.hpiRank || previewRow?.hpiRank, llmRank);
  const researchSources = evidenceData?.research.sources || [];
  const researchQuotes = evidenceData?.research.quotes || [];
  const historicalSnippets = evidenceData?.research.historicalSnippets || [];
  const wikidataFacts = evidenceData?.research.wikidataFacts || [];
  const wikipediaSections = evidenceData?.research.wikipediaSections || [];
  const notableWorks = Array.from(
    new Set(
      wikidataFacts
        .filter((fact) => fact.propertyId === 'P800' || fact.propertyLabel.toLowerCase() === 'notable work')
        .map((fact) => fact.value.trim())
        .filter(Boolean)
    )
  ).slice(0, 3);
  const displayName = figure?.canonicalName || previewRow?.name || '';
  const displayHistoricalRank =
    llmRank ??
    (figure?.llmConsensusRank ? Math.round(figure.llmConsensusRank) : null) ??
    previewRow?.llmRank ??
    null;
  const rankDigitCount = displayHistoricalRank !== null ? String(Math.abs(displayHistoricalRank)).length : 1;
  const rankLabelSizeClass =
    rankDigitCount <= 2 ? 'text-[8px] sm:text-[9.5px]' : rankDigitCount === 3 ? 'text-[7.5px] sm:text-[9px]' : 'text-[7px] sm:text-[8px]';
  const rankNumberSizeClass =
    rankDigitCount <= 2 ? 'text-[1.35rem] sm:text-[1.55rem]' : rankDigitCount === 3 ? 'text-[1.12rem] sm:text-[1.28rem]' : 'text-[0.92rem] sm:text-[1rem]';
  const waxPalette = useMemo(
    () => getWaxSealPalette(figure?.domain || previewRow?.domain || null),
    [figure?.domain, previewRow?.domain]
  );
  const timelineAssessment = evidenceData?.timeline.assessment || null;
  const timelineEvents = evidenceData?.timeline.events || [];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        forceMount
        showClose={false}
        className="w-full sm:max-w-[606px] lg:max-w-[702px] overflow-y-auto bg-[#faf9f7] dark:bg-slate-900 border-l border-stone-200 dark:border-amber-900/30 p-0"
      >
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
            {/* Header Section */}
            <div className="relative px-6 pt-6 pb-4 bg-gradient-to-b from-white to-[#faf9f7] dark:from-slate-800 dark:to-slate-900 border-b border-stone-200/60 dark:border-amber-900/30">
              {/* Action buttons - top right */}
              <div className="absolute top-3.5 right-4 z-20 inline-flex items-center gap-1 rounded-full bg-white/72 px-1 py-1 shadow-sm ring-1 ring-stone-200/85 backdrop-blur-md dark:bg-slate-900/72 dark:ring-slate-700/85">
                <button
                  onClick={() => setShareOpen(true)}
                  className="p-1.5 rounded-full hover:bg-stone-200/60 dark:hover:bg-slate-700/60 transition-colors"
                  aria-label="Share figure"
                >
                  <Share2 className="w-4 h-4 text-stone-500 dark:text-slate-300" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-stone-200/60 dark:hover:bg-slate-700/60 transition-colors"
                  aria-label="Close panel"
                >
                  <X className="w-5 h-5 text-stone-500 dark:text-slate-300" />
                </button>
              </div>

              <div className="flex flex-col gap-4 pt-8 sm:flex-row sm:gap-6 sm:items-start">
                {/* Portrait - tall, starts at top of panel */}
                <div className="flex-shrink-0 w-28 sm:w-36 min-h-[214px] sm:min-h-[250px]">
                  <div
                    onClick={() => {
                      if (figureId) window.location.href = `/figure/${figureId}`;
                    }}
                    className="group/portrait cursor-pointer relative"
                  >
                    {localThumbUrl && !localThumbFailed ? (
                      <div className="relative">
                        <img
                          src={localThumbUrl}
                          alt={figure?.canonicalName || previewRow?.name || ''}
                          loading="lazy"
                          className="w-28 h-40 sm:w-36 sm:h-48 object-cover rounded-lg shadow-lg ring-1 ring-stone-200/50 group-hover/portrait:ring-amber-400 transition-all"
                          onError={() => {
                            if (localThumbExt < 2) {
                              setLocalThumbExt(localThumbExt + 1);
                            } else {
                              setLocalThumbFailed(true);
                            }
                          }}
                        />
                        <div className="absolute inset-0 rounded-lg bg-black/0 group-hover/portrait:bg-black/30 transition-all flex items-end justify-center pb-2 opacity-0 group-hover/portrait:opacity-100">
                          <span className="text-[10px] font-medium text-white/90 bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm">View profile</span>
                        </div>
                      </div>
                    ) : wikiData?.thumbnail ? (
                      <div className="relative">
                        <img
                          src={wikiData.thumbnail.source}
                          alt={figure?.canonicalName || previewRow?.name || ''}
                          loading="lazy"
                          className="w-28 h-40 sm:w-36 sm:h-48 object-cover rounded-lg shadow-lg ring-1 ring-stone-200/50 group-hover/portrait:ring-amber-400 transition-all"
                        />
                        <div className="absolute inset-0 rounded-lg bg-black/0 group-hover/portrait:bg-black/30 transition-all flex items-end justify-center pb-2 opacity-0 group-hover/portrait:opacity-100">
                          <span className="text-[10px] font-medium text-white/90 bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm">View profile</span>
                        </div>
                      </div>
                    ) : wikiLoading ? (
                      <div className="w-28 h-40 sm:w-36 sm:h-48 rounded-lg bg-stone-100 dark:bg-slate-700 animate-pulse" />
                    ) : (
                      <div className="w-28 h-40 sm:w-36 sm:h-48 rounded-lg bg-gradient-to-br from-stone-100 to-stone-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center shadow-inner">
                        <span className="text-4xl font-serif text-stone-400 dark:text-slate-500">
                          {(figure?.canonicalName || previewRow?.name || '?').charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  {figureId && (
                    <a
                      href={`/figure/${figureId}`}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all duration-200 hover:bg-stone-900 hover:shadow-lg dark:bg-[#b89a50] dark:text-stone-900 dark:hover:bg-[#c9a55c]"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      Full profile
                      <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                    </a>
                  )}
                </div>

                {/* Name and metadata */}
                <div className="flex-1 min-w-0 pt-1 min-h-[214px] sm:min-h-[250px]">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_108px] sm:items-start sm:gap-x-4">
                    <div className="min-h-[148px] sm:min-h-[178px]">
                      <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-stone-400/90 dark:text-amber-600/85 font-medium">
                        Figure Details
                      </div>
                      <h2
                        title={displayName}
                        className="mb-2 font-serif text-2xl sm:text-[1.7rem] font-semibold text-stone-900 dark:text-amber-100 leading-tight [text-wrap:balance] overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]"
                      >
                        {displayName}
                      </h2>
                      {/* Profession + badges on same line */}
                      {(figure?.occupation || (previewRow?.badges && previewRow.badges.length > 0)) && (
                        <div className="flex items-center gap-2.5 flex-wrap mb-2">
                          {figure?.occupation && (
                            <span className="font-serif text-[0.92rem] sm:text-[0.98rem] uppercase tracking-[0.105em] leading-none first-letter:text-[1.14em] first-letter:tracking-[0.018em] text-stone-700 dark:text-amber-200/90">
                              {figure.occupation}
                            </span>
                          )}
                          {previewRow?.badges && previewRow.badges.length > 0 && (
                            <BadgeDisplay badges={previewRow.badges} maxVisible={3} />
                          )}
                        </div>
                      )}
                      <div className="flex flex-col gap-2 text-sm text-stone-600 dark:text-slate-400">
                      {/* Born on its own line */}
                      {formatYear(displayData?.birthYear ?? null) && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-[0.14em] text-stone-400/85 dark:text-amber-600/85 w-8">
                            Born
                          </span>
                          <span className="font-medium text-stone-800 dark:text-slate-200">
                            {formatYear(displayData?.birthYear ?? null)}{figure?.birthPlace ? ` in ${figure.birthPlace}` : ''}
                          </span>
                        </span>
                      )}
                      {/* Died on its own line */}
                      {figure?.deathYear && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-[0.14em] text-stone-400/85 dark:text-amber-600/85 w-8">
                            Died
                          </span>
                          <span className="font-medium text-stone-800 dark:text-slate-200">
                            {formatYear(figure.deathYear)}
                          </span>
                        </span>
                      )}
                      {displayData?.regionSub && (
                        <span
                          className="inline-flex w-fit items-center px-2 py-0.5 rounded-full text-xs font-medium text-white mt-1"
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
                      {notableWorks.length > 0 && (
                        <div className="pt-1">
                          <span className="text-[10px] uppercase tracking-[0.14em] text-stone-400/85 dark:text-amber-600/85">
                            Notable works
                          </span>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {notableWorks.map((work) => (
                              <a
                                key={work}
                                href={wikipediaArticleUrlFromTitle(work)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white/80 px-2.5 py-0.5 text-xs font-medium text-stone-700 transition-colors hover:border-amber-300 hover:text-amber-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-amber-500/60 dark:hover:text-amber-300"
                              >
                                {work}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    </div>

                    {displayHistoricalRank !== null && (
                      <div className="w-20 sm:w-[108px] sm:justify-self-end sm:self-start sm:pr-2 pt-8 sm:pt-9">
                        <Tooltip
                          content={
                            <div className="space-y-2">
                              <div className="font-medium text-stone-800 dark:text-slate-100">
                                LLM Rank: <span className="font-semibold">#{displayHistoricalRank}</span>
                              </div>
                              {figure?.llmConsensusRank != null && Math.round(figure.llmConsensusRank) !== displayHistoricalRank && (
                                <div className="text-stone-600 dark:text-slate-300">
                                  Unweighted Rank: <span className="font-semibold">#{Math.round(figure.llmConsensusRank)}</span>
                                </div>
                              )}
                              {(figure?.hpiRank || previewRow?.hpiRank) && (
                                <div className="text-stone-600 dark:text-slate-300">
                                  Pantheon HPI Rank: <span className="font-semibold">#{figure?.hpiRank || previewRow?.hpiRank}</span>
                                </div>
                              )}
                              {(figure?.domain || previewRow?.domain) && (
                                <div className="pt-1 border-t border-stone-100 dark:border-slate-700">
                                  <span className="text-stone-500 dark:text-slate-400">Seal color:</span>{' '}
                                  <span className="font-medium" style={{ color: waxPalette.mid }}>
                                    {figure?.domain || previewRow?.domain}
                                  </span>
                                  <div className="text-[10px] text-stone-400 dark:text-slate-500 mt-0.5 leading-snug">
                                    Each domain has a unique seal color — blue for Science, red for Politics, green for Arts, purple for Religion, and more.
                                  </div>
                                </div>
                              )}
                            </div>
                          }
                          align="right"
                        >
                          <div
                            className="relative h-[72px] w-[72px] sm:h-[84px] sm:w-[84px] rounded-full border cursor-help transition-transform duration-300 ease-out hover:scale-110 hover:rotate-[6deg] shadow-[inset_0_2px_3px_rgba(255,255,255,0.28),inset_0_-4px_6px_rgba(35,8,14,0.6),0_6px_12px_rgba(35,8,14,0.28)] hover:shadow-[inset_0_2px_3px_rgba(255,255,255,0.28),inset_0_-4px_6px_rgba(35,8,14,0.6),0_8px_20px_rgba(35,8,14,0.35)] dark:shadow-[inset_0_2px_3px_rgba(255,255,255,0.2),inset_0_-4px_6px_rgba(10,3,6,0.72),0_6px_12px_rgba(0,0,0,0.45)] dark:hover:shadow-[inset_0_2px_3px_rgba(255,255,255,0.2),inset_0_-4px_6px_rgba(10,3,6,0.72),0_8px_20px_rgba(0,0,0,0.55)]"
                            style={{
                              borderColor: waxPalette.border,
                              backgroundImage: `radial-gradient(circle at 30% 22%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 16%, transparent 30%), radial-gradient(circle at 28% 24%, ${waxPalette.outer} 0%, ${waxPalette.mid} 62%, ${waxPalette.inner} 100%)`,
                            }}
                          >
                            <div
                              className="absolute inset-[3px] sm:inset-[4px] rounded-full border"
                              style={{
                                borderColor: waxPalette.ring,
                                backgroundImage:
                                  'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.12) 0deg 10deg, rgba(0,0,0,0.08) 10deg 20deg)',
                              }}
                            />
                            <div
                              className="absolute inset-[9px] sm:inset-[11px] rounded-full border shadow-[inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_-2px_4px_rgba(20,4,8,0.55)]"
                              style={{
                                borderColor: waxPalette.ring,
                                backgroundImage: `radial-gradient(circle at 30% 24%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 18%, transparent 32%), radial-gradient(circle at 30% 25%, ${waxPalette.outer} 0%, ${waxPalette.mid} 60%, ${waxPalette.inner} 100%)`,
                              }}
                            >
                              <div className="flex h-full w-full flex-col items-center justify-center text-center">
                                <span className={`${rankLabelSizeClass} uppercase tracking-[0.18em]`} style={{ color: waxPalette.text }}>
                                  Rank
                                </span>
                                <span className={`mt-1 font-serif ${rankNumberSizeClass} font-semibold leading-none drop-shadow-[0_1px_1px_rgba(30,5,10,0.7)]`} style={{ color: waxPalette.text }}>
                                  #{displayHistoricalRank}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            <div className="mx-6 mt-3">
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-stone-200/80 bg-white/90 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800/80">
                {TAB_LABELS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-stone-900 text-white dark:bg-[#c9a55c] dark:text-stone-900'
                          : 'text-stone-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                      aria-pressed={isActive}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* See Also - Related Figures */}
            {isFullDataLoading && figure && !figure.relatedFigures && (
              <div className="mx-6 mt-3 flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.14em] text-stone-400 dark:text-amber-600 flex-shrink-0">
                  See also
                </span>
                <div className="flex items-center gap-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-7 w-24 rounded-full" />
                  ))}
                </div>
              </div>
            )}
            {figure?.relatedFigures && figure.relatedFigures.length > 0 && (
              <div className="mx-6 mt-3 flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.14em] text-stone-400 dark:text-amber-600 flex-shrink-0">
                  See also
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {figure.relatedFigures.slice(0, 3).map((related) => (
                    <Tooltip
                      key={related.id}
                      content={
                        <div className="text-center">
                          <div className="font-medium">{related.name}</div>
                          <div className="text-xs text-stone-400 dark:text-slate-500 capitalize">{related.relationship}</div>
                        </div>
                      }
                    >
                      <button
                        onClick={() => onNavigate?.(related.id)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-stone-100 dark:bg-slate-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors group"
                      >
                        <div className="w-6 h-6 rounded-full overflow-hidden ring-1 ring-stone-200 dark:ring-slate-600 flex-shrink-0">
                          <img
                            src={`/thumbnails/${related.id}.jpg`}
                            alt={related.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              if (target.src.endsWith('.jpg')) {
                                target.src = `/thumbnails/${related.id}.png`;
                              } else if (target.src.endsWith('.png')) {
                                target.src = `/thumbnails/${related.id}.webp`;
                              } else {
                                target.style.display = 'none';
                                target.parentElement!.innerHTML = `<span class="w-full h-full flex items-center justify-center bg-stone-200 dark:bg-slate-700 text-stone-500 dark:text-slate-400 text-[10px] font-medium">${related.name.charAt(0)}</span>`;
                              }
                            }}
                          />
                        </div>
                        <span className="text-xs text-stone-600 dark:text-slate-300 group-hover:text-amber-700 dark:group-hover:text-[#d4b06a] transition-colors max-w-[120px] truncate">
                          {related.name}
                        </span>
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}

            {/* Loading indicator for full data - subtle skeleton sections */}
            {!figure && previewRow && (
              <div className="mx-6 mt-4 space-y-3">
                <Skeleton className="h-20 w-full rounded-xl" />
                <div className="grid grid-cols-3 gap-3">
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                </div>
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            )}

            {/* Content */}
            <div className="p-6 flex-1">
              {activeTab === 'overview' && (
                <div className="space-y-5">
              {(linksLoading || relatedMedia.length > 0) && (
                <div className="rounded-xl border border-stone-200/70 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-slate-400">Related media</div>
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">
                      <Link2 className="h-3 w-3" />
                      Media Atlas
                    </span>
                  </div>
                  {linksLoading && (
                    <div className="mt-3 space-y-2">
                      <Skeleton className="h-14 w-full rounded-xl" />
                      <Skeleton className="h-14 w-full rounded-xl" />
                    </div>
                  )}
                  {!linksLoading && relatedMedia.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {relatedMedia.map((media) => (
                        <a
                          key={media.id}
                          href={`/media?media=${encodeURIComponent(media.id)}`}
                          className="flex items-center gap-3 rounded-xl border border-stone-200/60 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-left transition-colors hover:border-stone-300 dark:hover:border-slate-600 hover:bg-stone-50 dark:hover:bg-slate-700"
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
              {wikiLoading && !wikiData?.extract && (
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6 mt-3" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
              {wikiData?.extract && (
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
                  {getExtractParagraphs(wikiData.extract)?.map((paragraph, index) => (
                    <p
                      key={`${previewRow?.id || figure?.id}-extract-${index}`}
                      className={`text-sm text-stone-600 dark:text-slate-300 leading-relaxed ${index === 0 ? '' : 'mt-3'}`}
                    >
                      {paragraph}
                    </p>
                  ))}
                  {wikiSlug && (
                    <a
                      href={`https://en.wikipedia.org/wiki/${wikiSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-3 text-xs text-amber-600 dark:text-[#c9a55c] hover:text-amber-700 dark:hover:text-[#d4b06a] transition-colors font-medium"
                    >
                      Read more on Wikipedia <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {/* Google Ngrams Chart - Book mentions over time */}
              {figure?.ngramData ? (
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
              ) : isFullDataLoading && figure && (
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-[120px] w-full rounded-lg" />
                </div>
              )}

              {/* Key Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
                  <div className="text-xs text-stone-400 dark:text-slate-500 uppercase tracking-wide mb-1">Views</div>
                  <div className="text-lg font-semibold text-stone-900 dark:text-slate-100">
                    {formatViews(figure?.pageviewsGlobal ?? figure?.pageviews2025 ?? previewRow?.pageviews ?? null)}
                  </div>
                  <div className="text-[10px] text-stone-400 dark:text-slate-500">2025 (all languages)</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
                  <div className="text-xs text-stone-400 dark:text-slate-500 uppercase tracking-wide mb-1">Born</div>
                  <div className="text-lg font-semibold text-stone-900 dark:text-slate-100">
                    {formatYear(displayData?.birthYear ?? null) || '—'}
                  </div>
                  {displayData?.era && (
                    <div className="text-[10px] text-stone-400 dark:text-slate-500">{displayData.era}</div>
                  )}
                </div>
                <div className="text-center p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
                  <div className="text-xs text-stone-400 dark:text-slate-500 uppercase tracking-wide mb-1">Region</div>
                  <div className="text-sm font-medium text-stone-700 dark:text-slate-300 mt-1 truncate" title={displayData?.regionSub || undefined}>
                    {displayData?.regionSub || '—'}
                  </div>
                </div>
              </div>

              {/* Variance Badge */}
              {(figure?.varianceScore !== null || previewRow?.varianceScore !== null) && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
                  <div>
                    <div className="text-xs text-stone-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">Source Variance</div>
                    <p className="text-xs text-stone-500 dark:text-slate-400">How much sources disagree</p>
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
                    {figure.regionSub && (
                      <div className="flex justify-between gap-4">
                        <span className="text-stone-400 dark:text-slate-500">Region</span>
                        <span className="text-stone-700 dark:text-slate-300 text-right">{figure.regionSub}</span>
                      </div>
                    )}
                    {figure.birthLat !== null && figure.birthLon !== null && (
                      <div className="flex justify-between gap-4">
                        <span className="text-stone-400 dark:text-slate-500">Coordinates</span>
                        <span className="text-stone-700 dark:text-slate-300 font-mono text-xs">
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

              {/* Attention Gap - Featured Metric */}
              {attentionGap && (
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {attentionGap.direction === 'up' ? (
                          <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
                        ) : attentionGap.direction === 'down' ? (
                          <TrendingDown className="w-5 h-5 text-amber-600 dark:text-amber-500" />
                        ) : (
                          <Minus className="w-5 h-5 text-stone-400 dark:text-slate-500" />
                        )}
                        <Tooltip content="Compares this figure's academic ranking (Pantheon/HPI) to their LLM consensus rank. Values above 1x suggest LLMs rate them higher than traditional metrics; below 1x means lower.">
                          <span className="text-xs uppercase tracking-wide text-stone-500 dark:text-slate-400 font-medium cursor-help">
                            Attention Gap
                          </span>
                        </Tooltip>
                      </div>
                      <div className={`text-3xl font-semibold tracking-tight ${
                        attentionGap.direction === 'up'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : attentionGap.direction === 'down'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-stone-600 dark:text-slate-400'
                      }`}>
                        {attentionGap.ratio > 1 ? '↑' : attentionGap.ratio < 1 ? '↓' : ''}
                        {' '}{attentionGap.ratio.toFixed(1)}x
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-stone-400 dark:text-slate-500 mb-0.5">Pantheon</div>
                      <div className="font-mono text-sm text-stone-600 dark:text-slate-400">#{figure?.hpiRank || previewRow?.hpiRank}</div>
                      <div className="text-xs text-stone-400 dark:text-slate-500 mt-2 mb-0.5">LLM</div>
                      <div className="font-mono text-sm text-stone-900 dark:text-slate-100 font-medium">#{llmRank}</div>
                    </div>
                  </div>
                  <p className="text-xs text-stone-500 dark:text-slate-400 mt-3 leading-relaxed">
                    {attentionGap.label}
                  </p>
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

                // Official brand colors (see ModelProfileCard.tsx for sources)
                const modelColors: Record<string, string> = {
                  'claude-sonnet-4.5': '#da7756',  // Anthropic terra cotta
                  'claude-opus-4.5': '#da7756',    // Anthropic terra cotta
                  'claude-opus-4.6': '#da7756',    // Anthropic terra cotta
                  'deepseek-v3.2': '#4D6BFE',      // DeepSeek blue
                  'gemini-flash-3': '#078EFA',     // Gemini blue
                  'gemini-flash-3-preview': '#078EFA', // Gemini blue
                  'gemini-pro-3': '#4285F4',       // Google blue
                  'gpt-4o': '#10A37F',             // OpenAI teal
                  'gpt-5.2-thinking': '#10A37F',   // OpenAI teal
                  'gpt-5.3-thinking': '#10A37F',   // OpenAI teal
                  'grok-4': '#1a1a1a',             // xAI black
                  'grok-4.1-fast': '#1a1a1a',      // xAI black
                  'mistral-large-3': '#FF8205',    // Mistral orange
                  'qwen3': '#615EFF',              // Qwen violet (legacy key)
                  'qwen3-235b-a22b': '#615EFF',    // Qwen violet
                };

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
                      {/* Scale markers */}
                      <div className="absolute inset-0 flex justify-between items-center px-3 text-[10px] text-stone-400 dark:text-slate-400">
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
                                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full shadow-sm ring-1 ring-white/80 dark:ring-slate-700/80 cursor-help opacity-80 hover:opacity-100 hover:scale-125 transition-all z-10"
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
                          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-blue-500 rounded-full shadow-md ring-2 ring-white dark:ring-slate-700 cursor-help z-20 hover:scale-110 transition-transform"
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
                          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-amber-500 rounded-full shadow-md ring-2 ring-white dark:ring-slate-700 cursor-help z-20 hover:scale-110 transition-transform"
                          style={{ left: `${getPosition(llmAvgRank)}%` }}
                        />
                      </Tooltip>
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-3 text-[10px]">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                        <span className="text-stone-500 dark:text-slate-400">Pantheon</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
                        <span className="text-stone-500 dark:text-slate-400">LLM Avg</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
                        <span className="text-stone-400 dark:text-slate-500">Claude</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-teal-500 rounded-full" />
                        <span className="text-stone-400 dark:text-slate-500">Gemini</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                        <span className="text-stone-400 dark:text-slate-500">GPT</span>
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Birthplace Globe - only shown when full figure data is loaded */}
              {figure && figure.birthLat !== null && figure.birthLon !== null && (
                <div className="pt-2">
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
                </div>
              )}

              {/* Wikipedia Pageviews by Language - only shown when data is available */}
              {isFullDataLoading && figure && !figure.pageviewsByLanguage && (
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between">
                          <Skeleton className="h-3 w-20" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-1.5 w-full rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {figure?.pageviewsByLanguage && Object.keys(figure.pageviewsByLanguage).length > 0 && (() => {
                const langData = figure.pageviewsByLanguage as Record<string, number>;
                const total = Object.values(langData).reduce((sum, v) => sum + v, 0);
                const sortedLangs = Object.entries(langData)
                  .sort(([, a], [, b]) => b - a);
                const maxViews = sortedLangs[0]?.[1] || 1;

                return (
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-stone-400 dark:text-slate-500 font-medium">
                          Wikipedia Views by Language
                        </span>
                        <Tooltip
                          content="Pageviews from top 10 Wikipedia language editions (Jan 2025 to present)"
                          align="center"
                        >
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
                                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 dark:from-[#c9a55c] dark:to-[#b89a50] rounded-full transition-all group-hover:from-amber-500 group-hover:to-amber-600"
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Notable insight if non-English language dominates */}
                    {sortedLangs[0] && sortedLangs[0][0] !== 'en' && sortedLangs[0][1] > (langData['en'] || 0) * 1.2 && (
                      <div className="mt-3 pt-3 border-t border-stone-100 dark:border-slate-700">
                        <p className="text-xs text-amber-600 dark:text-[#c9a55c] flex items-center gap-1.5">
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

              {/* Wikipedia Pageviews Over Time */}
              {figure?.wikipediaSlug && (
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
              )}

              {activeTab === 'research' && (
                <FigureResearchTab
                  sources={researchSources}
                  quotes={researchQuotes}
                  snippets={historicalSnippets}
                  wikidataFacts={wikidataFacts}
                  wikipediaSections={wikipediaSections}
                  figureName={figure?.canonicalName || previewRow?.name || 'Unknown figure'}
                  isLoading={evidenceLoading}
                  error={evidenceError}
                />
              )}

              {activeTab === 'timeline' && (
                <div className="space-y-5">
                  {evidenceLoading && (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full rounded-xl" />
                      <Skeleton className="h-28 w-full rounded-xl" />
                    </div>
                  )}

                  {!evidenceLoading && evidenceError && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                      {evidenceError}
                    </div>
                  )}

                  {!evidenceLoading && !evidenceError && (
                    <>
                      <div className="rounded-xl border border-stone-200/70 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
                        <div className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-stone-500 dark:text-slate-400">
                          Biographical overview
                        </div>
                        {timelineAssessment?.assessmentText ? (
                          <p className="text-sm leading-relaxed text-stone-700 dark:text-slate-200">
                            {timelineAssessment.assessmentText}
                          </p>
                        ) : (
                          <p className="text-sm text-stone-600 dark:text-slate-300">
                            No timeline assessment generated yet.
                          </p>
                        )}
                      </div>

                      <FigureLifeTimeline
                        birthYear={displayData?.birthYear ?? null}
                        deathYear={figure?.deathYear ?? null}
                        events={timelineEvents}
                      />

                      <FigureTimelineMap events={timelineEvents} />

                      <div className="rounded-xl border border-stone-200/70 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
                        <div className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-stone-500 dark:text-slate-400">
                          Key events
                        </div>
                        {timelineEvents.length > 0 ? (
                          <div className="space-y-3">
                            {timelineEvents.slice(0, 16).map((event) => (
                              <div
                                key={event.id}
                                className="rounded-lg border border-stone-200 bg-stone-50/70 p-3 dark:border-slate-700 dark:bg-slate-800"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-stone-800 dark:text-slate-100">
                                      {event.eventLabel}
                                    </div>
                                    {event.eventDescription && (
                                      <p className="mt-1 text-xs leading-relaxed text-stone-600 dark:text-slate-300">
                                        {event.eventDescription}
                                      </p>
                                    )}
                                  </div>
                                  <span className="shrink-0 rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-stone-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                    {formatEventYears(event.eventStartYear, event.eventEndYear, event.metadata)}
                                  </span>
                                </div>
                                {event.placeLabel && (
                                  <div className="mt-2 text-xs text-stone-500 dark:text-slate-400">
                                    {event.placeLabel}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2 py-4 text-sm text-stone-600 dark:text-slate-300">
                            <Clock3 className="h-6 w-6 text-stone-300 dark:text-slate-600" />
                            <p>No timeline events generated yet.</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Mobile Navigation Bar - sticky bottom on small screens */}
            {(onPrevious || onNext) && (
              <div className="sticky bottom-0 left-0 right-0 sm:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t border-stone-200 dark:border-slate-700 p-3 flex items-center justify-between gap-2 mt-4">
                <button
                  onClick={onPrevious}
                  disabled={!hasPrevious}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg font-medium text-sm transition-colors ${
                    hasPrevious
                      ? 'bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-200 active:bg-stone-200 dark:active:bg-slate-700'
                      : 'bg-stone-50 dark:bg-slate-800/50 text-stone-300 dark:text-slate-600 cursor-not-allowed'
                  }`}
                  aria-label="Previous figure"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Previous</span>
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-3 rounded-lg bg-stone-800 dark:bg-slate-700 text-white font-medium text-sm active:bg-stone-900 dark:active:bg-slate-600 transition-colors"
                  aria-label="Close panel"
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  onClick={onNext}
                  disabled={!hasNext}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg font-medium text-sm transition-colors ${
                    hasNext
                      ? 'bg-stone-100 dark:bg-slate-800 text-stone-700 dark:text-slate-200 active:bg-stone-200 dark:active:bg-slate-700'
                      : 'bg-stone-50 dark:bg-slate-800/50 text-stone-300 dark:text-slate-600 cursor-not-allowed'
                  }`}
                  aria-label="Next figure"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-stone-400 dark:text-slate-500 text-sm">Select a figure to view details</p>
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

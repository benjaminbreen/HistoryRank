'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, X, Link2, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import type { MediaItem } from '@/lib/media';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';
import { FigureThumbnail } from '@/components/rankings/FigureThumbnail';
import { Skeleton } from '@/components/ui/skeleton';
import { MODEL_ICONS, SOURCE_LABELS } from '@/types';

type CastWithRole = {
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
};

type CrewMember = {
  name: string;
  job: string;
  department: string;
};

type MediaDetail = MediaItem & {
  wikipedia_extract?: string | null;
  summary_paragraphs?: string[];
  wikidata_qid?: string | null;
  directors?: string[];
  creators?: string[];
  cast?: string[];
  countries?: string[];
  awards?: string[];
  runtime_minutes?: number | null;
  // TMDB enrichment
  tmdb_id?: number | null;
  tmdb_overview?: string | null;
  tmdb_tagline?: string | null;
  tmdb_genres?: string[];
  tmdb_runtime?: number | null;
  tmdb_production_companies?: string[];
  tmdb_budget?: number | null;
  tmdb_revenue?: number | null;
  cast_with_roles?: CastWithRole[];
  crew?: CrewMember[];
  student_notes?: Array<{ initials: string; note?: string }>;
};

type MediaDetailPanelProps = {
  item: MediaDetail | null;
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
};

type MediaSourceEntry = {
  rank: number | null;
  accuracy: number | null;
  quality: number | null;
  notes: string | null;
  summary: string | null;
};

type MediaSourceGroup = {
  source: string;
  avg_accuracy: number | null;
  avg_quality: number | null;
  sample_count: number;
  entries: MediaSourceEntry[];
};

type StreamingProvider = {
  id: number;
  name: string;
  logoPath: string | null;
  type: string;
  url: string | null;
};

type StreamingResponse = {
  tmdbId: number | null;
  link: string | null;
  providers: StreamingProvider[];
};

type RelatedFigure = {
  figure_id: string;
  figure_name: string;
  relation: string;
  figure_rank: number | null;
};

function formatList(values?: string[] | null) {
  if (!values || values.length === 0) return '—';
  return values.join(', ');
}

function isBookType(type?: string | null) {
  if (!type) return false;
  const normalized = type.toLowerCase();
  return normalized === 'fiction' || normalized === 'book' || normalized === 'novel';
}

function getBookPurchaseLinks(title: string) {
  const encodedTitle = encodeURIComponent(title);
  return [
    {
      name: 'Amazon',
      url: `https://www.amazon.com/s?k=${encodedTitle}&i=stripbooks`,
      icon: '/icons/amazon.svg',
      color: '#FF9900',
    },
    {
      name: 'Bookshop.org',
      url: `https://bookshop.org/search?keywords=${encodedTitle}`,
      icon: '/icons/bookshop.svg',
      color: '#00856F',
    },
  ];
}

function formatScore(value: number | null) {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toFixed(1);
}

function interpolateHsl(a: [number, number, number], b: [number, number, number], t: number) {
  const hue = a[0] + (b[0] - a[0]) * t;
  const sat = a[1] + (b[1] - a[1]) * t;
  const light = a[2] + (b[2] - a[2]) * t;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function scoreColor(score: number | null) {
  if (score === null || Number.isNaN(score)) return undefined;
  // Scores typically range 5-10, same as ratings
  const clamped = Math.max(5, Math.min(9, score));
  const stops: Array<[number, [number, number, number]]> = [
    [5, [18, 78, 48]],    // red
    [5.5, [26, 82, 52]],
    [6, [38, 86, 54]],    // orange
    [6.5, [58, 78, 52]],
    [7, [78, 70, 50]],    // yellow
    [7.5, [98, 64, 48]],
    [8, [118, 60, 46]],   // light green
    [8.5, [132, 56, 44]],
    [9, [142, 52, 42]],   // green
  ];

  for (let index = 0; index < stops.length - 1; index += 1) {
    const [startScore, startColor] = stops[index];
    const [endScore, endColor] = stops[index + 1];
    if (clamped >= startScore && clamped <= endScore) {
      const t = (clamped - startScore) / (endScore - startScore);
      return interpolateHsl(startColor, endColor, t);
    }
  }
  return 'hsl(142 52% 42%)';
}

function ScorePill({ label, value }: { label: string; value: number | null }) {
  const color = scoreColor(value);
  return (
    <span
      className="rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium"
      style={color ? {
        color,
        borderColor: color,
        backgroundColor: `${color.replace(')', ' / 0.1)')}`,
      } : {
        color: 'var(--score-default-color, #78716c)',
        borderColor: 'var(--score-default-border, #e7e5e4)',
        backgroundColor: 'var(--score-default-bg, #fafaf9)',
      }}
    >
      {label} {formatScore(value)}
    </span>
  );
}

function SourceRankingCard({ group }: { group: MediaSourceGroup }) {
  const entries = group.entries ?? [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const hasMultiple = entries.length > 1;

  const cycleNext = useCallback(() => {
    if (!hasMultiple || isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % entries.length);
      setIsAnimating(false);
    }, 150);
  }, [entries.length, hasMultiple, isAnimating]);

  // Reset index when source changes
  useEffect(() => {
    setActiveIndex(0);
  }, [group.source]);

  const currentEntry = entries[activeIndex];
  const currentAcc = currentEntry?.accuracy ?? group.avg_accuracy;
  const currentQual = currentEntry?.quality ?? group.avg_quality;
  const currentNote = currentEntry?.notes || currentEntry?.summary || null;

  return (
    <div
      className={`rounded-xl border border-stone-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-sm transition-all ${
        hasMultiple ? 'cursor-pointer hover:border-stone-300 dark:hover:border-slate-600 hover:shadow-md' : ''
      }`}
      onClick={hasMultiple ? cycleNext : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
          {MODEL_ICONS[group.source] && (
            <img
              src={MODEL_ICONS[group.source]}
              alt=""
              className="w-4 h-4 opacity-70 dark:invert dark:opacity-60"
            />
          )}
          {SOURCE_LABELS[group.source] || group.source}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400 dark:text-slate-500">
          {group.sample_count} list{group.sample_count > 1 ? 's' : ''}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-stone-500 dark:text-slate-400">
        <ScorePill label="ACCURACY" value={currentAcc} />
        <ScorePill label="QUALITY" value={currentQual} />
        {currentEntry?.rank && (
          <span className="text-[14px] font-mono font-medium text-stone-500 dark:text-slate-400">#{currentEntry.rank}</span>
        )}
      </div>

      {/* Quote/notes with slide animation */}
      {currentNote && (
        <div className="relative overflow-hidden mt-2">
          <p
            className={`text-[11px] text-stone-500 dark:text-slate-400 leading-relaxed line-clamp-3 transition-all duration-150 ease-out ${
              isAnimating ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
            }`}
          >
            {currentNote}
          </p>
        </div>
      )}

      {/* Navigation dots */}
      {hasMultiple && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-stone-100 dark:border-slate-700">
          <div className="flex items-center gap-1.5">
            {entries.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  if (idx !== activeIndex && !isAnimating) {
                    setIsAnimating(true);
                    setTimeout(() => {
                      setActiveIndex(idx);
                      setIsAnimating(false);
                    }, 150);
                  }
                }}
                className={`transition-all ${
                  idx === activeIndex
                    ? 'w-4 h-1.5 bg-stone-400 dark:bg-slate-400 rounded-full'
                    : 'w-1.5 h-1.5 bg-stone-200 dark:bg-slate-600 rounded-full hover:bg-stone-300 dark:hover:bg-slate-500'
                }`}
                aria-label={`View entry ${idx + 1}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-stone-400 dark:text-slate-500">
            <span className="tabular-nums">{activeIndex + 1}/{entries.length}</span>
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>
      )}
    </div>
  );
}

export function MediaDetailPanel({ item, open, loading, onClose, onNext, onPrevious }: MediaDetailPanelProps) {
  const [relatedFigures, setRelatedFigures] = useState<RelatedFigure[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [sourceGroups, setSourceGroups] = useState<MediaSourceGroup[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [providers, setProviders] = useState<StreamingProvider[]>([]);
  const [providersLink, setProvidersLink] = useState<string | null>(null);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [wikiParagraphs, setWikiParagraphs] = useState<string[]>([]);
  const [wikiExtractLoading, setWikiExtractLoading] = useState(false);
  const [showFullExtract, setShowFullExtract] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      // Don't handle if lightbox is open (except Escape)
      if (lightboxImage && event.key !== 'Escape') return;

      switch (event.key) {
        case 'Escape':
          if (lightboxImage) {
            setLightboxImage(null);
          } else {
            onClose();
          }
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          onNext?.();
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          onPrevious?.();
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, onNext, onPrevious, lightboxImage]);

  // Close lightbox when panel closes or item changes
  useEffect(() => {
    setLightboxImage(null);
  }, [item?.id, open]);

  // Fetch Wikipedia extract when cache doesn't have summary_paragraphs
  useEffect(() => {
    setWikiParagraphs([]);
    setShowFullExtract(false);
    if (!item?.wikipedia_slug) return;
    // Skip if we already have enriched paragraphs from the cache
    if (item.summary_paragraphs && item.summary_paragraphs.length > 0) return;
    if (item.wikipedia_extract) return;

    const controller = new AbortController();
    setWikiExtractLoading(true);
    fetch(`/api/wikipedia?slug=${encodeURIComponent(item.wikipedia_slug)}`, { signal: controller.signal })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.extract_paragraphs?.length > 0) {
          setWikiParagraphs(data.extract_paragraphs);
        } else if (data?.extract) {
          setWikiParagraphs([data.extract]);
        }
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') console.error('Wiki extract fetch failed:', err);
      })
      .finally(() => setWikiExtractLoading(false));

    return () => controller.abort();
  }, [item?.id, item?.wikipedia_slug, item?.summary_paragraphs, item?.wikipedia_extract]);

  useEffect(() => {
    if (!item?.id) {
      setRelatedFigures([]);
      return;
    }
    const controller = new AbortController();
    const fetchLinks = async () => {
      setLinksLoading(true);
      try {
        const res = await fetch(`/api/media?mode=links&mediaId=${encodeURIComponent(item.id)}`, { signal: controller.signal });
        if (!res.ok) {
          setRelatedFigures([]);
          return;
        }
        const data = await res.json();
        setRelatedFigures(Array.isArray(data?.items) ? data.items : []);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('Failed to load related figures:', error);
        setRelatedFigures([]);
      } finally {
        setLinksLoading(false);
      }
    };

    fetchLinks();
    return () => controller.abort();
  }, [item?.id]);

  useEffect(() => {
    if (!item?.id) {
      setSourceGroups([]);
      return;
    }
    const controller = new AbortController();
    const fetchSources = async () => {
      setSourcesLoading(true);
      try {
        const res = await fetch(`/api/media?mode=sources&mediaId=${encodeURIComponent(item.id)}`, { signal: controller.signal });
        if (!res.ok) {
          setSourceGroups([]);
          return;
        }
        const data = await res.json();
        setSourceGroups(Array.isArray(data?.items) ? data.items : []);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('Failed to load media sources:', error);
        setSourceGroups([]);
      } finally {
        setSourcesLoading(false);
      }
    };

    fetchSources();
    return () => controller.abort();
  }, [item?.id]);

  useEffect(() => {
    if (!item?.id) {
      setProviders([]);
      setProvidersLink(null);
      return;
    }
    const controller = new AbortController();
    const fetchProviders = async () => {
      setProvidersLoading(true);
      try {
        const res = await fetch(`/api/media?mode=providers&mediaId=${encodeURIComponent(item.id)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setProviders([]);
          setProvidersLink(null);
          return;
        }
        const data: StreamingResponse = await res.json();
        setProviders(Array.isArray(data?.providers) ? data.providers : []);
        setProvidersLink(data?.link ?? null);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('Failed to load streaming providers:', error);
        setProviders([]);
        setProvidersLink(null);
      } finally {
        setProvidersLoading(false);
      }
    };

    fetchProviders();
    return () => controller.abort();
  }, [item?.id]);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Reset expanded sections when item changes — LLM analysis starts expanded
  useEffect(() => {
    setExpandedSections(new Set(['llm']));
  }, [item?.id]);

  // Prefer TMDB cast_with_roles over plain Wikidata cast names
  const hasTmdbCast = (item?.cast_with_roles?.length ?? 0) > 0;
  const castNames = hasTmdbCast
    ? item!.cast_with_roles!.map((c) => c.name)
    : (item?.cast ?? []);
  const castPreview = castNames.slice(0, 3).join(', ');
  const castExtra = castNames.length - 3;

  // Prefer TMDB crew directors, fall back to Wikidata directors
  const tmdbDirectors = (item?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name);
  const directorLine = tmdbDirectors.length > 0
    ? tmdbDirectors.join(', ')
    : item?.directors?.length ? item.directors.join(', ') : null;

  // Runtime: prefer TMDB, fall back to Wikidata
  const runtime = item?.tmdb_runtime ?? item?.runtime_minutes ?? null;

  // Summary: prefer Wikipedia paragraphs, fall back to TMDB overview, then plain fields
  // Filter out bad paragraphs (blockquotes, footnotes, bullets, very short lines)
  const cleanParagraphs = (item?.summary_paragraphs ?? []).filter((p) => {
    if (p.length < 40) return false;           // too short — likely a footnote or caption
    if (p.startsWith('*')) return false;        // bullet / footnote
    if (/^[""\u201c]/.test(p)) return false;   // starts with a quotation mark (blockquote)
    if (/^I believe\b/.test(p)) return false;   // common blockquote opener
    return true;
  });
  const hasSummaryParagraphs = cleanParagraphs.length > 0;
  const tmdbOverview = item?.tmdb_overview ?? null;

  // First LLM quote for peek strip
  const firstNote = sourceGroups[0]?.entries?.[0]?.notes || sourceGroups[0]?.entries?.[0]?.summary || null;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-stone-900/30 dark:bg-black/50 transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-[44rem] border-l border-stone-200 dark:border-slate-700 bg-[#faf9f7] dark:bg-slate-900 shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Panel header — unchanged */}
          <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-slate-700 px-6 py-3 bg-gradient-to-b from-white dark:from-slate-800 to-[#faf9f7] dark:to-slate-900">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onPrevious}
                  className="rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-stone-400 dark:text-slate-500 transition-colors hover:text-stone-700 dark:hover:text-slate-200 hover:border-stone-300 dark:hover:border-slate-500"
                  aria-label="Previous item"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  className="rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-stone-400 dark:text-slate-500 transition-colors hover:text-stone-700 dark:hover:text-slate-200 hover:border-stone-300 dark:hover:border-slate-500"
                  aria-label="Next item"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-stone-400 dark:text-slate-500">
                {item ? `${item.type}` : 'Media detail'}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-2 text-stone-500 dark:text-slate-400 transition-colors hover:text-stone-800 dark:hover:text-slate-200"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable content — continuous surface, no card wrappers */}
          <div className="flex-1 overflow-y-auto">
            {/* Loading skeleton */}
            {loading && (
              <div className="px-6 py-6 space-y-6">
                <div className="flex gap-6">
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <div className="flex gap-2 pt-2">
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                    <Skeleton className="h-16 w-full" />
                  </div>
                  <Skeleton className="hidden sm:block h-[180px] w-[120px] rounded-lg flex-shrink-0" />
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-stone-200/60 dark:via-slate-700/40 to-transparent" />
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            )}

            {!loading && !item && (
              <div className="px-6 py-6 text-sm text-stone-500 dark:text-slate-400">No media item selected.</div>
            )}

            {!loading && item && (
              <>
                {/* ── 1. HERO SECTION ── */}
                <section className="px-6 py-6">
                  <div className="flex gap-5">
                    {/* Text column */}
                    <div className="flex-1 min-w-0 space-y-3">
                      <h2 className="text-2xl sm:text-3xl font-serif text-stone-900 dark:text-amber-100 leading-tight">{item.title}</h2>
                      <div className="text-sm text-stone-500 dark:text-slate-400">
                        <span>{item.release_year ?? '—'}</span>
                        {runtime ? <span> · {runtime} min</span> : null}
                        {directorLine && (
                          <span> · <span className="text-amber-700 dark:text-[#c9a55c]">{directorLine}</span></span>
                        )}
                      </div>
                      {item.tmdb_tagline && (
                        <p className="text-xs italic text-stone-400 dark:text-slate-500">{item.tmdb_tagline}</p>
                      )}

                      {/* Score pills */}
                      {(item.llm_accuracy_score != null || item.llm_quality_score != null || item.rating_normalized != null) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.llm_accuracy_score != null && <ScorePill label="ACC" value={item.llm_accuracy_score} />}
                          {item.llm_quality_score != null && <ScorePill label="QUAL" value={item.llm_quality_score} />}
                          {item.rating_normalized != null && <ScorePill label="RATING" value={item.rating_normalized} />}
                        </div>
                      )}

                      {/* Summary inline — priority: wiki paragraphs > live wiki > cached wiki extract > TMDB overview > plain summary */}
                      <div className="text-sm leading-relaxed text-stone-700 dark:text-slate-300">
                        {hasSummaryParagraphs ? (
                          <div className="space-y-3">
                            <p className={showFullExtract ? '' : 'line-clamp-[10]'}>{cleanParagraphs[0]}</p>
                            {showFullExtract && cleanParagraphs.slice(1).map((p, i) => <p key={i} className="mt-2">{p}</p>)}
                            {(cleanParagraphs[0].length > 600 || cleanParagraphs.length > 1) && (
                              <button
                                type="button"
                                onClick={() => setShowFullExtract(!showFullExtract)}
                                className="text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 underline underline-offset-2"
                              >
                                {showFullExtract ? 'Show less' : 'Read more'}
                              </button>
                            )}
                          </div>
                        ) : wikiParagraphs.length > 0 ? (
                          <div className="space-y-3">
                            <p className={showFullExtract ? '' : 'line-clamp-[10]'}>{wikiParagraphs[0]}</p>
                            {showFullExtract && wikiParagraphs.slice(1).map((p, i) => <p key={i} className="mt-2">{p}</p>)}
                            {(wikiParagraphs[0].length > 600 || wikiParagraphs.length > 1) && (
                              <button
                                type="button"
                                onClick={() => setShowFullExtract(!showFullExtract)}
                                className="text-xs text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 underline underline-offset-2"
                              >
                                {showFullExtract ? 'Show less' : 'Read more'}
                              </button>
                            )}
                          </div>
                        ) : item.wikipedia_extract ? (
                          <p className={showFullExtract ? '' : 'line-clamp-[10]'}>{item.wikipedia_extract}</p>
                        ) : tmdbOverview ? (
                          <p className={showFullExtract ? '' : 'line-clamp-[10]'}>{tmdbOverview}</p>
                        ) : wikiExtractLoading ? (
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                            <Skeleton className="h-4 w-4/6" />
                          </div>
                        ) : (
                          <p>{item.summary || '—'}</p>
                        )}
                      </div>

                    </div>

                    {/* Poster floating right + Watch/Read below */}
                    <div className="hidden sm:flex flex-col items-center flex-shrink-0 gap-3">
                      <MediaThumbnail
                        mediaId={item.id}
                        wikipediaSlug={item.wikipedia_slug}
                        title={item.title}
                        size={150}
                        variant="poster"
                        className="rounded-lg border border-stone-200/60 dark:border-slate-700 shadow-md cursor-pointer"
                        onClick={(url) => setLightboxImage(url)}
                      />
                      {/* Watch / Read — compact below poster */}
                      {isBookType(item.type) ? (
                        <div className="flex flex-col items-center gap-1.5 w-full">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500 font-medium">Read</span>
                          <div className="flex items-center gap-1.5 flex-wrap justify-center">
                            {getBookPurchaseLinks(item.title).map((link) => (
                              <a
                                key={link.name}
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="h-7 px-2.5 rounded-full border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex items-center justify-center gap-1 transition-all hover:border-stone-300 dark:hover:border-slate-600 hover:shadow-sm"
                                title={`Buy on ${link.name}`}
                              >
                                <span
                                  className="w-3 h-3 rounded-sm flex items-center justify-center text-[7px] font-bold text-white"
                                  style={{ backgroundColor: link.color }}
                                >
                                  {link.name.charAt(0)}
                                </span>
                                <span className="text-[10px] text-stone-600 dark:text-slate-300">{link.name}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 w-full">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500 font-medium">Watch</span>
                          {providersLoading ? (
                            <div className="flex items-center gap-1.5">
                              <Skeleton className="h-7 w-7 rounded-full" />
                              <Skeleton className="h-7 w-7 rounded-full" />
                            </div>
                          ) : providers.length > 0 ? (
                            <div className="flex items-center gap-1.5 flex-wrap justify-center">
                              {providers.slice(0, 4).map((provider) => {
                                const icon = provider.logoPath ? (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w45${provider.logoPath}`}
                                    alt={provider.name}
                                    loading="lazy"
                                    className="h-4.5 w-4.5 rounded-full object-contain"
                                  />
                                ) : (
                                  <span className="text-[8px] uppercase text-stone-500 dark:text-slate-400">
                                    {provider.name.slice(0, 2)}
                                  </span>
                                );
                                return provider.url ? (
                                  <a
                                    key={provider.id}
                                    href={provider.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="h-7 w-7 rounded-full border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex items-center justify-center transition-all hover:scale-110 hover:border-stone-300 dark:hover:border-slate-600 hover:shadow-sm"
                                    title={`Watch on ${provider.name}`}
                                  >
                                    {icon}
                                  </a>
                                ) : (
                                  <div
                                    key={provider.id}
                                    className="h-7 w-7 rounded-full border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex items-center justify-center"
                                    title={provider.name}
                                  >
                                    {icon}
                                  </div>
                                );
                              })}
                              {providers.length > 4 && providersLink && (
                                <a
                                  href={providersLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[9px] text-stone-400 dark:text-slate-500 hover:text-stone-700 dark:hover:text-slate-300"
                                >
                                  +{providers.length - 4}
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-stone-400 dark:text-slate-500">Not available</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mobile poster + Watch/Read — below hero text */}
                  <div className="sm:hidden mt-4 flex flex-col items-center gap-3">
                    <MediaThumbnail
                      mediaId={item.id}
                      wikipediaSlug={item.wikipedia_slug}
                      title={item.title}
                      size={140}
                      variant="poster"
                      className="rounded-lg border border-stone-200/60 dark:border-slate-700 shadow-md cursor-pointer"
                      onClick={(url) => setLightboxImage(url)}
                    />
                    {isBookType(item.type) ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500 font-medium">Read</span>
                        {getBookPurchaseLinks(item.title).map((link) => (
                          <a
                            key={link.name}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="h-7 px-2.5 rounded-full border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex items-center justify-center gap-1 transition-all hover:border-stone-300 dark:hover:border-slate-600 hover:shadow-sm"
                            title={`Buy on ${link.name}`}
                          >
                            <span
                              className="w-3 h-3 rounded-sm flex items-center justify-center text-[7px] font-bold text-white"
                              style={{ backgroundColor: link.color }}
                            >
                              {link.name.charAt(0)}
                            </span>
                            <span className="text-[10px] text-stone-600 dark:text-slate-300">{link.name}</span>
                          </a>
                        ))}
                      </div>
                    ) : providers.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500 font-medium">Watch</span>
                        {providers.slice(0, 4).map((provider) => (
                          provider.url ? (
                            <a
                              key={provider.id}
                              href={provider.url}
                              target="_blank"
                              rel="noreferrer"
                              className="h-7 w-7 rounded-full border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex items-center justify-center transition-all hover:scale-110"
                              title={`Watch on ${provider.name}`}
                            >
                              {provider.logoPath ? (
                                <img src={`https://image.tmdb.org/t/p/w45${provider.logoPath}`} alt={provider.name} className="h-4 w-4 rounded-full object-contain" loading="lazy" />
                              ) : (
                                <span className="text-[8px] uppercase text-stone-500 dark:text-slate-400">{provider.name.slice(0, 2)}</span>
                              )}
                            </a>
                          ) : (
                            <div key={provider.id} className="h-7 w-7 rounded-full border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 flex items-center justify-center" title={provider.name}>
                              {provider.logoPath ? (
                                <img src={`https://image.tmdb.org/t/p/w45${provider.logoPath}`} alt={provider.name} className="h-4 w-4 rounded-full object-contain" loading="lazy" />
                              ) : (
                                <span className="text-[8px] uppercase text-stone-500 dark:text-slate-400">{provider.name.slice(0, 2)}</span>
                              )}
                            </div>
                          )
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>

                {/* ── Divider ── */}
                <div className="h-px mx-6 bg-gradient-to-r from-transparent via-stone-200/60 dark:via-slate-700/40 to-transparent" />

                {/* ── HISTORICAL CONTEXT STRIP ── */}
                <div className="px-6 py-3 flex items-center gap-3 flex-wrap text-[11px]">
                  <span className="flex items-center gap-1.5 text-stone-500 dark:text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/50 dark:bg-[#c9a55c]/50" />
                    {item.primary_era}
                  </span>
                  {item.sub_era && (
                    <span className="text-stone-500 dark:text-slate-400">{item.sub_era}</span>
                  )}
                  {item.primary_region && (
                    <span className="text-stone-500 dark:text-slate-400">{item.primary_region}</span>
                  )}
                  {(item.depicted_start_year != null) && (
                    <span className="font-mono text-stone-400 dark:text-slate-500">
                      {item.depicted_start_year < 0
                        ? `${Math.abs(item.depicted_start_year)} BCE`
                        : `${item.depicted_start_year} CE`}
                      {item.depicted_end_year != null && item.depicted_end_year !== item.depicted_start_year && (
                        <>–{item.depicted_end_year < 0
                          ? `${Math.abs(item.depicted_end_year)} BCE`
                          : `${item.depicted_end_year} CE`}</>
                      )}
                    </span>
                  )}
                  {item.domain && (
                    <span className="text-stone-500 dark:text-slate-400">{item.domain}</span>
                  )}
                </div>

                <div className="h-px mx-6 bg-gradient-to-r from-transparent via-stone-200/60 dark:via-slate-700/40 to-transparent" />

                {/* ── 2. LINKED FIGURES ── */}
                {(linksLoading || relatedFigures.length > 0) && (
                  <>
                    <section className="px-6 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500 flex items-center gap-1.5">
                          <Link2 className="h-3 w-3" />
                          Linked figures
                        </div>
                      </div>
                      {linksLoading ? (
                        <div className="flex gap-2">
                          <Skeleton className="h-9 w-32 rounded-full" />
                          <Skeleton className="h-9 w-28 rounded-full" />
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {relatedFigures.map((fig) => (
                            <a
                              key={fig.figure_id}
                              href={`/?figure=${encodeURIComponent(fig.figure_id)}`}
                              className="inline-flex items-center gap-2 rounded-full bg-stone-100/60 dark:bg-slate-800/40 border border-stone-200/60 dark:border-slate-700/40 px-2.5 py-1.5 text-left transition-colors hover:border-amber-300/30 dark:hover:border-[#c9a55c]/20 hover:bg-stone-50 dark:hover:bg-slate-800/60"
                            >
                              <FigureThumbnail
                                figureId={fig.figure_id}
                                wikipediaSlug={null}
                                name={fig.figure_name}
                                size={24}
                              />
                              <span className="text-sm text-stone-700 dark:text-slate-300">{fig.figure_name}</span>
                              {fig.figure_rank && (
                                <span className="text-[10px] font-mono text-stone-400 dark:text-slate-500">#{Math.round(fig.figure_rank)}</span>
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                    </section>
                    <div className="h-px mx-6 bg-gradient-to-r from-transparent via-stone-200/60 dark:via-slate-700/40 to-transparent" />
                  </>
                )}

                {/* ── 3. EDITOR'S NOTE ── */}
                {item.notes && (
                  <>
                    <div className="mx-6 my-4 rounded-r-lg border-l-[3px] border-l-amber-400/60 dark:border-l-[#c9a55c]/35 bg-amber-50/50 dark:bg-[#c9a55c]/[0.04] px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-400 dark:text-slate-500 mb-1.5 font-medium">Editor&apos;s Note</div>
                      <p className="text-sm text-stone-600 dark:text-slate-300 leading-relaxed">{item.notes}</p>
                    </div>
                    <div className="h-px mx-6 bg-gradient-to-r from-transparent via-stone-200/60 dark:via-slate-700/40 to-transparent" />
                  </>
                )}

                {/* ── 3b. STUDENT NOTES ── */}
                {item.student_notes && item.student_notes.length > 0 && (() => {
                  const withNotes = item.student_notes!.filter((s) => s.note);
                  const justRecommended = item.student_notes!.filter((s) => !s.note);
                  return (
                    <>
                      <div className="mx-6 my-4 space-y-2">
                        {withNotes.map((s, i) => (
                          <div key={i} className="rounded-r-lg border-l-[3px] border-l-sky-400/50 dark:border-l-sky-500/30 bg-sky-50/40 dark:bg-sky-900/[0.06] px-4 py-2.5">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] uppercase tracking-[0.25em] text-stone-400 dark:text-slate-500 font-medium">Student&apos;s Note</span>
                              <span className="text-[10px] font-mono text-stone-400 dark:text-slate-500">{s.initials}</span>
                            </div>
                            <p className="text-sm text-stone-600 dark:text-slate-300 leading-relaxed">{s.note}</p>
                          </div>
                        ))}
                        {justRecommended.length > 0 && (
                          <div className="flex items-center gap-2 px-1 text-[11px] text-stone-400 dark:text-slate-500">
                            <span>Also recommended by</span>
                            {justRecommended.map((s, i) => (
                              <span key={i} className="inline-flex items-center justify-center h-5 px-1.5 rounded bg-stone-100 dark:bg-slate-800 font-mono text-[10px] text-stone-500 dark:text-slate-400">{s.initials}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="h-px mx-6 bg-gradient-to-r from-transparent via-stone-200/60 dark:via-slate-700/40 to-transparent" />
                    </>
                  );
                })()}

                {/* ── 4. CAST & CREW PEEK STRIP ── */}
                {!isBookType(item.type) && (hasTmdbCast || item.cast?.length || item.crew?.length || item.directors?.length || item.creators?.length || item.countries?.length || item.awards?.length) ? (
                  <>
                    <section className="group">
                      <button
                        type="button"
                        onClick={() => toggleSection('cast')}
                        className="w-full px-6 py-3 flex items-start justify-between text-left transition-colors hover:bg-stone-50/50 dark:hover:bg-slate-800/30"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500 font-medium flex-shrink-0">Cast & Crew</span>
                            {castExtra > 0 && (
                              <span className="text-[10px] text-stone-400 dark:text-slate-500">{castNames.length} people</span>
                            )}
                          </div>
                          {/* Cast portrait row — always visible when collapsed */}
                          {!expandedSections.has('cast') && (
                            hasTmdbCast ? (
                              <div className="flex gap-3 overflow-hidden">
                                {item!.cast_with_roles!.slice(0, 6).map((c, i) => (
                                  <div key={i} className="flex-shrink-0 text-center" style={{ width: 52 }}>
                                    {c.profile_path ? (
                                      <img
                                        src={`https://image.tmdb.org/t/p/w45${c.profile_path}`}
                                        alt=""
                                        className="h-10 w-10 mx-auto rounded-full object-cover bg-stone-200 dark:bg-slate-700 border border-stone-200/60 dark:border-slate-700/40"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="h-10 w-10 mx-auto rounded-full bg-stone-200 dark:bg-slate-700 border border-stone-200/60 dark:border-slate-700/40 flex items-center justify-center text-xs text-stone-400 dark:text-slate-500 font-medium">
                                        {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                      </div>
                                    )}
                                    <div className="text-[10px] text-stone-600 dark:text-slate-400 font-medium mt-1 truncate">
                                      {c.name.split(' ').length > 1
                                        ? `${c.name.split(' ')[0][0]}. ${c.name.split(' ').slice(-1)[0]}`
                                        : c.name}
                                    </div>
                                    {c.character && (
                                      <div className="text-[9px] text-stone-400 dark:text-slate-500 italic truncate">{c.character.split(' / ')[0]}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : castPreview ? (
                              <span className="text-xs text-stone-500 dark:text-slate-500">{castPreview}{castExtra > 0 ? ` +${castExtra}` : ''}</span>
                            ) : null
                          )}
                        </div>
                        <ChevronDown className={`h-4 w-4 text-stone-300 dark:text-slate-600 transition-transform duration-200 flex-shrink-0 mt-0.5 ${expandedSections.has('cast') ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Expandable content */}
                      <div
                        className={`grid transition-all duration-200 ease-out ${
                          expandedSections.has('cast') ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="px-6 pb-4 space-y-4">
                            {/* Crew by role — from TMDB or Wikidata fallback */}
                            {(() => {
                              const crewByJob = new Map<string, string[]>();
                              if (item.crew?.length) {
                                for (const c of item.crew) {
                                  const existing = crewByJob.get(c.job) ?? [];
                                  existing.push(c.name);
                                  crewByJob.set(c.job, existing);
                                }
                              } else {
                                if (item.directors?.length) crewByJob.set('Director', item.directors);
                                if (item.creators?.length) crewByJob.set('Creator', item.creators);
                              }
                              if (crewByJob.size === 0) return null;

                              const jobOrder = ['Director', 'Creator', 'Writer', 'Screenplay', 'Original Music Composer', 'Director of Photography', 'Producer', 'Executive Producer', 'Novel', 'Story', 'Characters'];
                              const sorted = [...crewByJob.entries()].sort((a, b) => {
                                const ai = jobOrder.indexOf(a[0]);
                                const bi = jobOrder.indexOf(b[0]);
                                return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                              });

                              return (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {sorted.map(([job, names]) => (
                                    <div key={job}>
                                      <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">{job}</div>
                                      <div className="text-sm text-stone-700 dark:text-slate-300">{names.join(', ')}</div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}

                            {/* Cast — TMDB with character names, or plain Wikidata list */}
                            {hasTmdbCast ? (
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500 mb-2">Cast</div>
                                <div className="space-y-1.5">
                                  {item.cast_with_roles!.map((c, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      {c.profile_path ? (
                                        <img
                                          src={`https://image.tmdb.org/t/p/w45${c.profile_path}`}
                                          alt=""
                                          className="h-6 w-6 rounded-full object-cover bg-stone-200 dark:bg-slate-700"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <div className="h-6 w-6 rounded-full bg-stone-200 dark:bg-slate-700 flex items-center justify-center text-[9px] text-stone-400 dark:text-slate-500 font-medium">
                                          {c.name.charAt(0)}
                                        </div>
                                      )}
                                      <span className="text-sm text-stone-700 dark:text-slate-300">{c.name}</span>
                                      {c.character && (
                                        <span className="text-xs text-stone-400 dark:text-slate-500">as {c.character}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : item.cast && item.cast.length > 0 ? (
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Cast</div>
                                <div className="text-sm text-stone-700 dark:text-slate-300">{formatList(item.cast)}</div>
                              </div>
                            ) : null}

                            {/* Additional metadata */}
                            <div className="grid gap-2 sm:grid-cols-2">
                              {item.countries && item.countries.length > 0 && (
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Countries</div>
                                  <div className="text-sm text-stone-700 dark:text-slate-300">{formatList(item.countries)}</div>
                                </div>
                              )}
                              {item.tmdb_genres && item.tmdb_genres.length > 0 && (
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Genres</div>
                                  <div className="text-sm text-stone-700 dark:text-slate-300">{item.tmdb_genres.join(', ')}</div>
                                </div>
                              )}
                              {item.tmdb_production_companies && item.tmdb_production_companies.length > 0 && (
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Production</div>
                                  <div className="text-sm text-stone-700 dark:text-slate-300">{item.tmdb_production_companies.join(', ')}</div>
                                </div>
                              )}
                              {item.awards && item.awards.length > 0 && (
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Awards</div>
                                  <div className="text-sm text-stone-700 dark:text-slate-300">{formatList(item.awards)}</div>
                                </div>
                              )}
                              {item.rating_normalized != null && (
                                <div>
                                  <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Rating</div>
                                  <div className="text-sm text-stone-700 dark:text-slate-300">
                                    {item.rating_normalized.toFixed(1)} / 10
                                    {item.rating_source ? ` · ${item.rating_source.toUpperCase()}` : ''}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                    <div className="h-px mx-6 bg-gradient-to-r from-transparent via-stone-200/60 dark:via-slate-700/40 to-transparent" />
                  </>
                ) : isBookType(item.type) && (item.authors?.length || item.publisher || item.genres?.length) ? (
                  <>
                    <section className="group">
                      <button
                        type="button"
                        onClick={() => toggleSection('details')}
                        className="w-full px-6 py-3 flex items-center justify-between text-left transition-colors hover:bg-stone-50/50 dark:hover:bg-slate-800/30"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500 font-medium flex-shrink-0">Book Details</span>
                            {item.authors?.length ? (
                              <span className="text-xs text-stone-500 dark:text-slate-500 truncate">{item.authors.slice(0, 2).join(', ')}</span>
                            ) : null}
                          </div>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-stone-300 dark:text-slate-600 transition-transform duration-200 flex-shrink-0 ${expandedSections.has('details') ? 'rotate-180' : ''}`} />
                      </button>

                      <div
                        className={`grid transition-all duration-200 ease-out ${
                          expandedSections.has('details') ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="px-6 pb-4 grid gap-3 sm:grid-cols-2">
                            {item.authors && item.authors.length > 0 && (
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Author</div>
                                <div className="text-sm text-stone-700 dark:text-slate-300">{formatList(item.authors)}</div>
                              </div>
                            )}
                            {item.publisher && (
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Publisher</div>
                                <div className="text-sm text-stone-700 dark:text-slate-300">{item.publisher}</div>
                              </div>
                            )}
                            {item.genres && item.genres.length > 0 && (
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Genre</div>
                                <div className="text-sm text-stone-700 dark:text-slate-300">{formatList(item.genres)}</div>
                              </div>
                            )}
                            {item.language && (
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Language</div>
                                <div className="text-sm text-stone-700 dark:text-slate-300">{item.language}</div>
                              </div>
                            )}
                            {item.page_count != null && (
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Pages</div>
                                <div className="text-sm text-stone-700 dark:text-slate-300">{item.page_count}</div>
                              </div>
                            )}
                            {item.rating_normalized != null && (
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Rating</div>
                                <div className="text-sm text-stone-700 dark:text-slate-300">
                                  {item.rating_normalized.toFixed(1)} / 10
                                  {item.rating_source ? ` · ${item.rating_source.toUpperCase()}` : ''}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                    <div className="h-px mx-6 bg-gradient-to-r from-transparent via-stone-200/60 dark:via-slate-700/40 to-transparent" />
                  </>
                ) : null}

                {/* ── 5. LLM ANALYSIS PEEK STRIP ── */}
                {(sourcesLoading || sourceGroups.length > 0) && (
                  <>
                    <section className="group">
                      <button
                        type="button"
                        onClick={() => toggleSection('llm')}
                        className="w-full px-6 py-3 flex items-center justify-between text-left transition-colors hover:bg-stone-50/50 dark:hover:bg-slate-800/30"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500 font-medium flex-shrink-0">LLM Analysis</span>
                            <span className="text-xs text-stone-500 dark:text-slate-500">
                              {sourceGroups.length} model{sourceGroups.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {/* Quote preview */}
                          {firstNote && !expandedSections.has('llm') && (
                            <div className="mt-1.5 border-l-2 border-amber-300/40 dark:border-[#c9a55c]/25 pl-3">
                              <p className="text-[11px] text-stone-500 dark:text-slate-500 line-clamp-1 italic">{firstNote}</p>
                            </div>
                          )}
                        </div>
                        <ChevronDown className={`h-4 w-4 text-stone-300 dark:text-slate-600 transition-transform duration-200 flex-shrink-0 ml-2 ${expandedSections.has('llm') ? 'rotate-180' : ''}`} />
                      </button>

                      <div
                        className={`grid transition-all duration-200 ease-out ${
                          expandedSections.has('llm') ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="px-6 pb-4">
                            {sourcesLoading ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Skeleton className="h-20 rounded-xl" />
                                <Skeleton className="h-20 rounded-xl" />
                              </div>
                            ) : (
                              <div className="grid gap-3 sm:grid-cols-2">
                                {sourceGroups.map((group) => (
                                  <SourceRankingCard key={group.source} group={group} />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                    <div className="h-px mx-6 bg-gradient-to-r from-transparent via-stone-200/60 dark:via-slate-700/40 to-transparent" />
                  </>
                )}

                {/* ── 6. FOOTER LINKS ── */}
                <div className="h-px mx-6 bg-gradient-to-r from-transparent via-stone-200/60 dark:via-slate-700/40 to-transparent" />
                <div className="px-6 py-4 flex items-center gap-4 flex-wrap">
                  {item.wikipedia_slug && (
                    <a
                      className="inline-flex items-center gap-1.5 text-xs text-stone-400 dark:text-slate-500 hover:text-amber-700 dark:hover:text-[#c9a55c] transition-colors"
                      href={`https://en.wikipedia.org/wiki/${item.wikipedia_slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Wikipedia <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {providersLink && (
                    <a
                      className="inline-flex items-center gap-1.5 text-xs text-stone-400 dark:text-slate-500 hover:text-amber-700 dark:hover:text-[#c9a55c] transition-colors"
                      href={providersLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      TMDB <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Poster Lightbox Modal — unchanged */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            aria-label="Close lightbox"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxImage}
            alt={item?.title ?? 'Media poster'}
            loading="lazy"
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

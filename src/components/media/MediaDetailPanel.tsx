'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, X, Link2, ChevronRight } from 'lucide-react';
import type { MediaItem } from '@/lib/media';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';
import { FigureThumbnail } from '@/components/rankings/FigureThumbnail';
import { Skeleton } from '@/components/ui/skeleton';
import { MODEL_ICONS, SOURCE_LABELS } from '@/types';

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

  useEffect(() => {
    if (!item?.id) {
      setRelatedFigures([]);
      return;
    }
    const controller = new AbortController();
    const fetchLinks = async () => {
      setLinksLoading(true);
      try {
        const res = await fetch(`/api/media-links?mediaId=${encodeURIComponent(item.id)}`, { signal: controller.signal });
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
        const res = await fetch(`/api/media-sources?mediaId=${encodeURIComponent(item.id)}`, { signal: controller.signal });
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
        const res = await fetch(`/api/media/providers?mediaId=${encodeURIComponent(item.id)}`, {
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
          <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-slate-700 px-6 py-4 bg-gradient-to-b from-white dark:from-slate-800 to-[#faf9f7] dark:to-slate-900">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-400 dark:text-slate-500">Media detail</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-2 text-stone-500 dark:text-slate-400 transition-colors hover:text-stone-800 dark:hover:text-slate-200"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
            {loading && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-stone-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 p-4 sm:p-5 shadow-sm">
                  <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                    <Skeleton className="h-[140px] w-[100px] sm:h-[180px] sm:w-[120px] rounded-lg mx-auto sm:mx-0" />
                    <div className="flex-1 space-y-3">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-8 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <div className="flex gap-2 pt-2">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <Skeleton className="h-9 w-9 rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </div>
            )}

            {!loading && !item && (
              <div className="text-sm text-stone-500 dark:text-slate-400">No media item selected.</div>
            )}

            {!loading && item && (
              <>
                <div className="rounded-2xl border border-stone-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 p-4 sm:p-5 shadow-sm">
                  <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                    <div className="flex-shrink-0 mx-auto sm:mx-0">
                      <MediaThumbnail
                        mediaId={item.id}
                        wikipediaSlug={item.wikipedia_slug}
                        title={item.title}
                        size={140}
                        variant="poster"
                        className="border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-md"
                        onClick={(url) => setLightboxImage(url)}
                      />
                    </div>
                    <div className="space-y-3 text-center sm:text-left">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-400 dark:text-slate-500">Media Atlas</div>
                        <h2 className="text-xl sm:text-2xl font-serif text-stone-900 dark:text-amber-100">{item.title}</h2>
                        <div className="text-sm text-stone-500 dark:text-slate-400">
                          {item.release_year ?? '—'} · {item.type}
                          {item.runtime_minutes ? ` · ${item.runtime_minutes} min` : ''}
                          {item.countries && item.countries.length > 0 ? ` · ${item.countries.join(', ')}` : ''}
                        </div>
                      </div>
                      {isBookType(item.type) ? (
                        /* Book purchase links */
                        <div className="flex items-center gap-2 sm:gap-3 justify-center sm:justify-start flex-wrap">
                          <span className="text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Buy</span>
                          <div className="flex items-center gap-2">
                            {getBookPurchaseLinks(item.title).map((link) => (
                              <a
                                key={link.name}
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                className="h-9 px-3 rounded-full border border-stone-200 dark:border-slate-600 bg-white/90 dark:bg-slate-700/90 shadow-sm flex items-center justify-center gap-1.5 transition-all hover:scale-105 hover:shadow-md hover:border-stone-300 dark:hover:border-slate-500"
                                title={`Buy on ${link.name}`}
                              >
                                <span
                                  className="w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold text-white"
                                  style={{ backgroundColor: link.color }}
                                >
                                  {link.name.charAt(0)}
                                </span>
                                <span className="text-xs text-stone-600 dark:text-slate-300">{link.name}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Streaming providers for films/series */
                        <div className="flex items-center gap-2 sm:gap-3 justify-center sm:justify-start flex-wrap">
                          <span className="text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Streaming</span>
                          {providersLoading ? (
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-9 w-9 rounded-full" />
                              <Skeleton className="h-9 w-9 rounded-full" />
                              <Skeleton className="h-9 w-9 rounded-full" />
                            </div>
                          ) : providers.length > 0 ? (
                            <div className="flex items-center gap-2">
                              {providers.slice(0, 6).map((provider) => {
                                const content = (
                                  <>
                                    {provider.logoPath ? (
                                      <img
                                        src={`https://image.tmdb.org/t/p/w45${provider.logoPath}`}
                                        alt={provider.name}
                                        loading="lazy"
                                        className="h-6 w-6 rounded-full object-contain"
                                      />
                                    ) : (
                                      <span className="text-[9px] uppercase text-stone-500 dark:text-slate-400">
                                        {provider.name.slice(0, 2)}
                                      </span>
                                    )}
                                  </>
                                );
                                return provider.url ? (
                                  <a
                                    key={provider.id}
                                    href={provider.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="h-9 w-9 rounded-full border border-stone-200 dark:border-slate-600 bg-white/90 dark:bg-slate-700/90 shadow-sm flex items-center justify-center transition-all hover:scale-110 hover:shadow-md hover:border-stone-300 dark:hover:border-slate-500"
                                    title={`Watch on ${provider.name}`}
                                  >
                                    {content}
                                  </a>
                                ) : (
                                  <div
                                    key={provider.id}
                                    className="h-9 w-9 rounded-full border border-stone-200 dark:border-slate-600 bg-white/90 dark:bg-slate-700/90 shadow-sm flex items-center justify-center"
                                    title={provider.name}
                                  >
                                    {content}
                                  </div>
                                );
                              })}
                              {providers.length > 6 && (
                                <span className="text-xs text-stone-400 dark:text-slate-500">+{providers.length - 6}</span>
                              )}
                              {providersLink && (
                                <a
                                  href={providersLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500 hover:text-stone-700 dark:hover:text-slate-300"
                                >
                                  More
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-stone-400 dark:text-slate-500">Not available</span>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs text-stone-500 dark:text-slate-400">
                        <span className="rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1">{item.primary_era}</span>
                        {item.sub_era && (
                          <span className="rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1">
                            {item.sub_era}
                          </span>
                        )}
                        {item.primary_region && (
                          <span className="rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1">
                            {item.primary_region}
                          </span>
                        )}
                        {item.locale && (
                          <span className="rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1">
                            {item.locale}
                          </span>
                        )}
                        {item.domain && (
                          <span className="rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-1">
                            {item.domain}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {(linksLoading || relatedFigures.length > 0) && (
                  <section className="rounded-2xl border border-stone-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-slate-400">Related figures</div>
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">
                        <Link2 className="h-3 w-3" />
                        HistoryRank
                      </span>
                    </div>
                    {linksLoading && (
                      <div className="mt-3 space-y-2">
                        <Skeleton className="h-14 w-full rounded-xl" />
                        <Skeleton className="h-14 w-full rounded-xl" />
                      </div>
                    )}
                    {!linksLoading && relatedFigures.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {relatedFigures.map((fig) => (
                          <a
                            key={fig.figure_id}
                            href={`/?figure=${encodeURIComponent(fig.figure_id)}`}
                            className="flex items-center gap-3 rounded-xl border border-stone-200/60 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-left transition-colors hover:border-stone-300 dark:hover:border-slate-600 hover:bg-stone-50 dark:hover:bg-slate-700"
                          >
                            <FigureThumbnail
                              figureId={fig.figure_id}
                              wikipediaSlug={null}
                              name={fig.figure_name}
                              size={34}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-stone-800 dark:text-slate-200">{fig.figure_name}</div>
                              <div className="text-xs text-stone-500 dark:text-slate-400">
                                {fig.figure_rank ? `Rank #${Math.round(fig.figure_rank)}` : 'Rank —'}
                              </div>
                            </div>
                            <span className="rounded-full border border-stone-200 dark:border-slate-600 bg-stone-50 dark:bg-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-stone-500 dark:text-slate-400">
                              {fig.relation}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {(sourcesLoading || sourceGroups.length > 0) && (
                  <section className="rounded-2xl border border-stone-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-slate-400">Model ratings</div>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">LLM averages</span>
                    </div>
                    {sourcesLoading && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Skeleton className="h-20 rounded-xl" />
                        <Skeleton className="h-20 rounded-xl" />
                      </div>
                    )}
                    {!sourcesLoading && sourceGroups.length > 0 && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {sourceGroups.map((group) => (
                          <SourceRankingCard key={group.source} group={group} />
                        ))}
                      </div>
                    )}
                  </section>
                )}

                <section className="space-y-3 rounded-2xl border border-stone-200/70 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 p-5 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500 dark:text-slate-400">
                    Summary
                  </h3>
                  {item.summary_paragraphs && item.summary_paragraphs.length > 0 ? (
                    <div className="space-y-4 text-sm leading-relaxed text-stone-700 dark:text-slate-300">
                      {item.summary_paragraphs.map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-600 dark:text-slate-300">{item.wikipedia_extract || item.summary || '—'}</p>
                  )}
                  {item.wikipedia_slug && (
                    <a
                      className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"
                      href={`https://en.wikipedia.org/wiki/${item.wikipedia_slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Read more on Wikipedia <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </section>

                <section className="grid gap-4 rounded-2xl border border-stone-200/70 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 p-5 shadow-sm md:grid-cols-2">
                  {isBookType(item.type) ? (
                    <>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Author</div>
                        <div className="text-sm text-stone-700 dark:text-slate-300">{formatList(item.authors)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Publisher</div>
                        <div className="text-sm text-stone-700 dark:text-slate-300">{item.publisher ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Genre</div>
                        <div className="text-sm text-stone-700 dark:text-slate-300">{formatList(item.genres)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Language</div>
                        <div className="text-sm text-stone-700 dark:text-slate-300">{item.language ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Pages</div>
                        <div className="text-sm text-stone-700 dark:text-slate-300">{item.page_count ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Rating</div>
                        <div className="text-sm text-stone-700 dark:text-slate-300">
                          {item.rating_normalized ? `${item.rating_normalized.toFixed(1)} / 10` : '—'}
                          {item.rating_source ? ` · ${item.rating_source.toUpperCase()}` : ''}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Creators</div>
                        <div className="text-sm text-stone-700 dark:text-slate-300">{formatList(item.creators)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Directors</div>
                        <div className="text-sm text-stone-700 dark:text-slate-300">{formatList(item.directors)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Cast</div>
                        <div className="text-sm text-stone-700 dark:text-slate-300">{formatList(item.cast)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Countries</div>
                        <div className="text-sm text-stone-700 dark:text-slate-300">{formatList(item.countries)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Awards</div>
                        <div className="text-sm text-stone-700 dark:text-slate-300">{formatList(item.awards)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">Ratings</div>
                        <div className="text-sm text-stone-700 dark:text-slate-300">
                          {item.rating_normalized ? `${item.rating_normalized.toFixed(1)} / 10` : '—'}
                          {item.rating_source ? ` · ${item.rating_source.toUpperCase()}` : ''}
                        </div>
                      </div>
                    </>
                  )}
                </section>

                {item.notes && (
                  <section className="rounded-2xl border border-stone-200/80 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 p-4 text-sm text-stone-600 dark:text-slate-300 leading-relaxed">
                    {item.notes}
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Poster Lightbox Modal */}
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

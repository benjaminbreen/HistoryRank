'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, X, Link2 } from 'lucide-react';
import type { MediaItem } from '@/lib/media';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';
import { FigureThumbnail } from '@/components/rankings/FigureThumbnail';

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

function formatScore(value: number | null) {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toFixed(1);
}

function SourceRankingCard({ group }: { group: MediaSourceGroup }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const entries = group.entries ?? [];
  const hasMultiple = entries.length > 1;
  const current = entries[activeIndex] || null;
  const contribution = current?.notes || current?.summary || null;

  const cycleNext = () => {
    if (!hasMultiple || isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % entries.length);
      setIsAnimating(false);
    }, 150);
  };

  useEffect(() => {
    setActiveIndex(0);
  }, [group.source]);

  return (
    <div
      className={`rounded-xl border border-stone-200/80 bg-white p-3 shadow-sm transition-colors ${
        hasMultiple ? 'cursor-pointer hover:border-stone-300' : ''
      }`}
      onClick={hasMultiple ? cycleNext : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-stone-700">{group.source}</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400">
          {group.sample_count} list{group.sample_count > 1 ? 's' : ''}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-stone-500">
        <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 font-mono text-[11px] text-stone-700">
          Acc {formatScore(group.avg_accuracy)}
        </span>
        <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 font-mono text-[11px] text-stone-700">
          Qual {formatScore(group.avg_quality)}
        </span>
        {current?.rank ? (
          <span className="text-[10px] uppercase tracking-[0.16em] text-stone-400">
            #{current.rank}
          </span>
        ) : null}
      </div>
      {contribution && (
        <div className="relative mt-2 overflow-hidden">
          <p
            className={`text-xs leading-relaxed text-stone-500 transition-all duration-150 ease-out ${
              isAnimating ? 'opacity-0 translate-x-3' : 'opacity-100 translate-x-0'
            }`}
          >
            {contribution}
          </p>
        </div>
      )}
      {hasMultiple && (
        <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2">
          <div className="flex items-center gap-1.5">
            {entries.map((_, idx) => (
              <button
                key={`${group.source}-dot-${idx}`}
                onClick={(event) => {
                  event.stopPropagation();
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
                    ? 'h-1.5 w-4 rounded-full bg-stone-400'
                    : 'h-1.5 w-1.5 rounded-full bg-stone-200 hover:bg-stone-300'
                }`}
                aria-label={`View rationale ${idx + 1}`}
              />
            ))}
          </div>
          <span className="text-[10px] text-stone-400">
            {activeIndex + 1}/{entries.length}
          </span>
        </div>
      )}
    </div>
  );
}

export function MediaDetailPanel({ item, open, loading, onClose }: MediaDetailPanelProps) {
  const [relatedFigures, setRelatedFigures] = useState<RelatedFigure[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [sourceGroups, setSourceGroups] = useState<MediaSourceGroup[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

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

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-stone-900/25 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-[44rem] border-l border-stone-200 bg-[#faf9f7] shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-stone-200/80 px-6 py-4 bg-gradient-to-b from-white to-[#faf9f7]">
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-400">Media detail</div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-stone-200 bg-white p-2 text-stone-500 transition-colors hover:text-stone-800"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8">
            {loading && (
              <div className="text-sm text-stone-500">Loading details...</div>
            )}

            {!loading && !item && (
              <div className="text-sm text-stone-500">No media item selected.</div>
            )}

            {!loading && item && (
              <>
                <div className="rounded-2xl border border-stone-200/80 bg-white/90 p-5 shadow-sm">
                  <div className="flex gap-6">
                    <MediaThumbnail
                      mediaId={item.id}
                      wikipediaSlug={item.wikipedia_slug}
                      title={item.title}
                      size={132}
                      className="border border-stone-200 bg-white shadow-sm"
                    />
                    <div className="space-y-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-400">Media Atlas</div>
                        <h2 className="text-2xl font-serif text-stone-900">{item.title}</h2>
                        <div className="text-sm text-stone-500">
                          {item.release_year ?? '—'} · {item.type}
                          {item.runtime_minutes ? ` · ${item.runtime_minutes} min` : ''}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-stone-500">
                        <span className="rounded-full border border-stone-200 bg-white px-3 py-1">{item.primary_era}</span>
                        {item.sub_era && (
                          <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
                            {item.sub_era}
                          </span>
                        )}
                        {item.primary_region && (
                          <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
                            {item.primary_region}
                          </span>
                        )}
                        {item.locale && (
                          <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
                            {item.locale}
                          </span>
                        )}
                        {item.domain && (
                          <span className="rounded-full border border-stone-200 bg-white px-3 py-1">
                            {item.domain}
                          </span>
                        )}
                      </div>
                      {item.wikipedia_slug && (
                        <a
                          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-stone-500 hover:text-stone-800"
                          href={`https://en.wikipedia.org/wiki/${item.wikipedia_slug}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Wikipedia <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {(linksLoading || relatedFigures.length > 0) && (
                  <section className="rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Related figures</div>
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-stone-400">
                        <Link2 className="h-3 w-3" />
                        HistoryRank
                      </span>
                    </div>
                    {linksLoading && (
                      <div className="mt-3 text-xs text-stone-400">Loading related figures...</div>
                    )}
                    {!linksLoading && relatedFigures.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {relatedFigures.map((fig) => (
                          <a
                            key={fig.figure_id}
                            href={`/?figure=${encodeURIComponent(fig.figure_id)}`}
                            className="flex items-center gap-3 rounded-xl border border-stone-200/60 bg-white px-3 py-2 text-left transition-colors hover:border-stone-300 hover:bg-stone-50"
                          >
                            <FigureThumbnail
                              figureId={fig.figure_id}
                              wikipediaSlug={null}
                              name={fig.figure_name}
                              size={34}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-stone-800">{fig.figure_name}</div>
                              <div className="text-xs text-stone-500">
                                {fig.figure_rank ? `Rank #${Math.round(fig.figure_rank)}` : 'Rank —'}
                              </div>
                            </div>
                            <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-stone-500">
                              {fig.relation}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {(sourcesLoading || sourceGroups.length > 0) && (
                  <section className="rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Model ratings</div>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-stone-400">LLM averages</span>
                    </div>
                    {sourcesLoading && (
                      <div className="mt-3 text-xs text-stone-400">Loading model ratings...</div>
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

                <section className="space-y-3 rounded-2xl border border-stone-200/70 bg-white/90 p-5 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500">
                    Summary
                  </h3>
                  {item.summary_paragraphs && item.summary_paragraphs.length > 0 ? (
                    <div className="space-y-4 text-sm leading-relaxed text-stone-700">
                      {item.summary_paragraphs.map((paragraph, index) => (
                        <p key={index}>{paragraph}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-600">{item.wikipedia_extract || item.summary || '—'}</p>
                  )}
                </section>

                <section className="grid gap-4 rounded-2xl border border-stone-200/70 bg-white/90 p-5 shadow-sm md:grid-cols-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400">Creators</div>
                    <div className="text-sm text-stone-700">{formatList(item.creators)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400">Directors</div>
                    <div className="text-sm text-stone-700">{formatList(item.directors)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400">Cast</div>
                    <div className="text-sm text-stone-700">{formatList(item.cast)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400">Countries</div>
                    <div className="text-sm text-stone-700">{formatList(item.countries)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400">Awards</div>
                    <div className="text-sm text-stone-700">{formatList(item.awards)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-stone-400">Ratings</div>
                    <div className="text-sm text-stone-700">
                      {item.rating_normalized ? `${item.rating_normalized.toFixed(1)} / 10` : '—'}
                      {item.rating_source ? ` · ${item.rating_source.toUpperCase()}` : ''}
                    </div>
                  </div>
                </section>

                {item.notes && (
                  <section className="rounded-2xl border border-stone-200/80 bg-white/80 p-4 text-sm text-stone-600 leading-relaxed">
                    {item.notes}
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

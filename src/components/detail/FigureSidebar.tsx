'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import Link from 'next/link';
import { MapPin, ExternalLink, Share2 } from 'lucide-react';
import { BadgeDisplay } from '@/components/rankings/BadgeDisplay';
import { Tooltip } from '@/components/ui/tooltip';
import { ShareDialog } from '@/components/share/ShareDialog';
import { RankSeal } from './RankSeal';
import { REGION_COLORS } from '@/types';
import type { Figure, WikipediaData, RelatedMediaItem } from '@/types';
import type { BadgeType } from '@/types';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';
import { formatYear, formatAlias } from '@/lib/utils/figureFormatters';

const BirthplaceGlobe = lazy(() => import('./BirthplaceGlobe').then(m => ({ default: m.BirthplaceGlobe })));

interface FigureSidebarProps {
  figure: Figure;
  aliases: string[];
  badges: BadgeType[];
  wiki: WikipediaData | null;
  relatedMedia: RelatedMediaItem[];
  mediaLoading: boolean;
}

export function FigureSidebar({ figure, aliases, badges, wiki, relatedMedia, mediaLoading }: FigureSidebarProps) {
  const [localThumbExt, setLocalThumbExt] = useState<number>(0);
  const [localThumbFailed, setLocalThumbFailed] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);

  useEffect(() => {
    if (!imageModalOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setImageModalOpen(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [imageModalOpen]);

  const localThumbExts = ['jpg', 'png', 'webp'];
  const localThumbUrl = !localThumbFailed
    ? `/thumbnails/${figure.id}.${localThumbExts[localThumbExt]}`
    : null;
  const llmRank = figure.llmConsensusRank != null ? Math.round(figure.llmConsensusRank) : null;

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/figure/${figure.id}` : '';

  return (
    <div className="space-y-5">
      {/* Portrait */}
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 relative">
          {localThumbUrl && !localThumbFailed ? (
            <img
              src={localThumbUrl}
              alt={figure.canonicalName}
              loading="lazy"
              className="w-48 h-64 object-cover rounded-xl shadow-lg ring-1 ring-stone-200/50 cursor-pointer transition-transform duration-200 hover:scale-[1.03]"
              onClick={() => setImageModalOpen(true)}
              onError={() => {
                if (localThumbExt < 2) {
                  setLocalThumbExt(localThumbExt + 1);
                } else {
                  setLocalThumbFailed(true);
                }
              }}
            />
          ) : wiki?.thumbnail ? (
            <img
              src={wiki.thumbnail.source}
              alt={figure.canonicalName}
              loading="lazy"
              className="w-48 h-64 object-cover rounded-xl shadow-lg ring-1 ring-stone-200/50 cursor-pointer transition-transform duration-200 hover:scale-[1.03]"
              onClick={() => setImageModalOpen(true)}
            />
          ) : (
            <div className="w-48 h-64 rounded-xl bg-gradient-to-br from-stone-100 to-stone-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center shadow-inner">
              <span className="text-6xl font-serif text-stone-400 dark:text-slate-500">
                {figure.canonicalName.charAt(0)}
              </span>
            </div>
          )}
          {llmRank != null && (
            <div className="pointer-events-none absolute -bottom-3 -right-3">
              <RankSeal rank={llmRank} domain={figure.domain} size={66} />
            </div>
          )}
        </div>

        <h1 className="font-serif text-2xl font-semibold text-stone-900 dark:text-amber-100 leading-tight [text-wrap:balance]">
          {figure.canonicalName}
        </h1>

        {figure.occupation && (
          <p className="mt-1 font-serif text-[0.92rem] uppercase tracking-[0.105em] leading-none first-letter:text-[1.14em] first-letter:tracking-[0.018em] text-stone-700 dark:text-amber-200/90">
            {figure.occupation}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2 text-sm text-stone-600 dark:text-slate-400">
          {formatYear(figure.birthYear) && (
            <span>{formatYear(figure.birthYear)}</span>
          )}
          {figure.deathYear && (
            <>
              <span className="text-stone-300 dark:text-slate-600">—</span>
              <span>{formatYear(figure.deathYear)}</span>
            </>
          )}
        </div>

        {figure.regionSub && (
          <span
            className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: REGION_COLORS[figure.regionSub] || '#9ca3af' }}
          >
            {figure.regionSub}
          </span>
        )}
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="flex justify-center">
          <BadgeDisplay badges={badges} maxVisible={6} />
        </div>
      )}

      {/* Aliases */}
      {aliases.length > 0 && (
        <div className="rounded-xl border border-stone-200/70 bg-white/90 dark:bg-slate-800/80 dark:border-slate-700 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-stone-400/85 dark:text-amber-600/80 mb-2">
            Also known as
          </div>
          <div className="flex flex-wrap gap-1.5">
            {aliases.slice(0, 8).map((alias) => (
              <span
                key={alias}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-stone-100 dark:bg-slate-700 text-xs text-stone-600 dark:text-slate-300"
              >
                {formatAlias(alias)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Geography */}
      {(figure.birthPlace || figure.birthPolity || figure.birthLat !== null) && (
        <div className="rounded-xl border border-stone-200/70 bg-white/90 dark:bg-slate-800/80 dark:border-slate-700 p-3">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-3.5 h-3.5 text-stone-400 dark:text-slate-500" />
            <span className="text-[10px] uppercase tracking-[0.14em] text-stone-400/85 dark:text-amber-600/80 font-medium">
              Geography
            </span>
          </div>
          <div className="space-y-1.5 text-sm">
            {figure.birthPlace && (
              <div className="flex justify-between gap-3">
                <span className="text-stone-400 dark:text-slate-500 text-xs">Birthplace</span>
                <span className="text-stone-700 dark:text-slate-300 text-right text-xs">{figure.birthPlace}</span>
              </div>
            )}
            {figure.birthPolity && (
              <div className="flex justify-between gap-3">
                <span className="text-stone-400 dark:text-slate-500 text-xs">Polity</span>
                <span className="text-stone-700 dark:text-slate-300 text-right text-xs">{figure.birthPolity}</span>
              </div>
            )}
            {figure.birthLat !== null && figure.birthLon !== null && (
              <div className="flex justify-between gap-3">
                <span className="text-stone-400 dark:text-slate-500 text-xs">Coordinates</span>
                <span className="text-stone-700 dark:text-slate-300 font-mono text-[11px]">
                  {Math.abs(figure.birthLat).toFixed(2)}&deg; {figure.birthLat >= 0 ? 'N' : 'S'},{' '}
                  {Math.abs(figure.birthLon!).toFixed(2)}&deg; {figure.birthLon! >= 0 ? 'E' : 'W'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Globe */}
      {figure.birthLat !== null && figure.birthLon !== null && (
        <Suspense fallback={
          <div className="w-full h-[200px] rounded-xl bg-stone-100 dark:bg-slate-800 animate-pulse flex items-center justify-center">
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

      {/* Related Figures */}
      {figure.relatedFigures && figure.relatedFigures.length > 0 && (
        <div className="rounded-xl border border-stone-200/70 bg-white/90 dark:bg-slate-800/80 dark:border-slate-700 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-stone-400/85 dark:text-amber-600/80 mb-2">
            Related figures
          </div>
          <div className="flex flex-wrap gap-2">
            {figure.relatedFigures.slice(0, 6).map((related) => (
              <Tooltip
                key={related.id}
                content={
                  <div className="text-center">
                    <div className="font-medium">{related.name}</div>
                    <div className="text-xs text-stone-400 capitalize">{related.relationship}</div>
                  </div>
                }
              >
                <Link
                  href={`/figure/${related.id}`}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-stone-100 dark:bg-slate-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors group"
                >
                  <div className="w-5 h-5 rounded-full overflow-hidden ring-1 ring-stone-200 dark:ring-slate-600 flex-shrink-0">
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
                        }
                      }}
                    />
                  </div>
                  <span className="text-xs text-stone-600 dark:text-slate-300 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors max-w-[100px] truncate">
                    {related.name}
                  </span>
                </Link>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {/* Related Media */}
      {(mediaLoading || relatedMedia.length > 0) && (
        <div className="rounded-xl border border-stone-200/70 bg-white/90 dark:bg-slate-800/80 dark:border-slate-700 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-stone-400/85 dark:text-amber-600/80 mb-2">
            Related media
          </div>
          {mediaLoading ? (
            <div className="space-y-2">
              <div className="h-10 w-full rounded-lg bg-stone-100 dark:bg-slate-700 animate-pulse" />
              <div className="h-10 w-full rounded-lg bg-stone-100 dark:bg-slate-700 animate-pulse" />
            </div>
          ) : (
            <div className="space-y-1.5">
              {relatedMedia.map((media) => (
                <a
                  key={media.id}
                  href={`/media?media=${encodeURIComponent(media.id)}`}
                  className="flex items-center gap-2.5 rounded-lg border border-stone-200/60 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-left transition-colors hover:border-stone-300 dark:hover:border-slate-600"
                >
                  <MediaThumbnail
                    mediaId={media.id}
                    wikipediaSlug={media.wikipedia_slug}
                    title={media.title}
                    size={32}
                    className="border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-700"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-stone-800 dark:text-slate-200">{media.title}</div>
                    <div className="text-[10px] text-stone-500 dark:text-slate-400">
                      {media.release_year ?? '—'} · {media.type}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* External links */}
      <div className="flex items-center gap-2">
        {figure.wikipediaSlug && (
          <a
            href={`https://en.wikipedia.org/wiki/${figure.wikipediaSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-stone-200 dark:border-slate-700 text-xs font-medium text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 transition-colors"
          >
            Wikipedia <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <button
          onClick={() => setShareOpen(true)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-stone-200 dark:border-slate-700 text-xs font-medium text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 transition-colors"
        >
          Share <Share2 className="w-3 h-3" />
        </button>
      </div>

      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        url={shareUrl}
        title={figure.canonicalName}
      />

      {/* Image lightbox modal */}
      {imageModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
          onClick={() => setImageModalOpen(false)}
        >
          <img
            src={localThumbUrl && !localThumbFailed ? localThumbUrl : wiki?.thumbnail?.source || ''}
            alt={figure.canonicalName}
            className="max-h-[85vh] max-w-[90vw] rounded-xl shadow-2xl ring-1 ring-white/10 object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

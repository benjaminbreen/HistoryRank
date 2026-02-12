'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { MediaExplorer } from '@/components/media/MediaExplorer';
import { MediaDetailPanel } from '@/components/media/MediaDetailPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings } from '@/hooks/useSettings';
import type { MediaItem } from '@/lib/media';

type MediaResponse = { items: MediaItem[] };

function MediaLoading() {
  return (
    <div className="min-h-screen overflow-x-clip bg-transparent text-stone-900 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="h-24 w-full max-w-3xl" />
          <Skeleton className="h-[360px] w-full" />
        </div>
      </div>
    </div>
  );
}

function MediaPageContent() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const fetchMedia = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch('/api/media?mode=list', { signal: controller.signal });
        if (!res.ok) {
          setErrorMessage(`Failed to load media list (${res.status}).`);
          setItems([]);
          return;
        }
        const data: MediaResponse = await res.json();
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('Failed to load media list:', error);
        setItems([]);
        setErrorMessage('Failed to load media list.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMedia();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const mediaId = searchParams.get('media');
    if (mediaId) {
      setSelectedId(mediaId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedItem(null);
      return;
    }

    const controller = new AbortController();
    const fetchDetail = async () => {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/media?mode=detail&id=${encodeURIComponent(selectedId)}`, { signal: controller.signal });
        if (!res.ok) {
          setSelectedItem(null);
          return;
        }
        const data = await res.json();
        setSelectedItem(data?.item ?? null);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('Failed to load media detail:', error);
        setSelectedItem(null);
      } finally {
        setDetailLoading(false);
      }
    };

    fetchDetail();
    return () => controller.abort();
  }, [selectedId]);

  return (
    <div className="min-h-screen overflow-x-clip bg-transparent text-stone-900 dark:text-slate-100">
      <AppHeader
        active="media"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />
      <main className="mx-auto max-w-7xl overflow-x-clip px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-serif text-stone-900 dark:text-amber-100">Historical Media Atlas</h1>
          <div className="mt-1.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
            <div className="max-w-2xl text-sm text-stone-500 dark:text-slate-400 leading-relaxed space-y-0.5 min-w-0">
              <p>Curated films, series, podcasts, and books that deepen historical understanding.</p>
              <p>Entries marked <span className="text-amber-600 dark:text-amber-400">★</span> are personal recommendations by <a href="/about#team" className="underline hover:text-stone-700 dark:hover:text-slate-200">this site&apos;s author</a>.</p>
              <p>Entries marked <span className="text-sky-500 dark:text-sky-400">★</span> are recommendations of individual UCSC history students.</p>
            </div>
            {/* Desktop stats — hidden on mobile */}
            {!isLoading && items.length > 0 && (
              <div className="hidden sm:block flex-shrink-0">
                {(() => {
                  const counts: Record<string, number> = {};
                  for (const item of items) {
                    const t = item.type?.toLowerCase() ?? '';
                    if (t.includes('series') || t.includes('tv') || t.includes('miniseries')) counts['series'] = (counts['series'] ?? 0) + 1;
                    else if (t.includes('game')) counts['games'] = (counts['games'] ?? 0) + 1;
                    else if (t.includes('book') || t.includes('fiction') || t.includes('nonfiction') || t.includes('graphic')) counts['books'] = (counts['books'] ?? 0) + 1;
                    else if (t.includes('podcast')) counts['podcasts'] = (counts['podcasts'] ?? 0) + 1;
                    else if (t.includes('musical')) counts['musicals'] = (counts['musicals'] ?? 0) + 1;
                    else if (t.includes('film') || t.includes('documentary') || t.includes('movie')) counts['films'] = (counts['films'] ?? 0) + 1;
                    else counts['films'] = (counts['films'] ?? 0) + 1;
                  }
                  const row1 = [
                    { label: 'total', value: items.length },
                    { label: 'films', value: counts['films'] ?? 0 },
                    { label: 'series', value: counts['series'] ?? 0 },
                  ].filter(s => s.value > 0);
                  const row2 = [
                    { label: 'games', value: counts['games'] ?? 0 },
                    { label: 'books', value: counts['books'] ?? 0 },
                    { label: 'podcasts', value: counts['podcasts'] ?? 0 },
                  ].filter(s => s.value > 0);
                  const renderRow = (stats: typeof row1) =>
                    stats.map((s, i) => (
                      <div key={s.label} className="flex items-center gap-3">
                        {i > 0 && <div className="h-4 w-px bg-stone-300 dark:bg-slate-600" />}
                        <div className="flex items-baseline gap-1">
                          <span className="font-mono text-lg font-semibold text-stone-900 dark:text-amber-100">{s.value}</span>
                          <span className="text-xs text-stone-500 dark:text-slate-400">{s.label}</span>
                        </div>
                      </div>
                    ));
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center gap-4 justify-end">{renderRow(row1)}</div>
                      {row2.length > 0 && (
                        <>
                          <div className="h-px bg-stone-200 dark:bg-slate-700" />
                          <div className="flex items-center gap-4 justify-end">{renderRow(row2)}</div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-[360px] w-full" />
          </div>
        ) : (
          <MediaExplorer
            items={items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            density={settings.density}
            fontScale={settings.fontScale}
            thumbnailSize={settings.thumbnailSize}
          />
        )}
        <MediaDetailPanel
          item={selectedItem}
          open={Boolean(selectedId)}
          loading={detailLoading}
          onClose={() => setSelectedId(null)}
          onNext={() => {
            if (!selectedId || items.length === 0) return;
            const currentIndex = items.findIndex((i) => i.id === selectedId);
            if (currentIndex === -1) return;
            const nextIndex = (currentIndex + 1) % items.length;
            setSelectedId(items[nextIndex].id);
          }}
          onPrevious={() => {
            if (!selectedId || items.length === 0) return;
            const currentIndex = items.findIndex((i) => i.id === selectedId);
            if (currentIndex === -1) return;
            const prevIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
            setSelectedId(items[prevIndex].id);
          }}
        />
      </main>
    </div>
  );
}

export default function MediaPage() {
  return (
    <Suspense fallback={<MediaLoading />}>
      <MediaPageContent />
    </Suspense>
  );
}

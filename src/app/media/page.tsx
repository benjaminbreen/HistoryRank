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
    <div className="min-h-screen bg-[#f8f5ef] text-stone-900">
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
        const res = await fetch('/api/media', { signal: controller.signal });
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
        const res = await fetch(`/api/media/${encodeURIComponent(selectedId)}`, { signal: controller.signal });
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
    <div className="min-h-screen bg-[#f8f5ef] text-stone-900">
      <AppHeader
        active="media"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-6 sm:mb-10 space-y-3 sm:space-y-4">
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.3em] text-stone-400">Historical Media Atlas</p>
          <h1 className="text-2xl sm:text-3xl font-serif text-stone-900 md:text-4xl">Historical Media Atlas</h1>
          <p className="max-w-3xl text-sm text-stone-600 leading-relaxed">
            A curated list of films, series, and podcasts that can deepen historical understanding.
            These works are not substitutes for primary sources or scholarly reading, but they can
            illuminate eras, places, and themes in ways that spark further inquiry.
          </p>
          <p className="max-w-3xl text-sm text-stone-500 leading-relaxed">
            Recommendations are welcome at <a className="underline" href="mailto:bebreen@ucsc.edu">bebreen@ucsc.edu</a>.
            Entries marked as recommended reflect personal favorites and standout teaching material.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-[360px] w-full" />
          </div>
        ) : (
          <MediaExplorer items={items} selectedId={selectedId} onSelect={setSelectedId} />
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

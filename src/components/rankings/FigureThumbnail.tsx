'use client';

import { useState, memo } from 'react';
import useSWR from 'swr';
import { fetcher, swrConfig } from '@/lib/swr';

interface FigureThumbnailProps {
  figureId?: string;
  wikipediaSlug: string | null;
  name: string;
  size?: number;
  className?: string;
}

interface LoadState {
  key: string;
  localAttempt: number;
  localExhausted: boolean;
  remoteFailed: boolean;
}

const INITIAL_LOAD_STATE: Omit<LoadState, 'key'> = { localAttempt: 0, localExhausted: false, remoteFailed: false };

interface WikipediaThumbnailResponse {
  thumbnail?: { source?: string } | null;
}

export const FigureThumbnail = memo(function FigureThumbnail({ figureId, wikipediaSlug, name, size = 32, className }: FigureThumbnailProps) {
  // Load state belongs to one (figureId, slug) pair; a different pair starts fresh
  // without needing an effect to reset it.
  const stateKey = `${figureId ?? ''}|${wikipediaSlug ?? ''}`;
  const [loadState, setLoadState] = useState<LoadState>({ key: stateKey, ...INITIAL_LOAD_STATE });
  const current: LoadState = loadState.key === stateKey ? loadState : { key: stateKey, ...INITIAL_LOAD_STATE };
  const { localAttempt, localExhausted, remoteFailed } = current;
  const updateLoadState = (patch: Partial<Omit<LoadState, 'key'>>) =>
    setLoadState({ key: stateKey, localAttempt, localExhausted, remoteFailed, ...patch });

  // 96px webp variant first (one request, ~2KB); the originals stay as fallbacks
  // for figures whose variant hasn't been generated yet (see npm run thumbnails).
  const localSources = figureId
    ? [
        `/thumbnails-sm/${figureId}.webp`,
        `/thumbnails/${figureId}.jpg`,
        `/thumbnails/${figureId}.png`,
        `/thumbnails/${figureId}.webp`,
      ]
    : [];
  const hasLocalSources = localSources.length > 0;
  const localUrl = hasLocalSources && !localExhausted ? localSources[localAttempt] : null;

  // Wikipedia is only consulted when there is no figureId to look up locally.
  // SWR shares the request and result between rows and across remounts.
  const needsRemote = !hasLocalSources && !!wikipediaSlug;
  const { data: remoteData, error: remoteError, isLoading: remoteLoading } = useSWR<WikipediaThumbnailResponse>(
    needsRemote ? `/api/wikipedia?slug=${encodeURIComponent(wikipediaSlug)}` : null,
    fetcher,
    { ...swrConfig, dedupingInterval: 600000, shouldRetryOnError: false, revalidateIfStale: false },
  );
  const remoteUrl = remoteData?.thumbnail?.source ?? null;
  const imageUrl = hasLocalSources ? localUrl : (remoteFailed ? null : remoteUrl);

  // Placeholder with initials
  const initials = name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (needsRemote && remoteLoading) {
    return (
      <div
        className={`rounded-full bg-stone-200 dark:bg-slate-700 animate-pulse flex-shrink-0 transition-transform duration-200 ${className ?? ''}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (!imageUrl || remoteError) {
    return (
      <div
        className={`rounded-full bg-stone-200 dark:bg-slate-700 flex items-center justify-center text-stone-500 dark:text-slate-300 text-xs font-medium flex-shrink-0 transition-transform duration-200 ${className ?? ''}`}
        style={{ width: size, height: size }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={`rounded-full object-cover flex-shrink-0 transition-transform duration-200 ${className ?? ''}`}
      style={{ width: size, height: size }}
      onError={() => {
        if (localUrl && localAttempt < localSources.length - 1) {
          updateLoadState({ localAttempt: localAttempt + 1 });
          return;
        }
        if (localUrl) {
          updateLoadState({ localExhausted: true });
          return;
        }
        updateLoadState({ remoteFailed: true });
      }}
    />
  );
});

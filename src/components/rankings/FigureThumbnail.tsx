'use client';

import { useState, useEffect, memo } from 'react';

interface FigureThumbnailProps {
  figureId?: string;
  wikipediaSlug: string | null;
  name: string;
  size?: number;
  className?: string;
}

export const FigureThumbnail = memo(function FigureThumbnail({ figureId, wikipediaSlug, name, size = 32, className }: FigureThumbnailProps) {
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [localAttempt, setLocalAttempt] = useState(0);

  const localSources = figureId
    ? [
        `/thumbnails/${figureId}.jpg`,
        `/thumbnails/${figureId}.png`,
        `/thumbnails/${figureId}.webp`,
      ]
    : [];
  const localUrl = localAttempt < localSources.length ? localSources[localAttempt] : null;
  const imageUrl = localUrl ?? remoteUrl;

  useEffect(() => {
    setRemoteUrl(null);
    setLoading(false);
    setError(false);
    setLocalAttempt(0);
  }, [figureId, wikipediaSlug]);

  useEffect(() => {
    if (localUrl) return;

    if (!wikipediaSlug) {
      setError(true);
      return;
    }

    const fetchThumbnail = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/wikipedia?slug=${encodeURIComponent(wikipediaSlug)}`);
        const data = await res.json();
        if (data.thumbnail?.source) {
          setRemoteUrl(data.thumbnail.source);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchThumbnail();
  }, [localUrl, wikipediaSlug]);

  // Placeholder with initials
  const initials = name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (loading) {
    return (
      <div
        className={`rounded-full bg-stone-200 animate-pulse flex-shrink-0 transition-transform duration-200 ${className ?? ''}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (error || !imageUrl) {
    return (
      <div
        className={`rounded-full bg-stone-200 flex items-center justify-center text-stone-500 text-xs font-medium flex-shrink-0 transition-transform duration-200 ${className ?? ''}`}
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
      loading="lazy"
      className={`rounded-full object-cover flex-shrink-0 transition-transform duration-200 ${className ?? ''}`}
      style={{ width: size, height: size }}
      onError={() => {
        if (localUrl && localAttempt < localSources.length - 1) {
          setLocalAttempt((prev) => prev + 1);
          return;
        }
        setError(true);
      }}
    />
  );
});

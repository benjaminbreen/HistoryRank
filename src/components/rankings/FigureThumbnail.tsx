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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [localAttempt, setLocalAttempt] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (figureId) {
      if (localAttempt === 0) {
        setImageUrl(`/thumbnails/${figureId}.jpg`);
        return;
      }
      if (localAttempt === 1) {
        setImageUrl(`/thumbnails/${figureId}.png`);
        return;
      }
      if (localAttempt === 2) {
        setImageUrl(`/thumbnails/${figureId}.webp`);
        return;
      }
    }

    if (!wikipediaSlug) {
      setError(true);
      return;
    }

    const fetchThumbnail = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/wikipedia/${encodeURIComponent(wikipediaSlug)}`);
        const data = await res.json();
        if (data.thumbnail?.source) {
          setImageUrl(data.thumbnail.source);
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
  }, [wikipediaSlug, figureId, localAttempt]);

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
      className={`rounded-full object-cover flex-shrink-0 transition-transform duration-200 ${className ?? ''}`}
      style={{ width: size, height: size }}
      onError={() => {
        if (figureId && localAttempt < 2) {
          setLocalAttempt((localAttempt + 1) as 1 | 2);
          return;
        }
        setError(true);
      }}
    />
  );
});

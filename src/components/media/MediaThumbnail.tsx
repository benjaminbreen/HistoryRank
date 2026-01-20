'use client';

import { memo, useEffect, useState } from 'react';

interface MediaThumbnailProps {
  mediaId?: string;
  wikipediaSlug?: string | null;
  title: string;
  size?: number;
  className?: string;
  variant?: 'circle' | 'poster';
  onClick?: (imageUrl: string) => void;
}

export const MediaThumbnail = memo(function MediaThumbnail({
  mediaId,
  wikipediaSlug,
  title,
  size = 36,
  className,
  variant = 'circle',
  onClick,
}: MediaThumbnailProps) {
  const isPoster = variant === 'poster';
  const posterHeight = isPoster ? Math.round(size * 1.5) : size;
  const roundedClass = isPoster ? 'rounded-lg' : 'rounded-full';
  const clickableClass = onClick ? 'cursor-pointer transition-transform hover:scale-105 hover:shadow-lg' : '';
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [localAttempt, setLocalAttempt] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (mediaId) {
      if (localAttempt === 0) {
        setImageUrl(`/media-thumbnails/${mediaId}.jpg`);
        return;
      }
      if (localAttempt === 1) {
        setImageUrl(`/media-thumbnails/${mediaId}.png`);
        return;
      }
      if (localAttempt === 2) {
        setImageUrl(`/media-thumbnails/${mediaId}.webp`);
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
  }, [wikipediaSlug, mediaId, localAttempt]);

  const initials = title
    .split(' ')
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (loading) {
    return (
      <div
        className={`${roundedClass} bg-stone-200 animate-pulse flex-shrink-0 ${className ?? ''}`}
        style={{ width: size, height: posterHeight }}
      />
    );
  }

  if (error || !imageUrl) {
    return (
      <div
        className={`${roundedClass} bg-stone-200 flex items-center justify-center text-stone-500 text-xs font-medium flex-shrink-0 ${className ?? ''}`}
        style={{ width: size, height: posterHeight }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={title}
      loading="lazy"
      className={`${roundedClass} object-cover flex-shrink-0 ${clickableClass} ${className ?? ''}`}
      style={{ width: size, height: posterHeight }}
      onClick={onClick ? () => onClick(imageUrl) : undefined}
      onError={() => {
        if (mediaId && localAttempt < 2) {
          setLocalAttempt((localAttempt + 1) as 1 | 2);
          return;
        }
        setError(true);
      }}
    />
  );
});

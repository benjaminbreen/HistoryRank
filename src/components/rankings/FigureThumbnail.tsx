'use client';

import { useState, useEffect } from 'react';

interface FigureThumbnailProps {
  wikipediaSlug: string | null;
  name: string;
  size?: number;
}

export function FigureThumbnail({ wikipediaSlug, name, size = 32 }: FigureThumbnailProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
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
  }, [wikipediaSlug]);

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
        className="rounded-full bg-stone-200 animate-pulse flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  if (error || !imageUrl) {
    return (
      <div
        className="rounded-full bg-stone-200 flex items-center justify-center text-stone-500 text-xs font-medium flex-shrink-0"
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
      className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  );
}

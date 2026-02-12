'use client';

import useSWR from 'swr';
import { fetcher, figureDetailConfig, swrConfig } from '@/lib/swr';
import type {
  Figure,
  Ranking,
  FigureDetailResponse,
  FigureEvidenceResponse,
  FigureNeighbor,
  WikipediaData,
  RelatedMediaItem,
} from '@/types';

interface MediaLinksResponse {
  items: RelatedMediaItem[];
}

export interface UseFigureDataReturn {
  figure: Figure | null;
  rankings: Ranking[];
  aliases: string[];
  neighbors: { prev: FigureNeighbor | null; next: FigureNeighbor | null };
  evidence: FigureEvidenceResponse | null;
  wiki: WikipediaData | null;
  relatedMedia: RelatedMediaItem[];
  loading: {
    figure: boolean;
    evidence: boolean;
    wiki: boolean;
    media: boolean;
  };
  errors: {
    figure: Error | undefined;
    evidence: Error | undefined;
    wiki: Error | undefined;
    media: Error | undefined;
  };
}

export function useFigureData(id: string | null | undefined): UseFigureDataReturn {
  // Figure + rankings + aliases
  const {
    data: detailData,
    isLoading: figureLoading,
    error: figureError,
  } = useSWR<FigureDetailResponse>(
    id ? `/api/figures/${id}` : null,
    fetcher,
    { ...figureDetailConfig, dedupingInterval: 300000 },
  );

  const figure = detailData?.figure ?? null;
  const rankings = detailData?.rankings ?? [];
  const aliases = detailData?.aliases ?? [];
  const neighbors = detailData?.neighbors ?? { prev: null, next: null };
  const wikiSlug = figure?.wikipediaSlug;

  // Evidence data
  const {
    data: evidenceData,
    isLoading: evidenceLoading,
    error: evidenceError,
  } = useSWR<FigureEvidenceResponse>(
    id ? `/api/figures/${id}/evidence` : null,
    fetcher,
    { ...swrConfig, dedupingInterval: 300000 },
  );

  // Wikipedia data
  const {
    data: wikiData,
    isLoading: wikiLoading,
    error: wikiError,
  } = useSWR<WikipediaData>(
    wikiSlug ? `/api/wikipedia?slug=${encodeURIComponent(wikiSlug)}` : null,
    fetcher,
    { ...swrConfig, dedupingInterval: 600000 },
  );

  // Related media
  const {
    data: mediaData,
    isLoading: mediaLoading,
    error: mediaError,
  } = useSWR<MediaLinksResponse>(
    id ? `/api/media?mode=links&figureId=${encodeURIComponent(id)}` : null,
    fetcher,
    { ...swrConfig, dedupingInterval: 300000 },
  );

  return {
    figure,
    rankings,
    aliases,
    neighbors,
    evidence: evidenceData ?? null,
    wiki: wikiData ?? null,
    relatedMedia: Array.isArray(mediaData?.items) ? mediaData.items : [],
    loading: {
      figure: figureLoading,
      evidence: evidenceLoading,
      wiki: wikiLoading,
      media: mediaLoading,
    },
    errors: {
      figure: figureError,
      evidence: evidenceError,
      wiki: wikiError,
      media: mediaError,
    },
  };
}

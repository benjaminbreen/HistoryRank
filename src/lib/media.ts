import fs from 'fs';
import path from 'path';

export type MediaItem = {
  id: string;
  title: string;
  type: string;
  release_year?: number;
  depicted_start_year?: number | null;
  depicted_end_year?: number | null;
  eras_depicted: string[];
  regions_depicted: string[];
  primary_era: string;
  sub_era?: string;
  primary_region: string;
  locale?: string;
  domain?: string;
  recommended?: boolean;
  tags?: string[];
  notes?: string;
  wikipedia_slug?: string;
  summary?: string;
  llm_accuracy_rank?: number | null;
  llm_quality_rank?: number | null;
  llm_accuracy_score?: number | null;
  llm_quality_score?: number | null;
  llm_accuracy_count?: number | null;
  llm_quality_count?: number | null;
  llm_inclusion_count?: number | null;
  rating_source?: string | null;
  rating_raw_value?: number | null;
  rating_raw_scale?: number | null;
  rating_normalized?: number | null;
  rating_count?: number | null;
  // Book-specific fields
  authors?: string[] | null;
  publisher?: string | null;
  page_count?: number | null;
  genres?: string[] | null;
  language?: string | null;
};

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function loadMediaItems(): MediaItem[] {
  if (!fs.existsSync(MEDIA_PATH)) return [];
  const raw = fs.readFileSync(MEDIA_PATH, 'utf-8');
  const seenIds = new Map<string, number>();
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const item = JSON.parse(line) as Omit<MediaItem, 'id'> & { id?: string };
      const baseId = item.id ?? slugify(item.title);
      const nextCount = (seenIds.get(baseId) ?? 0) + 1;
      seenIds.set(baseId, nextCount);
      const id = nextCount > 1 ? `${baseId}-${nextCount}` : baseId;
      const eras = Array.isArray(item.eras_depicted) ? item.eras_depicted : [];
      const regions = Array.isArray(item.regions_depicted) ? item.regions_depicted : [];
      return {
        ...item,
        id,
        eras_depicted: eras,
        regions_depicted: regions,
        primary_era: item.primary_era ?? eras[0] ?? 'Unknown',
        primary_region: item.primary_region ?? regions[0] ?? 'Unknown',
      };
    });
}

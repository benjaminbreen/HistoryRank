import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

type LinkEntry = {
  figure_id: string;
  figure_name: string;
  relation: string;
  confidence: number;
  source: string;
  figure_rank: number | null;
};

type MediaLinkItem = {
  media_id: string;
  title: string;
  type: string;
  release_year: number | null;
  links: LinkEntry[];
};

type MediaLinksData = {
  items: MediaLinkItem[];
};

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');
const LINKS_PATH = path.join(process.cwd(), 'data', 'media-figure-links.suggestions.json');

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function loadMediaMap() {
  const raw = fs.readFileSync(MEDIA_PATH, 'utf8');
  const seenIds = new Map<string, number>();
  const map = new Map<string, any>();

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const item = JSON.parse(trimmed);
    const baseId = item.id || slugify(item.title || '');
    const nextCount = (seenIds.get(baseId) || 0) + 1;
    seenIds.set(baseId, nextCount);
    const id = nextCount > 1 ? `${baseId}-${nextCount}` : baseId;
    map.set(id, { ...item, id });
  }

  return map;
}

function loadLinks(): MediaLinksData {
  return JSON.parse(fs.readFileSync(LINKS_PATH, 'utf8'));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const figureId = searchParams.get('figureId');
  const mediaId = searchParams.get('mediaId');

  if (!figureId && !mediaId) {
    return NextResponse.json({ error: 'Missing figureId or mediaId.' }, { status: 400 });
  }

  const data = loadLinks();

  if (mediaId) {
    const match = data.items.find((item) => item.media_id === mediaId);
    return NextResponse.json({ items: match ? match.links : [] });
  }

  const mediaMap = loadMediaMap();
  const results = data.items
    .map((item) => {
      const link = item.links.find((entry) => entry.figure_id === figureId);
      if (!link) return null;
      const media = mediaMap.get(item.media_id);
      if (!media) return null;
      return {
        id: media.id,
        title: media.title,
        type: media.type,
        release_year: media.release_year ?? null,
        wikipedia_slug: media.wikipedia_slug ?? null,
        primary_era: media.primary_era ?? null,
        sub_era: media.sub_era ?? null,
        primary_region: media.primary_region ?? null,
        domain: media.domain ?? null,
        relation: link.relation ?? 'about',
      };
    })
    .filter(Boolean);

  return NextResponse.json({ items: results });
}

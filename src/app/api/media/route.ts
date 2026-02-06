import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { loadMediaItems } from '@/lib/media';
import { loadMediaEmbeddings, embedQuery, normalizeVector, dot } from '@/lib/embeddings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MediaDetail = ReturnType<typeof loadMediaItems>[number] & {
  wikipedia_extract?: string | null;
  summary_paragraphs?: string[];
  wikidata_qid?: string | null;
  directors?: string[];
  creators?: string[];
  cast?: string[];
  countries?: string[];
  awards?: string[];
  runtime_minutes?: number | null;
};

type LinkEntry = {
  figure_id: string;
  figure_name: string;
  relation: string;
  confidence: number;
  source: string;
  figure_rank: number | null;
};

type MediaLinksData = {
  items: Array<{
    media_id: string;
    title: string;
    type: string;
    release_year: number | null;
    links: LinkEntry[];
  }>;
};

type MediaSourceEntry = {
  rank: number | null;
  accuracy: number | null;
  quality: number | null;
  notes: string | null;
  summary: string | null;
};

type MediaSourceGroup = {
  source: string;
  avg_accuracy: number | null;
  avg_quality: number | null;
  sample_count: number;
  entries: MediaSourceEntry[];
};

type Provider = {
  id: number;
  name: string;
  logoPath: string | null;
  type: string;
  url: string | null;
};

const CACHE_PATH = path.join(process.cwd(), 'data', 'cache', 'media-details.json');
const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');
const LINKS_PATH = path.join(process.cwd(), 'data', 'media-figure-links.suggestions.json');
const RAW_DIR = path.join(process.cwd(), 'data', 'raw', 'media');

const PROVIDER_URL_TEMPLATES: Record<number, (title: string) => string> = {
  8: (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
  9: (t) => `https://www.amazon.com/s?k=${encodeURIComponent(t)}&i=instant-video`,
  10: (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
  15: (t) => `https://www.hulu.com/search?q=${encodeURIComponent(t)}`,
  337: (t) => `https://www.disneyplus.com/search?q=${encodeURIComponent(t)}`,
  1899: (t) => `https://www.max.com/search?q=${encodeURIComponent(t)}`,
  386: (t) => `https://www.peacocktv.com/search?q=${encodeURIComponent(t)}`,
  531: (t) => `https://www.paramountplus.com/search/?q=${encodeURIComponent(t)}`,
  350: (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
  387: (t) => `https://www.peacocktv.com/search?q=${encodeURIComponent(t)}`,
  526: (t) => `https://www.amazon.com/s?k=${encodeURIComponent(t)}&i=instant-video`,
  1770: (t) => `https://www.paramountplus.com/search/?q=${encodeURIComponent(t)}`,
  2: (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
  3: (t) => `https://play.google.com/store/search?q=${encodeURIComponent(t)}&c=movies`,
  192: (t) => `https://www.youtube.com/results?search_query=${encodeURIComponent(t)}+full+movie`,
  7: (t) => `https://vudu.com/content/movies/search?searchString=${encodeURIComponent(t)}`,
};

const sourceCache = {
  mediaById: null as Map<string, { id: string; title: string; release_year?: number | null }> | null,
  byKey: null as Map<string, string> | null,
  sourcesByMediaId: null as Map<string, MediaSourceGroup[]> | null,
};

function loadCache(): Record<string, MediaDetail> {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as Record<string, MediaDetail>;
  } catch {
    return {};
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getSourceLabel(filename: string) {
  const match = filename.match(/^(.+?)\s+(?:MEDIA\s+)?LIST/i);
  if (!match) return filename.replace(/\.(json|txt)$/i, '');
  return match[1].trim();
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

function loadMediaIndex() {
  if (sourceCache.mediaById && sourceCache.byKey) return;
  const raw = fs.readFileSync(MEDIA_PATH, 'utf8');
  const seenIds = new Map<string, number>();
  const mediaById = new Map<string, { id: string; title: string; release_year?: number | null }>();
  const byKey = new Map<string, string>();

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const item = JSON.parse(trimmed);
    const title = typeof item.title === 'string' ? item.title : '';
    if (!title) continue;
    const baseId = item.id || slugify(title);
    const nextCount = (seenIds.get(baseId) || 0) + 1;
    seenIds.set(baseId, nextCount);
    const id = nextCount > 1 ? `${baseId}-${nextCount}` : baseId;
    const releaseYear = typeof item.release_year === 'number' ? item.release_year : null;
    mediaById.set(id, { id, title, release_year: releaseYear });
    const key = `${normalizeTitle(title)}::${releaseYear ?? ''}`;
    if (!byKey.has(key)) byKey.set(key, id);
  }

  sourceCache.mediaById = mediaById;
  sourceCache.byKey = byKey;
}

function loadSources() {
  if (sourceCache.sourcesByMediaId) return;
  loadMediaIndex();
  const byKey = sourceCache.byKey!;
  const sourcesByMediaId = new Map<string, MediaSourceGroup[]>();

  const files = fs.readdirSync(RAW_DIR).filter((file) => /MEDIA LIST/i.test(file));
  for (const file of files) {
    const filePath = path.join(RAW_DIR, file);
    let parsed: any[] = [];
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const source = getSourceLabel(file);

    for (const entry of parsed) {
      const title = typeof entry.title === 'string' ? entry.title : '';
      const releaseYear = typeof entry.release_year === 'number' ? entry.release_year : null;
      if (!title || releaseYear === null) continue;
      const key = `${normalizeTitle(title)}::${releaseYear}`;
      const mediaId = byKey.get(key);
      if (!mediaId) continue;

      const record: MediaSourceEntry = {
        rank: typeof entry.rank === 'number' ? entry.rank : null,
        accuracy: typeof entry.llm_accuracy_score === 'number' ? entry.llm_accuracy_score : null,
        quality: typeof entry.llm_quality_score === 'number' ? entry.llm_quality_score : null,
        notes: typeof entry.notes === 'string' ? entry.notes : null,
        summary: typeof entry.summary === 'string' ? entry.summary : null,
      };

      const groups = sourcesByMediaId.get(mediaId) || [];
      let group = groups.find((g) => g.source === source);
      if (!group) {
        group = { source, avg_accuracy: null, avg_quality: null, sample_count: 0, entries: [] };
        groups.push(group);
      }
      group.entries.push(record);
      group.sample_count += 1;
      if (record.accuracy !== null) {
        const prev = group.avg_accuracy ?? 0;
        group.avg_accuracy = Math.round(((prev * (group.sample_count - 1)) + record.accuracy) / group.sample_count * 10) / 10;
      }
      if (record.quality !== null) {
        const prev = group.avg_quality ?? 0;
        group.avg_quality = Math.round(((prev * (group.sample_count - 1)) + record.quality) / group.sample_count * 10) / 10;
      }
      sourcesByMediaId.set(mediaId, groups);
    }
  }

  sourceCache.sourcesByMediaId = sourcesByMediaId;
}

function pickType(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes('tv') || normalized.includes('series') || normalized.includes('miniseries')) {
    return 'tv';
  }
  return 'movie';
}

function selectProviders(entry: any, title: string) {
  if (!entry) return [];
  const buckets = ['flatrate', 'free', 'ads', 'buy', 'rent'];
  const seen = new Set<number>();
  const providers: Provider[] = [];
  for (const bucket of buckets) {
    const list = Array.isArray(entry[bucket]) ? entry[bucket] : [];
    for (const item of list) {
      if (!item?.provider_id || seen.has(item.provider_id)) continue;
      seen.add(item.provider_id);
      const urlTemplate = PROVIDER_URL_TEMPLATES[item.provider_id];
      providers.push({
        id: item.provider_id,
        name: item.provider_name ?? 'Unknown',
        logoPath: item.logo_path ?? null,
        type: bucket,
        url: urlTemplate ? urlTemplate(title) : null,
      });
    }
  }
  return providers;
}

async function fetchJson(url: string) {
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`TMDb request failed (${res.status})`);
  return res.json();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'list';

  if (mode === 'detail') {
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const items = loadMediaItems();
    const item = items.find((entry) => entry.id === id);
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const cache = loadCache();
    const detail = cache[id];

    return NextResponse.json({
      item: {
        ...item,
        ...(detail ?? {}),
      },
    });
  }

  if (mode === 'links') {
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

  if (mode === 'sources') {
    const mediaId = searchParams.get('mediaId');
    if (!mediaId) {
      return NextResponse.json({ error: 'Missing mediaId.' }, { status: 400 });
    }
    loadSources();
    const groups = sourceCache.sourcesByMediaId?.get(mediaId) || [];
    return NextResponse.json({ items: groups });
  }

  if (mode === 'providers') {
    const mediaId = searchParams.get('mediaId');
    const region = searchParams.get('region') || 'US';
    const apiKey = process.env.TMDB_API_KEY;

    if (!mediaId) {
      return NextResponse.json({ providers: [] });
    }
    if (!apiKey) {
      return NextResponse.json({ providers: [], error: 'TMDB_API_KEY not set' }, { status: 500 });
    }

    const items = loadMediaItems();
    const item = items.find((entry) => entry.id === mediaId);
    if (!item) {
      return NextResponse.json({ providers: [] }, { status: 404 });
    }

    const type = pickType(item.type);
    const query = encodeURIComponent(item.title);
    const yearParam = item.release_year
      ? type === 'tv'
        ? `&first_air_date_year=${item.release_year}`
        : `&year=${item.release_year}`
      : '';

    const searchUrl = `https://api.themoviedb.org/3/search/${type}?api_key=${apiKey}&query=${query}${yearParam}`;
    const searchData = await fetchJson(searchUrl);
    const result = Array.isArray(searchData?.results) ? searchData.results[0] : null;
    if (!result?.id) {
      return NextResponse.json({ providers: [], tmdbId: null });
    }

    const providersUrl = `https://api.themoviedb.org/3/${type}/${result.id}/watch/providers?api_key=${apiKey}`;
    const providersData = await fetchJson(providersUrl);
    const entry = providersData?.results?.[region] || providersData?.results?.US || null;
    const providers = selectProviders(entry, item.title);

    return NextResponse.json({
      tmdbId: result.id,
      link: entry?.link ?? null,
      providers,
    });
  }

  if (mode === 'search') {
    const query = (searchParams.get('q') || '').trim();
    if (!query) {
      return NextResponse.json({ items: [], scores: {} });
    }

    const items = loadMediaItems();

    // --- Lexical scoring ---
    const searchLower = query.toLowerCase();
    const lexicalScores = new Map<string, number>();
    for (const item of items) {
      let score = 0;
      const title = (item.title ?? '').toLowerCase();
      const summary = (item.summary ?? '').toLowerCase();
      const notes = (item.notes ?? '').toLowerCase();
      const tags = (item.tags ?? []).join(' ').toLowerCase();
      const type = (item.type ?? '').toLowerCase();
      const era = (item.primary_era ?? '').toLowerCase();
      const region = (item.primary_region ?? '').toLowerCase();
      const domain = (item.domain ?? '').toLowerCase();
      const subEra = (item.sub_era ?? '').toLowerCase();

      if (title.includes(searchLower)) score += 4.0;
      if (tags.includes(searchLower)) score += 2.5;
      if (type.includes(searchLower)) score += 2.0;
      if (domain.includes(searchLower)) score += 1.5;
      if (era.includes(searchLower)) score += 1.5;
      if (subEra.includes(searchLower)) score += 1.5;
      if (region.includes(searchLower)) score += 1.0;
      if (summary.includes(searchLower)) score += 1.0;
      if (notes.includes(searchLower)) score += 0.5;

      // Multi-word: check each word
      const words = searchLower.split(/\s+/).filter((w) => w.length > 1);
      if (words.length > 1) {
        for (const word of words) {
          if (title.includes(word)) score += 1.0;
          if (tags.includes(word)) score += 0.8;
          if (summary.includes(word)) score += 0.3;
        }
      }

      if (score > 0) lexicalScores.set(item.id, score);
    }

    // --- Semantic scoring ---
    const smart = searchParams.get('smart') !== 'false';
    let semanticScores = new Map<string, number>();
    if (smart && process.env.OPENAI_API_KEY) {
      try {
        const embeddingsIndex = loadMediaEmbeddings();
        if (embeddingsIndex) {
          const queryEmbedding = normalizeVector(await embedQuery(query));
          semanticScores = new Map(
            embeddingsIndex.items.map((entry) => [entry.id, dot(entry.vector, queryEmbedding)])
          );
        }
      } catch (error) {
        console.warn('[media-search] Semantic search failed, using lexical only', error);
      }
    }

    // --- Combine scores ---
    const allIds = new Set([...lexicalScores.keys(), ...semanticScores.keys()]);
    const maxLexical = Math.max(...Array.from(lexicalScores.values()), 0.001);
    const maxSemantic = Math.max(...Array.from(semanticScores.values()), 0.001);

    const hasSemanticScores = semanticScores.size > 0;
    const semanticWeight = hasSemanticScores ? 0.7 : 0;
    const lexicalWeight = hasSemanticScores ? 0.3 : 1.0;

    const combinedScores = new Map<string, number>();
    for (const id of allIds) {
      const lexNorm = (lexicalScores.get(id) ?? 0) / maxLexical;
      const semNorm = (semanticScores.get(id) ?? 0) / maxSemantic;
      combinedScores.set(id, lexNorm * lexicalWeight + semNorm * semanticWeight);
    }

    // If semantic only (no lexical hits), include all items with semantic scores
    if (hasSemanticScores && lexicalScores.size === 0) {
      for (const [id, score] of semanticScores) {
        if (!combinedScores.has(id)) {
          const semNorm = score / maxSemantic;
          if (semNorm > 0.3) combinedScores.set(id, semNorm * semanticWeight);
        }
      }
    }

    // Sort by combined score, return top results
    const ranked = Array.from(combinedScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100);

    const itemMap = new Map(items.map((i) => [i.id, i]));
    const resultItems = ranked
      .map(([id]) => itemMap.get(id))
      .filter((i): i is NonNullable<typeof i> => i != null);

    const scores: Record<string, number> = {};
    for (const [id, score] of ranked) {
      scores[id] = Math.round(score * 1000) / 1000;
    }

    return NextResponse.json({ items: resultItems, scores });
  }

  const items = loadMediaItems();
  return NextResponse.json({ items });
}

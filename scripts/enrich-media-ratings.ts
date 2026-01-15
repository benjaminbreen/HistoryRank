import fs from 'fs';
import path from 'path';

function loadEnvFile(fileName: string) {
  const envPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');

type MediaItem = {
  id?: string;
  title: string;
  type: string;
  release_year?: number;
  rating_source?: string | null;
  rating_raw_value?: number | null;
  rating_raw_scale?: number | null;
  rating_normalized?: number | null;
  rating_count?: number | null;
};

type RatingRecord = {
  rating_source: string;
  rating_raw_value: number;
  rating_raw_scale: number;
  rating_normalized: number;
  rating_count?: number | null;
};

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');
const CACHE_PATH = path.join(process.cwd(), 'data', 'cache', 'media-ratings.json');

function getEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function loadCache(): Record<string, RatingRecord> {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')) as Record<string, RatingRecord>;
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, RatingRecord>) {
  ensureDir(CACHE_PATH);
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function toNormalized(value: number, scale: number) {
  if (scale === 10) return Math.round(value * 10) / 10;
  return Math.round((value / scale) * 10 * 10) / 10;
}

function getCategory(type: string) {
  const value = normalizeTitle(type);
  if (value === 'film') return 'film';
  if (value === 'series' || value === 'miniseries' || value === 'tv') return 'tv';
  if (value === 'documentary') return 'documentary';
  if (value === 'book' || value === 'novel' || value === 'fiction') return 'book';
  if (value === 'podcast') return 'podcast';
  if (value === 'game') return 'game';
  return 'other';
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return res.json() as Promise<any>;
}

async function fetchTmdbRating(item: MediaItem): Promise<RatingRecord | null> {
  const apiKey = getEnv('TMDB_API_KEY');
  const title = encodeURIComponent(item.title);
  const year = item.release_year ?? undefined;
  const category = getCategory(item.type);

  const candidates: any[] = [];

  if (category === 'film' || category === 'documentary') {
    const params = new URLSearchParams({ api_key: apiKey, query: item.title });
    if (year) params.set('year', String(year));
    const json = await fetchJson(`https://api.themoviedb.org/3/search/movie?${params.toString()}`);
    candidates.push(...(json.results ?? []).map((result: any) => ({ ...result, __type: 'movie' })));
  }

  if (category === 'tv') {
    const params = new URLSearchParams({ api_key: apiKey, query: item.title });
    if (year) params.set('first_air_date_year', String(year));
    const json = await fetchJson(`https://api.themoviedb.org/3/search/tv?${params.toString()}`);
    candidates.push(...(json.results ?? []).map((result: any) => ({ ...result, __type: 'tv' })));
  }

  if (!candidates.length) return null;

  const normalizedTitle = normalizeTitle(item.title);
  const scored = candidates.map((result) => {
    const candidateTitle = normalizeTitle(result.title || result.name || '');
    let score = 0;
    if (candidateTitle === normalizedTitle) score += 3;
    if (candidateTitle.includes(normalizedTitle) || normalizedTitle.includes(candidateTitle)) score += 1;
    if (year) {
      const date = (result.release_date || result.first_air_date || '').slice(0, 4);
      if (date && Number(date) === year) score += 2;
    }
    score += (result.popularity ?? 0) / 1000;
    return { result, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.result;
  if (!best || typeof best.vote_average !== 'number') return null;

  const rating_raw_value = Number(best.vote_average);
  const rating_count = typeof best.vote_count === 'number' ? best.vote_count : null;
  return {
    rating_source: 'tmdb',
    rating_raw_value,
    rating_raw_scale: 10,
    rating_normalized: toNormalized(rating_raw_value, 10),
    rating_count,
  };
}

async function fetchGoogleBooksRating(item: MediaItem): Promise<RatingRecord | null> {
  const apiKey = getEnv('GOOGLE_BOOKS_API_KEY');
  const query = encodeURIComponent(`intitle:${item.title}`);
  const url = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=5&key=${apiKey}`;
  const json = await fetchJson(url);
  const items = json.items ?? [];
  if (!items.length) return null;

  const normalizedTitle = normalizeTitle(item.title);
  const scored = items.map((entry: any) => {
    const info = entry.volumeInfo || {};
    const candidateTitle = normalizeTitle(info.title || '');
    let score = 0;
    if (candidateTitle === normalizedTitle) score += 3;
    if (candidateTitle.includes(normalizedTitle) || normalizedTitle.includes(candidateTitle)) score += 1;
    if (item.release_year && info.publishedDate) {
      const year = Number(String(info.publishedDate).slice(0, 4));
      if (year === item.release_year) score += 2;
    }
    score += (info.ratingsCount ?? 0) / 1000;
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.entry?.volumeInfo;
  if (!best || typeof best.averageRating !== 'number') return null;

  const rating_raw_value = Number(best.averageRating);
  const rating_count = typeof best.ratingsCount === 'number' ? best.ratingsCount : null;
  return {
    rating_source: 'googlebooks',
    rating_raw_value,
    rating_raw_scale: 5,
    rating_normalized: toNormalized(rating_raw_value, 5),
    rating_count,
  };
}

async function getRating(item: MediaItem): Promise<RatingRecord | null> {
  const category = getCategory(item.type);
  if (category === 'film' || category === 'tv' || category === 'documentary') {
    return await fetchTmdbRating(item);
  }
  if (category === 'book') {
    return await fetchGoogleBooksRating(item);
  }
  return null;
}

async function main() {
  if (!fs.existsSync(MEDIA_PATH)) {
    console.error(`Missing media file: ${MEDIA_PATH}`);
    process.exit(1);
  }

  const cache = loadCache();
  const lines = fs.readFileSync(MEDIA_PATH, 'utf-8').trim().split('\n');
  const updated: string[] = [];
  let updatedCount = 0;
  let skipped = 0;

  for (const line of lines) {
    const item = JSON.parse(line) as MediaItem;
    const id = item.id ?? slugify(item.title);
    if (item.rating_normalized) {
      updated.push(JSON.stringify(item));
      skipped++;
      continue;
    }

    if (cache[id]) {
      updated.push(JSON.stringify({ ...item, ...cache[id] }));
      updatedCount++;
      continue;
    }

    try {
      const rating = await getRating(item);
      if (rating) {
        cache[id] = rating;
        updated.push(JSON.stringify({ ...item, ...rating }));
        updatedCount++;
      } else {
        updated.push(JSON.stringify(item));
        skipped++;
      }
    } catch (error) {
      console.error(`Failed rating lookup for ${item.title}:`, error);
      updated.push(JSON.stringify(item));
      skipped++;
    }
  }

  fs.writeFileSync(MEDIA_PATH, `${updated.join('\n')}\n`);
  saveCache(cache);
  console.log(`Ratings updated: ${updatedCount}, skipped: ${skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

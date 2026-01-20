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
  // Book-specific fields
  authors?: string[] | null;
  publisher?: string | null;
  page_count?: number | null;
  genres?: string[] | null;
  language?: string | null;
};

type RatingRecord = {
  rating_source: string;
  rating_raw_value: number;
  rating_raw_scale: number;
  rating_normalized: number;
  rating_count?: number | null;
};

type BookMetadata = {
  authors?: string[] | null;
  publisher?: string | null;
  page_count?: number | null;
  genres?: string[] | null;
  language?: string | null;
};

type BookEnrichment = RatingRecord & BookMetadata;

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

// Language code mapping for common Google Books language codes
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  nl: 'Dutch',
  pl: 'Polish',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  el: 'Greek',
  he: 'Hebrew',
  tr: 'Turkish',
  hi: 'Hindi',
  la: 'Latin',
};

function getLanguageName(code?: string): string | null {
  if (!code) return null;
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

async function fetchGoogleBooksData(item: MediaItem): Promise<BookEnrichment | null> {
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
  if (!best) return null;

  // Extract book metadata
  const authors = Array.isArray(best.authors) && best.authors.length > 0 ? best.authors : null;
  const publisher = typeof best.publisher === 'string' ? best.publisher : null;
  const page_count = typeof best.pageCount === 'number' ? best.pageCount : null;
  const genres = Array.isArray(best.categories) && best.categories.length > 0 ? best.categories : null;
  const language = getLanguageName(best.language);

  // Check if we have a rating
  if (typeof best.averageRating !== 'number') {
    // Return metadata only, no rating
    return {
      rating_source: 'googlebooks',
      rating_raw_value: 0,
      rating_raw_scale: 5,
      rating_normalized: 0,
      rating_count: null,
      authors,
      publisher,
      page_count,
      genres,
      language,
    };
  }

  const rating_raw_value = Number(best.averageRating);
  const rating_count = typeof best.ratingsCount === 'number' ? best.ratingsCount : null;
  return {
    rating_source: 'googlebooks',
    rating_raw_value,
    rating_raw_scale: 5,
    rating_normalized: toNormalized(rating_raw_value, 5),
    rating_count,
    authors,
    publisher,
    page_count,
    genres,
    language,
  };
}

async function fetchOpenLibraryData(item: MediaItem): Promise<BookEnrichment | null> {
  // Search for the book
  const query = encodeURIComponent(item.title);
  const searchUrl = `https://openlibrary.org/search.json?title=${query}&limit=5`;
  const searchJson = await fetchJson(searchUrl);
  const docs = searchJson.docs ?? [];
  if (!docs.length) return null;

  const normalizedTitle = normalizeTitle(item.title);
  const scored = docs.map((doc: any) => {
    const candidateTitle = normalizeTitle(doc.title || '');
    let score = 0;
    if (candidateTitle === normalizedTitle) score += 3;
    if (candidateTitle.includes(normalizedTitle) || normalizedTitle.includes(candidateTitle)) score += 1;
    if (item.release_year && doc.first_publish_year) {
      if (doc.first_publish_year === item.release_year) score += 2;
    }
    score += (doc.ratings_count ?? 0) / 1000;
    return { doc, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.doc;
  if (!best?.key) return null;

  // Extract metadata from search results
  const authors = Array.isArray(best.author_name) && best.author_name.length > 0 ? best.author_name : null;
  const publisher = Array.isArray(best.publisher) && best.publisher.length > 0 ? best.publisher[0] : null;
  const page_count = typeof best.number_of_pages_median === 'number' ? best.number_of_pages_median : null;
  const genres = Array.isArray(best.subject) && best.subject.length > 0 ? best.subject.slice(0, 5) : null;
  const language = Array.isArray(best.language) && best.language.length > 0
    ? getLanguageName(best.language[0])
    : null;

  // Fetch ratings for this work
  const workKey = best.key; // e.g., "/works/OL45804W"
  const ratingsUrl = `https://openlibrary.org${workKey}/ratings.json`;

  try {
    const ratingsJson = await fetchJson(ratingsUrl);
    const summary = ratingsJson.summary;

    if (!summary || typeof summary.average !== 'number' || summary.average === 0) {
      // Return metadata only, no rating
      return {
        rating_source: 'openlibrary',
        rating_raw_value: 0,
        rating_raw_scale: 5,
        rating_normalized: 0,
        rating_count: null,
        authors,
        publisher,
        page_count,
        genres,
        language,
      };
    }

    const rating_raw_value = Number(summary.average);
    const rating_count = typeof summary.count === 'number' ? summary.count : null;
    return {
      rating_source: 'openlibrary',
      rating_raw_value,
      rating_raw_scale: 5,
      rating_normalized: toNormalized(rating_raw_value, 5),
      rating_count,
      authors,
      publisher,
      page_count,
      genres,
      language,
    };
  } catch {
    // Return metadata even if ratings fetch fails
    return {
      rating_source: 'openlibrary',
      rating_raw_value: 0,
      rating_raw_scale: 5,
      rating_normalized: 0,
      rating_count: null,
      authors,
      publisher,
      page_count,
      genres,
      language,
    };
  }
}

async function getEnrichment(item: MediaItem): Promise<RatingRecord | BookEnrichment | null> {
  const category = getCategory(item.type);
  if (category === 'film' || category === 'tv' || category === 'documentary') {
    return await fetchTmdbRating(item);
  }
  if (category === 'book') {
    // Try Google Books first for metadata and rating
    const googleData = await fetchGoogleBooksData(item);
    if (googleData) {
      // If Google Books has a rating, use it
      if (googleData.rating_normalized > 0) {
        return googleData;
      }
      // If no rating but has metadata, try Open Library for rating
      const openLibraryData = await fetchOpenLibraryData(item);
      if (openLibraryData && openLibraryData.rating_normalized > 0) {
        // Merge: prefer Google Books metadata, use Open Library rating
        return {
          ...openLibraryData,
          authors: googleData.authors ?? openLibraryData.authors,
          publisher: googleData.publisher ?? openLibraryData.publisher,
          page_count: googleData.page_count ?? openLibraryData.page_count,
          genres: googleData.genres ?? openLibraryData.genres,
          language: googleData.language ?? openLibraryData.language,
        };
      }
      // Return Google Books data even without rating (has metadata)
      return googleData;
    }
    // Fallback to Open Library entirely
    return await fetchOpenLibraryData(item);
  }
  return null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasBookMetadata(item: MediaItem): boolean {
  return Boolean(item.authors && item.authors.length > 0);
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
  let apiCalls = 0;

  for (const line of lines) {
    const item = JSON.parse(line) as MediaItem;
    const id = item.id ?? slugify(item.title);
    const category = getCategory(item.type);
    const isBook = category === 'book';

    // Skip if already has rating (and for books, also has metadata)
    if (item.rating_normalized && (!isBook || hasBookMetadata(item))) {
      updated.push(JSON.stringify(item));
      skipped++;
      continue;
    }

    // For non-books: check cache
    if (!isBook) {
      const cachedRating = cache[id];
      if (cachedRating) {
        updated.push(JSON.stringify({ ...item, ...cachedRating }));
        updatedCount++;
        continue;
      }
    }

    try {
      // Rate limit: wait 500ms between API calls to avoid 429 errors
      if (apiCalls > 0) {
        await delay(500);
      }
      apiCalls++;

      const enrichment = await getEnrichment(item);
      if (enrichment) {
        // For non-books, cache the rating
        if (!isBook) {
          cache[id] = enrichment as RatingRecord;
        }

        // Build the enriched item, filtering out zero ratings
        const enrichedItem = { ...item };
        if (enrichment.rating_normalized > 0) {
          enrichedItem.rating_source = enrichment.rating_source;
          enrichedItem.rating_raw_value = enrichment.rating_raw_value;
          enrichedItem.rating_raw_scale = enrichment.rating_raw_scale;
          enrichedItem.rating_normalized = enrichment.rating_normalized;
          enrichedItem.rating_count = enrichment.rating_count;
        }

        // Add book metadata if present
        if ('authors' in enrichment) {
          const bookData = enrichment as BookEnrichment;
          if (bookData.authors) enrichedItem.authors = bookData.authors;
          if (bookData.publisher) enrichedItem.publisher = bookData.publisher;
          if (bookData.page_count) enrichedItem.page_count = bookData.page_count;
          if (bookData.genres) enrichedItem.genres = bookData.genres;
          if (bookData.language) enrichedItem.language = bookData.language;
        }

        updated.push(JSON.stringify(enrichedItem));
        updatedCount++;

        const ratingInfo = enrichment.rating_normalized > 0
          ? `${enrichment.rating_normalized}/10`
          : 'no rating';
        const metaInfo = 'authors' in enrichment && enrichment.authors
          ? `, author: ${enrichment.authors[0]}`
          : '';
        console.log(`✓ ${item.title}: ${ratingInfo} (${enrichment.rating_source})${metaInfo}`);
      } else {
        updated.push(JSON.stringify(item));
        skipped++;
        console.log(`○ ${item.title}: no data found`);
      }
    } catch (error) {
      console.error(`✗ ${item.title}: ${(error as Error).message}`);
      updated.push(JSON.stringify(item));
      skipped++;
      // Wait longer after an error
      await delay(2000);
    }
  }

  fs.writeFileSync(MEDIA_PATH, `${updated.join('\n')}\n`);
  saveCache(cache);
  console.log(`Enrichment complete: ${updatedCount} updated, ${skipped} skipped`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * enrich-media-tmdb.ts
 *
 * Pulls rich data from TMDB for every film/TV/documentary in the media collection:
 *   - Plot overview, tagline
 *   - Full cast with character names + profile images
 *   - Full crew (director, writer, composer, cinematographer, etc.)
 *   - Genres, runtime, production companies
 *   - Budget / revenue (when available)
 *
 * Merges results into data/cache/media-details.json alongside existing Wikipedia data.
 *
 * Usage:
 *   npx tsx scripts/enrich-media-tmdb.ts
 *   npx tsx scripts/enrich-media-tmdb.ts --force          # re-fetch even if cached
 *   npx tsx scripts/enrich-media-tmdb.ts --limit=50       # only process first 50
 *   npx tsx scripts/enrich-media-tmdb.ts --offset=100     # start from item 100
 *   npx tsx scripts/enrich-media-tmdb.ts --dry-run        # preview matches without writing
 */

import fs from 'fs';
import path from 'path';

// ── Load env ──────────────────────────────────────────────────────────────────

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
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

// ── Types ─────────────────────────────────────────────────────────────────────

type MediaItem = {
  id?: string;
  title: string;
  type: string;
  release_year?: number;
  wikipedia_slug?: string;
  [key: string]: unknown;
};

type CastMember = {
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
};

type CrewMember = {
  name: string;
  job: string;
  department: string;
};

type TmdbEnrichment = {
  tmdb_id: number;
  tmdb_type: 'movie' | 'tv';
  tmdb_overview: string | null;
  tmdb_tagline: string | null;
  tmdb_genres: string[];
  tmdb_runtime: number | null;
  tmdb_production_companies: string[];
  tmdb_budget: number | null;
  tmdb_revenue: number | null;
  cast_with_roles: CastMember[];
  crew: CrewMember[];
};

type CacheEntry = Record<string, unknown>;

// ── Paths ─────────────────────────────────────────────────────────────────────

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');
const CACHE_PATH = path.join(process.cwd(), 'data', 'cache', 'media-details.json');
const SAVE_EVERY = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickType(type: string): 'movie' | 'tv' | null {
  const lower = type.toLowerCase();
  if (lower === 'film' || lower === 'documentary') return 'movie';
  if (lower === 'series' || lower === 'miniseries' || lower === 'tv') return 'tv';
  return null;
}

// ── TMDB fetch with retry ─────────────────────────────────────────────────────

async function tmdbFetch(url: string, attempt = 1): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HistoryRank/1.0 (media enrichment)' },
  });
  if (res.status === 429 && attempt <= 5) {
    const retryAfter = Number(res.headers.get('retry-after') || '2');
    await delay(Math.max(1000, retryAfter * 1000));
    return tmdbFetch(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${url.split('?')[0]}`);
  return res.json();
}

// ── Search TMDB for a media item ──────────────────────────────────────────────

async function searchTmdb(
  apiKey: string,
  title: string,
  year: number | undefined,
  tmdbType: 'movie' | 'tv',
): Promise<{ id: number; type: 'movie' | 'tv' } | null> {
  const params = new URLSearchParams({ api_key: apiKey, query: title });
  if (year) {
    params.set(tmdbType === 'tv' ? 'first_air_date_year' : 'year', String(year));
  }

  const data = await tmdbFetch(`https://api.themoviedb.org/3/search/${tmdbType}?${params}`);
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return null;

  // Score matches
  const normalizedQuery = normalizeTitle(title);
  const scored = results.map((r: any) => {
    const candidateTitle = normalizeTitle(r.title || r.name || '');
    let score = 0;
    if (candidateTitle === normalizedQuery) score += 5;
    else if (candidateTitle.includes(normalizedQuery) || normalizedQuery.includes(candidateTitle)) score += 2;
    if (year) {
      const dateStr = (r.release_date || r.first_air_date || '').slice(0, 4);
      if (dateStr && Number(dateStr) === year) score += 3;
    }
    score += (r.popularity ?? 0) / 1000;
    return { id: r.id as number, score };
  });

  scored.sort((a: any, b: any) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 1) return null;
  return { id: best.id, type: tmdbType };
}

// ── Fetch full details + credits ──────────────────────────────────────────────

async function fetchTmdbDetails(
  apiKey: string,
  tmdbId: number,
  tmdbType: 'movie' | 'tv',
): Promise<TmdbEnrichment> {
  const base = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}`;

  // Fetch details and credits in parallel
  const [details, credits] = await Promise.all([
    tmdbFetch(`${base}?api_key=${apiKey}`),
    tmdbFetch(`${base}/${tmdbType === 'tv' ? 'aggregate_credits' : 'credits'}?api_key=${apiKey}`),
  ]);

  // Parse cast (top 15)
  const rawCast = Array.isArray(credits?.cast) ? credits.cast : [];
  const castWithRoles: CastMember[] = rawCast.slice(0, 15).map((c: any) => ({
    name: c.name || c.original_name || '',
    character: tmdbType === 'tv'
      ? (c.roles?.[0]?.character || c.character || '')
      : (c.character || ''),
    profile_path: c.profile_path || null,
    order: typeof c.order === 'number' ? c.order : 999,
  }));

  // Parse crew — keep important roles
  const importantJobs = new Set([
    'Director', 'Writer', 'Screenplay', 'Story',
    'Original Music Composer', 'Director of Photography',
    'Producer', 'Executive Producer', 'Creator',
    'Novel', 'Book', 'Characters',
  ]);
  const rawCrew = Array.isArray(credits?.crew) ? credits.crew : [];
  const crew: CrewMember[] = [];
  const seenCrew = new Set<string>();

  for (const c of rawCrew) {
    const job = tmdbType === 'tv' ? (c.jobs?.[0]?.job || c.job || '') : (c.job || '');
    if (!importantJobs.has(job)) continue;
    const key = `${c.name}::${job}`;
    if (seenCrew.has(key)) continue;
    seenCrew.add(key);
    crew.push({
      name: c.name || c.original_name || '',
      job,
      department: c.department || '',
    });
  }

  // Parse genres
  const genres: string[] = (details.genres || []).map((g: any) => g.name).filter(Boolean);

  // Runtime
  let runtime: number | null = null;
  if (tmdbType === 'movie' && typeof details.runtime === 'number') {
    runtime = details.runtime;
  } else if (tmdbType === 'tv' && Array.isArray(details.episode_run_time) && details.episode_run_time.length) {
    runtime = details.episode_run_time[0];
  }

  // Production companies
  const companies: string[] = (details.production_companies || [])
    .map((c: any) => c.name)
    .filter(Boolean)
    .slice(0, 5);

  return {
    tmdb_id: tmdbId,
    tmdb_type: tmdbType,
    tmdb_overview: details.overview || null,
    tmdb_tagline: details.tagline || null,
    tmdb_genres: genres,
    tmdb_runtime: runtime,
    tmdb_production_companies: companies,
    tmdb_budget: typeof details.budget === 'number' && details.budget > 0 ? details.budget : null,
    tmdb_revenue: typeof details.revenue === 'number' && details.revenue > 0 ? details.revenue : null,
    cast_with_roles: castWithRoles,
    crew,
  };
}

// ── Load / save ───────────────────────────────────────────────────────────────

function loadMedia(): MediaItem[] {
  const raw = fs.readFileSync(MEDIA_PATH, 'utf8');
  const seenIds = new Map<string, number>();
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const item = JSON.parse(line) as MediaItem;
      const baseId = item.id || slugify(item.title || '');
      const next = (seenIds.get(baseId) || 0) + 1;
      seenIds.set(baseId, next);
      return { ...item, id: next > 1 ? `${baseId}-${next}` : baseId };
    });
}

function loadCache(): Record<string, CacheEntry> {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CacheEntry>) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const offsetArg = args.find((a) => a.startsWith('--offset='));
  const limit = limitArg ? Number(limitArg.slice(8)) : null;
  const offset = offsetArg ? Number(offsetArg.slice(9)) : 0;

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error('Missing TMDB_API_KEY in environment. Add it to .env.local');
    process.exit(1);
  }

  const items = loadMedia();
  const cache = loadCache();
  const targetItems = limit ? items.slice(offset, offset + limit) : items.slice(offset);

  // Filter to film/TV/documentary only
  const eligible = targetItems.filter((item) => pickType(item.type) !== null);

  console.log(`TMDB enrichment: ${eligible.length} eligible items (of ${targetItems.length} total)`);
  if (dryRun) console.log('(dry run — no writes)\n');

  let enriched = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < eligible.length; i++) {
    const item = eligible[i];
    const id = item.id!;
    const existing = cache[id];

    // Skip if already has TMDB data and not forcing
    if (existing?.tmdb_id && !force) {
      skipped++;
      continue;
    }

    const tmdbType = pickType(item.type)!;
    process.stdout.write(`[${i + 1}/${eligible.length}] ${item.title} (${item.release_year ?? '?'})... `);

    try {
      const match = await searchTmdb(apiKey, item.title, item.release_year, tmdbType);
      if (!match) {
        process.stdout.write('no match\n');
        failed++;
        await delay(250);
        continue;
      }

      if (dryRun) {
        process.stdout.write(`matched TMDB ${match.type}/${match.id}\n`);
        enriched++;
        await delay(100);
        continue;
      }

      const details = await fetchTmdbDetails(apiKey, match.id, match.type);

      // Merge into existing cache entry (preserving Wikipedia data)
      cache[id] = { ...(existing || {}), ...details };
      enriched++;

      const castCount = details.cast_with_roles.length;
      const crewCount = details.crew.length;
      process.stdout.write(`✓ ${castCount} cast, ${crewCount} crew\n`);

      if (enriched % SAVE_EVERY === 0) {
        saveCache(cache);
      }

      // Rate limit: ~250ms between items (3 API calls per item → ~12 req/s, well under TMDB's 40/10s limit)
      await delay(250);
    } catch (error) {
      process.stdout.write(`✗ ${(error as Error).message}\n`);
      failed++;
      await delay(1000);
    }
  }

  if (!dryRun) {
    saveCache(cache);
  }

  console.log(`\nDone: ${enriched} enriched, ${skipped} already cached, ${failed} failed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

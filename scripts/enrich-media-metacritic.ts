/**
 * enrich-media-metacritic.ts
 *
 * Fetches Metacritic user scores for games in the media collection.
 * No API key needed — parses the public Metacritic HTML pages.
 *
 * Usage:
 *   npx tsx scripts/enrich-media-metacritic.ts
 *   npx tsx scripts/enrich-media-metacritic.ts --dry-run    # preview without writing
 *   npx tsx scripts/enrich-media-metacritic.ts --force       # re-fetch even if already rated
 */

import fs from 'fs';
import path from 'path';

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');
const CACHE_PATH = path.join(process.cwd(), 'data', 'cache', 'metacritic-ratings.json');

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
  [key: string]: unknown;
};

type MetacriticRating = {
  rating_source: 'metacritic';
  rating_raw_value: number;
  rating_raw_scale: number;
  rating_normalized: number;
  rating_count: number | null;
  metascore: number | null;
};

// ── Slug generation ──────────────────────────────────────────────────────────

// Known slug overrides for titles that don't slugify cleanly
const SLUG_OVERRIDES: Record<string, string> = {
  'Civilization': 'sid-meiers-civilization',
  'Civilization VI': 'sid-meiers-civilization-vi',
  'Sid Meier\'s Civilization': 'sid-meiers-civilization',
  'Sid Meier\'s Civilization IV': 'sid-meiers-civilization-iv',
  'Sid Meier\'s Civilization VI': 'sid-meiers-civilization-vi',
  'Total War': null as unknown as string, // too generic, skip
  'Crusader Kings': null as unknown as string, // original has no Metacritic page
  'Age of Empires II': 'age-of-empires-ii-the-age-of-kings', // redirects
  'Europa Universalis V': null as unknown as string, // doesn't exist yet
  'Never Alone (Kisima Inŋitchuŋa)': 'never-alone',
  'Assassin\'s Creed: Origins': 'assassins-creed-origins',
  'Assassin\'s Creed Brotherhood': 'assassins-creed-brotherhood',
  'Assassin\'s Creed II': 'assassins-creed-ii',
  'Assassin\'s Creed IV: Black Flag': 'assassins-creed-iv-black-flag',
  'Assassin\'s Creed Unity': 'assassins-creed-unity',
  'L.A. Noire': 'la-noire',
  'Call of Duty: WWII': 'call-of-duty-wwii',
  'Call of Duty: World at War': 'call-of-duty-world-at-war',
  'Total War: Shogun 2': 'total-war-shogun-2',
  'Total War: Rome II': 'total-war-rome-ii',
  'Rome: Total War': 'rome-total-war',
  '1979 Revolution: Black Friday': '1979-revolution-black-friday',
};

function slugify(title: string): string | null {
  // Check overrides first
  if (title in SLUG_OVERRIDES) {
    return SLUG_OVERRIDES[title];
  }

  return title
    .toLowerCase()
    .replace(/['':]/g, '')          // strip apostrophes, colons
    .replace(/[^a-z0-9]+/g, '-')    // non-alphanum → hyphens
    .replace(/(^-|-$)+/g, '');       // trim leading/trailing hyphens
}

// ── Fetching ─────────────────────────────────────────────────────────────────

async function fetchMetacriticPage(slug: string): Promise<string | null> {
  const url = `https://www.metacritic.com/game/${slug}/`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error(`  Fetch error for ${url}: ${(err as Error).message}`);
    return null;
  }
}

function parseMetacriticHtml(html: string): MetacriticRating | null {
  // Extract user score: "User score X.X out of 10"
  const userScoreMatch = html.match(/User score\s+([0-9]+(?:\.[0-9]+)?)\s+out of 10/i);
  if (!userScoreMatch) return null;

  const userScore = parseFloat(userScoreMatch[1]);
  if (!Number.isFinite(userScore) || userScore === 0) return null;

  // Extract user rating count: "Based on N,NNN User"
  let ratingCount: number | null = null;
  const countMatch = html.match(/Based on\s+([0-9,]+)\s+User/i);
  if (countMatch) {
    ratingCount = parseInt(countMatch[1].replace(/,/g, ''), 10);
  }

  // Extract metascore from JSON-LD or text
  let metascore: number | null = null;
  const metascoreMatch = html.match(/"ratingValue"\s*:\s*(\d+)/);
  if (metascoreMatch) {
    metascore = parseInt(metascoreMatch[1], 10);
  }

  return {
    rating_source: 'metacritic',
    rating_raw_value: userScore,
    rating_raw_scale: 10,
    rating_normalized: Math.round(userScore * 10) / 10,
    rating_count: ratingCount,
    metascore,
  };
}

// ── Cache ────────────────────────────────────────────────────────────────────

function loadCache(): Record<string, MetacriticRating> {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, MetacriticRating>) {
  const dir = path.dirname(CACHE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  if (!fs.existsSync(MEDIA_PATH)) {
    console.error(`Missing media file: ${MEDIA_PATH}`);
    process.exit(1);
  }

  const cache = loadCache();
  const lines = fs.readFileSync(MEDIA_PATH, 'utf-8').trim().split('\n');
  const updated: string[] = [];
  let enriched = 0;
  let skipped = 0;
  let failed = 0;
  let cached = 0;
  let apiCalls = 0;

  for (const line of lines) {
    const item = JSON.parse(line) as MediaItem;
    const type = (item.type ?? '').toLowerCase();

    // Only process games
    if (type !== 'game') {
      updated.push(JSON.stringify(item));
      continue;
    }

    // Skip if already rated (unless --force)
    if (!force && item.rating_normalized && item.rating_normalized > 0) {
      updated.push(JSON.stringify(item));
      skipped++;
      continue;
    }

    const slug = slugify(item.title);
    if (!slug) {
      console.log(`⊘ ${item.title}: skipped (no slug mapping)`);
      updated.push(JSON.stringify(item));
      skipped++;
      continue;
    }

    // Check cache
    if (!force && cache[slug]) {
      const rating = cache[slug];
      const enrichedItem = { ...item, ...rating };
      // Remove metascore from item (internal field)
      delete (enrichedItem as Record<string, unknown>).metascore;
      updated.push(JSON.stringify(enrichedItem));
      cached++;
      console.log(`⟳ ${item.title}: ${rating.rating_normalized}/10 (cached)`);
      continue;
    }

    if (dryRun) {
      console.log(`◎ ${item.title} → https://www.metacritic.com/game/${slug}/`);
      updated.push(JSON.stringify(item));
      continue;
    }

    // Rate limit: 1.5s between requests to be polite
    if (apiCalls > 0) {
      await delay(1500);
    }
    apiCalls++;

    const html = await fetchMetacriticPage(slug);
    if (!html) {
      console.log(`✗ ${item.title}: page not found (${slug})`);
      updated.push(JSON.stringify(item));
      failed++;
      continue;
    }

    const rating = parseMetacriticHtml(html);
    if (!rating) {
      console.log(`✗ ${item.title}: no user score found on page`);
      updated.push(JSON.stringify(item));
      failed++;
      continue;
    }

    // Cache result
    cache[slug] = rating;

    // Write to item (exclude metascore from JSONL — keep it in cache only)
    const enrichedItem = {
      ...item,
      rating_source: rating.rating_source,
      rating_raw_value: rating.rating_raw_value,
      rating_raw_scale: rating.rating_raw_scale,
      rating_normalized: rating.rating_normalized,
      rating_count: rating.rating_count,
    };
    updated.push(JSON.stringify(enrichedItem));
    enriched++;

    const meta = rating.metascore ? ` (metascore: ${rating.metascore})` : '';
    const votes = rating.rating_count ? `, ${rating.rating_count.toLocaleString()} votes` : '';
    console.log(`✓ ${item.title}: ${rating.rating_normalized}/10${votes}${meta}`);
  }

  if (!dryRun) {
    fs.writeFileSync(MEDIA_PATH, `${updated.join('\n')}\n`);
    saveCache(cache);
  }

  console.log(`\nDone: ${enriched} enriched, ${cached} from cache, ${skipped} skipped, ${failed} failed`);
  if (dryRun) console.log('(dry run — no files written)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

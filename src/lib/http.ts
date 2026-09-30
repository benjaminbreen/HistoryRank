// The SQLite file is bundled read-only on Vercel, so data cannot change during a
// deployment (and Vercel's CDN cache is scoped per deployment). Locally the DB is
// rewritten by import scripts, so keep short lifetimes there.
export const IS_READONLY_DEPLOY = process.env.VERCEL === '1';

/** In-process cache lifetime for lookups derived from the DB. */
export const DERIVED_CACHE_TTL_MS = IS_READONLY_DEPLOY ? Infinity : 60_000;

/** Cache-Control for JSON derived from the bundled DB. */
export const DATA_CACHE_CONTROL = IS_READONLY_DEPLOY
  ? 'public, s-maxage=86400, stale-while-revalidate=604800'
  : 'public, s-maxage=60, stale-while-revalidate=300';

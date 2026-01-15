const fs = require('node:fs');
const path = require('node:path');
const wikipedia = require('./lib/wikipedia.js');

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');
const CACHE_PATH = path.join(process.cwd(), 'data', 'cache', 'media-details.json');

const MAX_CAST = 6;
const MAX_AWARDS = 5;
const SAVE_EVERY = 20;

function loadMedia() {
  if (!fs.existsSync(MEDIA_PATH)) return [];
  const raw = fs.readFileSync(MEDIA_PATH, 'utf8');
  const seenIds = new Map();
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const item = JSON.parse(line);
      const baseId = item.id || slugify(item.title || '');
      const nextCount = (seenIds.get(baseId) || 0) + 1;
      seenIds.set(baseId, nextCount);
      const id = nextCount > 1 ? `${baseId}-${nextCount}` : baseId;
      return { ...item, id };
    });
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function normalizeSlug(slug) {
  if (!slug) return '';
  try {
    return decodeURIComponent(slug).replace(/ /g, '_');
  } catch {
    return slug.replace(/ /g, '_');
  }
}

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
}

async function fetchSummaryParagraphs(slug) {
  const normalized = normalizeSlug(slug);
  const url = `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(normalized)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'HistoryRank/1.0 (media enrich)' } });
  if (!res.ok) return [];
  const html = await res.text();
  const paragraphs = [];
  const matches = html.match(/<p>(.*?)<\/p>/g) || [];
  for (const match of matches) {
    const clean = stripHtml(match);
    if (!clean || clean.toLowerCase().includes('coordinates')) continue;
    paragraphs.push(clean);
    if (paragraphs.length >= 3) break;
  }
  return paragraphs;
}

async function fetchSummarySafe(slug) {
  try {
    return await wikipedia.fetchWikipediaSummary(slug);
  } catch {
    return null;
  }
}

async function findWikipediaSlug(title) {
  if (!title) return null;
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title)}&format=json&utf8=1`;
  const data = await wikipedia.fetchJson(url);
  const top = data?.query?.search?.[0]?.title;
  if (!top) return null;
  return normalizeSlug(top);
}

function getClaimValues(entity, prop) {
  const claims = entity?.claims?.[prop];
  if (!claims || !claims.length) return [];
  return claims
    .map((claim) => claim?.mainsnak?.datavalue?.value)
    .filter(Boolean);
}

async function getLabels(values) {
  const labels = [];
  for (const value of values) {
    if (value?.id) {
      const entity = await wikipedia.getWikidataEntity(value.id);
      const label = wikipedia.getLabel(entity);
      if (label) labels.push(label);
    } else if (typeof value === 'string') {
      labels.push(value);
    }
  }
  return labels;
}

function getDurationMinutes(entity) {
  const values = getClaimValues(entity, 'P2047');
  if (!values.length) return null;
  const value = values[0];
  if (!value || typeof value !== 'object') return null;
  const amount = Number(String(value.amount || '').replace('+', ''));
  if (!Number.isFinite(amount)) return null;
  const unit = value.unit || '';
  if (unit.includes('Q7727')) return Math.round(amount); // minute
  if (unit.includes('Q25235')) return Math.round(amount * 60); // hour
  return Math.round(amount);
}

async function enrichItem(item) {
  if (!item.wikipedia_slug) return null;
  let normalized = normalizeSlug(item.wikipedia_slug);
  let summary = await fetchSummarySafe(normalized);
  if (!summary) {
    const fallback = await findWikipediaSlug(item.title);
    if (fallback) {
      normalized = fallback;
      summary = await fetchSummarySafe(normalized);
    }
  }
  if (!summary) return null;

  const extract = summary?.extract || null;
  const paragraphs = await fetchSummaryParagraphs(normalized);
  const wikidataQid = await wikipedia.getWikidataIdFromSlug(normalized);
  const entity = wikidataQid ? await wikipedia.getWikidataEntity(wikidataQid) : null;

  const directors = await getLabels(getClaimValues(entity, 'P57')).then((values) => values.slice(0, 2));
  const creators = await getLabels(getClaimValues(entity, 'P170')).then((values) => values.slice(0, 2));
  const cast = await getLabels(getClaimValues(entity, 'P161')).then((values) => values.slice(0, MAX_CAST));
  const countries = await getLabels(getClaimValues(entity, 'P495'));
  const awards = await getLabels(getClaimValues(entity, 'P166')).then((values) => values.slice(0, MAX_AWARDS));
  const runtimeMinutes = getDurationMinutes(entity);

  return {
    wikipedia_extract: extract,
    summary_paragraphs: paragraphs,
    wikidata_qid: wikidataQid,
    wikipedia_slug: normalized,
    directors,
    creators,
    cast,
    countries,
    awards,
    runtime_minutes: runtimeMinutes,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const offsetArg = args.find((arg) => arg.startsWith('--offset='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : null;
  const offset = offsetArg ? Number(offsetArg.slice('--offset='.length)) : 0;
  const items = loadMedia();
  const cache = loadCache();

  let updated = 0;
  let processed = 0;
  const targetItems = limit ? items.slice(offset, offset + limit) : items.slice(offset);
  for (const item of targetItems) {
    if (!item.wikipedia_slug) continue;
    if (cache[item.id] && !force) continue;
    processed += 1;
    process.stdout.write(`[${processed}/${targetItems.length}] ${item.title}... `);
    try {
      const detail = await enrichItem(item);
      if (detail) {
        cache[item.id] = detail;
        updated += 1;
        if (updated % SAVE_EVERY === 0) {
          saveCache(cache);
        }
        process.stdout.write('✓\n');
      } else {
        process.stdout.write('—\n');
      }
    } catch (error) {
      console.warn(`Failed to enrich ${item.title}: ${error.message}`);
      process.stdout.write('✗\n');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  saveCache(cache);
  console.log(`Enriched ${updated} media items.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

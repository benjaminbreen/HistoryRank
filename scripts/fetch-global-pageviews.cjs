/**
 * Fetch Wikipedia pageviews across top 10 language editions.
 * Stores per-language breakdown and global total.
 *
 * Improvements:
 * - Uses language-specific page titles from Wikidata sitelinks (and langlinks fallback)
 * - Uses user traffic (not all-agents) to reduce bot noise
 * - Uses a stable full calendar year window (default: last completed year)
 * - Supports figure-level concurrency for faster large backfills
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'historyrank.db');

const LANGUAGES = [
  { code: 'en', name: 'English', project: 'en.wikipedia', wikiKey: 'enwiki' },
  { code: 'de', name: 'German', project: 'de.wikipedia', wikiKey: 'dewiki' },
  { code: 'fr', name: 'French', project: 'fr.wikipedia', wikiKey: 'frwiki' },
  { code: 'es', name: 'Spanish', project: 'es.wikipedia', wikiKey: 'eswiki' },
  { code: 'ja', name: 'Japanese', project: 'ja.wikipedia', wikiKey: 'jawiki' },
  { code: 'ru', name: 'Russian', project: 'ru.wikipedia', wikiKey: 'ruwiki' },
  { code: 'zh', name: 'Chinese', project: 'zh.wikipedia', wikiKey: 'zhwiki' },
  { code: 'pt', name: 'Portuguese', project: 'pt.wikipedia', wikiKey: 'ptwiki' },
  { code: 'it', name: 'Italian', project: 'it.wikipedia', wikiKey: 'itwiki' },
  { code: 'ar', name: 'Arabic', project: 'ar.wikipedia', wikiKey: 'arwiki' },
];

const PAGEVIEWS_API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';
const WIKIDATA_ENTITY_API = 'https://www.wikidata.org/wiki/Special:EntityData/';
const EN_LANG_LINKS_API =
  'https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&lllimit=max&format=json&titles=';

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
const offsetArg = args.find((a) => a.startsWith('--offset='));
const offset = offsetArg ? parseInt(offsetArg.split('=')[1], 10) : 0;
const forceArg = args.includes('--force');
const yearArg = args.find((a) => a.startsWith('--year='));
const concurrencyArg = args.find((a) => a.startsWith('--concurrency='));

const defaultYear = new Date().getFullYear() - 1;
const targetYear = yearArg ? parseInt(yearArg.split('=')[1], 10) : defaultYear;
const rawConcurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 1;
const concurrency = Number.isFinite(rawConcurrency) ? Math.max(1, Math.min(8, rawConcurrency)) : 1;

if (Number.isNaN(targetYear) || targetYear < 2008 || targetYear > defaultYear) {
  console.error(`Invalid --year value. Use a year between 2008 and ${defaultYear}.`);
  process.exit(1);
}

const startDate = `${targetYear}0101`;
const endDate = `${targetYear}1231`;

const qidTitleCache = new Map();
const langlinkTitleCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTitle(title) {
  if (!title || typeof title !== 'string') return null;
  try {
    return decodeURIComponent(title).trim().replace(/ /g, '_');
  } catch {
    return title.trim().replace(/ /g, '_');
  }
}

async function fetchJson(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'HistoryRank/1.0 (pageviews fetcher)' },
    });

    if (res.status === 429 && attempt <= 5) {
      await sleep(attempt * 1000);
      return fetchJson(url, attempt + 1);
    }

    if ((res.status >= 500 || res.status === 408) && attempt <= 4) {
      await sleep(attempt * 1200);
      return fetchJson(url, attempt + 1);
    }

    if (!res.ok) return null;
    return res.json();
  } catch {
    if (attempt <= 3) {
      await sleep(attempt * 1000);
      return fetchJson(url, attempt + 1);
    }
    return null;
  }
}

async function getTitlesFromWikidataQid(qid) {
  if (!qid) return {};
  if (qidTitleCache.has(qid)) return qidTitleCache.get(qid);

  const data = await fetchJson(`${WIKIDATA_ENTITY_API}${encodeURIComponent(qid)}.json`);
  const entity = data?.entities?.[qid];
  const sitelinks = entity?.sitelinks || {};

  const titles = {};
  for (const lang of LANGUAGES) {
    const title = normalizeTitle(sitelinks?.[lang.wikiKey]?.title);
    if (title) titles[lang.code] = title;
  }

  qidTitleCache.set(qid, titles);
  return titles;
}

async function getTitlesFromEnglishLanglinks(slug) {
  const normalizedSlug = normalizeTitle(slug);
  if (!normalizedSlug) return {};
  if (langlinkTitleCache.has(normalizedSlug)) {
    return langlinkTitleCache.get(normalizedSlug);
  }

  const data = await fetchJson(`${EN_LANG_LINKS_API}${encodeURIComponent(normalizedSlug)}`);
  const pages = data?.query?.pages || {};
  const page = Object.values(pages)[0];
  const langlinks = page?.langlinks || [];

  const titles = { en: normalizedSlug };
  for (const item of langlinks) {
    const code = item?.lang;
    const title = normalizeTitle(item?.['*'] || item?.title);
    if (code && title && LANGUAGES.some((l) => l.code === code)) {
      titles[code] = title;
    }
  }

  langlinkTitleCache.set(normalizedSlug, titles);
  return titles;
}

async function resolveTitles(figure) {
  const resolved = {};
  const englishTitle = normalizeTitle(figure.wikipedia_slug);
  if (englishTitle) resolved.en = englishTitle;

  const fromQid = await getTitlesFromWikidataQid(figure.wikidata_qid);
  const qidEnTitle = normalizeTitle(fromQid.en);

  const canTrustQid =
    !englishTitle ||
    !qidEnTitle ||
    qidEnTitle.toLowerCase() === englishTitle.toLowerCase();

  if (canTrustQid) {
    Object.assign(resolved, fromQid);
  }

  const missingLangs = LANGUAGES.filter((lang) => !resolved[lang.code]);
  if (missingLangs.length > 0 && englishTitle) {
    const fromLanglinks = await getTitlesFromEnglishLanglinks(englishTitle);
    for (const lang of missingLangs) {
      if (fromLanglinks[lang.code]) {
        resolved[lang.code] = fromLanglinks[lang.code];
      }
    }
  }

  return resolved;
}

async function fetchPageviews(title, project) {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) return 0;

  const url = `${PAGEVIEWS_API}/${project}/all-access/user/${encodeURIComponent(normalizedTitle)}/monthly/${startDate}/${endDate}`;
  const data = await fetchJson(url);
  if (!data?.items || !Array.isArray(data.items)) return 0;
  return data.items.reduce((sum, item) => sum + (item.views || 0), 0);
}

async function fetchAllLanguages(languageTitles) {
  const perLanguage = await Promise.all(
    LANGUAGES.map(async (lang) => {
      const title = languageTitles[lang.code];
      if (!title) return [lang.code, 0];
      const views = await fetchPageviews(title, lang.project);
      return [lang.code, views];
    })
  );

  const breakdown = {};
  let total = 0;

  for (const [code, views] of perLanguage) {
    if (views > 0) {
      breakdown[code] = views;
      total += views;
    }
  }

  return { breakdown, total };
}

async function main() {
  const db = new Database(DB_PATH);

  let query = `
    SELECT id, canonical_name, wikipedia_slug, wikidata_qid, pageviews_by_language
    FROM figures
    WHERE wikipedia_slug IS NOT NULL
  `;

  if (!forceArg) {
    query += ` AND pageviews_by_language IS NULL`;
  }

  query += ` ORDER BY llm_consensus_rank ASC NULLS LAST`;

  if (limit) query += ` LIMIT ${limit}`;
  if (offset) query += ` OFFSET ${offset}`;

  const figures = db.prepare(query).all();

  console.log('\n🌍 Fetching Global Wikipedia Pageviews');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Period: ${startDate} → ${endDate} (calendar year ${targetYear})`);
  console.log('Traffic: user agents only');
  console.log(`Processing ${figures.length} figures across ${LANGUAGES.length} languages`);
  console.log(`Figure concurrency: ${concurrency}\n`);

  const updateStmt = db.prepare(`
    UPDATE figures
    SET pageviews_by_language = ?, pageviews_global = ?
    WHERE id = ?
  `);

  let processed = 0;
  let updated = 0;
  let nextIndex = 0;

  async function processOneFigure() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= figures.length) return;

      const figure = figures[currentIndex];
      const progress = `[${currentIndex + 1}/${figures.length}]`;

      process.stdout.write(`${progress} ${figure.canonical_name.slice(0, 35).padEnd(35)} `);

      const languageTitles = await resolveTitles(figure);
      const { breakdown, total } = await fetchAllLanguages(languageTitles);

      processed += 1;

      if (total > 0) {
        updateStmt.run(JSON.stringify(breakdown), total, figure.id);
        updated += 1;

        const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
        const topLang = sorted[0];
        const langCount = sorted.length;

        console.log(
          `✅ ${total.toLocaleString().padStart(12)} views (${langCount} langs, top: ${topLang[0]})`
        );
      } else {
        console.log('⚠️  No views found');
      }

      await sleep(50);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, figures.length) }, () => processOneFigure());
  await Promise.all(workers);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Processed: ${processed}`);
  console.log(`   Updated:   ${updated}`);
  console.log('\n✅ Done!\n');

  db.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

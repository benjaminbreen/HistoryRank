/**
 * Fetch Wikipedia pageviews across top 10 language editions
 * Stores per-language breakdown and global total
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'historyrank.db');

// Top 10 Wikipedia languages by traffic
const LANGUAGES = [
  { code: 'en', name: 'English', project: 'en.wikipedia' },
  { code: 'de', name: 'German', project: 'de.wikipedia' },
  { code: 'fr', name: 'French', project: 'fr.wikipedia' },
  { code: 'es', name: 'Spanish', project: 'es.wikipedia' },
  { code: 'ja', name: 'Japanese', project: 'ja.wikipedia' },
  { code: 'ru', name: 'Russian', project: 'ru.wikipedia' },
  { code: 'zh', name: 'Chinese', project: 'zh.wikipedia' },
  { code: 'pt', name: 'Portuguese', project: 'pt.wikipedia' },
  { code: 'it', name: 'Italian', project: 'it.wikipedia' },
  { code: 'ar', name: 'Arabic', project: 'ar.wikipedia' },
];

const PAGEVIEWS_API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

// Parse args
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
const offsetArg = args.find(a => a.startsWith('--offset='));
const offset = offsetArg ? parseInt(offsetArg.split('=')[1]) : 0;
const forceArg = args.includes('--force');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPageviews(slug, project, startDate, endDate) {
  const url = `${PAGEVIEWS_API}/${project}/all-access/all-agents/${encodeURIComponent(slug)}/monthly/${startDate}/${endDate}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'HistoryRank/1.0 (global pageviews)' },
    });

    if (res.status === 404) {
      // Article doesn't exist in this language
      return 0;
    }

    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited, wait and retry
        await sleep(2000);
        return fetchPageviews(slug, project, startDate, endDate);
      }
      return 0;
    }

    const data = await res.json();
    if (data?.items && Array.isArray(data.items)) {
      return data.items.reduce((sum, item) => sum + (item.views || 0), 0);
    }
    return 0;
  } catch (error) {
    return 0;
  }
}

async function fetchAllLanguages(slug) {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10).replace(/-/g, '');
  const startDate = '20250101';

  const results = {};
  let total = 0;

  for (const lang of LANGUAGES) {
    const views = await fetchPageviews(slug, lang.project, startDate, endDate);
    if (views > 0) {
      results[lang.code] = views;
      total += views;
    }
    // Small delay between language requests
    await sleep(50);
  }

  return { breakdown: results, total };
}

async function main() {
  const db = new Database(DB_PATH);

  // Get figures with wikipedia slugs
  let query = `
    SELECT id, canonical_name, wikipedia_slug, pageviews_by_language
    FROM figures
    WHERE wikipedia_slug IS NOT NULL
  `;

  if (!forceArg) {
    query += ` AND pageviews_by_language IS NULL`;
  }

  query += ` ORDER BY llm_consensus_rank ASC NULLS LAST`;

  if (limit) {
    query += ` LIMIT ${limit}`;
  }
  if (offset) {
    query += ` OFFSET ${offset}`;
  }

  const figures = db.prepare(query).all();

  console.log(`\n🌍 Fetching Global Wikipedia Pageviews`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  console.log(`Processing ${figures.length} figures across ${LANGUAGES.length} languages\n`);

  const updateStmt = db.prepare(`
    UPDATE figures
    SET pageviews_by_language = ?, pageviews_global = ?
    WHERE id = ?
  `);

  let processed = 0;
  let updated = 0;

  for (const figure of figures) {
    processed++;
    const progress = `[${processed}/${figures.length}]`;

    process.stdout.write(`${progress} ${figure.canonical_name.slice(0, 35).padEnd(35)} `);

    const { breakdown, total } = await fetchAllLanguages(figure.wikipedia_slug);

    if (total > 0) {
      updateStmt.run(JSON.stringify(breakdown), total, figure.id);
      updated++;

      // Show top language
      const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
      const topLang = sorted[0];
      const langCount = sorted.length;

      console.log(`✅ ${total.toLocaleString().padStart(12)} views (${langCount} langs, top: ${topLang[0]})`);
    } else {
      console.log(`⚠️  No views found`);
    }

    // Rate limit between figures
    await sleep(100);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Updated:   ${updated}`);
  console.log(`\n✅ Done!\n`);

  db.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

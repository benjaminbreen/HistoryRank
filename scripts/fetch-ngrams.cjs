/**
 * Fetch Google Ngrams data for historical figures
 * Stores 50-point timeseries (1920-2018, every 2 years) for English corpus
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'historyrank.db');

// Ngram settings
const NGRAM_API = 'https://books.google.com/ngrams/json';
const YEAR_START = 1920;
const YEAR_END = 2019;
const CORPUS = 'en-2019';
const SMOOTHING = 3;

// Parse args
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
const offsetArg = args.find(a => a.startsWith('--offset='));
const offset = offsetArg ? parseInt(offsetArg.split('=')[1]) : 0;
const forceArg = args.includes('--force');
const dryRunArg = args.includes('--dry-run');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchNgram(name, retries = 3) {
  const url = `${NGRAM_API}?content=${encodeURIComponent(name)}&year_start=${YEAR_START}&year_end=${YEAR_END}&corpus=${CORPUS}&smoothing=${SMOOTHING}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'HistoryRank/1.0 (ngram research)' },
      });

      if (res.status === 429) {
        // Rate limited, wait longer and retry
        console.log(`   ⏳ Rate limited, waiting 5s...`);
        await sleep(5000);
        continue;
      }

      if (!res.ok) {
        if (attempt === retries) return null;
        await sleep(2000);
        continue;
      }

      const data = await res.json();

      if (!data || !Array.isArray(data) || data.length === 0) {
        return null;
      }

      const result = data[0];
      if (!result?.timeseries || !Array.isArray(result.timeseries)) {
        return null;
      }

      // Sample every 2 years (100 points -> 50 points)
      const fullSeries = result.timeseries;
      const years = [];
      const values = [];

      for (let i = 0; i < fullSeries.length; i += 2) {
        years.push(YEAR_START + i);
        values.push(fullSeries[i]);
      }

      return { years, values };
    } catch (error) {
      if (attempt === retries) {
        console.log(`   ❌ Error: ${error.message}`);
        return null;
      }
      await sleep(2000);
    }
  }
  return null;
}

async function main() {
  console.log('📊 Google Ngrams Fetcher\n');

  const db = new Database(DB_PATH);

  // Get figures
  let query = `
    SELECT id, canonical_name, ngram_data
    FROM figures
    WHERE llm_consensus_rank IS NOT NULL
  `;

  if (!forceArg) {
    query += ` AND (ngram_data IS NULL OR ngram_data = '')`;
  }

  query += ` ORDER BY llm_consensus_rank ASC`;

  if (limit) {
    query += ` LIMIT ${limit}`;
  }
  if (offset) {
    query += ` OFFSET ${offset}`;
  }

  const figures = db.prepare(query).all();

  console.log(`Found ${figures.length} figures to process`);
  if (dryRunArg) {
    console.log('\n🔍 Dry run - showing first 10 figures:');
    figures.slice(0, 10).forEach((f, i) => {
      console.log(`   ${i + 1}. ${f.canonical_name}`);
    });
    db.close();
    return;
  }

  const updateStmt = db.prepare(`
    UPDATE figures SET ngram_data = ? WHERE id = ?
  `);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < figures.length; i++) {
    const figure = figures[i];
    const progress = `[${i + 1}/${figures.length}]`;

    process.stdout.write(`${progress} ${figure.canonical_name}... `);

    const ngramData = await fetchNgram(figure.canonical_name);

    if (ngramData) {
      updateStmt.run(JSON.stringify(ngramData), figure.id);
      console.log('✓');
      success++;
    } else {
      console.log('❌ no data');
      failed++;
    }

    // Rate limiting: 1 request per second
    if (i < figures.length - 1) {
      await sleep(1000);
    }
  }

  db.close();

  console.log(`\n📊 Results:`);
  console.log(`   Success: ${success}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total: ${figures.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

/**
 * Find Wikipedia slugs for figures missing them
 * Uses Wikipedia's search API to find matching articles
 *
 * Usage:
 *   node scripts/find-wikipedia-slugs.cjs [--limit=N] [--dry-run] [--offset=N]
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'historyrank.db');

// Wikipedia API endpoints
const WIKI_SEARCH_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_SUMMARY_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

// Parse args
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : null;
const offsetArg = args.find(a => a.startsWith('--offset='));
const offset = offsetArg ? parseInt(offsetArg.split('=')[1]) : 0;
const dryRun = args.includes('--dry-run');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'HistoryRank/1.0 (finding wikipedia slugs)' },
    });

    if (res.status === 429 && attempt <= 5) {
      const delay = Math.max(2000, attempt * 2000);
      console.log(`      Rate limited, waiting ${delay}ms...`);
      await sleep(delay);
      return fetchJson(url, attempt + 1);
    }

    if (!res.ok) {
      return null;
    }

    return res.json();
  } catch (error) {
    if (attempt <= 3) {
      await sleep(1000);
      return fetchJson(url, attempt + 1);
    }
    return null;
  }
}

/**
 * Search Wikipedia for a name and return best match
 */
async function searchWikipedia(name) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: name,
    srlimit: '5',
    format: 'json',
  });

  const url = `${WIKI_SEARCH_API}?${params}`;
  const data = await fetchJson(url);

  if (!data?.query?.search?.length) {
    return null;
  }

  return data.query.search;
}

/**
 * Get page summary to verify it's about a person
 */
async function getPageSummary(title) {
  const slug = title.replace(/ /g, '_');
  const url = `${WIKI_SUMMARY_API}${encodeURIComponent(slug)}`;
  const data = await fetchJson(url);

  if (!data) return null;

  return {
    title: data.title,
    slug: data.title?.replace(/ /g, '_'),
    description: data.description || '',
    extract: data.extract || '',
    type: data.type,
  };
}

/**
 * Check if a Wikipedia page is likely about a historical person
 */
function isLikelyPerson(summary, canonicalName) {
  if (!summary) return false;

  const desc = (summary.description || '').toLowerCase();
  const extract = (summary.extract || '').toLowerCase();
  const name = canonicalName.toLowerCase();

  // Keywords suggesting a person
  const personKeywords = [
    'born', 'died', 'was a', 'is a', 'were a',
    'philosopher', 'scientist', 'emperor', 'king', 'queen', 'ruler',
    'leader', 'politician', 'writer', 'artist', 'composer', 'inventor',
    'religious', 'prophet', 'saint', 'military', 'general', 'admiral',
    'president', 'prime minister', 'statesman', 'revolutionary',
    'mathematician', 'physicist', 'chemist', 'biologist', 'astronomer',
    'historian', 'economist', 'sociologist', 'psychologist',
    'poet', 'novelist', 'playwright', 'musician', 'painter', 'sculptor',
    'explorer', 'reformer', 'activist', 'theologian', 'monk', 'pope',
    'caliph', 'sultan', 'pharaoh', 'caesar', 'tsar', 'shogun',
  ];

  // Check description for person indicators
  for (const keyword of personKeywords) {
    if (desc.includes(keyword) || extract.includes(keyword)) {
      return true;
    }
  }

  // Check if name appears in the first sentence (biography pattern)
  const firstName = name.split(' ')[0];
  if (extract.startsWith(firstName) || extract.includes(`(${firstName}`)) {
    return true;
  }

  return false;
}

/**
 * Find best Wikipedia match for a figure
 */
async function findBestMatch(canonicalName) {
  // First try exact search
  const results = await searchWikipedia(canonicalName);
  if (!results) return null;

  // Check top results for a person match
  for (const result of results.slice(0, 3)) {
    const summary = await getPageSummary(result.title);
    await sleep(50); // Small delay between requests

    if (isLikelyPerson(summary, canonicalName)) {
      return {
        slug: summary.slug,
        title: summary.title,
        description: summary.description,
        confidence: result.title.toLowerCase() === canonicalName.toLowerCase() ? 'high' : 'medium',
      };
    }
  }

  // If no person match, try adding context to search
  const contextSearches = [
    `${canonicalName} historical figure`,
    `${canonicalName} biography`,
  ];

  for (const query of contextSearches) {
    const contextResults = await searchWikipedia(query);
    await sleep(100);

    if (!contextResults) continue;

    for (const result of contextResults.slice(0, 2)) {
      const summary = await getPageSummary(result.title);
      await sleep(50);

      if (isLikelyPerson(summary, canonicalName)) {
        return {
          slug: summary.slug,
          title: summary.title,
          description: summary.description,
          confidence: 'low',
        };
      }
    }
  }

  return null;
}

async function main() {
  const db = new Database(DB_PATH);

  // Get figures missing Wikipedia slugs, ordered by LLM consensus rank
  let query = `
    SELECT id, canonical_name, llm_consensus_rank
    FROM figures
    WHERE wikipedia_slug IS NULL
    ORDER BY llm_consensus_rank ASC NULLS LAST
  `;

  if (limit) {
    query += ` LIMIT ${limit}`;
  }
  if (offset) {
    query += ` OFFSET ${offset}`;
  }

  const figures = db.prepare(query).all();

  console.log(`\n🔍 Finding Wikipedia Slugs`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Processing ${figures.length} figures${dryRun ? ' (DRY RUN)' : ''}\n`);

  const updateStmt = db.prepare(`
    UPDATE figures
    SET wikipedia_slug = ?, source_confidence = ?
    WHERE id = ?
  `);

  let found = 0;
  let notFound = 0;
  const notFoundList = [];

  for (let i = 0; i < figures.length; i++) {
    const figure = figures[i];
    const progress = `[${i + 1}/${figures.length}]`;
    const rank = figure.llm_consensus_rank ? `#${Math.round(figure.llm_consensus_rank)}` : 'unranked';

    process.stdout.write(`${progress} ${figure.canonical_name.slice(0, 35).padEnd(35)} (${rank.padStart(8)}) `);

    const match = await findBestMatch(figure.canonical_name);

    if (match) {
      found++;
      console.log(`✅ ${match.slug} [${match.confidence}]`);

      if (!dryRun) {
        updateStmt.run(match.slug, match.confidence, figure.id);
      }
    } else {
      notFound++;
      notFoundList.push({ id: figure.id, name: figure.canonical_name, rank: figure.llm_consensus_rank });
      console.log(`❌ Not found`);
    }

    // Rate limiting - Wikipedia API is strict
    await sleep(500);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 SUMMARY`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   Found:     ${found}`);
  console.log(`   Not found: ${notFound}`);

  if (dryRun) {
    console.log(`\n   (Dry run - no changes made)`);
  }

  if (notFoundList.length > 0 && notFoundList.length <= 50) {
    console.log(`\n   Not found:`);
    for (const item of notFoundList) {
      console.log(`      - ${item.name} (${item.id})`);
    }
  }

  console.log(`\n✅ Done!\n`);

  db.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

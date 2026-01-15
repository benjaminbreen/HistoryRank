import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

type OverrideUpdates = Record<string, { wikipedia_slug?: string }>;

const OVERRIDES_PATH = path.join(process.cwd(), 'data', 'figure-overrides.json');

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripParen(title: string) {
  return title.replace(/\s*\(.*\)\s*/g, '').trim();
}

function loadOverrides(): { updates: OverrideUpdates } {
  if (!fs.existsSync(OVERRIDES_PATH)) {
    throw new Error(`Overrides file not found: ${OVERRIDES_PATH}`);
  }
  return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
}

function saveOverrides(data: { updates: OverrideUpdates }) {
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(data, null, 2));
}

async function searchWikipedia(query: string) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    format: 'json',
    srlimit: '5',
  });

  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
    headers: { 'User-Agent': 'HistoryRank/1.0 (slug resolver)' },
  });
  if (!res.ok) {
    throw new Error(`Wikipedia search failed (${res.status})`);
  }
  return res.json() as Promise<{ query?: { search?: Array<{ title: string }> } }>;
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 100;
  const dryRun = args.includes('--dry-run');

  const db = new Database('historyrank.db');
  const rows = db.prepare(`
    select f.id, f.canonical_name as name, count(r.id) as freq
    from figures f
    left join rankings r on r.figure_id = f.id
    where f.wikipedia_slug is null
    group by f.id
    order by freq desc, f.canonical_name asc
    limit ?
  `).all(limit);

  const overrides = loadOverrides();
  const updates: OverrideUpdates = overrides.updates || {};

  let resolved = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = String(row.name || '').trim();
    if (!name) {
      skipped++;
      continue;
    }

    try {
      const json = await searchWikipedia(name);
      const results = json.query?.search || [];
      if (results.length === 0) {
        skipped++;
        continue;
      }

      const top = results[0].title;
      const normalizedName = normalize(name);
      const normalizedTitle = normalize(top);
      const normalizedStripped = normalize(stripParen(top));

      const isMatch =
        normalizedTitle === normalizedName ||
        normalizedStripped === normalizedName;

      if (!isMatch) {
        skipped++;
        continue;
      }

      const slug = top.replace(/ /g, '_');
      updates[row.id] = { ...(updates[row.id] || {}), wikipedia_slug: slug };
      resolved++;
    } catch (error) {
      console.error(`Failed to resolve ${name}:`, error);
      skipped++;
    }
  }

  if (!dryRun) {
    overrides.updates = updates;
    saveOverrides(overrides);
  }

  console.log(`Resolved: ${resolved}, skipped: ${skipped}`);
  if (dryRun) {
    console.log('Dry run only: overrides not updated.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'historyrank.db');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'thumbnails');
const { fetchWikipediaSummary } = require('./lib/wikipedia');

const args = process.argv.slice(2);
const limitArg = args.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadFile(url, outPath, attempt = 1) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HistoryRank/1.0 (thumbnail fetch)' },
  });
  if (res.status === 429 && attempt <= 5) {
    const retryAfter = Number(res.headers.get('retry-after') || 0);
    const delay = Math.max(1000, retryAfter * 1000, attempt * 1500);
    await sleep(delay);
    return downloadFile(url, outPath, attempt + 1);
  }
  if (!res.ok) return false;
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
  return true;
}

function getExtFromUrl(url) {
  const clean = url.split('?')[0];
  const ext = path.extname(clean).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return '.jpg';
  if (ext === '.png') return '.png';
  if (ext === '.webp') return '.webp';
  return '.jpg';
}

function getRows() {
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true });
  const stmt = db.prepare(
    `
      SELECT id, wikipedia_slug
      FROM figures
      WHERE wikipedia_slug IS NOT NULL
      ORDER BY (llm_consensus_rank IS NULL), llm_consensus_rank ASC
      ${limit ? 'LIMIT ?' : ''}
    `
  );
  return limit ? stmt.all(limit) : stmt.all();
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const rows = getRows();

  let downloaded = 0;
  let skipped = 0;

  for (const row of rows) {
    const basePath = path.join(OUTPUT_DIR, row.id);
    if (fs.existsSync(`${basePath}.jpg`) || fs.existsSync(`${basePath}.png`) || fs.existsSync(`${basePath}.webp`)) {
      skipped++;
      continue;
    }

    const data = await fetchWikipediaSummary(row.wikipedia_slug);
    const thumbnailUrl = data?.thumbnail?.source || null;
    if (!thumbnailUrl) {
      skipped++;
      await sleep(150);
      continue;
    }

    const ext = getExtFromUrl(thumbnailUrl);
    const outPath = `${basePath}${ext}`;
    const ok = await downloadFile(thumbnailUrl, outPath);
    if (ok) downloaded++;
    await sleep(150);
  }

  console.log(`Downloaded ${downloaded} thumbnails. Skipped ${skipped}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

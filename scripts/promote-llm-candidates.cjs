const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(process.cwd(), 'historyrank.db');

const SOURCE_THRESHOLD = Number(process.env.LLM_SOURCE_THRESHOLD || 2);
const SAMPLE_THRESHOLD = Number(process.env.LLM_SAMPLE_THRESHOLD || 2);
const RANK_THRESHOLD = Number(process.env.LLM_RANK_THRESHOLD || 300);

function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function main() {
  const db = new Database(DB_PATH);
  const candidates = db.prepare('SELECT * FROM llm_candidates').all();

  const existing = new Set(db.prepare('SELECT id FROM figures').all().map((r) => r.id));
  const insert = db.prepare(
    `INSERT INTO figures (id, canonical_name, created_at, updated_at)
     VALUES (?, ?, ?, ?)`
  );

  const now = Date.now();
  let promoted = 0;
  for (const c of candidates) {
    const sources = JSON.parse(c.sources || '[]');
    const meets =
      sources.length >= SOURCE_THRESHOLD ||
      c.sample_count >= SAMPLE_THRESHOLD ||
      (c.avg_rank !== null && c.avg_rank <= RANK_THRESHOLD);
    if (!meets) continue;

    const slug = generateSlug(c.display_name);
    if (!slug || existing.has(slug)) continue;

    insert.run(slug, c.display_name, now, now);
    existing.add(slug);
    promoted++;
  }

  console.log(`Promoted ${promoted} candidates into figures`);
}

main();

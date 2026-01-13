const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');
const DB_PATH = path.join(process.cwd(), 'historyrank.db');

function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/^st\.\s*/i, 'saint ')
    .replace(/^sir\s+/i, '')
    .replace(/^dr\.\s*/i, '')
    .replace(/,\s*(jr\.?|sr\.?|i{1,3}|iv|v|vi{1,3})$/i, '')
    .replace(/\s+ibn\s+/g, ' ibn ')
    .replace(/\s+al-/g, ' al-')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseJsonArray(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  const data = JSON.parse(content);
  if (!Array.isArray(data)) return [];
  return data;
}

function sourceFromFilename(filename) {
  const match = filename.match(/^(.+?)\s+LIST\s+(\d+)\s*\(.*\)\.txt$/i);
  if (!match) return null;
  return match[1].trim().toLowerCase().replace(/\s+/g, '-');
}

function main() {
  const files = fs.readdirSync(RAW_DIR).filter((f) => f.includes('LIST') && f.endsWith('.txt'));
  const candidateMap = new Map();

  for (const file of files) {
    const source = sourceFromFilename(file);
    if (!source) continue;
    const entries = parseJsonArray(path.join(RAW_DIR, file));
    for (const entry of entries) {
      if (!entry || typeof entry.name !== 'string' || typeof entry.rank !== 'number') continue;
      const norm = normalizeName(entry.name);
      if (!norm) continue;
      const existing = candidateMap.get(norm);
      if (!existing) {
        candidateMap.set(norm, {
          normalized_name: norm,
          display_name: entry.name,
          sources: new Set([source]),
          sample_count: 1,
          total_rank: entry.rank,
        });
      } else {
        existing.sources.add(source);
        existing.sample_count += 1;
        existing.total_rank += entry.rank;
      }
    }
  }

  const db = new Database(DB_PATH);
  db.exec('DELETE FROM llm_candidates;');
  const insert = db.prepare(
    `INSERT INTO llm_candidates (normalized_name, display_name, sources, sample_count, avg_rank, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const now = Date.now();
  for (const entry of candidateMap.values()) {
    insert.run(
      entry.normalized_name,
      entry.display_name,
      JSON.stringify(Array.from(entry.sources)),
      entry.sample_count,
      entry.total_rank / entry.sample_count,
      now
    );
  }

  console.log(`Inserted ${candidateMap.size} candidates into llm_candidates`);
}

main();

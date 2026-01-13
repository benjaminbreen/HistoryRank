import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const DB_PATH = path.join(process.cwd(), 'historyrank.db');
const INPUT_PATH = path.join(process.cwd(), 'data', 'regions', 'region-map.csv');

type RegionRow = {
  id: string;
  canonical_name: string;
  wikipedia_slug: string;
  birth_year: string;
  domain: string;
  era: string;
  llm_consensus_rank: string;
  region_macro: string;
  region_sub: string;
  birth_polity: string;
  birth_place: string;
  birth_lat: string;
  birth_lon: string;
};

function parseCsv(content: string): RegionRow[] {
  const lines = content.trim().split('\n');
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: RegionRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {} as Record<string, string>;
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row as RegionRow);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function toNullableNumber(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

if (!fs.existsSync(INPUT_PATH)) {
  console.error(`Missing ${INPUT_PATH}. Run "npm run export:regions" first.`);
  process.exit(1);
}

const content = fs.readFileSync(INPUT_PATH, 'utf-8');
const rows = parseCsv(content);

const db = new Database(DB_PATH);
const update = db.prepare(
  `
    UPDATE figures
    SET
      region_macro = ?,
      region_sub = ?,
      birth_polity = ?,
      birth_place = ?,
      birth_lat = ?,
      birth_lon = ?
    WHERE id = ?
  `
);

const transaction = db.transaction((updates: RegionRow[]) => {
  updates.forEach((row) => {
    if (!row.id) return;
    update.run(
      row.region_macro || null,
      row.region_sub || null,
      row.birth_polity || null,
      row.birth_place || null,
      toNullableNumber(row.birth_lat),
      toNullableNumber(row.birth_lon),
      row.id
    );
  });
});

transaction(rows);

console.log(`Updated ${rows.length} rows in ${DB_PATH}`);

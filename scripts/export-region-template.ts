import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const DB_PATH = path.join(process.cwd(), 'historyrank.db');
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'regions');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'region-map.csv');

function toCsvRow(values: Array<string | number | null>): string {
  return values
    .map((value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(',');
}

const db = new Database(DB_PATH);

interface FigureRow {
  id: string;
  canonical_name: string;
  wikipedia_slug: string | null;
  birth_year: number | null;
  domain: string | null;
  era: string | null;
  llm_consensus_rank: number | null;
}

const rows = db
  .prepare(
    `
      SELECT
        id,
        canonical_name,
        wikipedia_slug,
        birth_year,
        domain,
        era,
        llm_consensus_rank
      FROM figures
      ORDER BY (llm_consensus_rank IS NULL), llm_consensus_rank ASC
      LIMIT 100
    `
  )
  .all() as FigureRow[];

const header = [
  'id',
  'canonical_name',
  'wikipedia_slug',
  'birth_year',
  'domain',
  'era',
  'llm_consensus_rank',
  'region_macro',
  'region_sub',
  'birth_polity',
  'birth_place',
  'birth_lat',
  'birth_lon',
];

const lines = [toCsvRow(header)];
rows.forEach((row) => {
  lines.push(
    toCsvRow([
      row.id,
      row.canonical_name,
      row.wikipedia_slug,
      row.birth_year,
      row.domain,
      row.era,
      row.llm_consensus_rank,
      '',
      '',
      '',
      '',
      '',
      '',
    ])
  );
});

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${lines.join('\n')}\n`, 'utf-8');

console.log(`Wrote ${rows.length} rows to ${OUTPUT_PATH}`);

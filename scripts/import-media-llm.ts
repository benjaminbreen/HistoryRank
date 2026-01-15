import fs from 'node:fs';
import path from 'node:path';

type MediaRecord = Record<string, unknown>;

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function loadMedia(): MediaRecord[] {
  if (!fs.existsSync(MEDIA_PATH)) return [];
  const raw = fs.readFileSync(MEDIA_PATH, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MediaRecord);
}

function saveMedia(items: MediaRecord[]) {
  const lines = items.map((item) => JSON.stringify(item));
  fs.writeFileSync(MEDIA_PATH, `${lines.join('\n')}\n`);
}

function toArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string') as string[];
}

function unionStrings(a: unknown, b: unknown): string[] {
  const set = new Set<string>();
  toArray(a).forEach((item) => set.add(item));
  toArray(b).forEach((item) => set.add(item));
  return Array.from(set);
}

function getScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mergeScore(existing: MediaRecord, incoming: MediaRecord, field: string, countField: string) {
  const incomingScore = getScore(incoming[field]);
  if (incomingScore === null) return;

  const existingScore = getScore(existing[field]);
  const existingCountRaw = getScore(existing[countField]);
  const existingCount = existingCountRaw ? Math.max(1, Math.floor(existingCountRaw)) : (existingScore !== null ? 1 : 0);
  const nextCount = existingCount + 1;
  const nextScore = existingScore === null
    ? incomingScore
    : (existingScore * existingCount + incomingScore) / nextCount;

  existing[field] = Math.round(nextScore * 10) / 10;
  existing[countField] = nextCount;
}

function mergeMedia(existing: MediaRecord, incoming: MediaRecord) {
  existing.type = existing.type ?? incoming.type;
  existing.release_year = existing.release_year ?? incoming.release_year;
  existing.depicted_start_year = existing.depicted_start_year ?? incoming.depicted_start_year ?? null;
  existing.depicted_end_year = existing.depicted_end_year ?? incoming.depicted_end_year ?? null;
  existing.primary_era = existing.primary_era ?? incoming.primary_era;
  existing.primary_region = existing.primary_region ?? incoming.primary_region;
  existing.wikipedia_slug = existing.wikipedia_slug ?? incoming.wikipedia_slug;
  existing.summary = existing.summary ?? incoming.summary;
  existing.notes = existing.notes ?? incoming.notes;

  existing.tags = unionStrings(existing.tags, incoming.tags);
  existing.eras_depicted = unionStrings(existing.eras_depicted, incoming.eras_depicted);
  existing.regions_depicted = unionStrings(existing.regions_depicted, incoming.regions_depicted);

  mergeScore(existing, incoming, 'llm_accuracy_score', 'llm_accuracy_count');
  mergeScore(existing, incoming, 'llm_quality_score', 'llm_quality_count');

  const inclusionCount = getScore(existing.llm_inclusion_count);
  existing.llm_inclusion_count = inclusionCount ? inclusionCount + 1 : 1;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options: { file?: string; dryRun: boolean } = { dryRun: false };
  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      options.file = arg.slice('--file='.length);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }
  return options;
}

function main() {
  const options = parseArgs();
  if (!options.file) {
    throw new Error('Missing --file= path to the LLM media list.');
  }

  const listPath = path.resolve(options.file);
  const raw = fs.readFileSync(listPath, 'utf8');
  const parsed = JSON.parse(raw) as MediaRecord[];
  if (!Array.isArray(parsed)) {
    throw new Error('LLM list must be a JSON array.');
  }

  const existing = loadMedia();
  const index = new Map<string, MediaRecord>();
  for (const item of existing) {
    const title = typeof item.title === 'string' ? item.title : '';
    if (!title) continue;
    const year = typeof item.release_year === 'number' ? String(item.release_year) : '';
    index.set(`${normalizeTitle(title)}::${year}`, item);
  }

  let added = 0;
  let updated = 0;

  for (const item of parsed) {
    const title = typeof item.title === 'string' ? item.title : '';
    if (!title) continue;
    const releaseYear = typeof item.release_year === 'number' ? String(item.release_year) : '';
    const key = `${normalizeTitle(title)}::${releaseYear}`;
    const existingItem = index.get(key);

    const { rank: _rank, ...incoming } = item;

    if (existingItem) {
      mergeMedia(existingItem, incoming);
      updated += 1;
    } else {
      const record: MediaRecord = { ...incoming };
      record.llm_inclusion_count = 1;
      existing.push(record);
      index.set(key, record);
      added += 1;
    }
  }

  if (!options.dryRun) {
    saveMedia(existing);
  }

  console.log(`Media import complete. Added ${added}, updated ${updated}.`);
}

main();

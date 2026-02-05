import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const RAW_DIRS = [
  { dir: path.join(process.cwd(), 'data', 'raw_v2'), version: 'v2' as const },
  { dir: path.join(process.cwd(), 'data', 'raw_v3'), version: 'v3' as const },
];
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'derived');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'v2v3-consensus.json');
const GROUP_EXCLUDE = new Set([
  'the-beatles',
]);
const OVERRIDES_FILE = path.join(process.cwd(), 'data', 'figure-overrides.json');

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJsonArray(text: string): string {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON array found in file');
  }
  return text.slice(start, end + 1);
}

type RawEntry = {
  rank?: number;
  name: string;
  primary_contribution?: string;
};

type ListMeta = {
  file: string;
  version: 'v2' | 'v3';
  model: string;
  entries: number;
  matched: number;
  unmatched: number;
  deduped: number;
  duplicates: number;
};

function inferModelFromFilename(file: string, version: 'v2' | 'v3'): string {
  const base = file.replace(/\.txt$/, '');
  if (version === 'v2') {
    const parts = base.split(' V2 LIST ');
    return parts[0].trim();
  }
  const parts = base.split(' V3 LIST ');
  return parts[0].trim();
}

function main() {
  const existingDirs = RAW_DIRS.filter((entry) => fs.existsSync(entry.dir));
  if (existingDirs.length === 0) {
    throw new Error('Missing data/raw_v2 or data/raw_v3');
  }

  const filesByDir = existingDirs.flatMap(({ dir, version }) => {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.txt') && !f.endsWith('.quality.txt') && !f.endsWith('.failed.txt') && !f.endsWith('.raw.txt') && !f.endsWith('.repaired.txt'))
      .sort();
    return files.map((file) => ({ dir, file, version }));
  });

  if (filesByDir.length === 0) {
    throw new Error('No V2/V3 list files found in data/raw_v2 or data/raw_v3');
  }

  const db = new Database('historyrank.db');
  const aliasRows = db.prepare('SELECT alias, figure_id FROM name_aliases').all();
  const aliasMap = new Map<string, string>();
  for (const row of aliasRows) {
    aliasMap.set(row.alias, row.figure_id);
  }

  const mergeRemap = new Map<string, string>();
  if (fs.existsSync(OVERRIDES_FILE)) {
    const overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')) as {
      merges?: Record<string, string[]>;
    };
    const merges = overrides.merges || {};
    for (const [keepId, deleteIds] of Object.entries(merges)) {
      for (const deleteId of deleteIds) {
        mergeRemap.set(deleteId, keepId);
      }
    }
  }

  const perModelFigure: Map<string, Map<string, { sum: number; count: number }>> = new Map();
  const listMeta: ListMeta[] = [];
  const modelSet = new Set<string>();
  let skippedEmpty = 0;

  for (const { dir, file, version } of filesByDir) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const jsonArray = extractJsonArray(content);
    const entries = JSON.parse(jsonArray) as RawEntry[];
    if (!Array.isArray(entries) || entries.length === 0) {
      skippedEmpty += 1;
      continue;
    }

    const model = inferModelFromFilename(file, version);
    const modelKey = `${version}:${model}`;
    modelSet.add(modelKey);
    const modelMap = perModelFigure.get(modelKey) || new Map<string, { sum: number; count: number }>();
    perModelFigure.set(modelKey, modelMap);

    let matched = 0;
    let unmatched = 0;
    let duplicates = 0;
    const listRanks = new Map<string, number>();

    entries.forEach((entry, idx) => {
      if (!entry?.name) return;
      const nameNorm = normalizeName(entry.name);
      const figureId = aliasMap.get(nameNorm);
      if (!figureId) {
        unmatched += 1;
        return;
      }
      const mergedId = mergeRemap.get(figureId) || figureId;
      const rank = typeof entry.rank === 'number' ? entry.rank : idx + 1;
      if (listRanks.has(mergedId)) {
        duplicates += 1;
        const existing = listRanks.get(mergedId) as number;
        if (rank < existing) {
          listRanks.set(mergedId, rank);
        }
        return;
      }
      listRanks.set(mergedId, rank);
      matched += 1;
    });

    for (const [figureId, rank] of listRanks.entries()) {
      if (GROUP_EXCLUDE.has(figureId)) {
        continue;
      }
      const record = modelMap.get(figureId) || { sum: 0, count: 0 };
      record.sum += rank;
      record.count += 1;
      modelMap.set(figureId, record);
    }

    listMeta.push({
      file,
      version,
      model,
      entries: entries.length,
      matched,
      unmatched,
      deduped: listRanks.size,
      duplicates,
    });
  }

  const perFigureModelAverages: Map<string, { sum: number; count: number }> = new Map();
  for (const modelMap of perModelFigure.values()) {
    for (const [figureId, { sum, count }] of modelMap.entries()) {
      if (GROUP_EXCLUDE.has(figureId)) {
        continue;
      }
      const avg = sum / count;
      const record = perFigureModelAverages.get(figureId) || { sum: 0, count: 0 };
      record.sum += avg;
      record.count += 1;
      perFigureModelAverages.set(figureId, record);
    }
  }

  const figures = Array.from(perFigureModelAverages.entries()).map(([id, { sum, count }]) => ({
    id,
    avgRank: sum / count,
    modelCount: count,
  }));

  figures.sort((a, b) => a.avgRank - b.avgRank);

  const payload = {
    generatedAt: new Date().toISOString(),
    aggregation: 'per-model',
    listCount: filesByDir.length - skippedEmpty,
    modelCount: modelSet.size,
    lists: listMeta,
    skippedEmpty,
    figures,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));

  console.log(`Wrote ${OUTPUT_FILE}`);
  console.log(`V2+V3 lists: ${filesByDir.length - skippedEmpty}, models: ${modelSet.size}, figures: ${figures.length}`);
}

main();

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const RAW_DIR = path.join(process.cwd(), 'data', 'raw_v2');
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'derived');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'v2-consensus.json');
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
  model: string;
  entries: number;
  matched: number;
  unmatched: number;
  deduped: number;
  duplicates: number;
};

function inferModelFromFilename(file: string): string {
  const base = file.replace(/\.txt$/, '');
  const parts = base.split(' V2 LIST ');
  return parts[0].trim();
}

function main() {
  if (!fs.existsSync(RAW_DIR)) {
    throw new Error(`Missing directory: ${RAW_DIR}`);
  }

  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.txt') && !f.endsWith('.quality.txt'))
    .sort();

  if (files.length === 0) {
    throw new Error('No V2 list files found in data/raw_v2');
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

  for (const file of files) {
    const filePath = path.join(RAW_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const jsonArray = extractJsonArray(content);
    const entries = JSON.parse(jsonArray) as RawEntry[];

    const model = inferModelFromFilename(file);
    modelSet.add(model);
    const modelMap = perModelFigure.get(model) || new Map<string, { sum: number; count: number }>();
    perModelFigure.set(model, modelMap);

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
      const record = modelMap.get(figureId) || { sum: 0, count: 0 };
      record.sum += rank;
      record.count += 1;
      modelMap.set(figureId, record);
    }

    listMeta.push({
      file,
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
    listCount: files.length,
    modelCount: modelSet.size,
    lists: listMeta,
    figures,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));

  console.log(`Wrote ${OUTPUT_FILE}`);
  console.log(`V2 lists: ${files.length}, models: ${modelSet.size}, figures: ${figures.length}`);
}

main();

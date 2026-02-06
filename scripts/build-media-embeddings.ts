#!/usr/bin/env npx tsx
import fs from 'fs';
import path from 'path';
import { normalizeVector } from '@/lib/embeddings';

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_BATCH = 100;

function loadEnvFile(fileName: string) {
  const envPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) return;
    const key = match[1];
    let value = match[2] || '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

type MediaRow = {
  id: string;
  title: string;
  type: string;
  summary?: string;
  notes?: string;
  tags?: string[];
  primary_era?: string;
  sub_era?: string;
  primary_region?: string;
  locale?: string;
  domain?: string;
  eras_depicted?: string[];
  regions_depicted?: string[];
  depicted_start_year?: number | null;
  depicted_end_year?: number | null;
  release_year?: number;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function loadMediaItems(): MediaRow[] {
  const mediaPath = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');
  if (!fs.existsSync(mediaPath)) {
    throw new Error(`Media file not found: ${mediaPath}`);
  }
  const raw = fs.readFileSync(mediaPath, 'utf8');
  const seenIds = new Map<string, number>();
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const item = JSON.parse(line) as MediaRow & { id?: string };
      const baseId = item.id ?? slugify(item.title);
      const nextCount = (seenIds.get(baseId) ?? 0) + 1;
      seenIds.set(baseId, nextCount);
      const id = nextCount > 1 ? `${baseId}-${nextCount}` : baseId;
      return { ...item, id };
    });
}

function buildEmbeddingText(item: MediaRow): string {
  const parts: string[] = [
    item.title,
    `Type: ${item.type}`,
  ];

  if (item.summary) parts.push(`Summary: ${item.summary}`);
  if (item.notes) parts.push(`Notes: ${item.notes}`);
  if (item.domain) parts.push(`Domain: ${item.domain}`);
  if (item.primary_era) parts.push(`Era: ${item.primary_era}`);
  if (item.sub_era) parts.push(`Sub-era: ${item.sub_era}`);
  if (item.primary_region) parts.push(`Region: ${item.primary_region}`);
  if (item.locale) parts.push(`Locale: ${item.locale}`);
  if (item.eras_depicted && item.eras_depicted.length > 0) {
    parts.push(`Historical periods: ${item.eras_depicted.join(', ')}`);
  }
  if (item.regions_depicted && item.regions_depicted.length > 0) {
    parts.push(`Regions: ${item.regions_depicted.join(', ')}`);
  }
  if (item.depicted_start_year != null || item.depicted_end_year != null) {
    const start = item.depicted_start_year != null ? `${item.depicted_start_year}` : '?';
    const end = item.depicted_end_year != null ? `${item.depicted_end_year}` : '?';
    parts.push(`Time period depicted: ${start} to ${end}`);
  }
  if (item.release_year) parts.push(`Released: ${item.release_year}`);
  if (item.tags && item.tags.length > 0) {
    parts.push(`Tags: ${item.tags.join(', ')}`);
  }

  return parts.join('. ');
}

async function embedBatch(inputs: string[], model: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: inputs }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI embeddings failed (${response.status}): ${message}`);
  }

  const json = (await response.json()) as { data?: Array<{ embedding: number[] }> };
  if (!json.data || json.data.length !== inputs.length) {
    throw new Error('OpenAI embeddings response length mismatch');
  }

  return json.data.map((item) => item.embedding);
}

async function main() {
  loadEnvFile('.env.local');

  const model = process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_MODEL;
  const batchSize = Number(process.env.OPENAI_EMBEDDING_BATCH || DEFAULT_BATCH);

  const items = loadMediaItems();
  console.log(`Loaded ${items.length} media items`);

  const inputs = items.map((item) => buildEmbeddingText(item));
  const vectors: Array<{ id: string; vector: number[] }> = [];

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batchInputs = inputs.slice(i, i + batchSize);
    const embeddings = await embedBatch(batchInputs, model);
    embeddings.forEach((embedding, index) => {
      const normalized = normalizeVector(embedding);
      vectors.push({ id: items[i + index].id, vector: normalized });
    });
    console.log(`Embedded ${Math.min(i + batchSize, inputs.length)} / ${inputs.length}`);
  }

  const output = {
    model,
    dims: vectors[0]?.vector.length || 0,
    createdAt: new Date().toISOString(),
    items: vectors,
  };

  const outDir = path.join(process.cwd(), 'data', 'embeddings');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'media.json');
  fs.writeFileSync(outPath, JSON.stringify(output));
  console.log(`Saved ${vectors.length} media embeddings to ${outPath} (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

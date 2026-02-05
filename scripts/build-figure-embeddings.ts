#!/usr/bin/env npx tsx
import fs from 'fs';
import path from 'path';
import { db, figures } from '@/lib/db';
import { asc, sql } from 'drizzle-orm';
import { normalizeVector } from '@/lib/embeddings';

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_BATCH = 100;

type TagsIndex = Record<string, string[]>;

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

function loadTagsIndex(): TagsIndex {
  const tagsPath = path.join(process.cwd(), 'data', 'embeddings', 'tags.json');
  if (!fs.existsSync(tagsPath)) return {};
  const raw = fs.readFileSync(tagsPath, 'utf8');
  return JSON.parse(raw) as TagsIndex;
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase();
}

function deriveTags(row: {
  id: string;
  domain: string | null;
  occupation: string | null;
  era: string | null;
  regionSub: string | null;
  regionMacro: string | null;
}, manual: TagsIndex) {
  const tags = new Set<string>();
  const manualTags = manual[row.id] || [];
  manualTags.map(normalizeTag).filter(Boolean).forEach((tag) => tags.add(tag));

  if (row.domain) {
    const domain = row.domain.toLowerCase();
    tags.add(domain);
    if (domain.includes('science')) tags.add('scientist');
    if (domain.includes('religion')) tags.add('religious');
    if (domain.includes('politic')) tags.add('politician');
    if (domain.includes('art')) tags.add('artist');
    if (domain.includes('military')) tags.add('commander');
  }

  if (row.occupation) {
    const occupation = row.occupation.toLowerCase();
    tags.add(occupation);

    const sportKeywords = [
      'athlete',
      'football',
      'soccer',
      'basketball',
      'baseball',
      'tennis',
      'golf',
      'swimmer',
      'runner',
      'sprinter',
      'boxer',
      'mma',
      'cyclist',
      'cricket',
      'hockey',
      'racing driver',
      'olympic',
      'wrestler',
    ];
    if (sportKeywords.some((keyword) => occupation.includes(keyword))) {
      tags.add('sports');
      tags.add('athlete');
    }
  }

  if (row.era) tags.add(row.era.toLowerCase());
  if (row.regionMacro) tags.add(row.regionMacro.toLowerCase());
  if (row.regionSub) tags.add(row.regionSub.toLowerCase());

  return Array.from(tags);
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
    body: JSON.stringify({
      model,
      input: inputs,
    }),
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

function buildEmbeddingText(row: {
  id: string;
  canonicalName: string;
  domain: string | null;
  occupation: string | null;
  era: string | null;
  regionSub: string | null;
  regionMacro: string | null;
  birthPlace: string | null;
  wikipediaExtract: string | null;
  relatedFigures: string | null;
}, tags: string[]) {
  const related = row.relatedFigures ? row.relatedFigures : '';
  return [
    row.canonicalName,
    row.domain ? `Domain: ${row.domain}` : null,
    row.occupation ? `Occupation: ${row.occupation}` : null,
    row.era ? `Era: ${row.era}` : null,
    row.regionMacro ? `Region: ${row.regionMacro}` : null,
    row.regionSub ? `Subregion: ${row.regionSub}` : null,
    row.birthPlace ? `Birthplace: ${row.birthPlace}` : null,
    row.wikipediaExtract ? `Summary: ${row.wikipediaExtract}` : null,
    related ? `Related: ${related}` : null,
    tags.length ? `Tags: ${tags.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('. ');
}

async function main() {
  loadEnvFile('.env.local');
  const manualTags = loadTagsIndex();

  const model = process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_MODEL;
  const batchSize = Number(process.env.OPENAI_EMBEDDING_BATCH || DEFAULT_BATCH);

  const rows = await db
    .select({
      id: figures.id,
      canonicalName: figures.canonicalName,
      domain: figures.domain,
      occupation: figures.occupation,
      era: figures.era,
      regionMacro: figures.regionMacro,
      regionSub: figures.regionSub,
      birthPlace: figures.birthPlace,
      wikipediaExtract: figures.wikipediaExtract,
      relatedFigures: figures.relatedFigures,
    })
    .from(figures)
    .orderBy(asc(sql`${figures.llmConsensusRank} is null`), asc(figures.llmConsensusRank));

  const inputs = rows.map((row) => buildEmbeddingText(row, deriveTags(row, manualTags)));
  const vectors: Array<{ id: string; vector: number[] }> = [];

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batchInputs = inputs.slice(i, i + batchSize);
    const embeddings = await embedBatch(batchInputs, model);
    embeddings.forEach((embedding, index) => {
      const normalized = normalizeVector(embedding);
      vectors.push({ id: rows[i + index].id, vector: normalized });
    });
    console.log(`Embedded ${Math.min(i + batchSize, inputs.length)} / ${inputs.length}`);
  }

  const output = {
    model,
    dims: vectors[0]?.vector.length || 0,
    createdAt: new Date().toISOString(),
    figures: vectors,
  };

  const outPath = path.join(process.cwd(), 'data', 'embeddings', 'figures.json');
  fs.writeFileSync(outPath, JSON.stringify(output));
  console.log(`Saved embeddings to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

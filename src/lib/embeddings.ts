import fs from 'fs';
import path from 'path';

export type FigureEmbedding = {
  id: string;
  vector: number[];
};

export type EmbeddingsIndex = {
  model: string;
  dims: number;
  createdAt: string;
  figures: FigureEmbedding[];
};

export type MediaEmbedding = {
  id: string;
  vector: number[];
};

export type MediaEmbeddingsIndex = {
  model: string;
  dims: number;
  createdAt: string;
  items: MediaEmbedding[];
};

const DEFAULT_MODEL = 'text-embedding-3-small';

let cachedIndex: EmbeddingsIndex | null = null;
let cachedPath: string | null = null;

let cachedMediaIndex: MediaEmbeddingsIndex | null = null;

function resolveEmbeddingsPath(): string {
  const candidates = [
    path.join(process.cwd(), 'data', 'embeddings', 'figures.json'),
    path.join(__dirname, '../../data/embeddings/figures.json'),
    path.join(__dirname, '../../../data/embeddings/figures.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

function resolveMediaEmbeddingsPath(): string {
  const candidates = [
    path.join(process.cwd(), 'data', 'embeddings', 'media.json'),
    path.join(__dirname, '../../data/embeddings/media.json'),
    path.join(__dirname, '../../../data/embeddings/media.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

export function loadFigureEmbeddings(): EmbeddingsIndex | null {
  if (cachedIndex) return cachedIndex;

  const embeddingsPath = resolveEmbeddingsPath();
  if (!fs.existsSync(embeddingsPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(embeddingsPath, 'utf8');
    // Guard against LFS pointer files or corrupt data
    if (!raw.startsWith('{')) {
      console.warn('[embeddings] figures.json appears to be an LFS pointer or invalid, skipping');
      return null;
    }
    cachedIndex = JSON.parse(raw) as EmbeddingsIndex;
    cachedPath = embeddingsPath;
    return cachedIndex;
  } catch (error) {
    console.warn('[embeddings] Failed to load figure embeddings:', error);
    return null;
  }
}

export function loadMediaEmbeddings(): MediaEmbeddingsIndex | null {
  if (cachedMediaIndex) return cachedMediaIndex;

  const embeddingsPath = resolveMediaEmbeddingsPath();
  if (!fs.existsSync(embeddingsPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(embeddingsPath, 'utf8');
    if (!raw.startsWith('{')) {
      console.warn('[embeddings] media.json appears to be an LFS pointer or invalid, skipping');
      return null;
    }
    cachedMediaIndex = JSON.parse(raw) as MediaEmbeddingsIndex;
    return cachedMediaIndex;
  } catch (error) {
    console.warn('[embeddings] Failed to load media embeddings:', error);
    return null;
  }
}

export function getEmbeddingsPath() {
  if (cachedPath) return cachedPath;
  return resolveEmbeddingsPath();
}

export function normalizeVector(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum) || 1;
  return vector.map((value) => value / norm);
}

export function dot(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

export async function embedQuery(text: string): Promise<number[]> {
  if (typeof window !== 'undefined') {
    throw new Error('embedQuery can only run on the server');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_MODEL;

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI embeddings failed (${response.status}): ${message}`);
  }

  const json = (await response.json()) as { data?: Array<{ embedding: number[] }> };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error('OpenAI embeddings response missing embedding data');
  }

  return embedding;
}

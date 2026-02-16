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

/**
 * Binary embeddings index — holds a shared Float32Array buffer and
 * provides per-figure vector slices without copying memory.
 */
export type BinaryEmbeddingsIndex = {
  model: string;
  dims: number;
  createdAt: string;
  count: number;
  ids: string[];
  vectors: Float32Array; // count × dims contiguous floats
};

const DEFAULT_MODEL = 'text-embedding-3-small';

let cachedBinaryIndex: BinaryEmbeddingsIndex | null = null;
let cachedJsonIndex: EmbeddingsIndex | null = null;
let cachedPath: string | null = null;

let cachedMediaIndex: MediaEmbeddingsIndex | null = null;

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function resolveFile(filename: string): string | null {
  const candidates = [
    path.join(process.cwd(), 'data', 'embeddings', filename),
    path.join(__dirname, '../../data/embeddings', filename),
    path.join(__dirname, '../../../data/embeddings', filename),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveMediaEmbeddingsPath(): string {
  const found = resolveFile('media.json');
  return found ?? path.join(process.cwd(), 'data', 'embeddings', 'media.json');
}

// ---------------------------------------------------------------------------
// Binary loader (preferred — ~29 MB vs 149 MB JSON)
// ---------------------------------------------------------------------------

function loadBinaryIndex(): BinaryEmbeddingsIndex | null {
  if (cachedBinaryIndex) return cachedBinaryIndex;

  const metaPath = resolveFile('figures-meta.json');
  const binPath = resolveFile('figures-vectors.bin');
  if (!metaPath || !binPath) return null;

  try {
    const metaRaw = fs.readFileSync(metaPath, 'utf8');
    if (!metaRaw.startsWith('{')) {
      console.warn('[embeddings] figures-meta.json appears to be an LFS pointer, skipping');
      return null;
    }
    const meta = JSON.parse(metaRaw) as {
      model: string;
      dims: number;
      createdAt: string;
      count: number;
      ids: string[];
    };

    const buf = fs.readFileSync(binPath);
    const expectedBytes = meta.count * meta.dims * 4;
    if (buf.length !== expectedBytes) {
      console.warn(
        `[embeddings] Binary size mismatch: got ${buf.length}, expected ${expectedBytes}. Skipping.`,
      );
      return null;
    }

    // Create a Float32Array over the buffer.  Buffer.from() guarantees a fresh
    // ArrayBuffer copy so the underlying memory is safe to retain.
    const aligned = Buffer.from(buf);
    const vectors = new Float32Array(
      aligned.buffer,
      aligned.byteOffset,
      meta.count * meta.dims,
    );

    cachedBinaryIndex = { ...meta, vectors };
    console.log(
      `[embeddings] Loaded binary figures index: ${meta.count} figures, ${meta.dims} dims`,
    );
    return cachedBinaryIndex;
  } catch (error) {
    console.warn('[embeddings] Failed to load binary figure embeddings:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// JSON loader (fallback for local dev with the big JSON file)
// ---------------------------------------------------------------------------

function loadJsonIndex(): EmbeddingsIndex | null {
  if (cachedJsonIndex) return cachedJsonIndex;

  const jsonPath = resolveFile('figures.json');
  if (!jsonPath) return null;

  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    if (!raw.startsWith('{')) {
      console.warn('[embeddings] figures.json appears to be an LFS pointer or invalid, skipping');
      return null;
    }
    cachedJsonIndex = JSON.parse(raw) as EmbeddingsIndex;
    cachedPath = jsonPath;
    return cachedJsonIndex;
  } catch (error) {
    console.warn('[embeddings] Failed to load JSON figure embeddings:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load figure embeddings, trying binary format first (Vercel-friendly),
 * then falling back to the legacy 149 MB JSON file.
 *
 * Returns null if neither source is available (graceful degradation to
 * lexical-only search).
 */
export function loadFigureEmbeddings(): EmbeddingsIndex | null {
  // Try binary first (fast, small, works on Vercel)
  const binary = loadBinaryIndex();
  if (binary) {
    // Wrap as legacy EmbeddingsIndex so callers don't need to change.
    // Each figure.vector is a Float32Array *view* (no copy).
    return {
      model: binary.model,
      dims: binary.dims,
      createdAt: binary.createdAt,
      figures: binary.ids.map((id, i) => ({
        id,
        vector: Array.from(
          binary.vectors.subarray(i * binary.dims, (i + 1) * binary.dims),
        ),
      })),
    };
  }

  // Fallback to JSON
  return loadJsonIndex();
}

/**
 * Load figure embeddings in binary form for callers that want to avoid
 * the per-figure Array.from() copy overhead.  Returns null if binary
 * files aren't available.
 */
export function loadFigureEmbeddingsBinary(): BinaryEmbeddingsIndex | null {
  return loadBinaryIndex();
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
  return resolveFile('figures.json') ?? resolveFile('figures-meta.json') ?? '';
}

export function normalizeVector(vector: number[]): number[] {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum) || 1;
  return vector.map((value) => value / norm);
}

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
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

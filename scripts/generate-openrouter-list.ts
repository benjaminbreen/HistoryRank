import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(fileName: string) {
  const envPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');

type GenerateOptions = {
  model: string;
  label: string;
  labelFromArgs: boolean;
  outputDir: string;
  maxRetries: number;
  chunked: boolean;
  chunkSize: number;
  timeoutMs: number;
  resume: boolean;
  resumeFile: string | null;
};

const DEFAULT_MODEL = 'qwen/qwen3-235b-a22b-2507';
const DEFAULT_LABEL = '';
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'raw');
const MAX_RETRIES = 3;
const DEFAULT_CHUNK_SIZE = 250;
const DEFAULT_TIMEOUT_MS = 180000;
const TOTAL_RANKS = 1000;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function parseArgs(): GenerateOptions {
  const args = process.argv.slice(2);
  const options: GenerateOptions = {
    model: DEFAULT_MODEL,
    label: DEFAULT_LABEL,
    labelFromArgs: false,
    outputDir: OUTPUT_DIR,
    maxRetries: MAX_RETRIES,
    chunked: false,
    chunkSize: DEFAULT_CHUNK_SIZE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    resume: false,
    resumeFile: null,
  };

  for (const arg of args) {
    if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg.startsWith('--label=')) {
      options.label = arg.slice('--label='.length);
      options.labelFromArgs = true;
    } else if (arg.startsWith('--out=')) {
      options.outputDir = path.resolve(arg.slice('--out='.length));
    } else if (arg.startsWith('--retries=')) {
      options.maxRetries = Number(arg.slice('--retries='.length));
    } else if (arg === '--chunked') {
      options.chunked = true;
    } else if (arg.startsWith('--chunk-size=')) {
      options.chunkSize = Number(arg.slice('--chunk-size='.length));
    } else if (arg.startsWith('--timeout=')) {
      options.timeoutMs = Number(arg.slice('--timeout='.length));
    } else if (arg === '--resume') {
      options.resume = true;
    } else if (arg.startsWith('--resume-file=')) {
      options.resumeFile = arg.slice('--resume-file='.length);
    }
  }

  return options;
}

function readPromptFromAgents(): string {
  const agentsPath = path.join(process.cwd(), 'AGENTS.md');
  const content = fs.readFileSync(agentsPath, 'utf8');
  const marker = '## Core LLM prompt (use exactly, unchanged)';
  const start = content.indexOf(marker);
  if (start === -1) {
    throw new Error('Could not find Core LLM prompt in AGENTS.md');
  }
  const afterMarker = content.slice(start + marker.length);
  const lines = afterMarker.split('\n').map((line) => line.trim());
  const promptLine = lines.find((line) => line.length > 0);
  if (!promptLine) {
    throw new Error('Core LLM prompt is empty in AGENTS.md');
  }
  return promptLine;
}

function nextListNumber(prefix: string, outputDir: string): number {
  const files = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedPrefix} LIST (\\d+) \\(`, 'i');
  let max = 0;
  for (const file of files) {
    const match = file.match(regex);
    if (match) {
      const n = Number(match[1]);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
  }
  return max + 1;
}

function formatDate(d = new Date()): string {
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function extractJsonArray(text: string): string {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON array found in model output.');
  }
  return text.slice(start, end + 1);
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 1000000007;
  }
  return String(hash);
}

function validateList(items: unknown[], expectedCount = 1000): void {
  if (items.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} entries, got ${items.length}`);
  }
  const ranks = new Set<number>();
  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      throw new Error('Entry is not an object.');
    }
    const entry = item as { rank?: number; name?: string; primary_contribution?: string };
    if (typeof entry.rank !== 'number' || typeof entry.name !== 'string' || typeof entry.primary_contribution !== 'string') {
      throw new Error('Entry missing rank/name/primary_contribution.');
    }
    ranks.add(entry.rank);
  }
  if (ranks.size !== expectedCount) {
    throw new Error('Ranks are not unique.');
  }
}

async function callOpenRouter(prompt: string, model: string, timeoutMs: number): Promise<string> {
  const apiKey = getEnv('OPENROUTER_API_KEY');
  const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'HistoryRank',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message?.content;
  if (typeof message !== 'string') {
    throw new Error('OpenRouter response missing content.');
  }
  return message;
}

type PartialState = {
  runId: string;
  model: string;
  label?: string;
  chunkSize: number;
  promptHash: string;
  createdAt: string;
  entries: unknown[];
  completedRanges: { start: number; end: number }[];
};

function sanitizeModelId(model: string): string {
  return model.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase();
}

function labelFromModel(model: string): string {
  const explicitMap: Record<string, string> = {
    'x-ai/grok-4.1-fast': 'Grok 4.1 Fast',
    'x-ai/grok-4': 'Grok 4',
    'qwen/qwen3-235b-a22b-2507': 'Qwen3 235B A22B',
    'qwen/qwen3-235b-a22b-thinking-2507': 'Qwen3 235B A22B Thinking',
  };

  if (explicitMap[model]) return explicitMap[model];

  const raw = model.split('/').slice(-1)[0] || model;
  const parts = raw.split(/[-_]+/g).filter(Boolean);
  return parts.map((part) => {
    if (/^\d/.test(part)) return part;
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ');
}

function findLatestPartial(prefix: string, outputDir: string): string | null {
  if (!fs.existsSync(outputDir)) return null;
  const files = fs.readdirSync(outputDir).filter((file) => file.startsWith(`.${prefix}-partial-`));
  if (!files.length) return null;
  const withStats = files.map((file) => ({
    file,
    mtime: fs.statSync(path.join(outputDir, file)).mtimeMs,
  }));
  withStats.sort((a, b) => b.mtime - a.mtime);
  return path.join(outputDir, withStats[0].file);
}

async function generateChunk(
  prompt: string,
  model: string,
  startRank: number,
  endRank: number,
  maxRetries: number,
  timeoutMs: number
) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      console.log(`Requesting ranks ${startRank}-${endRank} (attempt ${attempt}/${maxRetries})...`);
      const chunkPrompt = `${prompt}\n\nReturn only ranks ${startRank} through ${endRank} as a raw JSON array (no extra text).`;
      const output = await callOpenRouter(chunkPrompt, model, timeoutMs);
      const jsonArray = extractJsonArray(output);
      const parsed = JSON.parse(jsonArray);
      if (!Array.isArray(parsed)) {
        throw new Error('Parsed output is not an array.');
      }

      const expectedCount = endRank - startRank + 1;
      validateList(parsed, expectedCount);
      for (const item of parsed) {
        const entry = item as { rank: number };
        if (entry.rank < startRank || entry.rank > endRank) {
          throw new Error(`Out of range rank: ${entry.rank}`);
        }
      }

      return parsed;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Chunk ${startRank}-${endRank} failed: ${lastError.message}`);
    }
  }
  throw lastError || new Error('Failed to generate chunk.');
}

async function main() {
  const options = parseArgs();
  const prompt = readPromptFromAgents();
  const promptHash = hashString(prompt);
  const prefix = options.labelFromArgs
    ? options.label
    : (options.label || labelFromModel(options.model));

  if (options.chunked) {
    console.log(`Generating list in chunks of ${options.chunkSize}...`);
    fs.mkdirSync(options.outputDir, { recursive: true });

    let state: PartialState;
    let partialPath: string;

    if (options.resume || options.resumeFile) {
      partialPath = options.resumeFile
        ? path.resolve(options.resumeFile)
        : (findLatestPartial(prefix, options.outputDir) || '');

      if (!partialPath || !fs.existsSync(partialPath)) {
        throw new Error('No partial file found to resume.');
      }

      const raw = fs.readFileSync(partialPath, 'utf8');
      state = JSON.parse(raw) as PartialState;

      if (state.model !== options.model) {
        throw new Error(`Partial file model mismatch: ${state.model}`);
      }
      if (state.chunkSize !== options.chunkSize) {
        throw new Error(`Partial file chunk size mismatch: ${state.chunkSize}`);
      }
      if (state.promptHash !== promptHash) {
        throw new Error('Partial file prompt hash mismatch.');
      }
      console.log(`Resuming from ${partialPath}`);
    } else {
      const runId = new Date().toISOString().replace(/[:.]/g, '-');
      const partialName = `.${prefix}-partial-${sanitizeModelId(options.model)}-${runId}.json`;
      partialPath = path.join(options.outputDir, partialName);
      state = {
        runId,
        model: options.model,
        label: prefix,
        chunkSize: options.chunkSize,
        promptHash,
        createdAt: new Date().toISOString(),
        entries: [],
        completedRanges: [],
      };
      fs.writeFileSync(partialPath, JSON.stringify(state, null, 2));
      console.log(`Initialized partial file at ${partialPath}`);
    }

    const entriesByRank = new Map<number, unknown>();
    for (const entry of state.entries) {
      const item = entry as { rank?: number };
      if (typeof item.rank === 'number') {
        entriesByRank.set(item.rank, entry);
      }
    }

    const completed = new Set(state.completedRanges.map((range) => `${range.start}-${range.end}`));
    for (let start = 1; start <= TOTAL_RANKS; start += options.chunkSize) {
      const end = Math.min(start + options.chunkSize - 1, TOTAL_RANKS);
      const key = `${start}-${end}`;
      if (completed.has(key)) continue;

      const chunk = await generateChunk(prompt, options.model, start, end, options.maxRetries, options.timeoutMs);
      for (const item of chunk) {
        const entry = item as { rank?: number };
        if (typeof entry.rank === 'number') {
          entriesByRank.set(entry.rank, item);
        }
      }

      state.completedRanges.push({ start, end });
      state.entries = Array.from(entriesByRank.entries())
        .sort((a, b) => a[0] - b[0])
        .map((item) => item[1]);
      fs.writeFileSync(partialPath, JSON.stringify(state, null, 2));
      console.log(`Saved progress to ${partialPath}`);
    }

    const chunks = Array.from(entriesByRank.entries())
      .sort((a, b) => a[0] - b[0])
      .map((item) => item[1]);
    validateList(chunks, TOTAL_RANKS);
    const listNumber = nextListNumber(prefix, options.outputDir);
    const filename = `${prefix} LIST ${listNumber} (${formatDate()}).txt`;
    const fullPath = path.join(options.outputDir, filename);
    fs.writeFileSync(fullPath, JSON.stringify(chunks, null, 2));
    if (partialPath && fs.existsSync(partialPath)) {
      fs.unlinkSync(partialPath);
    }
    console.log(`Saved ${chunks.length} entries to ${fullPath}`);
    return;
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= options.maxRetries; attempt += 1) {
    try {
      console.log(`Generating list (attempt ${attempt}/${options.maxRetries}) with model ${options.model}...`);
      const output = await callOpenRouter(prompt, options.model, options.timeoutMs);
      const jsonArray = extractJsonArray(output);
      const parsed = JSON.parse(jsonArray);
      if (!Array.isArray(parsed)) {
        throw new Error('Parsed output is not an array.');
      }
      validateList(parsed);

      const listNumber = nextListNumber(prefix, options.outputDir);
      const filename = `${prefix} LIST ${listNumber} (${formatDate()}).txt`;
      const fullPath = path.join(options.outputDir, filename);
      fs.mkdirSync(options.outputDir, { recursive: true });
      fs.writeFileSync(fullPath, JSON.stringify(parsed, null, 2));

      console.log(`Saved ${parsed.length} entries to ${fullPath}`);
      return;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt} failed: ${lastError.message}`);
    }
  }

  throw lastError || new Error('Failed to generate list.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

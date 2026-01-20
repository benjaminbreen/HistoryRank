import fs from 'node:fs';
import path from 'node:path';
import {
  assessListQuality,
  formatReportAsText,
  type ListEntry,
  type QualityReport,
} from './lib/assess-list-quality.js';

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
const TOTAL_RANKS = 500;
const PROMPT_LABEL_SUFFIX = 'Detailed Prompt';

const DETAILED_PROMPT = [
  'Role: You are a senior historian and data scientist specializing in historiometry (quantitative reasoning about historical impact).',
  '',
  'Task: Generate a ranked list of the 500 most influential historical individuals in world history.',
  '',
  'Core metric (explicit rubric):',
  'For each candidate, assign three subscores from 0-5 using the anchors below, then compute TOTAL = Breadth + Depth + Longevity (0-15).',
  'All scores must be integers.',
  'Your ranking must be strictly non-increasing by TOTAL (i.e., TOTAL at rank n >= TOTAL at rank n+1).',
  'If two candidates share the same TOTAL, break ties by (1) higher Longevity, then (2) higher Depth, then (3) higher Breadth.',
  'If still tied, order by earliest birth year; if unknown, earliest attested century; if still tied, alphabetical by name.',
  '',
  'Breadth (0-5): geographic scope of influence',
  '0 = local/short-range; 1 = single polity/region; 2 = multi-regional; 3 = continental; 4 = multi-continental; 5 = global-systemic.',
  '',
  'Depth (0-5): degree to which the individual altered institutions, knowledge systems, or mass behavior',
  '0 = marginal; 1 = modest; 2 = meaningful within a domain; 3 = reshaped a major institution/field; 4 = restructured multiple institutions/fields or enabled a new regime; 5 = foundational transformation (religious, state, economic, scientific/technological, or civilizational).',
  '',
  'Longevity (0-5): persistence of effects across time',
  '0 = <10 years; 1 = decades; 2 = ~1 century; 3 = multiple centuries; 4 = >500 years; 5 = >1000 years or still-cascading structural effects.',
  '',
  'Admissibility rules (strict):',
  '- Individuals only (no groups, movements, dynasties, corporations, bands, collectives, or anonymous traditions).',
  '- Historically attested persons only; exclude purely legendary/uncertain figures. (If attestation is borderline, exclude.)',
  '- Use a standard, widely recognized name form (no relational labels like "X\'s rival" or "Y\'s adviser").',
  '- No duplicates: each name may appear only once.',
  '',
  'Anti-bias guardrails (method, not quotas):',
  '- Do NOT enforce demographic quotas (gender, region, ethnicity, etc.).',
  '- Do NOT treat modern Anglophone fame, Nobel/award status, or pop-culture visibility as evidence.',
  '- When in doubt, prefer demonstrable institutional, infrastructural, or long-run civilizational effects over media celebrity or short-lived notoriety.',
  '- Actively correct for encyclopedia gravity: before finalizing, explicitly consider whether major world regions and eras are underweighted due to source visibility. Only adjust when the rubric supports it (no token additions).',
  '',
  'Clustering constraint:',
  '- This is a single linear competition. Do not output blocks by profession, era, or nationality.',
  '- However, do not artificially alternate categories; the order must follow the TOTAL/tie-break rules.',
  '',
  'Output format (JSON only; no other text):',
  'Return a raw JSON array of 500 objects. Each object must include:',
  '{',
  '  "rank": <integer 1-500>,',
  '  "name": "<string>",',
  '  "primary_contribution": "<one sentence, concrete mechanism of impact>",',
  '  "breadth": <0-5>,',
  '  "depth": <0-5>,',
  '  "longevity": <0-5>,',
  '  "total": <0-15>',
  '}',
  '',
  'Example object format (use your own values):',
  '{ "rank": 1, "name": "Example Name", "primary_contribution": "One sentence describing a concrete mechanism of impact.", "breadth": 5, "depth": 5, "longevity": 5, "total": 15 }',
  '',
  'Quality control (must perform before output):',
  '1) Uniqueness check: ensure every "name" is unique.',
  '2) Score monotonicity check: ensure totals are non-increasing by rank; fix violations.',
  '3) Admissibility check: remove any collective/legendary/relational-name entries and replace them with the next-best candidates under the rubric.',
  '4) Global sanity check: if >60% of the list is from any one macro-region (Europe, East Asia, South Asia, MENA, Sub-Saharan Africa, Americas, Oceania), re-audit for encyclopedia bias; only revise where scores justify it.',
  '5) Schema check: ensure every field is present, in range, and correctly typed; fix any violations before responding.',
  '6) Rank check: ranks must be exactly 1-500, sequential, with no gaps.',
  '',
  'Technical instruction:',
  'Output the JSON array only. No preface, no explanation, no markdown.',
].join('\n');

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

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    // Support both --flag=value and --flag value formats
    if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg === '--model' && nextArg && !nextArg.startsWith('--')) {
      options.model = nextArg;
      i++;
    } else if (arg.startsWith('--label=')) {
      options.label = arg.slice('--label='.length);
      options.labelFromArgs = true;
    } else if (arg === '--label' && nextArg && !nextArg.startsWith('--')) {
      options.label = nextArg;
      options.labelFromArgs = true;
      i++;
    } else if (arg.startsWith('--out=')) {
      options.outputDir = path.resolve(arg.slice('--out='.length));
    } else if (arg === '--out' && nextArg && !nextArg.startsWith('--')) {
      options.outputDir = path.resolve(nextArg);
      i++;
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

function runQualityAssessment(
  entries: ListEntry[],
  filename: string,
  model: string,
  outputDir: string
): QualityReport {
  const report = assessListQuality(entries, filename, model);

  // Save JSON report
  const reportFilename = filename.replace(/\.txt$/, '.quality.json');
  const reportPath = path.join(outputDir, reportFilename);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Save text report
  const textReportFilename = filename.replace(/\.txt$/, '.quality.txt');
  const textReportPath = path.join(outputDir, textReportFilename);
  fs.writeFileSync(textReportPath, formatReportAsText(report));

  // Print summary to console
  const verdictColor = report.verdict === 'PASS' ? '\x1b[32m' : report.verdict === 'WARN' ? '\x1b[33m' : '\x1b[31m';
  const resetColor = '\x1b[0m';
  console.log(`\n📊 Quality Assessment: ${verdictColor}${report.verdict}${resetColor}`);
  console.log(`   ${report.summary}`);
  console.log(`   Report saved to: ${reportFilename}`);

  if (report.verdict === 'FAIL') {
    console.log('\n⚠️  WARNING: This list has quality issues and may not be suitable for inclusion.');
    console.log(`   Review the report for details: ${textReportPath}`);
  }

  return report;
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
      // Enable reasoning for models that support it (GPT-5.2, o3, etc.)
      // This makes OpenRouter GPT-5.2 behave like ChatGPT "Thinking" mode
      ...(model.includes('gpt-5') || model.includes('o3') ? {
        reasoning: { effort: 'high' }
      } : {}),
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
    // OpenAI
    'openai/gpt-5.2': 'GPT-5.2 Thinking',
    'openai/gpt-5.2-chat': 'GPT-5.2 Chat',
    'openai/gpt-5.2-pro': 'GPT-5.2 Pro',
    'openai/o3-mini': 'o3-mini',
    // xAI
    'x-ai/grok-4.1-fast': 'Grok 4.1 Fast',
    'x-ai/grok-4': 'Grok 4',
    // Qwen
    'qwen/qwen3-235b-a22b-2507': 'Qwen3 235B A22B',
    'qwen/qwen3-235b-a22b-thinking-2507': 'Qwen3 235B A22B Thinking',
    // Google
    'google/gemini-3-pro-preview': 'Gemini Pro 3',
    'google/gemini-3-flash-preview': 'Gemini Flash 3 Preview',
    // Anthropic
    'anthropic/claude-opus-4.5': 'Claude Opus 4.5',
    'anthropic/claude-sonnet-4.5': 'Claude Sonnet 4.5',
    // DeepSeek
    'deepseek/deepseek-chat-v3-0324': 'DeepSeek V3.2',
    // Mistral
    'mistralai/mistral-large-2501': 'Mistral Large 3',
    // GLM
    'zhipu/glm-4.7': 'GLM 4.7',
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

function buildPrefix(options: GenerateOptions): string {
  let prefix = options.labelFromArgs
    ? options.label
    : (options.label || labelFromModel(options.model));

  if (!options.labelFromArgs && !prefix.toLowerCase().includes('detailed')) {
    prefix = `${prefix} ${PROMPT_LABEL_SUFFIX}`;
  }

  return prefix;
}

async function main() {
  const options = parseArgs();
  const prompt = DETAILED_PROMPT;
  const promptHash = hashString(prompt);
  const prefix = buildPrefix(options);

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

    // Run quality assessment
    runQualityAssessment(chunks as ListEntry[], filename, options.model, options.outputDir);
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
      validateList(parsed, TOTAL_RANKS);

      const listNumber = nextListNumber(prefix, options.outputDir);
      const filename = `${prefix} LIST ${listNumber} (${formatDate()}).txt`;
      const fullPath = path.join(options.outputDir, filename);
      fs.mkdirSync(options.outputDir, { recursive: true });
      fs.writeFileSync(fullPath, JSON.stringify(parsed, null, 2));

      console.log(`Saved ${parsed.length} entries to ${fullPath}`);

      // Run quality assessment
      runQualityAssessment(parsed as ListEntry[], filename, options.model, options.outputDir);
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

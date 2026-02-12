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
  reportDir: string;
  maxRetries: number;
  chunkSize: number;
  timeoutMs: number;
  resume: boolean;
  resumeFile: string | null;
  forbiddenLimit: number;
  relaxedTopup: boolean;
  totalRanks: number;
  singleShot: boolean;
};

const DEFAULT_MODEL = 'qwen/qwen3-235b-a22b-2507';
const DEFAULT_LABEL = '';
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'raw_v2');
const REPORT_DIR = path.join(process.cwd(), 'data', 'quality-reports-v2');
const MAX_RETRIES = 3;
const DEFAULT_CHUNK_SIZE = 100;
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_FORBIDDEN_LIMIT = 100;
const TOTAL_RANKS = 500;
const PROMPT_LABEL_SUFFIX = 'V2 Prompt';
const PARTIAL_PREFIX = '.v2-partial';
const DEFAULT_RELAXED_TOPUP = true;
const DEFAULT_SINGLE_SHOT = true;

const V2_PROMPT = [
  'Role: You are a senior historian and data scientist specializing in historiometry.',
  '',
  'Task: Generate a candidate pool of influential historical individuals in world history.',
  '',
  'Scoring rubric (explicit):',
  'For each candidate, assign three subscores from 0-5 using the anchors below, then compute TOTAL = Breadth + Depth + Longevity (0-15).',
  'All scores must be integers.',
  '',
  'Breadth (0-5): geographic scope of influence',
  '0 = local/short-range; 1 = single polity/region; 2 = multi-regional; 3 = continental; 4 = multi-continental; 5 = global-systemic.',
  '',
  'Depth (0-5): degree to which the individual altered institutions, knowledge systems, or mass behavior',
  '0 = marginal; 1 = modest; 2 = meaningful within a domain; 3 = reshaped a major institution/field; 4 = restructured multiple institutions/fields or enabled a new regime; 5 = foundational transformation.',
  '',
  'Longevity (0-5): persistence of effects across time',
  '0 = <10 years; 1 = decades; 2 = ~1 century; 3 = multiple centuries; 4 = >500 years; 5 = >1000 years or still-cascading effects.',
  '',
  'Admissibility rules (strict):',
  '- Individuals only (no groups, movements, dynasties, corporations, bands, collectives).',
  '- Historically attested persons only; exclude purely legendary/uncertain figures.',
  '- Use standard, widely recognized name forms (no relational labels like "X\'s adviser").',
  '- No duplicates within this output.',
  '',
  'Anti-collapse guidance:',
  '- Avoid long consecutive runs of the same profession/domain/role (e.g., 6+ in a row).',
  '- Avoid local minima: if you notice a thematic run emerging, diversify candidates while still honoring the rubric.',
  '',
  'Output format (JSON only; no other text):',
  'Return a raw JSON array of objects. Each object must include:',
  '{',
  '  "name": "<string>",',
  '  "breadth": <0-5>,',
  '  "depth": <0-5>,',
  '  "longevity": <0-5>,',
  '  "total": <0-15>',
  '}',
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
    reportDir: REPORT_DIR,
    maxRetries: MAX_RETRIES,
    chunkSize: DEFAULT_CHUNK_SIZE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    resume: false,
    resumeFile: null,
    forbiddenLimit: DEFAULT_FORBIDDEN_LIMIT,
    relaxedTopup: DEFAULT_RELAXED_TOPUP,
    totalRanks: TOTAL_RANKS,
    singleShot: DEFAULT_SINGLE_SHOT,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

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
    } else if (arg.startsWith('--report-dir=')) {
      options.reportDir = path.resolve(arg.slice('--report-dir='.length));
    } else if (arg === '--report-dir' && nextArg && !nextArg.startsWith('--')) {
      options.reportDir = path.resolve(nextArg);
      i++;
    } else if (arg.startsWith('--retries=')) {
      options.maxRetries = Number(arg.slice('--retries='.length));
    } else if (arg.startsWith('--chunk-size=')) {
      options.chunkSize = Number(arg.slice('--chunk-size='.length));
    } else if (arg.startsWith('--timeout=')) {
      options.timeoutMs = Number(arg.slice('--timeout='.length));
    } else if (arg === '--resume') {
      options.resume = true;
    } else if (arg.startsWith('--resume-file=')) {
      options.resumeFile = arg.slice('--resume-file='.length);
    } else if (arg.startsWith('--forbidden-limit=')) {
      options.forbiddenLimit = Number(arg.slice('--forbidden-limit='.length));
    } else if (arg === '--no-relaxed-topup') {
      options.relaxedTopup = false;
    } else if (arg.startsWith('--total=')) {
      options.totalRanks = Number(arg.slice('--total='.length));
    } else if (arg === '--single-shot') {
      options.singleShot = true;
    } else if (arg === '--chunked') {
      options.singleShot = false;
    }
  }

  return options;
}

function nextListNumber(prefix: string, outputDir: string): number {
  const files = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedPrefix} V2 LIST (\\d+) \\(`, 'i');
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
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  throw new Error('No JSON array found in model output.');
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type Candidate = {
  name: string;
  breadth: number;
  depth: number;
  longevity: number;
  total: number;
};

function dedupeCandidates(items: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const item of items) {
    const key = normalizeName(item.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

type PartialState = {
  runId: string;
  model: string;
  label: string;
  chunkSize: number;
  createdAt: string;
  candidates: Candidate[];
};

function validateCandidates(items: unknown[]): Candidate[] {
  const out: Candidate[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const entry = item as Candidate;
    if (
      typeof entry.name !== 'string' ||
      typeof entry.breadth !== 'number' ||
      typeof entry.depth !== 'number' ||
      typeof entry.longevity !== 'number'
    ) {
      continue;
    }
    const total = typeof entry.total === 'number' ? entry.total : entry.breadth + entry.depth + entry.longevity;
    out.push({
      name: entry.name.trim(),
      breadth: entry.breadth,
      depth: entry.depth,
      longevity: entry.longevity,
      total,
    });
  }
  return out;
}

function runQualityAssessment(
  entries: ListEntry[],
  filename: string,
  model: string,
  reportDir: string,
  expectedCount: number
): QualityReport {
  const report = assessListQuality(entries, filename, model, expectedCount);
  fs.mkdirSync(reportDir, { recursive: true });

  const reportFilename = filename.replace(/\.txt$/, '.quality.json');
  const reportPath = path.join(reportDir, reportFilename);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const textReportFilename = filename.replace(/\.txt$/, '.quality.txt');
  const textReportPath = path.join(reportDir, textReportFilename);
  fs.writeFileSync(textReportPath, formatReportAsText(report));

  console.log(`\n📊 Quality Assessment: ${report.verdict}`);
  console.log(`   ${report.summary}`);
  console.log(`   Report saved to: ${reportPath}`);

  return report;
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
      temperature: 0.25,
      messages: [
        { role: 'user', content: prompt },
      ],
      ...(model.includes('gpt-5') || model.includes('o3') ? { reasoning: { effort: 'high' } } : {}),
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

async function repairJsonWithModel(output: string, model: string, timeoutMs: number): Promise<string> {
  const repairPrompt = [
    'You are a JSON repair tool.',
    'Fix the JSON array below so it is valid strict JSON.',
    'Rules:',
    '- Return ONLY the corrected JSON array.',
    '- Preserve all objects and fields.',
    '- Escape any quotes inside strings.',
    '- Remove trailing commas.',
    '',
    output,
  ].join('\n');
  return callOpenRouter(repairPrompt, model, timeoutMs);
}

function buildChunkPrompt(chunkSize: number, forbidden: string[]): string {
  const forbiddenBlock = forbidden.length
    ? `\nForbidden list (do not include any of these names):\n${forbidden.map((n) => `- ${n}`).join('\n')}\n`
    : '';
  return [
    V2_PROMPT,
    '',
    `Generate exactly ${chunkSize} candidates.`,
    'Output must be STRICT JSON: double quotes for all keys/strings, no trailing commas, escape quotes inside strings.',
    'Begin the response with "[" and end with "]". Do not include any other text or markdown.',
    forbiddenBlock,
  ].join('\n');
}

function rankCandidates(candidates: Candidate[]): ListEntry[] {
  const sorted = [...candidates].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.longevity !== a.longevity) return b.longevity - a.longevity;
    if (b.depth !== a.depth) return b.depth - a.depth;
    if (b.breadth !== a.breadth) return b.breadth - a.breadth;
    return a.name.localeCompare(b.name);
  });

  return sorted.map((c, idx) => ({
    rank: idx + 1,
    name: c.name,
    primary_contribution: '—',
    breadth: c.breadth,
    depth: c.depth,
    longevity: c.longevity,
    total: c.total,
  }) as ListEntry);
}

async function generateChunk(model: string, chunkSize: number, forbidden: string[], timeoutMs: number): Promise<Candidate[]> {
  const prompt = buildChunkPrompt(chunkSize, forbidden);
  const output = await callOpenRouter(prompt, model, timeoutMs);
  let jsonArray: string;
  let items: unknown[];
  try {
    jsonArray = extractJsonArray(output);
    items = JSON.parse(jsonArray) as unknown[];
  } catch {
    const repaired = await repairJsonWithModel(output, model, timeoutMs);
    jsonArray = extractJsonArray(repaired);
    items = JSON.parse(jsonArray) as unknown[];
  }
  return validateCandidates(items);
}

function buildContributionPrompt(entries: ListEntry[]): string {
  return [
    'You are a historian. For each entry below, write ONE concise sentence describing a concrete mechanism of impact.',
    'Return STRICT JSON array ONLY. Each object must include:',
    '{ "name": "<string>", "primary_contribution": "<one sentence>" }',
    'Use the name exactly as given.',
    'Do not add or remove entries.',
    '',
    JSON.stringify(entries.map((e) => ({ name: e.name }))),
  ].join('\n');
}

async function enrichContributions(model: string, ranked: ListEntry[], timeoutMs: number): Promise<ListEntry[]> {
  const chunkSize = 200;
  const out = new Map<string, string>();
  for (let i = 0; i < ranked.length; i += chunkSize) {
    const chunk = ranked.slice(i, i + chunkSize);
    const prompt = buildContributionPrompt(chunk);
    const output = await callOpenRouter(prompt, model, timeoutMs);
    let jsonArray = extractJsonArray(output);
    let items: Array<{ name: string; primary_contribution: string }>;
    try {
      items = JSON.parse(jsonArray);
    } catch {
      const repaired = await repairJsonWithModel(jsonArray, model, timeoutMs);
      jsonArray = extractJsonArray(repaired);
      items = JSON.parse(jsonArray);
    }
    for (const item of items) {
      if (typeof item?.name === 'string' && typeof item?.primary_contribution === 'string') {
        out.set(item.name, item.primary_contribution);
      }
    }
  }

  return ranked.map((entry) => ({
    ...entry,
    primary_contribution: out.get(entry.name) || entry.primary_contribution,
  }));
}

async function main() {
  const options = parseArgs();
  const label = options.labelFromArgs ? options.label : options.label || options.model.split('/').slice(-1)[0];
  const promptLabel = `${label} ${PROMPT_LABEL_SUFFIX}`.trim();

  fs.mkdirSync(options.outputDir, { recursive: true });

  const listNumber = nextListNumber(label, options.outputDir);
  const filename = `${label} V2 LIST ${listNumber} (${formatDate()}).txt`;
  const outputPath = path.join(options.outputDir, filename);
  const partialPath = options.resumeFile
    ? path.resolve(options.resumeFile)
    : path.join(options.outputDir, `${PARTIAL_PREFIX}-${label}-${listNumber}.json`);

  console.log(`\n🧪 Generating V2 list for ${label}`);
  console.log(`   Model: ${options.model}`);
  console.log(`   Output: ${outputPath}`);
  console.log(`   Total ranks: ${options.totalRanks}`);
  console.log(`   Chunk size: ${options.chunkSize}`);
  console.log(`   Forbidden list limit: ${options.forbiddenLimit}`);
  console.log(`   Relaxed top-up: ${options.relaxedTopup ? 'on' : 'off'}`);
  console.log(`   Single shot: ${options.singleShot ? 'on' : 'off'}`);
  if (options.resume) {
    console.log(`   Resume: ${partialPath}`);
  }
  fs.mkdirSync(path.dirname(partialPath), { recursive: true });

  if (options.singleShot) {
    let candidates: Candidate[] = [];
    let rawOutput = '';
    for (let attempt = 1; attempt <= options.maxRetries; attempt += 1) {
      try {
        rawOutput = await callOpenRouter(buildChunkPrompt(options.totalRanks, []), options.model, options.timeoutMs);
        let jsonArray: string;
        try {
          jsonArray = extractJsonArray(rawOutput);
          candidates = validateCandidates(JSON.parse(jsonArray) as unknown[]);
        } catch {
          const repaired = await repairJsonWithModel(rawOutput, options.model, options.timeoutMs);
          jsonArray = extractJsonArray(repaired);
          candidates = validateCandidates(JSON.parse(jsonArray) as unknown[]);
        }
        break;
      } catch (error) {
        if (attempt === options.maxRetries) {
          const failedPath = outputPath.replace(/\.txt$/, '.failed.txt');
          fs.writeFileSync(failedPath, rawOutput || String(error));
          throw error;
        }
      }
    }

    candidates = dedupeCandidates(candidates);
    if (candidates.length < options.totalRanks) {
      console.warn(`\n⚠️  Only ${candidates.length} unique candidates generated. Proceeding with partial list.`);
    }

    const ranked = rankCandidates(candidates).slice(0, options.totalRanks);
    const enriched = await enrichContributions(options.model, ranked, options.timeoutMs);

    fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2));
    runQualityAssessment(enriched as ListEntry[], filename, promptLabel, options.reportDir, options.totalRanks);

    console.log(`\n✅ V2 list saved: ${outputPath}`);
    return;
  }

  const neededChunks = Math.ceil(options.totalRanks / options.chunkSize);
  let candidates: Candidate[] = [];
  const forbiddenSet = new Set<string>();

  if (options.resume && fs.existsSync(partialPath)) {
    const partial = JSON.parse(fs.readFileSync(partialPath, 'utf8')) as PartialState;
    if (partial.model !== options.model) {
      throw new Error(`Resume file model mismatch: ${partial.model} vs ${options.model}`);
    }
    candidates = partial.candidates || [];
    for (const entry of candidates) {
      forbiddenSet.add(normalizeName(entry.name));
    }
    console.log(`   Loaded ${candidates.length} candidates from partial file.`);
  }

  for (let i = 0; i < neededChunks; i++) {
    const remaining = options.totalRanks - candidates.length;
    const chunkSize = Math.min(options.chunkSize, remaining);
    console.log(`\n   ▶ Chunk ${i + 1}/${neededChunks} (${chunkSize} candidates)`);

    let attempts = 0;
    let filled = 0;
    while (filled < chunkSize && attempts < options.maxRetries) {
      try {
        const forbiddenAll = Array.from(forbiddenSet);
        const forbidden = forbiddenAll.slice(-options.forbiddenLimit);
        const chunk = await generateChunk(options.model, chunkSize - filled, forbidden, options.timeoutMs);
        let added = 0;
        for (const entry of chunk) {
          const normalized = normalizeName(entry.name);
          if (forbiddenSet.has(normalized)) continue;
          forbiddenSet.add(normalized);
          candidates.push(entry);
          added += 1;
        }
        filled += added;
        if (added === 0) {
          attempts += 1;
          console.warn(`   ⚠️  Chunk returned no new candidates (attempt ${attempts}/${options.maxRetries}).`);
        }
      } catch (error) {
        attempts += 1;
        console.warn(`   ⚠️  Chunk failed (attempt ${attempts}/${options.maxRetries}). Retrying...`);
      }
    }
    if (filled < chunkSize) {
      console.warn(`   ⚠️  Chunk incomplete: got ${filled}/${chunkSize} candidates. Continuing...`);
    }

    const partialState: PartialState = {
      runId: `${label}-${listNumber}`,
      model: options.model,
      label,
      chunkSize: options.chunkSize,
      createdAt: new Date().toISOString(),
      candidates,
    };
    fs.writeFileSync(partialPath, JSON.stringify(partialState, null, 2));
  }

  let topupAttempts = 0;
  let lastCount = candidates.length;
  while (candidates.length < options.totalRanks && topupAttempts < options.maxRetries) {
    const missing = options.totalRanks - candidates.length;
    console.warn(`\n⚠️  Top-up needed: ${missing} candidates remaining.`);
    try {
      const forbiddenAll = Array.from(forbiddenSet);
      const forbidden = forbiddenAll.slice(-options.forbiddenLimit);
      const chunk = await generateChunk(options.model, Math.min(options.chunkSize, missing), forbidden, options.timeoutMs);
      let added = 0;
      for (const entry of chunk) {
        const normalized = normalizeName(entry.name);
        if (forbiddenSet.has(normalized)) continue;
        forbiddenSet.add(normalized);
        candidates.push(entry);
        added += 1;
      }
      if (added === 0 || candidates.length === lastCount) {
        topupAttempts += 1;
      } else {
        topupAttempts = 0;
      }
      lastCount = candidates.length;
    } catch {
      topupAttempts += 1;
    }
  }

  if (options.relaxedTopup && candidates.length < options.totalRanks) {
    console.warn(`\n⚠️  Entering relaxed top-up mode (duplicates allowed).`);
    let relaxedAttempts = 0;
    while (candidates.length < options.totalRanks && relaxedAttempts < options.maxRetries) {
      const missing = options.totalRanks - candidates.length;
      try {
        const chunk = await generateChunk(options.model, Math.min(options.chunkSize, missing), [], options.timeoutMs);
        candidates.push(...chunk);
        candidates = dedupeCandidates(candidates);
      } catch {
        relaxedAttempts += 1;
      }
      if (candidates.length < options.totalRanks) {
        relaxedAttempts += 1;
      }
    }
  }

  if (candidates.length < options.totalRanks) {
    console.warn(`\n⚠️  Only ${candidates.length} unique candidates generated. Proceeding with partial list.`);
  }

  const ranked = rankCandidates(candidates).slice(0, options.totalRanks);
  const enriched = await enrichContributions(options.model, ranked, options.timeoutMs);

  fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2));

  // Run quality assessment (structure-only/duplicates/collapse) using requested totalRanks.
  runQualityAssessment(enriched as ListEntry[], filename, promptLabel, options.reportDir, options.totalRanks);

  console.log(`\n✅ V2 list saved: ${outputPath}`);
  if (fs.existsSync(partialPath)) {
    fs.unlinkSync(partialPath);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

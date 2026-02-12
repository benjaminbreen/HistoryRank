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
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'raw_v3');
const REPORT_DIR = path.join(process.cwd(), 'data', 'quality-reports-v3');
const MAX_RETRIES = 3;
const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_FORBIDDEN_LIMIT = 100;
const TOTAL_RANKS = 500;
const PROMPT_LABEL_SUFFIX = 'V3 Prompt';
const PARTIAL_PREFIX = '.v3-partial';
const DEFAULT_RELAXED_TOPUP = true;
const DEFAULT_SINGLE_SHOT = true;

const V3_PROMPT = [
  'Role: You are a historian specializing in historiometry—the systematic study of historical impact.',
  '',
  'Task: Generate a ranked list of the 500 most influential individuals in world history.',
  '',
  'Ranking Criteria (apply systematically):',
  '- Breadth: Geographic scope of influence (local → regional → continental → global)',
  '- Depth: Magnitude of change to human civilization—through institutions, belief systems, cultural expression, technology, social structures, or ways of understanding existence',
  '- Longevity: Durability of impact across time. For modern figures: estimate persistence based on how deeply embedded their contribution is, not recency',
  '',
  'Admissibility Rules:',
  '- Individuals only. Exclude groups, collectives, dynasties, movements.',
  '- Historically attested persons with documented existence.',
  '- Use a single, standard name per person.',
  '',
  'Entity Resolution (critical):',
  '- Before adding any person, verify they are not already present under a variant name.',
  '',
  'Ranking Methodology:',
  '- Single linear ranking by total historical impact, not categorical grouping.',
  '- If two figures are close, choose based on: (1) geographic reach, (2) durability of change, (3) depth of transformation.',
  '- Let impact determine distribution across domains—do not artificially balance by profession, region, or era.',
  '',
  'Output Format (JSON only):',
  'Return a raw JSON array of 500 objects. Each object must include:',
  '{',
  '  "rank": <integer 1-500>,',
  '  "name": "<string>",',
  '  "primary_contribution": "Concrete mechanism of impact (one sentence, <20 words)"',
  '}',
  '',
  'Technical Requirements:',
  '- Output only valid JSON array starting with [ and ending with ].',
  '- No preamble, explanation, or markdown.',
  '- Run internal duplicate check before output.',
  '- All 500 entries must be unique individuals.',
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
  const regex = new RegExp(`^${escapedPrefix} V3 LIST (\\d+) \\(`, 'i');
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

type PartialState = {
  runId: string;
  model: string;
  label: string;
  chunkSize: number;
  createdAt: string;
  candidates: ListEntry[];
};

function validateV3Entries(items: unknown[], expectedCount: number): ListEntry[] {
  const out: ListEntry[] = [];
  const seenNames = new Set<string>();
  const seenRanks = new Set<number>();

  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const entry = item as Partial<ListEntry>;
    if (typeof entry.name !== 'string' || typeof entry.rank !== 'number') {
      continue;
    }
    const name = entry.name.trim();
    if (!name) continue;
    const key = normalizeName(name);
    if (seenNames.has(key)) continue;
    if (seenRanks.has(entry.rank)) continue;
    seenNames.add(key);
    seenRanks.add(entry.rank);
    out.push({
      rank: entry.rank,
      name,
      primary_contribution: typeof entry.primary_contribution === 'string'
        ? entry.primary_contribution.trim()
        : '—',
    });
  }

  out.sort((a, b) => a.rank - b.rank);

  if (out.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} entries, got ${out.length}`);
  }
  for (let i = 0; i < out.length; i += 1) {
    if (out[i].rank !== i + 1) {
      throw new Error('Non-sequential ranks');
    }
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
    V3_PROMPT,
    '',
    `Generate exactly ${chunkSize} entries.`,
    `Ranks must be integers from 1 to ${chunkSize}, unique and sequential.`,
    'Output must be STRICT JSON: double quotes for all keys/strings, no trailing commas, escape quotes inside strings.',
    'Begin the response with "[" and end with "]". Do not include any other text or markdown.',
    forbiddenBlock,
  ].join('\n');
}


async function main() {
  const options = parseArgs();
  const label = options.labelFromArgs ? options.label : options.label || options.model.split('/').slice(-1)[0];
  const promptLabel = `${label} ${PROMPT_LABEL_SUFFIX}`.trim();

  fs.mkdirSync(options.outputDir, { recursive: true });

  const listNumber = nextListNumber(label, options.outputDir);
  const filename = `${label} V3 LIST ${listNumber} (${formatDate()}).txt`;
  const outputPath = path.join(options.outputDir, filename);
  const partialPath = options.resumeFile
    ? path.resolve(options.resumeFile)
    : path.join(options.outputDir, `${PARTIAL_PREFIX}-${label}-${listNumber}.json`);

  console.log(`\n🧪 Generating V3 list for ${label}`);
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

  if (!options.singleShot) {
    throw new Error('V3 generator supports single-shot mode only. Remove --chunked or add --single-shot.');
  }

  let entries: ListEntry[] = [];
  let rawOutput = '';
  for (let attempt = 1; attempt <= options.maxRetries; attempt += 1) {
    try {
      rawOutput = await callOpenRouter(buildChunkPrompt(options.totalRanks, []), options.model, options.timeoutMs);
      const rawPath = outputPath.replace(/\.txt$/, '.raw.txt');
      fs.writeFileSync(rawPath, rawOutput);

      let jsonArray: string;
      try {
        jsonArray = extractJsonArray(rawOutput);
        entries = validateV3Entries(JSON.parse(jsonArray) as unknown[], options.totalRanks);
      } catch {
        const repaired = await repairJsonWithModel(rawOutput, options.model, options.timeoutMs);
        const repairedPath = outputPath.replace(/\.txt$/, '.repaired.txt');
        fs.writeFileSync(repairedPath, repaired);
        jsonArray = extractJsonArray(repaired);
        entries = validateV3Entries(JSON.parse(jsonArray) as unknown[], options.totalRanks);
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

  fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2));
  runQualityAssessment(entries, filename, promptLabel, options.reportDir, options.totalRanks);

  console.log(`\n✅ V3 list saved: ${outputPath}`);
  if (fs.existsSync(partialPath)) {
    fs.unlinkSync(partialPath);
  }
  return;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

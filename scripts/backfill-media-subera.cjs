const fs = require('node:fs');
const path = require('node:path');

function loadEnvFile(fileName) {
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

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'raw', 'media');

const SUB_ERA_LIST = [
  'Ancient',
  'Ancient Egypt',
  'Ancient Greece',
  'Ancient Rome',
  'Roman Republic',
  'Classical',
  'Hellenistic',
  'Late Antiquity',
  'Byzantine Empire',
  'Viking Age',
  'Early Middle Ages',
  'High Middle Ages',
  'Late Middle Ages',
  'Medieval',
  'Renaissance',
  'Reformation',
  "Age of Exploration",
  "Thirty Years' War",
  'English Civil War',
  'Glorious Revolution',
  'War of Spanish Succession',
  'Stuart England',
  'Tudor England',
  'Mongol Empire',
  'Ottoman Empire',
  'French Revolution',
  'Napoleonic Wars',
  'Ancien Régime',
  'Industrial Revolution',
  'Gilded Age',
  'Progressive Era',
  'Great Depression',
  'Interwar Period',
  'Post-War Britain',
  'Post-War America',
  '1950s America',
  '1960s America',
  '1970s America',
  '1980s America',
  '1990s America',
  'Civil Rights Movement',
  'Reconstruction',
  'Jim Crow',
  'Slavery',
  'Antebellum America',
  'American Civil War',
  'Watergate',
  'Cold War',
  'Space Race',
  'World War I',
  'World War II',
  'Nazi Germany',
  'Soviet Union',
  'Post-Soviet Era',
  'Korean War',
  'Vietnam War',
  'Iran-Iraq War',
  'Gulf War',
  'War on Terror',
  'Soviet-Afghan War',
  'Decolonization',
  'Apartheid South Africa',
  'Partition of India',
  'Colonial North America',
  'Colonial Latin America',
  'British Raj',
  'Ming Dynasty',
  'Qing Dynasty',
  'Mughal Empire',
  'Meiji Restoration',
  'Edo Period',
  'Warring States (China)',
  'Three Kingdoms (China)',
  'Han Dynasty',
  'Tang Dynasty',
  'Song Dynasty',
  'Roaring Twenties',
  'Prohibition',
  'Great Migration (U.S.)',
  'Modern History',
  'Contemporary',
  'Other',
];

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5';
const DEFAULT_CHUNK_SIZE = 15;
const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_MAX_TOKENS = 3000;

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function normalizeTitle(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function makeId(item) {
  const year = typeof item.release_year === 'number' ? item.release_year : '';
  const type = item.type || '';
  return `${normalizeTitle(item.title || '')}::${year}::${type}`;
}

function extractJsonArray(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON array found in model output.');
  }
  return text.slice(start, end + 1);
}

function loadMedia() {
  if (!fs.existsSync(MEDIA_PATH)) return [];
  const raw = fs.readFileSync(MEDIA_PATH, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function saveMedia(items) {
  const lines = items.map((item) => JSON.stringify(item));
  fs.writeFileSync(MEDIA_PATH, `${lines.join('\n')}\n`);
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 1000000007;
  }
  return String(hash);
}

async function callOpenRouter(prompt, model, timeoutMs, maxTokens) {
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
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
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

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    model: DEFAULT_MODEL,
    chunkSize: DEFAULT_CHUNK_SIZE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxTokens: DEFAULT_MAX_TOKENS,
    resume: false,
    resumeFile: null,
    limit: null,
    dryRun: false,
  };
  for (const arg of args) {
    if (arg.startsWith('--model=')) options.model = arg.slice('--model='.length);
    else if (arg.startsWith('--chunk-size=')) options.chunkSize = Number(arg.slice('--chunk-size='.length));
    else if (arg.startsWith('--timeout=')) options.timeoutMs = Number(arg.slice('--timeout='.length));
    else if (arg.startsWith('--max-tokens=')) options.maxTokens = Number(arg.slice('--max-tokens='.length));
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length));
    else if (arg === '--resume') options.resume = true;
    else if (arg.startsWith('--resume-file=')) options.resumeFile = arg.slice('--resume-file='.length);
    else if (arg === '--dry-run') options.dryRun = true;
  }
  return options;
}

function buildPrompt(items) {
  return `Assign a sub-era to each item using the allowed list.

Allowed sub_era values:
${SUB_ERA_LIST.map((value) => `- ${value}`).join('\n')}

Instructions:
- Choose the single best sub_era for each item from the list above.
- Use "Other" when no specific sub-era is a good fit.
- Return only a raw JSON array of objects with: {"id": "string", "sub_era": "string"}.

Items:
${items.map((item) => (
  `- id: ${item.id}\n  title: ${item.title}\n  type: ${item.type}\n  release_year: ${item.release_year ?? 'unknown'}\n  primary_era: ${item.primary_era}\n  regions: ${(item.regions_depicted || []).join(', ') || 'unknown'}\n  notes: ${item.notes || ''}\n  tags: ${(item.tags || []).join(', ') || ''}`
)).join('\n')}
`;
}

function loadPartial(partialPath) {
  const raw = fs.readFileSync(partialPath, 'utf8');
  return JSON.parse(raw);
}

function savePartial(partialPath, state) {
  fs.writeFileSync(partialPath, JSON.stringify(state, null, 2));
}

async function main() {
  const options = parseArgs();
  const items = loadMedia();
  const missing = items.filter((item) => !item.sub_era || !SUB_ERA_LIST.includes(item.sub_era));
  const targetItems = options.limit ? missing.slice(0, options.limit) : missing;
  if (!targetItems.length) {
    console.log('No items missing sub_era.');
    return;
  }

  const promptHash = hashString(SUB_ERA_LIST.join('|'));
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const partialPath = options.resumeFile
    ? path.resolve(options.resumeFile)
    : path.join(OUTPUT_DIR, `.sub-era-backfill-${runId}.json`);

  let state = {
    model: options.model,
    chunkSize: options.chunkSize,
    promptHash,
    completedIds: [],
    updates: {},
  };

  if (options.resume) {
    if (!fs.existsSync(partialPath)) {
      throw new Error('No partial file found to resume.');
    }
    state = loadPartial(partialPath);
  } else {
    savePartial(partialPath, state);
    console.log(`Initialized partial file at ${partialPath}`);
  }

  const completed = new Set(state.completedIds);
  const updates = state.updates || {};

  for (let index = 0; index < targetItems.length; index += options.chunkSize) {
    const batch = targetItems.slice(index, index + options.chunkSize)
      .map((item) => ({
        id: makeId(item),
        title: item.title,
        type: item.type,
        release_year: item.release_year,
        primary_era: item.primary_era,
        regions_depicted: item.regions_depicted,
        notes: item.notes,
        tags: item.tags,
      }))
      .filter((item) => !completed.has(item.id));

    if (!batch.length) continue;

    console.log(`Requesting sub-era for ${batch.length} items...`);
    const prompt = buildPrompt(batch);
    const output = await callOpenRouter(prompt, options.model, options.timeoutMs, options.maxTokens);
    const jsonArray = extractJsonArray(output);
    const parsed = JSON.parse(jsonArray);
    if (!Array.isArray(parsed)) {
      throw new Error('Parsed output is not an array.');
    }

    for (const entry of parsed) {
      if (!entry || typeof entry.id !== 'string' || typeof entry.sub_era !== 'string') {
        throw new Error('Invalid response entry in sub_era output.');
      }
      updates[entry.id] = entry.sub_era;
      completed.add(entry.id);
    }

    state.completedIds = Array.from(completed);
    state.updates = updates;
    savePartial(partialPath, state);
  }

  const byId = new Map(items.map((item) => [makeId(item), item]));
  let updatedCount = 0;
  for (const [id, subEra] of Object.entries(updates)) {
    if (!SUB_ERA_LIST.includes(subEra)) continue;
    const item = byId.get(id);
    if (!item) continue;
    if (item.sub_era !== subEra) {
      item.sub_era = subEra;
      updatedCount += 1;
    }
  }

  if (!options.dryRun) {
    saveMedia(items);
  }

  console.log(`Backfill complete. Updated ${updatedCount} items.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

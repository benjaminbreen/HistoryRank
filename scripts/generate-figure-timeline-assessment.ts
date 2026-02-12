import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

type CliArgs = {
  figureId: string | null;
  dbPath: string;
  provider: 'auto' | 'openrouter' | 'gemini';
  model: string;
  ageCoverage: 'strict' | 'balanced' | 'off';
  birthPolicy: 'forbid' | 'discourage' | 'allow';
  promptVersion: string;
  minEvents: number;
  maxEvents: number;
  maxTokens: number;
  dryRun: boolean;
  publish: boolean;
  timeoutMs: number;
};

type EvidenceRef = {
  refId: number;
  kind: 'source' | 'snippet' | 'quote';
  tableId: number;
  label: string;
  url: string | null;
  summary: string;
};

type TimelineEvent = {
  event_label: string;
  event_description: string | null;
  event_start_year: number | null;
  event_end_year: number | null;
  event_month: number | null;
  event_day: number | null;
  date_precision: 'day' | 'month' | 'year';
  date_is_estimated: boolean;
  place_label: string | null;
  place_lat: number | null;
  place_lon: number | null;
  confidence: number | null;
  influence_intensity: number | null; // 0..100
  geographic_scope: number | null; // 1..5 (local -> global)
  public_visibility: number | null; // 0..100
  controversy: number | null; // 0..100
  source_refs: number[];
};

type TimelineOutput = {
  bio_overview: string;
  events: TimelineEvent[];
};

type TimelineEventResolved = TimelineEvent & {
  source_ids: number[];
  evidence_links: Array<{
    ref_id: number;
    kind: EvidenceRef['kind'];
    table_id: number;
    label: string;
    url: string | null;
  }>;
};

type AgeBandRequirement = {
  key: 'age_1_20' | 'age_20_40' | 'age_40_60';
  minAge: number;
  maxAge: number;
  label: string;
};

const AGE_BAND_REQUIREMENTS: AgeBandRequirement[] = [
  { key: 'age_1_20', minAge: 1, maxAge: 20, label: '1-20' },
  { key: 'age_20_40', minAge: 20, maxAge: 40, label: '20-40' },
  { key: 'age_40_60', minAge: 40, maxAge: 60, label: '40-60' },
];

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

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const figureId = get('--figure-id');
  const dbPath = get('--db') || path.join(process.cwd(), 'historyrank.db');
  const providerRaw = get('--provider') || 'auto';
  const provider =
    providerRaw === 'auto' || providerRaw === 'openrouter' || providerRaw === 'gemini'
      ? providerRaw
      : null;
  const model = get('--model') || 'openai/gpt-5.2';
  const ageCoverageRaw = get('--age-coverage') || 'strict';
  const ageCoverage =
    ageCoverageRaw === 'strict' || ageCoverageRaw === 'balanced' || ageCoverageRaw === 'off'
      ? ageCoverageRaw
      : null;
  const birthPolicyRaw = get('--birth-policy') || 'forbid';
  const birthPolicy =
    birthPolicyRaw === 'forbid' || birthPolicyRaw === 'discourage' || birthPolicyRaw === 'allow'
      ? birthPolicyRaw
      : null;
  const promptVersion = get('--prompt-version') || 'timeline_events_v6';
  const minEventsRaw = get('--min-events');
  const maxEventsRaw = get('--max-events');
  const maxEvents = maxEventsRaw ? Number.parseInt(maxEventsRaw, 10) : 6;
  const minEvents = minEventsRaw ? Number.parseInt(minEventsRaw, 10) : Math.max(1, Math.min(4, maxEvents));
  const maxTokensRaw = get('--max-tokens');
  const maxTokens = maxTokensRaw ? Number.parseInt(maxTokensRaw, 10) : 1100;
  const timeoutRaw = get('--timeout-ms');
  const timeoutMs = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : 120_000;
  const dryRun = argv.includes('--dry-run');
  const publish = argv.includes('--publish');

  if (!figureId) {
    throw new Error('Missing required argument: --figure-id=<id>');
  }
  if (!provider) {
    throw new Error('Invalid --provider. Use auto, openrouter, or gemini.');
  }
  if (!ageCoverage) {
    throw new Error('Invalid --age-coverage. Use strict, balanced, or off.');
  }
  if (!birthPolicy) {
    throw new Error('Invalid --birth-policy. Use forbid, discourage, or allow.');
  }
  if (!Number.isFinite(maxEvents) || maxEvents < 1 || maxEvents > 20) {
    throw new Error('Invalid --max-events. Use a number between 1 and 20.');
  }
  if (!Number.isFinite(minEvents) || minEvents < 1 || minEvents > maxEvents) {
    throw new Error('Invalid --min-events. Use a number between 1 and --max-events.');
  }
  if (!Number.isFinite(maxTokens) || maxTokens < 256 || maxTokens > 20000) {
    throw new Error('Invalid --max-tokens. Use a number between 256 and 20000.');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 5_000 || timeoutMs > 300_000) {
    throw new Error('Invalid --timeout-ms. Use a number between 5000 and 300000.');
  }

  return {
    figureId,
    dbPath,
    provider,
    model,
    ageCoverage,
    birthPolicy,
    promptVersion,
    minEvents,
    maxEvents,
    maxTokens,
    dryRun,
    publish,
    timeoutMs,
  };
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  throw new Error('No JSON object found in model output');
}

function parseModelJsonObject(content: string): unknown {
  let extracted: string;
  try {
    extracted = extractJsonObject(content);
  } catch {
    const preview = content.slice(0, 500).replace(/\s+/g, ' ').trim();
    throw new Error(`No JSON object found in model output. Preview: ${preview}`);
  }

  try {
    return JSON.parse(extracted) as unknown;
  } catch {
    let repaired = extracted
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .trim();

    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;

    if (closeBrackets < openBrackets) {
      repaired += ']'.repeat(openBrackets - closeBrackets);
    }
    if (closeBraces < openBraces) {
      repaired += '}'.repeat(openBraces - closeBraces);
    }

    try {
      return JSON.parse(repaired) as unknown;
    } catch {
      const preview = content.slice(0, 500).replace(/\s+/g, ' ').trim();
      throw new Error(`Failed to parse model JSON output after repair. Preview: ${preview}`);
    }
  }
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function safeInteger(value: unknown): number | null {
  const num = safeNumber(value);
  if (num === null) return null;
  if (!Number.isInteger(num)) return null;
  return num;
}

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeRefs(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

function clampNumber(value: number | null, min: number, max: number): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, value));
}

function safePrecision(value: unknown): 'day' | 'month' | 'year' | null {
  if (typeof value !== 'string') return null;
  if (value === 'day' || value === 'month' || value === 'year') return value;
  return null;
}

function looksLikeBirthEvent(label: string, description: string | null): boolean {
  const haystack = `${label} ${description || ''}`.toLowerCase();
  return /\b(birth|born)\b/.test(haystack);
}

function truncateText(value: string | null, maxChars: number): string | null {
  if (!value) return null;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trim()}...`;
}

function normalizeOutput(
  raw: unknown,
  maxEvents: number,
  birthPolicy: 'forbid' | 'discourage' | 'allow'
): TimelineOutput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Model output is not an object');
  }

  const obj = raw as Record<string, unknown>;
  const bioOverview = safeText(obj.bio_overview);
  if (!bioOverview) {
    throw new Error('Model output missing bio_overview');
  }

  const eventsInput = Array.isArray(obj.events) ? obj.events : [];
  const events: TimelineEvent[] = [];

  for (const item of eventsInput) {
    if (typeof item !== 'object' || item === null) continue;
    const event = item as Record<string, unknown>;
    const eventLabel = safeText(event.event_label);
    if (!eventLabel) continue;
    const eventDescription = safeText(event.event_description);
    const isBirthEvent = looksLikeBirthEvent(eventLabel, eventDescription);
    if (birthPolicy === 'forbid' && isBirthEvent) continue;

    const placeLat = safeNumber(event.place_lat);
    const placeLon = safeNumber(event.place_lon);
    if (placeLat === null || placeLon === null) continue;

    const eventYear =
      safeInteger(event.event_year) ??
      safeInteger(event.event_start_year) ??
      safeInteger(event.event_end_year);
    if (eventYear === null) continue;

    const eventMonthRaw = safeInteger(event.event_month);
    const eventDayRaw = safeInteger(event.event_day);
    const eventMonth = eventMonthRaw !== null && eventMonthRaw >= 1 && eventMonthRaw <= 12 ? eventMonthRaw : null;
    const eventDay =
      eventDayRaw !== null && eventDayRaw >= 1 && eventDayRaw <= 31 && eventMonth !== null ? eventDayRaw : null;

    const datePrecisionRaw = safePrecision(event.date_precision);
    let datePrecision: 'day' | 'month' | 'year' = datePrecisionRaw ?? 'year';
    if (datePrecision === 'day' && (eventMonth === null || eventDay === null)) datePrecision = 'month';
    if (datePrecision === 'month' && eventMonth === null) datePrecision = 'year';

    const dateIsEstimated = event.date_is_estimated === true;

    events.push({
      event_label: eventLabel,
      event_description: eventDescription,
      // Single-point timeline event; we disallow ranges.
      event_start_year: eventYear,
      event_end_year: eventYear,
      event_month: eventMonth,
      event_day: eventDay,
      date_precision: datePrecision,
      date_is_estimated: dateIsEstimated,
      place_label: safeText(event.place_label),
      place_lat: placeLat,
      place_lon: placeLon,
      confidence: clampNumber(safeNumber(event.confidence), 0, 1),
      influence_intensity: clampNumber(safeNumber(event.influence_intensity), 0, 100),
      geographic_scope: clampNumber(safeNumber(event.geographic_scope), 1, 5),
      public_visibility: clampNumber(safeNumber(event.public_visibility), 0, 100),
      controversy: clampNumber(safeNumber(event.controversy), 0, 100),
      source_refs: safeRefs(event.source_refs),
    });
  }

  return {
    bio_overview: bioOverview,
    events: events.slice(0, maxEvents),
  };
}

function buildAgeBandRequirements(
  birthYear: number | null,
  deathYear: number | null
): AgeBandRequirement[] {
  if (birthYear === null) return [];
  if (deathYear === null || deathYear <= birthYear) return [];

  const livedYears = deathYear - birthYear;
  return AGE_BAND_REQUIREMENTS.filter((band) => livedYears >= band.minAge);
}

function getCoveredAgeBands(
  events: TimelineEvent[],
  birthYear: number | null,
  requirements: AgeBandRequirement[]
): AgeBandRequirement[] {
  if (birthYear === null || requirements.length === 0) return [];

  return requirements.filter((band) => {
    return events.some((event) => {
      const eventYear = event.event_start_year ?? event.event_end_year;
      if (eventYear === null) return false;
      const age = eventYear - birthYear;
      return age >= band.minAge && age <= band.maxAge;
    });
  });
}

function getMinRequiredAgeBands(
  ageCoverage: 'strict' | 'balanced' | 'off',
  applicableBands: number
): number {
  if (ageCoverage === 'off') return 0;
  if (ageCoverage === 'strict') return applicableBands;
  if (applicableBands <= 0) return 0;
  if (applicableBands === 1) return 1;
  if (applicableBands === 2) return 1;
  return 2;
}

function formatAgeBandWindows(
  requirements: AgeBandRequirement[],
  birthYear: number | null
): string {
  if (requirements.length === 0) return '';
  if (birthYear === null) return requirements.map((band) => band.label).join(', ');
  return requirements
    .map((band) => `${band.label} (year ${birthYear + band.minAge} to ${birthYear + band.maxAge})`)
    .join(', ');
}

function buildPrompt(
  figureContext: Record<string, unknown>,
  evidenceRefs: EvidenceRef[],
  minEvents: number,
  maxEvents: number,
  ageBandRequirements: AgeBandRequirement[],
  birthYear: number | null,
  ageCoverage: 'strict' | 'balanced' | 'off',
  birthPolicy: 'forbid' | 'discourage' | 'allow'
): string {
  const allowedRefIds = evidenceRefs.map((ref) => ref.refId);
  const hasEvidence = allowedRefIds.length > 0;
  const groundingRule = hasEvidence
    ? '- Use only claims grounded in provided context/evidence.'
    : '- Evidence records are sparse; use high-confidence mainstream historical facts and set source_refs to [].';
  const refsRule = hasEvidence
    ? `- source_refs must use ONLY these integer ref_id values: ${JSON.stringify(allowedRefIds)}.`
    : '- source_refs must be an empty array for every event.';
  const evidenceJson = JSON.stringify(
    evidenceRefs.map((ref) => ({
      ref_id: ref.refId,
      kind: ref.kind,
      label: ref.label,
      url: ref.url,
      summary: ref.summary,
    }))
  );

  const contextJson = JSON.stringify(figureContext);
  const ageBandWindows = formatAgeBandWindows(ageBandRequirements, birthYear);
  const balancedMinRequired = getMinRequiredAgeBands('balanced', ageBandRequirements.length);
  const ageBandRule =
    ageCoverage === 'off' || ageBandRequirements.length === 0
      ? '- Spread events broadly across the figure timeline; avoid clustering all events into one short period.'
      : ageCoverage === 'balanced'
      ? `- Age-stage spread target: cover at least ${balancedMinRequired} applicable age bands (${ageBandWindows}) with non-birth events.`
      : `- Age-stage spread requirement: include at least one non-birth event in each applicable age band: ${ageBandWindows}.`;
  const ageBandGuidance =
    ageCoverage === 'off'
      ? '- Prefer broad life-stage coverage (early, mid, late life) whenever possible.'
      : '- If an early-life band is missing, use an education/training/first-office milestone (NOT birth).';
  const birthRule =
    birthPolicy === 'forbid'
      ? '- Do not include the figure birth as an event.'
      : birthPolicy === 'discourage'
      ? '- Avoid including birth as an event unless needed to complete a coherent timeline.'
      : '- Birth event is allowed if historically useful.';

  return [
    'Role: You are a historian writing structured timeline data.',
    '',
    'Task:',
    'Given the figure context and evidence records, produce:',
    `1) A short biographical overview (2-4 sentences, factual)`,
    minEvents === maxEvents
      ? `2) Exactly ${maxEvents} key life/career events suitable for timeline/map display`
      : `2) Between ${minEvents} and ${maxEvents} key life/career events suitable for timeline/map display`,
    '',
    'Strict constraints:',
    '- English only.',
    groundingRule,
    refsRule,
    '- Keep each event_description under 24 words.',
    '- Prefer concrete dated milestones over vague themes.',
    ageBandRule,
    ageBandGuidance,
    birthRule,
    '- Every event must include place_lat and place_lon as numeric decimal coordinates (not null).',
    '- Every event must be a single point in time (NO date ranges).',
    '- Every event must include event_year (best-guess year if uncertain).',
    '- Include event_month and event_day when known.',
    '- Include date_precision as one of: day, month, year.',
    '- Include date_is_estimated: true when any date element is a best guess, else false.',
    '- Score confidence as 0..1.',
    '- Score influence_intensity as 0..100.',
    '- Score geographic_scope as 1..5 where 1=local, 2=regional, 3=transregional, 4=continental, 5=global.',
    '- Score public_visibility as 0..100 (public salience at the time).',
    '- Score controversy as 0..100 (degree of contestation/polarization at the time).',
    '- Output JSON only, no markdown.',
    '',
    'Required JSON schema:',
    '{',
    '  "bio_overview": "string (2-4 sentences)",',
    '  "events": [',
    '    {',
      '      "event_label": "string",',
    '      "event_description": "string|null",',
    '      "event_year": "integer",',
    '      "event_month": "integer|null",',
    '      "event_day": "integer|null",',
    '      "date_precision": "day|month|year",',
    '      "date_is_estimated": "boolean",',
    '      "place_label": "string|null",',
    '      "place_lat": "number",',
    '      "place_lon": "number",',
    '      "confidence": "number|null",',
    '      "influence_intensity": "number|null",',
    '      "geographic_scope": "number|null",',
    '      "public_visibility": "number|null",',
    '      "controversy": "number|null",',
    '      "source_refs": [number]',
    '    }',
    '  ]',
    '}',
    '',
    `Figure context JSON: ${contextJson}`,
    `Evidence records JSON: ${evidenceJson}`,
  ].join('\n');
}

async function callOpenRouter(prompt: string, model: string, maxTokens: number, timeoutMs: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY');
  }
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
      response_format: { type: 'json_object' },
      ...(model.includes('gpt-5') || model.includes('o3') ? { reasoning: { effort: 'high' } } : {}),
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenRouter response missing content');
  }

  return content;
}

function normalizeGeminiModel(model: string): string {
  return model.startsWith('google/') ? model.slice('google/'.length) : model;
}

async function callGeminiDirect(prompt: string, model: string, maxTokens: number, timeoutMs: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY (or GOOGLE_API_KEY)');
  }

  const geminiModel = normalizeGeminiModel(model);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          required: ['bio_overview', 'events'],
          properties: {
            bio_overview: { type: 'STRING' },
            events: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                required: [
                  'event_label',
                  'event_description',
                  'event_year',
                  'event_month',
                  'event_day',
                  'date_precision',
                  'date_is_estimated',
                  'place_label',
                  'place_lat',
                  'place_lon',
                  'confidence',
                  'influence_intensity',
                  'geographic_scope',
                  'public_visibility',
                  'controversy',
                  'source_refs',
                ],
                properties: {
                  event_label: { type: 'STRING' },
                  event_description: { type: 'STRING', nullable: true },
                  event_year: { type: 'INTEGER' },
                  event_month: { type: 'INTEGER', nullable: true },
                  event_day: { type: 'INTEGER', nullable: true },
                  date_precision: { type: 'STRING', enum: ['day', 'month', 'year'] },
                  date_is_estimated: { type: 'BOOLEAN' },
                  place_label: { type: 'STRING', nullable: true },
                  place_lat: { type: 'NUMBER' },
                  place_lon: { type: 'NUMBER' },
                  confidence: { type: 'NUMBER', nullable: true },
                  influence_intensity: { type: 'NUMBER', nullable: true },
                  geographic_scope: { type: 'NUMBER', nullable: true },
                  public_visibility: { type: 'NUMBER', nullable: true },
                  controversy: { type: 'NUMBER', nullable: true },
                  source_refs: { type: 'ARRAY', items: { type: 'INTEGER' } },
                },
              },
            },
          },
        },
      },
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!content) {
    throw new Error('Gemini response missing content');
  }

  return content;
}

function resolveProvider(args: CliArgs): 'openrouter' | 'gemini' {
  if (args.provider !== 'auto') return args.provider;
  const model = args.model.toLowerCase();
  if (model.startsWith('gemini-') || model.startsWith('google/gemini-')) {
    return 'gemini';
  }
  return 'openrouter';
}

function hashInput(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value)))).sort((a, b) => a - b);
}

async function main() {
  loadEnvFile('.env.local');

  const args = parseArgs(process.argv.slice(2));
  const provider = resolveProvider(args);
  const db = new Database(args.dbPath);

  const figure = db
    .prepare(
      `
      SELECT id, canonical_name, birth_year, death_year, occupation, domain, era, region_sub,
             wikipedia_slug, pageviews_global, llm_consensus_rank, hpi_rank, ngram_percentile
      FROM figures
      WHERE id = ?
      LIMIT 1
      `
    )
    .get(args.figureId) as
    | {
        id: string;
        canonical_name: string;
        birth_year: number | null;
        death_year: number | null;
        occupation: string | null;
        domain: string | null;
        era: string | null;
        region_sub: string | null;
        wikipedia_slug: string | null;
        pageviews_global: number | null;
        llm_consensus_rank: number | null;
        hpi_rank: number | null;
        ngram_percentile: number | null;
      }
    | undefined;

  if (!figure) {
    db.close();
    throw new Error(`Figure not found: ${args.figureId}`);
  }

  const sources = db
    .prepare(
      `
      SELECT id, source_role, source_corpus, source_kind, title, author, publication_year, source_url, snippet, confidence
      FROM figure_research_sources
      WHERE figure_id = ?
        AND curation_status IN ('auto', 'reviewed', 'approved')
      ORDER BY confidence DESC, id ASC
      LIMIT 12
      `
    )
    .all(args.figureId) as Array<{
      id: number;
      source_role: string;
      source_corpus: string;
      source_kind: string;
      title: string;
      author: string | null;
      publication_year: number | null;
      source_url: string;
      snippet: string | null;
      confidence: number | null;
    }>;

  const snippets = db
    .prepare(
      `
      SELECT id, corpus, edition_year, source_title, source_url, snippet, match_score
      FROM figure_historical_snippets
      WHERE figure_id = ?
        AND curation_status IN ('auto', 'reviewed', 'approved')
      ORDER BY match_score DESC, id ASC
      LIMIT 8
      `
    )
    .all(args.figureId) as Array<{
      id: number;
      corpus: string;
      edition_year: number | null;
      source_title: string | null;
      source_url: string | null;
      snippet: string;
      match_score: number | null;
    }>;

  const quotes = db
    .prepare(
      `
      SELECT id, quote_text, attributed_to, quote_year, source_url, verification_status, warning_short, confidence
      FROM figure_quotes
      WHERE figure_id = ?
        AND curation_status IN ('auto', 'reviewed', 'approved')
      ORDER BY confidence DESC, id ASC
      LIMIT 8
      `
    )
    .all(args.figureId) as Array<{
      id: number;
      quote_text: string;
      attributed_to: string | null;
      quote_year: number | null;
      source_url: string | null;
      verification_status: string;
      warning_short: string | null;
      confidence: number | null;
    }>;

  let refId = 1;
  const evidenceRefs: EvidenceRef[] = [];

  for (const source of sources) {
    evidenceRefs.push({
      refId,
      kind: 'source',
      tableId: source.id,
      label: source.title,
      url: source.source_url,
      summary: [
        source.source_role,
        source.source_corpus,
        source.author || null,
        source.publication_year,
        truncateText(source.snippet || null, 220),
      ]
        .filter(Boolean)
        .join(' | '),
    });
    refId += 1;
  }

  for (const snippet of snippets) {
    evidenceRefs.push({
      refId,
      kind: 'snippet',
      tableId: snippet.id,
      label: snippet.source_title || `${snippet.corpus} snippet`,
      url: snippet.source_url,
      summary: [snippet.corpus, snippet.edition_year, truncateText(snippet.snippet, 280)].filter(Boolean).join(' | '),
    });
    refId += 1;
  }

  for (const quote of quotes) {
    evidenceRefs.push({
      refId,
      kind: 'quote',
      tableId: quote.id,
      label: quote.attributed_to || figure.canonical_name,
      url: quote.source_url,
      summary: [quote.quote_year, quote.verification_status, truncateText(quote.quote_text, 220)].filter(Boolean).join(' | '),
    });
    refId += 1;
  }

  const figureContext = {
    id: figure.id,
    canonical_name: figure.canonical_name,
    birth_year: figure.birth_year,
    death_year: figure.death_year,
    occupation: figure.occupation,
    domain: figure.domain,
    era: figure.era,
    region_sub: figure.region_sub,
    wikipedia_slug: figure.wikipedia_slug,
    metrics: {
      llm_consensus_rank: figure.llm_consensus_rank,
      hpi_rank: figure.hpi_rank,
      pageviews_global: figure.pageviews_global,
      ngram_percentile: figure.ngram_percentile,
    },
  };

  const ageBandRequirements = buildAgeBandRequirements(figure.birth_year, figure.death_year);
  const prompt = buildPrompt(
    figureContext,
    evidenceRefs,
    args.minEvents,
    args.maxEvents,
    ageBandRequirements,
    figure.birth_year,
    args.ageCoverage,
    args.birthPolicy
  );
  const inputHash = hashInput({
    figureContext,
    evidenceRefs,
    promptVersion: args.promptVersion,
    minEvents: args.minEvents,
    maxEvents: args.maxEvents,
    ageCoverage: args.ageCoverage,
    birthPolicy: args.birthPolicy,
  });

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          figureId: args.figureId,
          figureName: figure.canonical_name,
          provider,
          model: args.model,
          ageCoverage: args.ageCoverage,
          birthPolicy: args.birthPolicy,
          promptVersion: args.promptVersion,
          evidenceRefs: evidenceRefs.length,
          minEvents: args.minEvents,
          maxEvents: args.maxEvents,
          ageBandRequirements: ageBandRequirements.map((band) => band.label),
          inputHash,
          promptPreview: prompt.slice(0, 1200),
        },
        null,
        2
      )
    );
    db.close();
    return;
  }

  const maxAttempts = 3;
  let parsed: unknown = null;
  let output: TimelineOutput | null = null;
  let finalValidationError: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const correction =
      finalValidationError && attempt > 1
        ? `\n\nPrevious attempt failed validation: ${finalValidationError}\nRegenerate full JSON and satisfy all constraints exactly.`
        : '';
    const attemptPrompt = `${prompt}${correction}`;

    try {
      const content =
        provider === 'gemini'
          ? await callGeminiDirect(attemptPrompt, args.model, args.maxTokens, args.timeoutMs)
          : await callOpenRouter(attemptPrompt, args.model, args.maxTokens, args.timeoutMs);
      parsed = parseModelJsonObject(content);
      const candidate = normalizeOutput(parsed, args.maxEvents, args.birthPolicy);

      if (candidate.events.length < args.minEvents) {
        const parsedPreview = JSON.stringify(parsed).slice(0, 1200);
        finalValidationError = `Model returned ${candidate.events.length} valid events; required ${args.minEvents}-${args.maxEvents} after birth/coordinate validation. Parsed preview: ${parsedPreview}`;
        continue;
      }

      const coveredAgeBands = getCoveredAgeBands(candidate.events, figure.birth_year, ageBandRequirements);
      const minRequiredBands = getMinRequiredAgeBands(args.ageCoverage, ageBandRequirements.length);
      if (coveredAgeBands.length < minRequiredBands) {
        const missingAgeBands = ageBandRequirements.filter(
          (band) => !coveredAgeBands.some((covered) => covered.key === band.key)
        );
        finalValidationError = `Insufficient age-band coverage (${coveredAgeBands.length}/${minRequiredBands} required in ${args.ageCoverage} mode). Covered: ${formatAgeBandWindows(
          coveredAgeBands,
          figure.birth_year
        ) || 'none'}. Missing: ${formatAgeBandWindows(
          missingAgeBands,
          figure.birth_year
        ) || 'none'} (birth_year=${figure.birth_year}, death_year=${figure.death_year})`;
        continue;
      }

      output = candidate;
      finalValidationError = null;
      break;
    } catch (error) {
      finalValidationError = error instanceof Error ? error.message : String(error);
    }
  }

  if (!output) {
    db.close();
    throw new Error(finalValidationError || 'Timeline generation failed validation after retries.');
  }

  const evidenceRefsByRefId = new Map<number, EvidenceRef>();
  for (const evidenceRef of evidenceRefs) {
    evidenceRefsByRefId.set(evidenceRef.refId, evidenceRef);
  }

  const resolvedEvents: TimelineEventResolved[] = output.events.map((event) => {
    const evidenceLinks = event.source_refs
      .map((refId) => evidenceRefsByRefId.get(refId))
      .filter((ref): ref is EvidenceRef => Boolean(ref))
      .map((ref) => ({
        ref_id: ref.refId,
        kind: ref.kind,
        table_id: ref.tableId,
        label: ref.label,
        url: ref.url,
      }));

    const sourceIds = uniqueNumbers(
      evidenceLinks
        .filter((ref) => ref.kind === 'source')
        .map((ref) => ref.table_id)
    );

    return {
      ...event,
      source_ids: sourceIds,
      evidence_links: evidenceLinks,
    };
  });

  const citations = uniqueNumbers(
    resolvedEvents.flatMap((event) => event.source_ids)
  );

  const status = args.publish ? 'published' : 'draft';
  const now = Math.floor(Date.now() / 1000);

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE figure_assessments
      SET status = 'stale', updated_at = ?
      WHERE figure_id = ?
        AND assessment_kind = 'timeline_events'
        AND status IN ('draft', 'published')
      `
    ).run(now, args.figureId);

    const insertAssessment = db.prepare(
      `
      INSERT INTO figure_assessments (
        figure_id, assessment_kind, model, prompt_version, trigger_mode, input_hash,
        assessment_text, assessment_json, citations, status, generated_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    const assessmentJson = JSON.stringify({
      mode: 'events_only',
      events_count: output.events.length,
      evidence_index: evidenceRefs,
      raw_model_output: parsed,
    });

    const result = insertAssessment.run(
      args.figureId,
      'timeline_events',
      provider === 'gemini' ? `gemini:${normalizeGeminiModel(args.model)}` : args.model,
      args.promptVersion,
      'on_demand',
      inputHash,
      output.bio_overview,
      assessmentJson,
      JSON.stringify(citations),
      status,
      now,
      now,
      now
    );

    const assessmentId = Number(result.lastInsertRowid);

    const insertEvent = db.prepare(
      `
      INSERT INTO figure_timeline_events (
        figure_id, assessment_id, event_label, event_description, event_start_year, event_end_year,
        place_label, place_lat, place_lon, confidence, source_ids, sort_index, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    resolvedEvents.forEach((event, index) => {
      const eventMetadata = {
        event_year: event.event_start_year,
        event_month: event.event_month,
        event_day: event.event_day,
        date_precision: event.date_precision,
        date_is_estimated: event.date_is_estimated,
        influence_intensity: event.influence_intensity,
        geographic_scope: event.geographic_scope,
        public_visibility: event.public_visibility,
        controversy: event.controversy,
        source_ref_ids: uniqueNumbers(event.source_refs),
        evidence_links: event.evidence_links,
      };
      insertEvent.run(
        args.figureId,
        assessmentId,
        event.event_label,
        event.event_description,
        event.event_start_year,
        event.event_end_year,
        event.place_label,
        event.place_lat,
        event.place_lon,
        event.confidence,
        JSON.stringify(event.source_ids),
        index,
        JSON.stringify(eventMetadata),
        now,
        now
      );
    });

    return { assessmentId };
  });

  try {
    const result = tx();
    console.log(
      `Generated timeline events for ${figure.canonical_name}: assessment_id=${result.assessmentId}, events=${output.events.length}, status=${status}`
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

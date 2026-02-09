import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

type SourceRole = 'primary' | 'secondary';
type SourceCorpus =
  | 'wikisource'
  | 'project_gutenberg'
  | 'internet_archive'
  | 'crossref'
  | 'openalex'
  | 'openlibrary';
type SourceKind = 'text' | 'speech' | 'letter' | 'book' | 'article' | 'archive_record' | 'other';

type CliArgs = {
  dbPath: string;
  figureId: string | null;
  name: string | null;
  top: number;
  model: string;
  outDir: string;
  maxPrimary: number;
  maxSecondary: number;
  limitPerRole: number;
  publish: boolean;
  dryRun: boolean;
};

type FigureTarget = {
  id: string;
  canonicalName: string;
  birthYear: number | null;
};

type SuggestedSource = {
  title: string;
  author: string | null;
  year: number | null;
  rationale: string;
  likelyCorpora?: string[];
  sourceType?: string;
};

type SuggestionPayload = {
  figure: string;
  primary_sources: SuggestedSource[];
  secondary_sources: SuggestedSource[];
  notes?: string;
};

type ResolvedSource = {
  source_corpus: SourceCorpus;
  source_role: SourceRole;
  source_kind: SourceKind;
  title: string;
  author: string | null;
  publication_year: number | null;
  source_url: string;
  access_url: string | null;
  snippet: string | null;
  confidence: number;
  why: string;
  metadata: Record<string, unknown>;
};

type CandidateFile = {
  generatedAt: string;
  figureId: string;
  figureName: string;
  constraints: Record<string, unknown>;
  suggestions: {
    primary: SuggestedSource[];
    secondary: SuggestedSource[];
    notes: string | null;
  };
  unresolved: Array<{ role: SourceRole; title: string; reason: string }>;
  candidates: ResolvedSource[];
};

type SearchCandidate = {
  source_corpus: SourceCorpus;
  source_kind: SourceKind;
  title: string;
  author: string | null;
  publication_year: number | null;
  source_url: string;
  access_url: string | null;
  snippet: string | null;
  metadata: Record<string, unknown>;
};

const PRIMARY_CORPUS_HINTS: Array<'wikisource' | 'project_gutenberg' | 'internet_archive'> = [
  'wikisource',
  'project_gutenberg',
  'internet_archive',
];

const PRIMARY_MIN_SCORE = 0.75;
const SECONDARY_MIN_SCORE = 0.72;
const ABOUTNESS_TERMS = [
  'biography',
  'life',
  'letters',
  'writings',
  'works',
  'thought',
  'philosophy',
  'legacy',
  'career',
  'political',
  'military',
  'reign',
  'rule',
  'ideas',
  'study',
  'studies',
  'history',
  'companion',
  'reader',
  'guide',
];
const SECONDARY_LIKE_TERMS = [
  'biography',
  'life of',
  'encyclopedia',
  'dictionary',
  'companion',
  'introduction',
  'critical',
  'study',
  'studies',
  'analysis',
];
const PRIMARY_DIVERSITY_ORDER: SourceCorpus[] = [
  'project_gutenberg',
  'wikisource',
  'internet_archive',
];
const SECONDARY_DIVERSITY_ORDER: SourceCorpus[] = [
  'openalex',
  'crossref',
  'openlibrary',
];

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const dbPath = get('--db') || path.join(process.cwd(), 'historyrank.db');
  const figureId = get('--figure-id');
  const name = get('--name');
  const topRaw = get('--top');
  const top = topRaw ? Number.parseInt(topRaw, 10) : 1;
  const model = get('--model') || 'gemini-2.5-flash-lite';
  const outDir = get('--out-dir') || path.join(process.cwd(), 'data', 'research-candidates');
  const maxPrimaryRaw = get('--max-primary');
  const maxSecondaryRaw = get('--max-secondary');
  const maxPrimary = maxPrimaryRaw ? Number.parseInt(maxPrimaryRaw, 10) : 3;
  const maxSecondary = maxSecondaryRaw ? Number.parseInt(maxSecondaryRaw, 10) : 3;
  const limitPerRoleRaw = get('--limit-per-role');
  const limitPerRole = limitPerRoleRaw ? Number.parseInt(limitPerRoleRaw, 10) : 3;
  const publish = argv.includes('--publish');
  const dryRun = argv.includes('--dry-run');

  if (!Number.isFinite(top) || top < 1 || top > 200) {
    throw new Error('Invalid --top. Use a number between 1 and 200.');
  }
  if (!Number.isFinite(maxPrimary) || maxPrimary < 1 || maxPrimary > 8) {
    throw new Error('Invalid --max-primary. Use a number between 1 and 8.');
  }
  if (!Number.isFinite(maxSecondary) || maxSecondary < 1 || maxSecondary > 8) {
    throw new Error('Invalid --max-secondary. Use a number between 1 and 8.');
  }
  if (!Number.isFinite(limitPerRole) || limitPerRole < 1 || limitPerRole > 8) {
    throw new Error('Invalid --limit-per-role. Use a number between 1 and 8.');
  }

  return {
    dbPath,
    figureId,
    name,
    top,
    model,
    outDir,
    maxPrimary,
    maxSecondary,
    limitPerRole,
    publish,
    dryRun,
  };
}

function normalizeGeminiModel(model: string): string {
  if (model.startsWith('google/')) return model.slice('google/'.length);
  return model;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(' ').filter((token) => token.length > 1);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = aSet.size + bSet.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function titleSimilarity(a: string, b: string): number {
  const aNorm = normalizeText(a);
  const bNorm = normalizeText(b);
  if (!aNorm || !bNorm) return 0;
  if (aNorm === bNorm) return 1;

  const j = jaccard(tokenize(aNorm), tokenize(bNorm));
  const contained = aNorm.includes(bNorm) || bNorm.includes(aNorm) ? 0.2 : 0;
  return Math.min(1, j + contained);
}

function authorSimilarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const aNorm = normalizeText(a);
  const bNorm = normalizeText(b);
  if (!aNorm || !bNorm) return 0;
  if (aNorm === bNorm) return 1;

  const aTokens = tokenize(aNorm);
  const bTokens = tokenize(bNorm);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  return jaccard(aTokens, bTokens);
}

function parseYear(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded > -4000 && rounded < 3000) return rounded;
  }
  if (typeof value === 'string') {
    const match = value.match(/-?\d{3,4}/);
    if (match) {
      const parsed = Number.parseInt(match[0], 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function inferSourceKind(title: string, defaultKind: SourceKind = 'text'): SourceKind {
  const lower = title.toLowerCase();
  if (/(speech|address|oration|sermon)/.test(lower)) return 'speech';
  if (/(letter|epistle|correspondence)/.test(lower)) return 'letter';
  if (/(article|journal|review|proceedings|paper)/.test(lower)) return 'article';
  if (/(archive|catalog|record|collection)/.test(lower)) return 'archive_record';
  if (/(book|volume|novel|essays|memoirs|autobiography|treatise|works)/.test(lower)) return 'book';
  return defaultKind;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}

function clipSnippet(value: string | null | undefined, maxLength = 280): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;

  const clipped = normalized.slice(0, maxLength).trim();
  const sentenceBreak = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('; '), clipped.lastIndexOf(': '));
  if (sentenceBreak > 120) return clipped.slice(0, sentenceBreak + 1).trim();
  return `${clipped}...`;
}

function getFigureNameParts(figureName: string): { full: string; surname: string | null; tokens: string[] } {
  const full = normalizeText(figureName);
  const tokens = tokenize(figureName);
  const surname = tokens.length > 1 ? tokens[tokens.length - 1] : tokens[0] || null;
  return { full, surname, tokens };
}

function hasAboutnessTerm(text: string): boolean {
  const norm = normalizeText(text);
  return ABOUTNESS_TERMS.some((term) => norm.includes(term));
}

function isSecondaryLikeTitle(title: string): boolean {
  const norm = normalizeText(title);
  return SECONDARY_LIKE_TERMS.some((term) => norm.includes(term));
}

function isAncientOrClassical(figure: FigureTarget, suggestion: SuggestedSource): boolean {
  if (figure.birthYear !== null && figure.birthYear < 500) return true;
  return suggestion.year !== null && suggestion.year < 500;
}

function evaluatePrimaryGate(
  figure: FigureTarget,
  suggestion: SuggestedSource,
  candidate: SearchCandidate,
  titleScore: number,
  authorScore: number
): { pass: boolean; reason: string } {
  if (titleScore < 0.82) {
    return { pass: false, reason: `Title similarity too low (${titleScore.toFixed(2)})` };
  }

  if (isSecondaryLikeTitle(candidate.title) && titleScore < 0.95) {
    return { pass: false, reason: 'Candidate title appears secondary/reference-like for a primary source' };
  }

  const ancient = isAncientOrClassical(figure, suggestion);
  if (ancient) {
    const corpusAllowsAuthorGap =
      candidate.source_corpus === 'wikisource' ||
      candidate.source_corpus === 'project_gutenberg' ||
      candidate.source_corpus === 'internet_archive';
    if (corpusAllowsAuthorGap && titleScore >= 0.9) {
      return { pass: true, reason: 'Ancient/classical allowance with strong title match in public-text corpus' };
    }
  }

  if (authorScore < 0.35) {
    return { pass: false, reason: `Author match too low (${authorScore.toFixed(2)})` };
  }

  return { pass: true, reason: 'Primary gate passed' };
}

function evaluateSecondaryAboutness(
  figure: FigureTarget,
  suggestion: SuggestedSource,
  candidate: SearchCandidate,
  titleScore: number
): { pass: boolean; reason: string } {
  const parts = getFigureNameParts(figure.canonicalName);
  const titleNorm = normalizeText(candidate.title);
  const snippetNorm = normalizeText(candidate.snippet || '');
  const metadataNorm = normalizeText(
    `${candidate.metadata.openalex_id || ''} ${candidate.metadata.crossref_type || ''} ${candidate.metadata.doi || ''}`
  );

  const fullNameInTitle = parts.full.length > 0 && titleNorm.includes(parts.full);
  const surnameInTitle = parts.surname ? titleNorm.includes(parts.surname) : false;
  const aboutnessTermInTitle = hasAboutnessTerm(candidate.title);
  const aboutnessTermInSnippet = hasAboutnessTerm(candidate.snippet || '');
  const metadataMentionsFull = parts.full.length > 0 && metadataNorm.includes(parts.full);
  const snippetMentionsFull = parts.full.length > 0 && snippetNorm.includes(parts.full);
  const snippetMentionsSurname = parts.surname ? snippetNorm.includes(parts.surname) : false;

  if (fullNameInTitle) {
    return { pass: true, reason: 'Figure full name present in title' };
  }

  if (surnameInTitle && aboutnessTermInTitle) {
    return { pass: true, reason: 'Surname + aboutness term present in title' };
  }

  if (snippetMentionsFull || metadataMentionsFull) {
    return { pass: true, reason: 'Figure identified in snippet/metadata' };
  }

  if (titleScore >= 0.92 && (surnameInTitle || snippetMentionsSurname) && (aboutnessTermInTitle || aboutnessTermInSnippet)) {
    return { pass: true, reason: 'Very high title match with surname/aboutness support' };
  }

  return { pass: false, reason: 'Secondary aboutness gate failed (title does not clearly target the figure)' };
}

async function loadLocalEnvIfPresent(): Promise<void> {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return;
  const envPath = path.join(process.cwd(), '.env.local');
  try {
    const raw = await readFile(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex <= 0) continue;
      const key = trimmed.slice(0, equalIndex).trim();
      if (key !== 'GEMINI_API_KEY' && key !== 'GOOGLE_API_KEY') continue;
      const valueRaw = trimmed.slice(equalIndex + 1).trim();
      const value = valueRaw.replace(/^['"]|['"]$/g, '');
      if (value && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional local env file.
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HistoryRank/1.0 (hybrid source resolver)' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveFigureTargets(args: CliArgs): Promise<FigureTarget[]> {
  if (args.figureId && args.name) {
    return [{ id: args.figureId, canonicalName: args.name, birthYear: null }];
  }

  const db = new Database(args.dbPath, { readonly: true });
  try {
    if (args.figureId) {
      const row = db
        .prepare('SELECT id, canonical_name as canonicalName, birth_year as birthYear FROM figures WHERE id = ? LIMIT 1')
        .get(args.figureId) as FigureTarget | undefined;
      if (!row) throw new Error(`Figure not found: ${args.figureId}`);
      return [row];
    }

    if (args.name) {
      return [{ id: slugify(args.name), canonicalName: args.name, birthYear: null }];
    }

    const rows = db
      .prepare(
        `SELECT id, canonical_name as canonicalName, birth_year as birthYear
         FROM figures
         WHERE llm_consensus_rank IS NOT NULL
         ORDER BY llm_consensus_rank ASC
         LIMIT ?`
      )
      .all(args.top) as FigureTarget[];

    if (rows.length === 0) {
      throw new Error('No figures found for target selection.');
    }
    return rows;
  } finally {
    db.close();
  }
}

function coerceSuggestedSource(value: unknown): SuggestedSource | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const titleRaw = row.title;
  if (typeof titleRaw !== 'string' || !titleRaw.trim()) return null;

  const authorRaw = row.author;
  const rationaleRaw = row.rationale;
  const likelyCorpora = Array.isArray(row.likely_corpora)
    ? row.likely_corpora.filter((item): item is string => typeof item === 'string')
    : undefined;
  const sourceType = typeof row.source_type === 'string' ? row.source_type : undefined;

  return {
    title: titleRaw.trim(),
    author: typeof authorRaw === 'string' && authorRaw.trim() ? authorRaw.trim() : null,
    year: parseYear(row.year),
    rationale: typeof rationaleRaw === 'string' ? rationaleRaw.trim() : '',
    likelyCorpora: likelyCorpora && likelyCorpora.length > 0 ? likelyCorpora : undefined,
    sourceType,
  };
}

function parseSuggestionPayload(raw: unknown): SuggestionPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid suggestion payload: expected object');
  }
  const row = raw as Record<string, unknown>;
  const primary = Array.isArray(row.primary_sources)
    ? row.primary_sources.map(coerceSuggestedSource).filter((item): item is SuggestedSource => item !== null)
    : [];
  const secondary = Array.isArray(row.secondary_sources)
    ? row.secondary_sources.map(coerceSuggestedSource).filter((item): item is SuggestedSource => item !== null)
    : [];

  return {
    figure: typeof row.figure === 'string' ? row.figure : '',
    primary_sources: primary,
    secondary_sources: secondary,
    notes: typeof row.notes === 'string' ? row.notes : undefined,
  };
}

async function generateSuggestions(
  figure: FigureTarget,
  args: CliArgs
): Promise<{ suggestions: SuggestionPayload; usage: Record<string, unknown> | null }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY (or GOOGLE_API_KEY)');

  const minSecondaryYear = new Date().getUTCFullYear() - 50;
  const model = normalizeGeminiModel(args.model);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = [
    `Figure: ${figure.canonicalName}`,
    'Task: Propose high-quality source candidates for historical research.',
    '',
    'Requirements:',
    `- Return up to ${args.maxPrimary} PRIMARY sources authored by the figure (or directly attributed speeches/letters).`,
    '- PRIMARY sources should prioritize texts likely available on Wikisource, Project Gutenberg, or Internet Archive.',
    `- Return up to ${args.maxSecondary} SECONDARY scholarly sources, prioritizing academic books/articles from ${minSecondaryYear} or later.`,
    '- Prefer peer-reviewed or major academic press sources for secondary works.',
    '- If uncertain, omit the item. Do not invent URLs.',
    '',
    'Output strict JSON with this schema only:',
    '{',
    '  "figure": "string",',
    '  "primary_sources": [',
    '    {',
    '      "title": "string",',
    '      "author": "string|null",',
    '      "year": 0,',
    '      "rationale": "string",',
    '      "likely_corpora": ["wikisource"|"project_gutenberg"|"internet_archive"]',
    '    }',
    '  ],',
    '  "secondary_sources": [',
    '    {',
    '      "title": "string",',
    '      "author": "string|null",',
    '      "year": 0,',
    '      "rationale": "string",',
    '      "source_type": "book|article"',
    '    }',
    '  ],',
    '  "notes": "string"',
    '}',
  ].join('\n');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1500,
        responseMimeType: 'application/json',
      },
    }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload) {
    const errMessage =
      (payload as { error?: { message?: string } } | null)?.error?.message || `Gemini error (${res.status})`;
    throw new Error(errMessage);
  }

  const rawText = ((payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .join('')
    .trim();
  if (!rawText) {
    throw new Error('Gemini returned empty response text');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Gemini response was not valid JSON');
  }

  return {
    suggestions: parseSuggestionPayload(parsed),
    usage: ((payload as { usageMetadata?: Record<string, unknown> }).usageMetadata || null),
  };
}

async function searchWikisource(title: string, limit = 6): Promise<SearchCandidate[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: `"${title}"`,
    srlimit: String(limit),
    format: 'json',
    utf8: '1',
  });
  const url = `https://en.wikisource.org/w/api.php?${params.toString()}`;
  const data = await fetchJson<{ query?: { search?: Array<{ title: string }> } }>(url);
  const rows = data?.query?.search || [];

  return rows.map((row) => {
    const pageTitle = row.title.trim();
    const pageUrl = `https://en.wikisource.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`;
    return {
      source_corpus: 'wikisource',
      source_kind: inferSourceKind(pageTitle, 'text'),
      title: pageTitle,
      author: null,
      publication_year: null,
      source_url: pageUrl,
      access_url: pageUrl,
      snippet: null,
      metadata: {},
    };
  });
}

async function searchGutenberg(title: string, limit = 8): Promise<SearchCandidate[]> {
  const url = `https://gutendex.com/books/?search=${encodeURIComponent(title)}`;
  const data = await fetchJson<{
    results?: Array<{
      id: number;
      title?: string;
      authors?: Array<{ name?: string }>;
      summaries?: string[];
      languages?: string[];
      download_count?: number;
    }>;
  }>(url);
  const rows = (data?.results || []).slice(0, limit);

  return rows
    .filter((row) => row.id && row.title)
    .map((row) => {
      const pageUrl = `https://www.gutenberg.org/ebooks/${row.id}`;
      return {
        source_corpus: 'project_gutenberg',
        source_kind: inferSourceKind(String(row.title), 'book'),
        title: String(row.title).trim(),
        author: row.authors?.[0]?.name?.trim() || null,
        publication_year: null,
        source_url: pageUrl,
        access_url: pageUrl,
        snippet: clipSnippet(row.summaries?.[0] || null),
        metadata: {
          gutenberg_id: row.id,
          languages: row.languages || [],
          download_count: typeof row.download_count === 'number' ? row.download_count : null,
        },
      };
    });
}

async function searchInternetArchive(title: string, author: string | null, limit = 8): Promise<SearchCandidate[]> {
  const query = author
    ? `(title:("${title}") AND creator:("${author}")) AND mediatype:(texts)`
    : `(title:("${title}")) AND mediatype:(texts)`;
  const params = new URLSearchParams({
    q: query,
    fl: 'identifier,title,creator,year',
    rows: String(limit),
    page: '1',
    output: 'json',
  });
  const url = `https://archive.org/advancedsearch.php?${params.toString()}`;
  const data = await fetchJson<{
    response?: { docs?: Array<{ identifier?: string; title?: string; creator?: string; year?: string | number }> };
  }>(url);
  const docs = data?.response?.docs || [];

  return docs
    .filter((doc) => doc.identifier && doc.title)
    .map((doc) => {
      const pageUrl = `https://archive.org/details/${doc.identifier}`;
      return {
        source_corpus: 'internet_archive',
        source_kind: inferSourceKind(String(doc.title), 'text'),
        title: String(doc.title).trim(),
        author: doc.creator ? String(doc.creator).trim() : null,
        publication_year: parseYear(doc.year),
        source_url: pageUrl,
        access_url: pageUrl,
        snippet: null,
        metadata: { ia_identifier: doc.identifier },
      };
    });
}

async function searchCrossref(title: string, author: string | null, limit = 8): Promise<SearchCandidate[]> {
  const params = new URLSearchParams({
    rows: String(limit),
    'query.bibliographic': author ? `${title} ${author}` : title,
    select: 'DOI,title,author,issued,container-title,type,URL',
  });
  const url = `https://api.crossref.org/works?${params.toString()}`;
  const data = await fetchJson<{
    message?: {
      items?: Array<{
        DOI?: string;
        URL?: string;
        title?: string[];
        type?: string;
        author?: Array<{ given?: string; family?: string }>;
        issued?: { 'date-parts'?: number[][] };
        'container-title'?: string[];
      }>;
    };
  }>(url);
  const rows = data?.message?.items || [];

  return rows
    .filter((row) => row.title?.[0] && (row.URL || row.DOI))
    .map((row) => {
      const titleValue = String(row.title![0]).trim();
      const contributor = row.author?.[0];
      const contributorName =
        contributor && (contributor.given || contributor.family)
          ? [contributor.given, contributor.family].filter(Boolean).join(' ')
          : null;
      const year = row.issued?.['date-parts']?.[0]?.[0];
      const urlValue = row.URL || `https://doi.org/${row.DOI}`;
      return {
        source_corpus: 'crossref',
        source_kind: row.type?.includes('book') ? 'book' : 'article',
        title: titleValue,
        author: contributorName,
        publication_year: typeof year === 'number' ? year : null,
        source_url: urlValue!,
        access_url: urlValue!,
        snippet: row['container-title']?.[0] || null,
        metadata: { doi: row.DOI || null, crossref_type: row.type || null },
      };
    });
}

async function searchOpenAlex(title: string, limit = 8): Promise<SearchCandidate[]> {
  const params = new URLSearchParams({
    search: title,
    per_page: String(limit),
    sort: 'relevance_score:desc',
  });
  const url = `https://api.openalex.org/works?${params.toString()}`;
  const data = await fetchJson<{
    results?: Array<{
      id?: string;
      doi?: string;
      display_name?: string;
      publication_year?: number;
      type?: string;
      authorships?: Array<{ author?: { display_name?: string | null } | null }>;
      primary_location?: {
        landing_page_url?: string | null;
        source?: { display_name?: string | null } | null;
      } | null;
    }>;
  }>(url);
  const rows = data?.results || [];

  return rows
    .filter((row) => row.display_name && (row.doi || row.id || row.primary_location?.landing_page_url))
    .map((row) => {
      const doiUrl = row.doi
        ? row.doi.startsWith('http')
          ? row.doi
          : `https://doi.org/${row.doi.replace(/^doi:\s*/i, '')}`
        : null;
      const urlValue = doiUrl || row.primary_location?.landing_page_url || row.id!;
      return {
        source_corpus: 'openalex',
        source_kind: row.type === 'book' ? 'book' : 'article',
        title: row.display_name!.trim(),
        author: row.authorships?.[0]?.author?.display_name || null,
        publication_year: typeof row.publication_year === 'number' ? row.publication_year : null,
        source_url: urlValue,
        access_url: urlValue,
        snippet: row.primary_location?.source?.display_name || null,
        metadata: { openalex_id: row.id || null, work_type: row.type || null },
      };
    });
}

async function searchOpenLibrary(title: string, author: string | null, limit = 8): Promise<SearchCandidate[]> {
  const params = new URLSearchParams({
    title,
    limit: String(limit),
  });
  if (author) params.set('author', author);
  const url = `https://openlibrary.org/search.json?${params.toString()}`;
  const data = await fetchJson<{
    docs?: Array<{
      key?: string;
      title?: string;
      author_name?: string[];
      first_publish_year?: number;
      edition_count?: number;
    }>;
  }>(url);
  const rows = data?.docs || [];

  return rows
    .filter((row) => row.key && row.title)
    .map((row) => {
      const pageUrl = `https://openlibrary.org${row.key}`;
      return {
        source_corpus: 'openlibrary',
        source_kind: 'book',
        title: String(row.title).trim(),
        author: row.author_name?.[0] || null,
        publication_year: parseYear(row.first_publish_year),
        source_url: pageUrl,
        access_url: pageUrl,
        snippet: null,
        metadata: { edition_count: row.edition_count || null },
      };
    });
}

function scorePrimarySuggestion(
  suggestion: SuggestedSource,
  candidate: SearchCandidate,
  figure: FigureTarget
): { score: number; why: string; titleScore: number; authorScore: number; yearScore: number } {
  const t = titleSimilarity(suggestion.title, candidate.title);
  const a =
    suggestion.author !== null
      ? authorSimilarity(suggestion.author, candidate.author)
      : authorSimilarity(figure.canonicalName, candidate.author) * 0.7;
  const y =
    suggestion.year !== null && candidate.publication_year !== null
      ? Math.max(0, 1 - Math.min(50, Math.abs(suggestion.year - candidate.publication_year)) / 50)
      : 0.25;

  const corpusBoost =
    candidate.source_corpus === 'wikisource'
      ? 0.08
      : candidate.source_corpus === 'project_gutenberg'
        ? 0.07
        : 0.05;
  const score = clamp01(t * 0.62 + a * 0.25 + y * 0.13 + corpusBoost);
  return {
    score,
    why: `Matched primary suggestion by title=${t.toFixed(2)}, author=${a.toFixed(2)}, year=${y.toFixed(2)}`,
    titleScore: t,
    authorScore: a,
    yearScore: y,
  };
}

function scoreSecondarySuggestion(
  suggestion: SuggestedSource,
  candidate: SearchCandidate,
  minSecondaryYear: number
): { score: number; why: string; titleScore: number; authorScore: number; yearScore: number } {
  if (candidate.publication_year !== null && candidate.publication_year < minSecondaryYear) {
    return {
      score: 0,
      why: `Rejected: publication year ${candidate.publication_year} before ${minSecondaryYear}`,
      titleScore: 0,
      authorScore: 0,
      yearScore: 0,
    };
  }

  const t = titleSimilarity(suggestion.title, candidate.title);
  const a = authorSimilarity(suggestion.author, candidate.author);
  const y =
    suggestion.year !== null && candidate.publication_year !== null
      ? Math.max(0, 1 - Math.min(30, Math.abs(suggestion.year - candidate.publication_year)) / 30)
      : candidate.publication_year !== null
        ? 0.6
        : 0.25;
  const providerBoost =
    candidate.source_corpus === 'crossref'
      ? 0.09
      : candidate.source_corpus === 'openalex'
        ? 0.08
        : 0.03;

  const score = clamp01(t * 0.63 + a * 0.2 + y * 0.17 + providerBoost);
  return {
    score,
    why: `Matched secondary suggestion by title=${t.toFixed(2)}, author=${a.toFixed(2)}, year=${y.toFixed(2)}`,
    titleScore: t,
    authorScore: a,
    yearScore: y,
  };
}

function dedupeByUrl(candidates: ResolvedSource[]): ResolvedSource[] {
  const bestByUrl = new Map<string, ResolvedSource>();
  for (const candidate of candidates) {
    const current = bestByUrl.get(candidate.source_url);
    if (!current || current.confidence < candidate.confidence) {
      bestByUrl.set(candidate.source_url, candidate);
    }
  }
  return Array.from(bestByUrl.values());
}

function selectBalancedByCorpus(
  rows: ResolvedSource[],
  limit: number,
  preferredCorpora: SourceCorpus[]
): ResolvedSource[] {
  if (limit <= 0 || rows.length === 0) return [];

  const sorted = [...rows].sort((a, b) => b.confidence - a.confidence);
  if (limit === 1) return sorted.slice(0, 1);

  const selected: ResolvedSource[] = [];
  const usedUrls = new Set<string>();

  const add = (row: ResolvedSource | undefined) => {
    if (!row) return;
    if (selected.length >= limit) return;
    if (usedUrls.has(row.source_url)) return;
    selected.push(row);
    usedUrls.add(row.source_url);
  };

  for (const corpus of preferredCorpora) {
    add(sorted.find((row) => row.source_corpus === corpus && !usedUrls.has(row.source_url)));
  }

  for (const row of sorted) {
    add(row);
    if (selected.length >= limit) break;
  }

  return selected;
}

function buildCoverageSummary(candidates: ResolvedSource[]): Record<string, unknown> {
  const byRole: Record<string, number> = {};
  const byCorpus: Record<string, number> = {};
  const years = candidates.map((row) => row.publication_year).filter((year): year is number => year !== null);

  let nonEnglishCount = 0;
  for (const row of candidates) {
    byRole[row.source_role] = (byRole[row.source_role] || 0) + 1;
    byCorpus[row.source_corpus] = (byCorpus[row.source_corpus] || 0) + 1;

    const langs = row.metadata?.languages;
    if (Array.isArray(langs)) {
      const hasNonEnglish = langs.some((lang) => typeof lang === 'string' && lang.toLowerCase() !== 'en');
      if (hasNonEnglish) nonEnglishCount += 1;
    }
  }

  return {
    total: candidates.length,
    byRole,
    byCorpus,
    yearSpan:
      years.length > 0
        ? {
            min: Math.min(...years),
            max: Math.max(...years),
          }
        : null,
    nonEnglishCandidates: nonEnglishCount,
  };
}

async function resolveSuggestionsForFigure(
  figure: FigureTarget,
  suggestions: SuggestionPayload,
  args: CliArgs
): Promise<CandidateFile> {
  const minSecondaryYear = new Date().getUTCFullYear() - 50;
  const unresolved: CandidateFile['unresolved'] = [];
  const resolved: ResolvedSource[] = [];

  const primarySuggestions = suggestions.primary_sources.slice(0, args.maxPrimary);
  for (const suggestion of primarySuggestions) {
    const hinted = new Set(
      (suggestion.likelyCorpora || PRIMARY_CORPUS_HINTS)
        .map((item) => item.toLowerCase())
        .filter((item) => PRIMARY_CORPUS_HINTS.includes(item as (typeof PRIMARY_CORPUS_HINTS)[number]))
    );
    const corpora = PRIMARY_CORPUS_HINTS.filter((item) => hinted.has(item));
    const searchJobs: Array<Promise<SearchCandidate[]>> = [];
    if (corpora.includes('wikisource')) searchJobs.push(searchWikisource(suggestion.title));
    if (corpora.includes('project_gutenberg')) searchJobs.push(searchGutenberg(suggestion.title));
    if (corpora.includes('internet_archive')) searchJobs.push(searchInternetArchive(suggestion.title, suggestion.author));

    const searchResults = (await Promise.all(searchJobs)).flat();
    if (searchResults.length === 0) {
      unresolved.push({ role: 'primary', title: suggestion.title, reason: 'No resolver results from corpus APIs' });
      continue;
    }

    let best: { candidate: SearchCandidate; score: number; why: string } | null = null;
    let bestRejectedReason: string | null = null;
    for (const row of searchResults) {
      const scored = scorePrimarySuggestion(suggestion, row, figure);
      const gate = evaluatePrimaryGate(
        figure,
        suggestion,
        row,
        scored.titleScore,
        scored.authorScore
      );
      if (!gate.pass) {
        if (!bestRejectedReason || scored.score > (best?.score || 0)) {
          bestRejectedReason = `${gate.reason}; baseScore=${scored.score.toFixed(2)}`;
        }
        continue;
      }
      if (!best || scored.score > best.score) {
        best = { candidate: row, score: scored.score, why: `${scored.why}; ${gate.reason}` };
      }
    }

    if (!best || best.score < PRIMARY_MIN_SCORE) {
      unresolved.push({
        role: 'primary',
        title: suggestion.title,
        reason: best
          ? `Best score below threshold (${best.score.toFixed(2)} < ${PRIMARY_MIN_SCORE.toFixed(2)})`
          : bestRejectedReason || 'No candidate passed primary gate',
      });
      continue;
    }

    resolved.push({
      source_corpus: best.candidate.source_corpus,
      source_role: 'primary',
      source_kind: best.candidate.source_kind,
      title: best.candidate.title,
      author: best.candidate.author,
      publication_year: best.candidate.publication_year,
      source_url: best.candidate.source_url,
      access_url: best.candidate.access_url,
      snippet: best.candidate.snippet,
      confidence: best.score,
      why: `Primary source resolved from suggestion "${suggestion.title}". ${best.why}`,
      metadata: {
        strategy: 'llm_hybrid_resolver_v1',
        suggestion_title: suggestion.title,
        suggestion_author: suggestion.author,
        suggestion_year: suggestion.year,
        suggestion_rationale: suggestion.rationale,
        ...best.candidate.metadata,
      },
    });
  }

  const secondarySuggestions = suggestions.secondary_sources.slice(0, args.maxSecondary);
  for (const suggestion of secondarySuggestions) {
    const searchResults = (
      await Promise.all([
        searchCrossref(suggestion.title, suggestion.author),
        searchOpenAlex(suggestion.title),
        searchOpenLibrary(suggestion.title, suggestion.author),
      ])
    ).flat();

    if (searchResults.length === 0) {
      unresolved.push({ role: 'secondary', title: suggestion.title, reason: 'No resolver results from bibliography APIs' });
      continue;
    }

    let best: { candidate: SearchCandidate; score: number; why: string } | null = null;
    let bestRejectedReason: string | null = null;
    for (const row of searchResults) {
      const scored = scoreSecondarySuggestion(suggestion, row, minSecondaryYear);
      const aboutness = evaluateSecondaryAboutness(figure, suggestion, row, scored.titleScore);
      if (!aboutness.pass) {
        if (!bestRejectedReason || scored.score > (best?.score || 0)) {
          bestRejectedReason = `${aboutness.reason}; baseScore=${scored.score.toFixed(2)}`;
        }
        continue;
      }
      if (!best || scored.score > best.score) {
        best = {
          candidate: row,
          score: scored.score,
          why: `${scored.why}; ${aboutness.reason}`,
        };
      }
    }

    if (!best || best.score < SECONDARY_MIN_SCORE) {
      unresolved.push({
        role: 'secondary',
        title: suggestion.title,
        reason: best
          ? `Best score below threshold (${best.score.toFixed(2)} < ${SECONDARY_MIN_SCORE.toFixed(2)})`
          : bestRejectedReason || 'No candidate passed secondary aboutness gate',
      });
      continue;
    }

    resolved.push({
      source_corpus: best.candidate.source_corpus,
      source_role: 'secondary',
      source_kind: best.candidate.source_kind,
      title: best.candidate.title,
      author: best.candidate.author,
      publication_year: best.candidate.publication_year,
      source_url: best.candidate.source_url,
      access_url: best.candidate.access_url,
      snippet: best.candidate.snippet,
      confidence: best.score,
      why: `Secondary source resolved from suggestion "${suggestion.title}". ${best.why}`,
      metadata: {
        strategy: 'llm_hybrid_resolver_v1',
        min_secondary_year: minSecondaryYear,
        suggestion_title: suggestion.title,
        suggestion_author: suggestion.author,
        suggestion_year: suggestion.year,
        suggestion_rationale: suggestion.rationale,
        ...best.candidate.metadata,
      },
    });
  }

  const deduped = dedupeByUrl(resolved);
  const primaryBalanced = selectBalancedByCorpus(
    deduped.filter((row) => row.source_role === 'primary'),
    args.limitPerRole,
    PRIMARY_DIVERSITY_ORDER
  );
  const secondaryBalanced = selectBalancedByCorpus(
    deduped.filter((row) => row.source_role === 'secondary'),
    args.limitPerRole,
    SECONDARY_DIVERSITY_ORDER
  );
  const roleFiltered: ResolvedSource[] = [...primaryBalanced, ...secondaryBalanced];
  const coverage = buildCoverageSummary(roleFiltered);

  return {
    generatedAt: new Date().toISOString(),
    figureId: figure.id,
    figureName: figure.canonicalName,
    constraints: {
      strategy: 'llm_hybrid_resolver_v1',
      selection: 'balanced_role_and_corpus_v1',
      model: normalizeGeminiModel(args.model),
      language: 'en',
      sourceRoles: ['primary', 'secondary'],
      minSecondaryYear,
      minPrimaryScore: PRIMARY_MIN_SCORE,
      minSecondaryScore: SECONDARY_MIN_SCORE,
      maxPrimarySuggestions: args.maxPrimary,
      maxSecondarySuggestions: args.maxSecondary,
      limitPerRole: args.limitPerRole,
      preferredPrimaryCorpora: PRIMARY_DIVERSITY_ORDER,
      preferredSecondaryCorpora: SECONDARY_DIVERSITY_ORDER,
      coverage,
    },
    suggestions: {
      primary: primarySuggestions,
      secondary: secondarySuggestions,
      notes: suggestions.notes || null,
    },
    unresolved,
    candidates: roleFiltered,
  };
}

function mapSourceCorpusForDb(corpus: SourceCorpus): { sourceCorpus: string; provider: string | null } {
  if (corpus === 'wikisource' || corpus === 'project_gutenberg' || corpus === 'internet_archive') {
    return { sourceCorpus: corpus, provider: null };
  }
  return { sourceCorpus: 'other', provider: corpus };
}

function isPublicDomain(corpus: SourceCorpus, role: SourceRole): boolean {
  if (role === 'primary') return true;
  return corpus === 'wikisource' || corpus === 'project_gutenberg' || corpus === 'internet_archive';
}

function publishCandidates(dbPath: string, file: CandidateFile): number {
  const db = new Database(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  const existsStmt = db.prepare('SELECT 1 FROM figures WHERE id = ? LIMIT 1');
  if (!existsStmt.get(file.figureId)) {
    db.close();
    return 0;
  }

  const upsertStmt = db.prepare(`
    INSERT INTO figure_research_sources (
      figure_id, source_role, source_corpus, source_kind, title, author,
      publication_year, source_url, access_url, snippet, is_public_domain, confidence,
      curation_status, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(figure_id, source_url) DO UPDATE SET
      source_role = excluded.source_role,
      source_corpus = excluded.source_corpus,
      source_kind = excluded.source_kind,
      title = excluded.title,
      author = excluded.author,
      publication_year = excluded.publication_year,
      access_url = excluded.access_url,
      snippet = excluded.snippet,
      is_public_domain = excluded.is_public_domain,
      confidence = excluded.confidence,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
  `);

  const now = Math.floor(Date.now() / 1000);
  const run = db.transaction(() => {
    let count = 0;
    for (const row of file.candidates) {
      const mapped = mapSourceCorpusForDb(row.source_corpus);
      const metadata = JSON.stringify({
        ...row.metadata,
        provider: mapped.provider,
        import_reason: row.why,
        figure_name: file.figureName,
      });
      upsertStmt.run(
        file.figureId,
        row.source_role,
        mapped.sourceCorpus,
        row.source_kind,
        row.title,
        row.author,
        row.publication_year,
        row.source_url,
        row.access_url,
        row.snippet,
        isPublicDomain(row.source_corpus, row.source_role) ? 1 : 0,
        row.confidence,
        'auto',
        metadata,
        now,
        now
      );
      count += 1;
    }
    return count;
  });

  try {
    return run();
  } finally {
    db.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadLocalEnvIfPresent();
  const figures = await resolveFigureTargets(args);

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          targets: figures.map((row) => ({ id: row.id, name: row.canonicalName })),
          model: normalizeGeminiModel(args.model),
          publish: args.publish,
          outDir: args.outDir,
        },
        null,
        2
      )
    );
    return;
  }

  await mkdir(args.outDir, { recursive: true });

  let publishedTotal = 0;
  for (const figure of figures) {
    console.log(`Generating suggestions for ${figure.id} (${figure.canonicalName})`);
    const { suggestions, usage } = await generateSuggestions(figure, args);
    const file = await resolveSuggestionsForFigure(figure, suggestions, args);
    file.constraints.usageMetadata = usage;

    const outputPath = path.join(args.outDir, `${figure.id}.research-sources.json`);
    await writeFile(outputPath, JSON.stringify(file, null, 2), 'utf8');
    console.log(
      `Wrote ${file.candidates.length} resolved candidates (${file.unresolved.length} unresolved) to ${outputPath}`
    );

    if (args.publish) {
      const published = publishCandidates(args.dbPath, file);
      publishedTotal += published;
      console.log(`Published ${published} rows for ${figure.id}`);
    }
  }

  if (args.publish) {
    console.log(`Done. Published total rows: ${publishedTotal}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

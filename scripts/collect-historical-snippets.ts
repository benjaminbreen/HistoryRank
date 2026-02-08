import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

type SnippetCorpus =
  | 'britannica_1911'
  | 'britannica_1902'
  | 'wikisource'
  | 'project_gutenberg'
  | 'internet_archive'
  | 'other';

type HistoricalSnippetCandidate = {
  corpus: SnippetCorpus;
  edition_year: number | null;
  source_title: string | null;
  source_url: string | null;
  snippet: string;
  match_score: number;
  why: string;
};

type CandidatePayload = {
  generatedAt: string;
  figureId: string;
  figureName: string;
  constraints: {
    language: 'en';
    preferredCorpora: string[];
    queryNames: string[];
    seedFallbackUsed: boolean;
  };
  candidates: HistoricalSnippetCandidate[];
};

type BritannicaIndexEntry = {
  pageTitle: string;
  entryTitle: string;
  url: string;
  matchKeys: string[];
};

type BritannicaIndexPayload = {
  generatedAt: string;
  source: string;
  prefix: string;
  totalPagesFetched: number;
  entries: BritannicaIndexEntry[];
};

type SeedPayload = Record<string, HistoricalSnippetCandidate[]>;

type CliArgs = {
  dbPath: string;
  indexPath: string;
  figureId: string | null;
  name: string | null;
  aliases: string[];
  top: number | null;
  limit: number;
  outDir: string;
  dryRun: boolean;
};

type FigureTarget = {
  figureId: string;
  figureName: string;
  aliases: string[];
};

type ParseResponse = {
  parse?: {
    text?: string;
  };
};

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const dbPath = get('--db') || path.join(process.cwd(), 'historyrank.db');
  const indexPath =
    get('--index') || path.join(process.cwd(), 'data', 'corpora', 'britannica-1911-index.json');
  const figureId = get('--figure-id');
  const name = get('--name');
  const aliasesRaw = get('--aliases');
  const aliases = aliasesRaw
    ? aliasesRaw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const topRaw = get('--top');
  const top = topRaw ? Number.parseInt(topRaw, 10) : null;
  const limitRaw = get('--limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 3;
  const outDir = get('--out-dir') || path.join(process.cwd(), 'data', 'research-candidates');
  const dryRun = argv.includes('--dry-run');

  if (!name && !figureId && top === null) {
    throw new Error('Provide one of: --name, --figure-id, or --top=N');
  }
  if (top !== null && (!Number.isFinite(top) || top <= 0 || top > 5000)) {
    throw new Error('Invalid --top. Use a number between 1 and 5000.');
  }
  if (!Number.isFinite(limit) || limit <= 0 || limit > 20) {
    throw new Error('Invalid --limit. Use a number between 1 and 20.');
  }

  return { dbPath, indexPath, figureId, name, aliases, top, limit, outDir, dryRun };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeNameKey(input: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return ascii
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripTrailingParenthetical(input: string): string {
  return input.replace(/\s*\([^)]*\)\s*$/g, '').trim();
}

function stripHonorifics(input: string): string {
  return input
    .replace(/\b(sir|saint|st|lord|lady|dr|prof|mr|mrs|ms|rev|fr)\.?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function reorderCommaName(input: string): string | null {
  const segments = input.split(',').map((part) => part.trim()).filter(Boolean);
  if (segments.length < 2) return null;
  const [lastName, ...rest] = segments;
  const remainder = rest.join(' ').trim();
  if (!lastName || !remainder) return null;
  return `${remainder} ${lastName}`.trim();
}

function buildNameVariants(input: string): string[] {
  const out = new Set<string>();
  const raw = input.trim();
  if (!raw) return [];

  out.add(raw);
  out.add(stripTrailingParenthetical(raw));
  out.add(stripHonorifics(raw));
  out.add(stripHonorifics(stripTrailingParenthetical(raw)));

  const reordered = reorderCommaName(raw);
  if (reordered) {
    out.add(reordered);
    out.add(stripHonorifics(reordered));
    out.add(stripTrailingParenthetical(reordered));
    out.add(stripHonorifics(stripTrailingParenthetical(reordered)));
  }

  return Array.from(out)
    .map((value) => normalizeNameKey(value))
    .filter(Boolean);
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\[[0-9]+\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampScore(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

function countWords(input: string): number {
  return input.split(/\s+/).filter(Boolean).length;
}

function isBoilerplateParagraph(input: string): boolean {
  const lower = input.toLowerCase();
  if (lower.startsWith('redirect to:')) return true;
  if (lower.includes('1911 encyclop') && lower.includes('disclaimer')) return true;
  if (lower.startsWith('see also ')) return true;
  if (/^\d+\.\s/.test(input)) return true;
  if (lower.includes('.mw-parser-output')) return true;
  if (lower.includes('{') && lower.includes('}')) return true;
  if (lower.length > 20 && /^[^a-zA-Z]*$/.test(lower)) return true;
  return false;
}

function buildFigureMatchKeys(name: string, aliases: string[]): string[] {
  const keys = new Set<string>();
  const canonicalKey = normalizeNameKey(name);
  const canonicalWords = countWords(canonicalKey);

  for (const variant of buildNameVariants(name)) {
    if (countWords(variant) >= 2 || canonicalWords === 1) keys.add(variant);
  }
  for (const alias of aliases) {
    for (const variant of buildNameVariants(alias)) {
      if (countWords(variant) >= 2 || canonicalWords === 1) keys.add(variant);
    }
  }

  return Array.from(keys);
}

function scoreMatchedEntry(
  matchedKey: string,
  canonicalKey: string,
  snippet: string
): number {
  let score = matchedKey === canonicalKey ? 0.94 : 0.86;
  if (snippet.length >= 120) score += 0.05;
  if (snippet.length > 700) score -= 0.05;
  return clampScore(score);
}

function rankEntryForFigure(entryTitle: string, canonicalKey: string, canonicalWords: number): number {
  const normalizedBase = normalizeNameKey(stripHonorifics(stripTrailingParenthetical(entryTitle)));
  const normalizedRaw = normalizeNameKey(stripHonorifics(entryTitle));
  let score = 0;

  if (normalizedBase === canonicalKey) score += 10;
  if (normalizedRaw === canonicalKey) score += 5;

  const reordered = reorderCommaName(entryTitle);
  if (reordered && normalizeNameKey(stripHonorifics(stripTrailingParenthetical(reordered))) === canonicalKey) {
    score += 6;
  }

  if (entryTitle.includes('(')) score -= 2;
  if (canonicalWords === 1 && entryTitle.includes('(')) score -= 4;

  return score;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HistoryRank/1.0 (historical snippet collection)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function extractRedirectTargetPageTitle(html: string): string | null {
  const redirectMatch = html.match(
    /Redirect to:\s*<a[^>]+href="\/wiki\/([^"#?]+)(?:#[^"]*)?"[^>]*>/i
  );
  if (!redirectMatch?.[1]) return null;
  const decoded = decodeURIComponent(redirectMatch[1]).replace(/_/g, ' ').trim();
  return decoded || null;
}

function selectLeadParagraph(textHtml: string): string {
  const paragraphs = Array.from(textHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => stripHtml(match[1] || ''))
    .filter((value) => value.length >= 80 && !isBoilerplateParagraph(value));

  if (paragraphs.length === 0) {
    return '';
  }

  const best = paragraphs[0];
  if (best.length <= 700) return best;
  const clipped = best.slice(0, 700);
  const sentenceEnd = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('; '), clipped.lastIndexOf(': '));
  return sentenceEnd > 140 ? `${clipped.slice(0, sentenceEnd + 1).trim()}` : `${clipped.trim()}...`;
}

async function fetchWikisourceLeadSnippet(pageTitle: string, depth = 0): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'parse',
    page: pageTitle,
    prop: 'text',
    redirects: '1',
    format: 'json',
    formatversion: '2',
    disableeditsection: '1',
    disabletoc: '1',
    utf8: '1',
  });
  const url = `https://en.wikisource.org/w/api.php?${params.toString()}`;
  const data = await fetchJson<ParseResponse>(url);
  const html = data?.parse?.text || '';
  if (!html) return null;

  const redirectTarget = extractRedirectTargetPageTitle(html);
  if (redirectTarget && depth < 2 && normalizeNameKey(redirectTarget) !== normalizeNameKey(pageTitle)) {
    return fetchWikisourceLeadSnippet(redirectTarget, depth + 1);
  }

  const snippet = selectLeadParagraph(html);
  if (!snippet) return null;
  if (snippet.length < 120) return null;
  return snippet;
}

async function loadSeedCandidates(figureName: string, figureId: string): Promise<HistoricalSnippetCandidate[]> {
  const seedsPath = path.join(process.cwd(), 'data', 'research-seeds', 'historical-snippets.en.json');
  try {
    const raw = await readFile(seedsPath, 'utf8');
    const seeds = JSON.parse(raw) as SeedPayload;
    const keys = new Set<string>([
      normalizeNameKey(figureName),
      normalizeNameKey(figureId.replace(/-/g, ' ')),
      figureId,
    ]);
    const matches: HistoricalSnippetCandidate[] = [];
    for (const [key, value] of Object.entries(seeds)) {
      if (!keys.has(normalizeNameKey(key))) continue;
      if (!Array.isArray(value)) continue;
      matches.push(...value);
    }
    return matches;
  } catch {
    return [];
  }
}

function dedupeAndRank(candidates: HistoricalSnippetCandidate[]): HistoricalSnippetCandidate[] {
  const seen = new Set<string>();
  const out: HistoricalSnippetCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.corpus}::${candidate.source_title || ''}::${candidate.snippet
      .slice(0, 180)
      .toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out.sort((a, b) => b.match_score - a.match_score);
}

async function loadIndex(indexPath: string): Promise<BritannicaIndexPayload> {
  const raw = await readFile(indexPath, 'utf8');
  const payload = JSON.parse(raw) as BritannicaIndexPayload;
  if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
    throw new Error(`Index has no entries: ${indexPath}`);
  }
  return payload;
}

function buildIndexLookup(entries: BritannicaIndexEntry[]): Map<string, BritannicaIndexEntry[]> {
  const map = new Map<string, BritannicaIndexEntry[]>();
  for (const entry of entries) {
    for (const key of entry.matchKeys) {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(entry);
    }
  }
  return map;
}

function openDatabase(dbPath: string): Database.Database {
  return new Database(dbPath, { readonly: true });
}

function loadFigureTargets(args: CliArgs, db: Database.Database): FigureTarget[] {
  if (args.name) {
    return [
      {
        figureId: args.figureId || slugify(args.name),
        figureName: args.name,
        aliases: args.aliases,
      },
    ];
  }

  const aliasesByFigure = new Map<string, string[]>();
  const aliasStmt = db.prepare('SELECT alias FROM name_aliases WHERE figure_id = ?');
  const loadAliases = (figureId: string): string[] => {
    const rows = aliasStmt.all(figureId) as Array<{ alias: string }>;
    const out = new Set<string>();
    for (const row of rows) {
      if (!row.alias) continue;
      out.add(row.alias);
    }
    return Array.from(out);
  };

  if (args.figureId) {
    const row = db
      .prepare('SELECT id, canonical_name FROM figures WHERE id = ? LIMIT 1')
      .get(args.figureId) as { id: string; canonical_name: string } | undefined;
    if (!row) throw new Error(`Figure not found: ${args.figureId}`);
    aliasesByFigure.set(row.id, loadAliases(row.id));
    return [
      {
        figureId: row.id,
        figureName: row.canonical_name,
        aliases: aliasesByFigure.get(row.id) || [],
      },
    ];
  }

  const top = args.top!;
  const rows = db
    .prepare(
      `
      SELECT id, canonical_name
      FROM figures
      WHERE llm_consensus_rank IS NOT NULL
      ORDER BY llm_consensus_rank ASC
      LIMIT ?
      `
    )
    .all(top) as Array<{ id: string; canonical_name: string }>;

  return rows.map((row) => ({
    figureId: row.id,
    figureName: row.canonical_name,
    aliases: loadAliases(row.id),
  }));
}

async function buildCandidatesForFigure(
  figure: FigureTarget,
  lookup: Map<string, BritannicaIndexEntry[]>,
  limit: number
): Promise<HistoricalSnippetCandidate[]> {
  const figureKeys = buildFigureMatchKeys(figure.figureName, figure.aliases);
  const canonicalKey = normalizeNameKey(figure.figureName);
  const canonicalWords = countWords(canonicalKey);

  const matched = new Map<string, { entry: BritannicaIndexEntry; matchedKey: string }>();
  for (const key of figureKeys) {
    const entries = lookup.get(key) || [];
    for (const entry of entries) {
      const existing = matched.get(entry.pageTitle);
      if (!existing) {
        matched.set(entry.pageTitle, { entry, matchedKey: key });
        continue;
      }
      if (existing.matchedKey !== canonicalKey && key === canonicalKey) {
        matched.set(entry.pageTitle, { entry, matchedKey: key });
      }
    }
  }

  const selected = Array.from(matched.values())
    .sort((a, b) => {
      const aCanonical = a.matchedKey === canonicalKey ? 1 : 0;
      const bCanonical = b.matchedKey === canonicalKey ? 1 : 0;
      const aRank = rankEntryForFigure(a.entry.entryTitle, canonicalKey, canonicalWords);
      const bRank = rankEntryForFigure(b.entry.entryTitle, canonicalKey, canonicalWords);
      return (
        bCanonical - aCanonical ||
        bRank - aRank ||
        a.entry.entryTitle.localeCompare(b.entry.entryTitle)
      );
    })
    .slice(0, limit);

  const out: HistoricalSnippetCandidate[] = [];
  for (const item of selected) {
    const snippet = await fetchWikisourceLeadSnippet(item.entry.pageTitle);
    if (!snippet) continue;
    out.push({
      corpus: 'britannica_1911',
      edition_year: 1911,
      source_title: item.entry.entryTitle,
      source_url: item.entry.url,
      snippet,
      match_score: scoreMatchedEntry(item.matchedKey, canonicalKey, snippet),
      why:
        item.matchedKey === canonicalKey
          ? 'Exact canonical-name match against 1911 Encyclopaedia Britannica entry.'
          : 'Matched via name-alias key against 1911 Encyclopaedia Britannica entry.',
    });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const index = await loadIndex(args.indexPath);
  const lookup = buildIndexLookup(index.entries);
  const db = openDatabase(args.dbPath);

  try {
    const targets = loadFigureTargets(args, db);
    if (targets.length === 0) {
      console.log('No figures resolved for snippet collection.');
      return;
    }

    await mkdir(args.outDir, { recursive: true });

    let written = 0;
    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      const fetched = await buildCandidatesForFigure(target, lookup, args.limit);
      const seeds = await loadSeedCandidates(target.figureName, target.figureId);
      const candidates = dedupeAndRank([...seeds, ...fetched]).slice(0, args.limit);

      const payload: CandidatePayload = {
        generatedAt: new Date().toISOString(),
        figureId: target.figureId,
        figureName: target.figureName,
        constraints: {
          language: 'en',
          preferredCorpora: ['britannica_1911', 'britannica_1902', 'wikisource'],
          queryNames: [target.figureName, ...target.aliases].slice(0, 12),
          seedFallbackUsed: seeds.length > 0,
        },
        candidates,
      };

      if (args.dryRun) {
        if (targets.length === 1) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          console.log(`${target.figureId}: ${candidates.length} candidates`);
        }
      } else {
        const outputPath = path.join(args.outDir, `${target.figureId}.historical-snippets.json`);
        await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
      }

      written += 1;
      if (targets.length > 1 && (i + 1) % 20 === 0) {
        console.log(`Processed ${i + 1}/${targets.length} figures...`);
      }
    }

    if (!args.dryRun) {
      console.log(`Wrote historical snippet candidates for ${written} figure(s) to ${args.outDir}`);
    }
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

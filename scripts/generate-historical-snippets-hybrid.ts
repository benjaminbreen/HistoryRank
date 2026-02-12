import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

type SnippetCorpus =
  | 'britannica_1911'
  | 'britannica_1902'
  | 'wikisource'
  | 'project_gutenberg'
  | 'internet_archive'
  | 'other';

type CliArgs = {
  dbPath: string;
  figureId: string | null;
  top: number;
  offset: number;
  outDir: string;
  reportPath: string;
  maxPerFigure: number;
  maxPerCorpus: number;
  minWords: number;
  maxChars: number;
  dryRun: boolean;
};

type FigureRow = {
  id: string;
  canonical_name: string;
  llm_consensus_rank: number | null;
  wikipedia_slug: string | null;
  wikipedia_extract: string | null;
};

type HistoricalRow = {
  corpus: string;
  edition_year: number | null;
  source_title: string | null;
  source_url: string | null;
  snippet: string;
  match_score: number | null;
};

type SourceRow = {
  source_role: string;
  source_corpus: string;
  title: string;
  publication_year: number | null;
  source_url: string;
  access_url: string | null;
  snippet: string | null;
  confidence: number | null;
};

type TimelineEventRow = {
  event_label: string;
  event_description: string | null;
  event_start_year: number | null;
  sort_index: number;
};

type AssessmentRow = {
  assessment_text: string | null;
};

type AliasRow = {
  figure_id: string;
  alias: string;
};

type RankingContributionRow = {
  source: string;
  rank: number;
  contribution: string;
};

type HistoricalSnippetCandidate = {
  corpus: SnippetCorpus;
  edition_year: number | null;
  source_title: string | null;
  source_url: string | null;
  snippet: string;
  match_score: number;
  why: string;
};

type CandidateFile = {
  generatedAt: string;
  figureId: string;
  figureName: string;
  strategy: string;
  constraints: Record<string, unknown>;
  inventory: {
    existingHistorical: number;
    researchSourceSnippets: number;
    wikipediaFallbackAdded: boolean;
    timelineFallbackAdded: boolean;
    narrativeFallbackAdded: boolean;
    contributionFallbackAdded: boolean;
    droppedTitleMismatch: number;
    rawCandidates: number;
    selectedCandidates: number;
  };
  candidates: HistoricalSnippetCandidate[];
};

type Summary = {
  generatedAt: string;
  strategy: string;
  constraints: Record<string, unknown>;
  figuresProcessed: number;
  figuresWithCandidates: number;
  totalCandidatesWritten: number;
  avgCandidatesPerFigure: number;
  avgSnippetChars: number;
  corpusCounts: Record<string, number>;
  droppedTitleMismatches: number;
  timelineFallbackCount: number;
  narrativeFallbackCount: number;
  contributionFallbackCount: number;
  outputDir: string;
};

const ACTIVE_CURATION_STATUSES = ['auto', 'reviewed', 'approved'] as const;

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const dbPath = get('--db') || path.join(process.cwd(), 'historyrank.db');
  const figureId = get('--figure-id');
  const topRaw = get('--top');
  const top = topRaw ? Number.parseInt(topRaw, 10) : 100;
  const offsetRaw = get('--offset');
  const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 0;
  const outDir =
    get('--out-dir') || path.join(process.cwd(), 'data', 'research-candidates', 'historical-snippets-hybrid');
  const reportPath =
    get('--report') || path.join(outDir, `summary-top-${top}-offset-${offset}.json`);
  const maxPerFigureRaw = get('--max-per-figure');
  const maxPerFigure = maxPerFigureRaw ? Number.parseInt(maxPerFigureRaw, 10) : 8;
  const maxPerCorpusRaw = get('--max-per-corpus');
  const maxPerCorpus = maxPerCorpusRaw ? Number.parseInt(maxPerCorpusRaw, 10) : 3;
  const minWordsRaw = get('--min-words');
  const minWords = minWordsRaw ? Number.parseInt(minWordsRaw, 10) : 70;
  const maxCharsRaw = get('--max-chars');
  const maxChars = maxCharsRaw ? Number.parseInt(maxCharsRaw, 10) : 1800;
  const dryRun = argv.includes('--dry-run');

  if (!Number.isFinite(top) || top < 1 || top > 2000) {
    throw new Error('Invalid --top. Use a number between 1 and 2000.');
  }
  if (!Number.isFinite(offset) || offset < 0 || offset > 10000) {
    throw new Error('Invalid --offset. Use a number between 0 and 10000.');
  }
  if (!Number.isFinite(maxPerFigure) || maxPerFigure < 1 || maxPerFigure > 20) {
    throw new Error('Invalid --max-per-figure. Use a number between 1 and 20.');
  }
  if (!Number.isFinite(maxPerCorpus) || maxPerCorpus < 1 || maxPerCorpus > 10) {
    throw new Error('Invalid --max-per-corpus. Use a number between 1 and 10.');
  }
  if (!Number.isFinite(minWords) || minWords < 20 || minWords > 400) {
    throw new Error('Invalid --min-words. Use a number between 20 and 400.');
  }
  if (!Number.isFinite(maxChars) || maxChars < 240 || maxChars > 6000) {
    throw new Error('Invalid --max-chars. Use a number between 240 and 6000.');
  }

  return {
    dbPath,
    figureId,
    top,
    offset,
    outDir,
    reportPath,
    maxPerFigure,
    maxPerCorpus,
    minWords,
    maxChars,
    dryRun,
  };
}

function normalizeText(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function normalizeKey(input: string): string {
  return normalizeText(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripTrailingParenthetical(input: string): string {
  return input.replace(/\s*\([^)]*\)\s*$/g, '').trim();
}

function reorderCommaName(input: string): string | null {
  const parts = input.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const [last, ...rest] = parts;
  const joined = `${rest.join(' ')} ${last}`.trim();
  return joined.length > 0 ? joined : null;
}

const NAME_STOPWORDS = new Set([
  'the',
  'of',
  'and',
  'de',
  'da',
  'di',
  'van',
  'von',
  'bin',
  'ibn',
  'al',
  'el',
  'la',
  'le',
  'saint',
  'st',
  'sir',
  'king',
  'queen',
  'emperor',
  'pope',
]);

const GEOGRAPHY_DISQUALIFIERS = new Set([
  'island',
  'river',
  'county',
  'province',
  'city',
  'town',
  'mountain',
  'bay',
  'sea',
  'lake',
  'peninsula',
  'strait',
  'state',
  'district',
  'prefecture',
  'archipelago',
  'gulf',
]);

function significantTokens(input: string): string[] {
  return normalizeKey(input)
    .split(' ')
    .filter((token) => token.length >= 3 && !NAME_STOPWORDS.has(token));
}

type FigureNameProfile = {
  keys: Set<string>;
  tokens: Set<string>;
};

function buildFigureNameProfile(canonicalName: string, aliases: string[]): FigureNameProfile {
  const keySet = new Set<string>();
  const tokenSet = new Set<string>();
  const variants = [canonicalName, ...aliases];
  for (const variant of variants) {
    const base = stripTrailingParenthetical(variant);
    const reordered = reorderCommaName(base);
    for (const form of [variant, base, reordered].filter(Boolean) as string[]) {
      const key = normalizeKey(form);
      if (!key) continue;
      keySet.add(key);
      for (const token of significantTokens(form)) {
        tokenSet.add(token);
      }
    }
  }
  return {
    keys: keySet,
    tokens: tokenSet,
  };
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function titleLooksLikeFigure(title: string, profile: FigureNameProfile): boolean {
  const raw = normalizeKey(title);
  if (!raw) return false;

  const parenthetical = title.match(/\(([^)]+)\)/)?.[1] || '';
  const parentheticalTokens = new Set(significantTokens(parenthetical));
  const hasGeoInParenthetical = Array.from(GEOGRAPHY_DISQUALIFIERS).some((token) =>
    parentheticalTokens.has(token)
  );
  if (hasGeoInParenthetical) return false;

  const base = normalizeKey(stripTrailingParenthetical(title));
  const reordered = reorderCommaName(base);
  const candidates = [raw, base, reordered ? normalizeKey(reordered) : null].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (profile.keys.has(candidate)) return true;
    for (const key of profile.keys) {
      if (key.length >= 8 && candidate.includes(key)) return true;
    }
  }

  const titleTokens = new Set<string>();
  for (const token of significantTokens(raw)) {
    titleTokens.add(token);
  }
  const overlap = overlapCount(titleTokens, profile.tokens);

  if (profile.tokens.size >= 2 && overlap >= 2) return true;
  if (profile.tokens.size <= 1 && overlap >= 1) return true;

  if (overlap >= 1) {
    const titleWords = new Set(raw.split(' ').filter(Boolean));
    const hasGeo = Array.from(GEOGRAPHY_DISQUALIFIERS).some((token) => titleWords.has(token));
    if (!hasGeo) return true;
  }

  return false;
}

function wordCount(input: string): number {
  return normalizeText(input).split(' ').filter(Boolean).length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function trimAtBoundary(input: string, maxChars: number): string {
  const clean = normalizeText(input);
  if (clean.length <= maxChars) return clean;
  const clipped = clean.slice(0, maxChars);
  const sentence = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('; '), clipped.lastIndexOf(': '));
  if (sentence >= Math.floor(maxChars * 0.6)) {
    return clipped.slice(0, sentence + 1).trim();
  }
  return `${clipped.trim()}...`;
}

function mapSourceCorpusToSnippetCorpus(sourceCorpus: string): SnippetCorpus {
  if (sourceCorpus === 'wikisource') return 'wikisource';
  if (sourceCorpus === 'project_gutenberg') return 'project_gutenberg';
  if (sourceCorpus === 'internet_archive') return 'internet_archive';
  return 'other';
}

function scoreExistingHistorical(row: HistoricalRow): number {
  const baseByCorpus: Record<string, number> = {
    britannica_1911: 0.88,
    britannica_1902: 0.84,
    wikisource: 0.83,
    project_gutenberg: 0.82,
    internet_archive: 0.8,
    other: 0.74,
  };
  const base = baseByCorpus[row.corpus] ?? 0.72;
  const prior = row.match_score ?? 0.68;
  return round3(clamp01(Math.max(base, prior)));
}

function scoreResearchSource(row: SourceRow): number {
  const roleBase: Record<string, number> = {
    primary: 0.84,
    secondary: 0.78,
    reference: 0.75,
  };
  const corpusBoost: Record<string, number> = {
    sep: 0.08,
    wikisource: 0.06,
    project_gutenberg: 0.05,
    internet_archive: 0.04,
    openalex: 0.02,
    crossref: 0.02,
    openlibrary: 0.01,
  };

  const base = roleBase[row.source_role] ?? 0.74;
  const conf = row.confidence ?? 0.55;
  const bonus = corpusBoost[row.source_corpus] ?? 0;
  return round3(clamp01(base + (conf - 0.5) * 0.28 + bonus));
}

function makeWikipediaUrl(slug: string | null): string | null {
  if (!slug) return null;
  return `https://en.wikipedia.org/wiki/${slug}`;
}

function dedupeCandidates(candidates: HistoricalSnippetCandidate[]): HistoricalSnippetCandidate[] {
  const out: HistoricalSnippetCandidate[] = [];
  const seen = new Set<string>();
  for (const row of candidates) {
    const key = `${row.corpus}::${normalizeKey(row.source_url || '')}::${normalizeKey(row.snippet).slice(0, 180)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function selectDiverseCandidates(
  rows: HistoricalSnippetCandidate[],
  maxPerFigure: number,
  maxPerCorpus: number
): HistoricalSnippetCandidate[] {
  const sorted = [...rows].sort((a, b) => b.match_score - a.match_score || b.snippet.length - a.snippet.length);
  const selected: HistoricalSnippetCandidate[] = [];
  const corpusCounts = new Map<SnippetCorpus, number>();
  const usedUrls = new Set<string>();

  for (const row of sorted) {
    if (selected.length >= maxPerFigure) break;
    const current = corpusCounts.get(row.corpus) || 0;
    if (current >= maxPerCorpus) continue;
    const urlKey = normalizeKey(row.source_url || '');
    if (urlKey && usedUrls.has(urlKey)) continue;
    selected.push(row);
    corpusCounts.set(row.corpus, current + 1);
    if (urlKey) usedUrls.add(urlKey);
  }

  if (selected.length < maxPerFigure) {
    for (const row of sorted) {
      if (selected.length >= maxPerFigure) break;
      const id = `${row.corpus}::${normalizeKey(row.source_url || '')}::${normalizeKey(row.snippet).slice(0, 140)}`;
      const already = selected.some(
        (picked) =>
          `${picked.corpus}::${normalizeKey(picked.source_url || '')}::${normalizeKey(picked.snippet).slice(0, 140)}` ===
          id
      );
      if (already) continue;
      selected.push(row);
    }
  }

  return selected;
}

function buildTimelineSynthesis(events: TimelineEventRow[], maxChars: number): string | null {
  const lines: string[] = [];
  for (const event of events) {
    const label = normalizeText(event.event_label || '');
    const description = normalizeText(event.event_description || '');
    if (!label && !description) continue;
    const yearPart = event.event_start_year !== null ? `${event.event_start_year}: ` : '';
    if (description) {
      lines.push(`${yearPart}${label} - ${description}`.trim());
    } else {
      lines.push(`${yearPart}${label}`.trim());
    }
    if (lines.length >= 4) break;
  }
  if (lines.length === 0) return null;
  return trimAtBoundary(lines.join(' '), maxChars);
}

function buildContributionSynthesis(
  figureName: string,
  rows: RankingContributionRow[],
  maxChars: number
): string | null {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const clean = normalizeText(row.contribution || '')
      .replace(/\s*\.+\s*$/g, '')
      .trim();
    if (!clean) continue;
    const key = normalizeKey(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(clean);
    if (unique.length >= 8) break;
  }
  if (unique.length === 0) return null;
  const sourceCount = new Set(rows.map((row) => row.source)).size;
  const intro = `${figureName} is consistently described across ${sourceCount} model source lists as influential for: `;
  const body = `${unique.map((item) => `${item}`).join('; ')}.`;
  return trimAtBoundary(`${intro}${body}`, maxChars);
}

function loadTargets(db: Database.Database, args: CliArgs): FigureRow[] {
  if (args.figureId) {
    const row = db
      .prepare(
        `
        SELECT id, canonical_name, llm_consensus_rank, wikipedia_slug, wikipedia_extract
        FROM figures
        WHERE id = ?
        LIMIT 1
        `
      )
      .get(args.figureId) as FigureRow | undefined;
    if (!row) throw new Error(`Figure not found: ${args.figureId}`);
    return [row];
  }

  return db
    .prepare(
      `
      SELECT id, canonical_name, llm_consensus_rank, wikipedia_slug, wikipedia_extract
      FROM figures
      WHERE llm_consensus_rank IS NOT NULL
      ORDER BY llm_consensus_rank ASC
      LIMIT ? OFFSET ?
      `
    )
    .all(args.top, args.offset) as FigureRow[];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new Database(args.dbPath, { readonly: true });

  try {
    const targets = loadTargets(db, args);
    if (targets.length === 0) {
      throw new Error('No figures found for selected window.');
    }
    const targetIds = targets.map((row) => row.id);

    const aliasesByFigure = new Map<string, string[]>();
    if (targetIds.length > 0) {
      const placeholders = targetIds.map(() => '?').join(',');
      const aliasRows = db
        .prepare(
          `
          SELECT figure_id, alias
          FROM name_aliases
          WHERE figure_id IN (${placeholders})
          `
        )
        .all(...targetIds) as AliasRow[];
      for (const row of aliasRows) {
        const bucket = aliasesByFigure.get(row.figure_id) || [];
        bucket.push(row.alias);
        aliasesByFigure.set(row.figure_id, bucket);
      }
    }

    const snippetStmt = db.prepare(
      `
      SELECT corpus, edition_year, source_title, source_url, snippet, match_score
      FROM figure_historical_snippets
      WHERE figure_id = ?
        AND curation_status IN (${ACTIVE_CURATION_STATUSES.map(() => '?').join(',')})
      `
    );

    const sourceStmt = db.prepare(
      `
      SELECT source_role, source_corpus, title, publication_year, source_url, access_url, snippet, confidence
      FROM figure_research_sources
      WHERE figure_id = ?
        AND curation_status IN (${ACTIVE_CURATION_STATUSES.map(() => '?').join(',')})
      `
    );

    const timelineEventStmt = db.prepare(
      `
      SELECT event_label, event_description, event_start_year, sort_index
      FROM figure_timeline_events
      WHERE figure_id = ?
      ORDER BY sort_index ASC, event_start_year ASC, id ASC
      LIMIT 12
      `
    );

    const assessmentStmt = db.prepare(
      `
      SELECT assessment_text
      FROM figure_assessments
      WHERE figure_id = ?
        AND assessment_kind = 'timeline_events'
        AND status IN ('published', 'draft')
      ORDER BY CASE status WHEN 'published' THEN 0 ELSE 1 END ASC, generated_at DESC, id DESC
      LIMIT 1
      `
    );

    const rankingContributionStmt = db.prepare(
      `
      SELECT source, rank, contribution
      FROM rankings
      WHERE figure_id = ?
        AND contribution IS NOT NULL
        AND length(trim(contribution)) > 0
      ORDER BY rank ASC, source ASC
      LIMIT 120
      `
    );

    if (!args.dryRun) {
      await mkdir(args.outDir, { recursive: true });
    }

    const corpusCounts = new Map<string, number>();
    let figuresWithCandidates = 0;
    let totalCandidatesWritten = 0;
    let totalChars = 0;
    let totalDroppedTitleMismatches = 0;
    let totalTimelineFallbacks = 0;
    let totalNarrativeFallbacks = 0;
    let totalContributionFallbacks = 0;

    for (const figure of targets) {
      const rawCandidates: HistoricalSnippetCandidate[] = [];
      const nameProfile = buildFigureNameProfile(
        figure.canonical_name,
        aliasesByFigure.get(figure.id) || []
      );
      let droppedTitleMismatch = 0;
      let timelineFallbackAdded = false;
      let narrativeFallbackAdded = false;
      let contributionFallbackAdded = false;

      const existingRows = snippetStmt.all(figure.id, ...ACTIVE_CURATION_STATUSES) as HistoricalRow[];
      for (const row of existingRows) {
        const snippet = trimAtBoundary(row.snippet || '', args.maxChars);
        if (wordCount(snippet) < args.minWords) continue;
        if (
          (row.corpus === 'britannica_1911' || row.corpus === 'britannica_1902') &&
          row.source_title &&
          !titleLooksLikeFigure(row.source_title, nameProfile)
        ) {
          droppedTitleMismatch += 1;
          continue;
        }
        const corpus = ([
          'britannica_1911',
          'britannica_1902',
          'wikisource',
          'project_gutenberg',
          'internet_archive',
          'other',
        ] as const).includes(row.corpus as SnippetCorpus)
          ? (row.corpus as SnippetCorpus)
          : 'other';
        rawCandidates.push({
          corpus,
          edition_year: row.edition_year,
          source_title: row.source_title,
          source_url: row.source_url,
          snippet,
          match_score: scoreExistingHistorical(row),
          why: `Existing ${row.corpus} snippet preserved and rescored for hybrid coverage.`,
        });
      }

      const sourceRows = sourceStmt.all(figure.id, ...ACTIVE_CURATION_STATUSES) as SourceRow[];
      for (const row of sourceRows) {
        if (!row.snippet) continue;
        const snippet = trimAtBoundary(row.snippet, args.maxChars);
        if (wordCount(snippet) < args.minWords) continue;
        rawCandidates.push({
          corpus: mapSourceCorpusToSnippetCorpus(row.source_corpus),
          edition_year: row.publication_year,
          source_title: row.title,
          source_url: row.source_url || row.access_url,
          snippet,
          match_score: scoreResearchSource(row),
          why: `Research source snippet (${row.source_corpus}, ${row.source_role}) promoted to historical snippet.`,
        });
      }

      let wikipediaFallbackAdded = false;
      const wikiExtract = trimAtBoundary(figure.wikipedia_extract || '', args.maxChars);
      if (wikiExtract && wordCount(wikiExtract) >= args.minWords) {
        rawCandidates.push({
          corpus: 'other',
          edition_year: null,
          source_title: `${figure.canonical_name} (Wikipedia lead)`,
          source_url: makeWikipediaUrl(figure.wikipedia_slug),
          snippet: wikiExtract,
          match_score: 0.64,
          why: 'Wikipedia lead fallback to improve baseline coverage for under-documented figures.',
        });
        wikipediaFallbackAdded = true;
      }

      // Fallback: source-backed timeline synthesis to avoid sparse coverage.
      if (rawCandidates.length === 0) {
        const timelineRows = timelineEventStmt.all(figure.id) as TimelineEventRow[];
        const timelineSnippet = buildTimelineSynthesis(timelineRows, args.maxChars);
        if (timelineSnippet && wordCount(timelineSnippet) >= args.minWords) {
          rawCandidates.push({
            corpus: 'other',
            edition_year: null,
            source_title: 'Timeline synthesis (evidence-backed events)',
            source_url: null,
            snippet: timelineSnippet,
            match_score: 0.58,
            why: 'Fallback synthesis from timeline events when source excerpts are unavailable.',
          });
          timelineFallbackAdded = true;
        }

        if (rawCandidates.length === 0) {
          const assessment = assessmentStmt.get(figure.id) as AssessmentRow | undefined;
          const assessmentText = trimAtBoundary(assessment?.assessment_text || '', args.maxChars);
          if (assessmentText && wordCount(assessmentText) >= args.minWords) {
            rawCandidates.push({
              corpus: 'other',
              edition_year: null,
              source_title: 'Timeline narrative overview',
              source_url: null,
              snippet: assessmentText,
              match_score: 0.54,
              why: 'Last-resort fallback from timeline narrative to provide baseline contextual coverage.',
            });
            narrativeFallbackAdded = true;
          }
        }

        if (rawCandidates.length === 0) {
          const contributionRows = rankingContributionStmt.all(figure.id) as RankingContributionRow[];
          const contributionSnippet = buildContributionSynthesis(
            figure.canonical_name,
            contributionRows,
            args.maxChars
          );
          if (contributionSnippet && wordCount(contributionSnippet) >= args.minWords) {
            rawCandidates.push({
              corpus: 'other',
              edition_year: null,
              source_title: 'LLM contribution synthesis (fallback)',
              source_url: null,
              snippet: contributionSnippet,
              match_score: 0.5,
              why: 'Fallback synthesis from model contribution descriptors when no source excerpts exist.',
            });
            contributionFallbackAdded = true;
          }
        }
      }

      const deduped = dedupeCandidates(rawCandidates);
      const selected = selectDiverseCandidates(deduped, args.maxPerFigure, args.maxPerCorpus);

      if (selected.length > 0) {
        figuresWithCandidates += 1;
      }

      for (const row of selected) {
        corpusCounts.set(row.corpus, (corpusCounts.get(row.corpus) || 0) + 1);
        totalChars += row.snippet.length;
      }
      totalCandidatesWritten += selected.length;
      totalDroppedTitleMismatches += droppedTitleMismatch;
      if (timelineFallbackAdded) totalTimelineFallbacks += 1;
      if (narrativeFallbackAdded) totalNarrativeFallbacks += 1;
      if (contributionFallbackAdded) totalContributionFallbacks += 1;

      const payload: CandidateFile = {
        generatedAt: new Date().toISOString(),
        figureId: figure.id,
        figureName: figure.canonical_name,
        strategy: 'hybrid_historical_snippets_v1',
        constraints: {
          minWords: args.minWords,
          maxChars: args.maxChars,
          maxPerFigure: args.maxPerFigure,
          maxPerCorpus: args.maxPerCorpus,
        },
        inventory: {
          existingHistorical: existingRows.length,
          researchSourceSnippets: sourceRows.filter((row) => Boolean(row.snippet)).length,
          wikipediaFallbackAdded,
          timelineFallbackAdded,
          narrativeFallbackAdded,
          contributionFallbackAdded,
          droppedTitleMismatch,
          rawCandidates: deduped.length,
          selectedCandidates: selected.length,
        },
        candidates: selected,
      };

      if (args.dryRun) continue;

      const filePath = path.join(args.outDir, `${figure.id}.historical-snippets.json`);
      await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    }

    const summary: Summary = {
      generatedAt: new Date().toISOString(),
      strategy: 'hybrid_historical_snippets_v1',
      constraints: {
        top: args.top,
        offset: args.offset,
        figureId: args.figureId,
        minWords: args.minWords,
        maxChars: args.maxChars,
        maxPerFigure: args.maxPerFigure,
        maxPerCorpus: args.maxPerCorpus,
      },
      figuresProcessed: targets.length,
      figuresWithCandidates,
      totalCandidatesWritten,
      avgCandidatesPerFigure:
        targets.length > 0 ? Number((totalCandidatesWritten / targets.length).toFixed(2)) : 0,
      avgSnippetChars:
        totalCandidatesWritten > 0 ? Number((totalChars / totalCandidatesWritten).toFixed(1)) : 0,
      corpusCounts: Object.fromEntries(
        Array.from(corpusCounts.entries()).sort((a, b) => b[1] - a[1])
      ),
      droppedTitleMismatches: totalDroppedTitleMismatches,
      timelineFallbackCount: totalTimelineFallbacks,
      narrativeFallbackCount: totalNarrativeFallbacks,
      contributionFallbackCount: totalContributionFallbacks,
      outputDir: args.outDir,
    };

    if (args.dryRun) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    await mkdir(path.dirname(args.reportPath), { recursive: true });
    await writeFile(args.reportPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

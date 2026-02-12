import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

type EdgeDirection = 'directed' | 'undirected';
type RelationType = 'influenced' | 'mentored' | 'rival' | 'associated';
type EvidenceKind = 'timeline_ref' | 'source_excerpt' | 'snippet_match' | 'llm_seed';
type EvidenceFamily =
  | 'timeline'
  | 'primary_text'
  | 'scholarship'
  | 'reference'
  | 'historical_snippet'
  | 'llm_seed';

type CliArgs = {
  dbPath: string;
  top: number;
  offset: number;
  minEvidenceItems: number;
  minSourceFamilies: number;
  approvedThreshold: number;
  dagAugment: boolean;
  chronoMinGap: number;
  chronoWeight: number;
  chronoMinConfidence: number;
  reportPath: string;
  publish: boolean;
  replaceExisting: boolean;
};

type FigureRow = {
  id: string;
  canonical_name: string;
  birth_year: number | null;
  death_year: number | null;
  related_figures: string | null;
};

type AliasRow = {
  figure_id: string;
  alias: string;
};

type AssessmentRow = {
  id: number;
  figure_id: string;
  status: 'draft' | 'published';
  generated_at: number | null;
};

type TimelineEventRow = {
  id: number;
  figure_id: string;
  event_label: string;
  event_description: string | null;
  metadata: string | null;
};

type ResearchSourceRow = {
  id: number;
  figure_id: string;
  source_corpus: string;
  title: string;
  snippet: string | null;
  metadata: string | null;
  source_url: string;
};

type HistoricalSnippetRow = {
  id: number;
  figure_id: string;
  corpus: string;
  source_title: string | null;
  snippet: string;
  source_url: string | null;
};

type RelatedFigureSeed = {
  id: string;
  name?: string;
  relationship?: string;
};

type EvidenceDraft = {
  kind: EvidenceKind;
  family: EvidenceFamily;
  sourceTable: 'figure_timeline_events' | 'figure_research_sources' | 'figure_historical_snippets' | 'figures';
  sourceRowId: number | null;
  excerpt: string;
  weight: number;
  metadata: Record<string, unknown>;
};

type EdgeDraft = {
  fromId: string;
  toId: string;
  direction: EdgeDirection;
  relationType: RelationType;
  evidence: EvidenceDraft[];
};

type FinalEdge = {
  fromId: string;
  toId: string;
  direction: EdgeDirection;
  relationType: RelationType;
  evidenceScore: number;
  confidence: number;
  supportCount: number;
  sourceFamilyCount: number;
  status: 'candidate' | 'approved';
  evidence: EvidenceDraft[];
};

type PublishResult = {
  insertedEdges: number;
  updatedEdges: number;
  evidenceRows: number;
  replacedRows: number;
};

const TIMELINE_WEIGHT_BY_STYLE = {
  directed: 0.5,
  rival: 0.4,
  mention: 0.3,
} as const;

const SOURCE_FAMILY_WEIGHT: Record<EvidenceFamily, number> = {
  timeline: 0.3,
  primary_text: 0.3,
  scholarship: 0.35,
  reference: 0.25,
  historical_snippet: 0.22,
  llm_seed: 0.1,
};

const RELATED_DIRECTIONAL_PATTERNS = {
  targetToSource: [
    'teacher',
    'mentor',
    'mentored by',
    'influenced by',
    'student of',
    'disciple of',
    'predecessor',
    'inspiration',
  ],
  sourceToTarget: [
    'student',
    'disciple',
    'protege',
    'protégé',
    'successor',
    'mentor to',
    'teacher of',
  ],
  rival: [
    'rival',
    'opponent',
    'adversary',
    'enemy',
    'conflict',
  ],
} as const;

const EVIDENCE_KIND_CAPS: Record<EvidenceKind, number> = {
  timeline_ref: 3,
  source_excerpt: 2,
  snippet_match: 2,
  llm_seed: 1,
};

const COMMON_SINGLE_NAME_BLOCKLIST = new Set([
  'john',
  'james',
  'henry',
  'william',
  'charles',
  'thomas',
  'mary',
  'joseph',
  'george',
  'edward',
  'robert',
  'david',
  'richard',
  'michael',
  'paul',
  'francis',
  'alexander',
  'peter',
  'leo',
  'benjamin',
  'samuel',
  'anthony',
  'mark',
  'louis',
  'philip',
  'nicholas',
  'anne',
  'elizabeth',
  'catherine',
  'moses',
]);

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const dbPath = get('--db') || path.join(process.cwd(), 'historyrank.db');
  const topRaw = get('--top');
  const top = topRaw ? Number.parseInt(topRaw, 10) : 200;
  const offsetRaw = get('--offset');
  const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : 0;
  const minEvidenceRaw = get('--min-evidence');
  const minEvidenceItems = minEvidenceRaw ? Number.parseInt(minEvidenceRaw, 10) : 2;
  const minFamiliesRaw = get('--min-families');
  const minSourceFamilies = minFamiliesRaw ? Number.parseInt(minFamiliesRaw, 10) : 2;
  const approvedThresholdRaw = get('--approved-threshold');
  const approvedThreshold = approvedThresholdRaw ? Number.parseFloat(approvedThresholdRaw) : 0.62;
  const dagAugment = !argv.includes('--no-dag-augment');
  const chronoMinGapRaw = get('--chrono-min-gap');
  const chronoMinGap = chronoMinGapRaw ? Number.parseInt(chronoMinGapRaw, 10) : 25;
  const chronoWeightRaw = get('--chrono-weight');
  const chronoWeight = chronoWeightRaw ? Number.parseFloat(chronoWeightRaw) : 0.22;
  const chronoMinConfidenceRaw = get('--chrono-min-confidence');
  const chronoMinConfidence = chronoMinConfidenceRaw ? Number.parseFloat(chronoMinConfidenceRaw) : 0.56;
  const reportPath =
    get('--report') ||
    path.join(process.cwd(), 'data', 'research-candidates', `influence-edges-top-${top}-offset-${offset}.json`);
  const publish = argv.includes('--publish');
  const replaceExisting = !argv.includes('--append');

  if (!Number.isFinite(top) || top < 1 || top > 5000) {
    throw new Error('Invalid --top. Use a number between 1 and 5000.');
  }
  if (!Number.isFinite(offset) || offset < 0 || offset > 20000) {
    throw new Error('Invalid --offset. Use a non-negative integer.');
  }
  if (!Number.isFinite(minEvidenceItems) || minEvidenceItems < 1 || minEvidenceItems > 10) {
    throw new Error('Invalid --min-evidence. Use a number between 1 and 10.');
  }
  if (!Number.isFinite(minSourceFamilies) || minSourceFamilies < 1 || minSourceFamilies > 6) {
    throw new Error('Invalid --min-families. Use a number between 1 and 6.');
  }
  if (!Number.isFinite(approvedThreshold) || approvedThreshold <= 0 || approvedThreshold > 1) {
    throw new Error('Invalid --approved-threshold. Use a number >0 and <=1.');
  }
  if (!Number.isFinite(chronoMinGap) || chronoMinGap < 0 || chronoMinGap > 300) {
    throw new Error('Invalid --chrono-min-gap. Use a number between 0 and 300.');
  }
  if (!Number.isFinite(chronoWeight) || chronoWeight < 0 || chronoWeight > 1) {
    throw new Error('Invalid --chrono-weight. Use a number between 0 and 1.');
  }
  if (!Number.isFinite(chronoMinConfidence) || chronoMinConfidence < 0 || chronoMinConfidence > 1) {
    throw new Error('Invalid --chrono-min-confidence. Use a number between 0 and 1.');
  }

  return {
    dbPath,
    top,
    offset,
    minEvidenceItems,
    minSourceFamilies,
    approvedThreshold,
    dagAugment,
    chronoMinGap,
    chronoWeight,
    chronoMinConfidence,
    reportPath,
    publish,
    replaceExisting,
  };
}

function normalizeText(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function wordCount(input: string): number {
  return input.split(/\s+/).filter(Boolean).length;
}

function truncate(input: string, max = 220): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max).trim()}...`;
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function parseJsonSafe<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function inferSeedRelationshipEdge(
  sourceFigureId: string,
  targetFigureId: string,
  relationshipRaw: string
): {
  fromId: string;
  toId: string;
  direction: EdgeDirection;
  relationType: RelationType;
  weight: number;
  cue: string;
} {
  const relationship = normalizeText(relationshipRaw);

  if (RELATED_DIRECTIONAL_PATTERNS.rival.some((token) => relationship.includes(token))) {
    return {
      fromId: sourceFigureId,
      toId: targetFigureId,
      direction: 'undirected',
      relationType: 'rival',
      weight: 0.18,
      cue: 'seed-rival',
    };
  }

  if (RELATED_DIRECTIONAL_PATTERNS.targetToSource.some((token) => relationship.includes(token))) {
    const relationType: RelationType =
      relationship.includes('teacher') || relationship.includes('mentor') ? 'mentored' : 'influenced';
    return {
      fromId: targetFigureId,
      toId: sourceFigureId,
      direction: 'directed',
      relationType,
      weight: 0.26,
      cue: 'seed-target-to-source',
    };
  }

  if (RELATED_DIRECTIONAL_PATTERNS.sourceToTarget.some((token) => relationship.includes(token))) {
    return {
      fromId: sourceFigureId,
      toId: targetFigureId,
      direction: 'directed',
      relationType: 'mentored',
      weight: 0.24,
      cue: 'seed-source-to-target',
    };
  }

  return {
    fromId: sourceFigureId,
    toId: targetFigureId,
    direction: 'undirected',
    relationType: 'associated',
    weight: SOURCE_FAMILY_WEIGHT.llm_seed,
    cue: 'seed-associated',
  };
}

function canonicalUndirected(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a];
}

function edgeKey(fromId: string, toId: string, direction: EdgeDirection, relationType: RelationType): string {
  if (direction === 'undirected') {
    const [left, right] = canonicalUndirected(fromId, toId);
    return `${direction}|${relationType}|${left}|${right}`;
  }
  return `${direction}|${relationType}|${fromId}|${toId}`;
}

function addEdgeEvidence(
  edges: Map<string, EdgeDraft>,
  edge: { fromId: string; toId: string; direction: EdgeDirection; relationType: RelationType },
  evidence: EvidenceDraft
) {
  if (edge.fromId === edge.toId) return;

  const fromId =
    edge.direction === 'undirected' ? canonicalUndirected(edge.fromId, edge.toId)[0] : edge.fromId;
  const toId =
    edge.direction === 'undirected' ? canonicalUndirected(edge.fromId, edge.toId)[1] : edge.toId;
  const key = edgeKey(fromId, toId, edge.direction, edge.relationType);
  const existing = edges.get(key);
  if (!existing) {
    edges.set(key, {
      fromId,
      toId,
      direction: edge.direction,
      relationType: edge.relationType,
      evidence: [evidence],
    });
    return;
  }
  existing.evidence.push(evidence);
}

function buildMentionKeys(
  figures: FigureRow[],
  aliasRows: AliasRow[]
): {
  keyToFigureId: Map<string, string>;
  primaryMentionKeyByFigure: Map<string, string>;
  contextStringsByFigure: Map<string, Set<string>>;
  keyTokenCount: Map<string, number>;
} {
  const aliasesByFigure = new Map<string, string[]>();
  for (const row of aliasRows) {
    const bucket = aliasesByFigure.get(row.figure_id) || [];
    bucket.push(row.alias);
    aliasesByFigure.set(row.figure_id, bucket);
  }

  const rawKeysByFigure = new Map<string, Set<string>>();
  const tokenOwners = new Map<string, Set<string>>();
  const contextStringsByFigure = new Map<string, Set<string>>();
  for (const figure of figures) {
    const keySet = new Set<string>();
    const contextSet = new Set<string>();
    const canonicalNorm = normalizeText(figure.canonical_name);
    if (canonicalNorm) {
      keySet.add(canonicalNorm);
      contextSet.add(canonicalNorm);
    }

    const aliases = aliasesByFigure.get(figure.id) || [];
    for (const alias of aliases) {
      const normalized = normalizeText(alias);
      if (!normalized) continue;
      contextSet.add(normalized);
      const words = wordCount(normalized);
      if (words >= 2 && normalized.length >= 6) {
        keySet.add(normalized);
      }
    }

    for (const phrase of contextSet) {
      for (const token of phrase.split(' ').filter(Boolean)) {
        const owners = tokenOwners.get(token) || new Set<string>();
        owners.add(figure.id);
        tokenOwners.set(token, owners);
      }
    }
    contextStringsByFigure.set(figure.id, contextSet);
    const filtered = new Set<string>();
    for (const key of keySet) {
      const words = wordCount(key);
      if (words >= 2) {
        filtered.add(key);
        continue;
      }
      const tokenOwnerCount = tokenOwners.get(key)?.size || 0;
      if (
        key.length >= 5 &&
        !COMMON_SINGLE_NAME_BLOCKLIST.has(key) &&
        tokenOwnerCount === 1
      ) {
        filtered.add(key);
      }
    }
    rawKeysByFigure.set(figure.id, filtered);
  }

  const keyOwners = new Map<string, Set<string>>();
  for (const [figureId, keys] of rawKeysByFigure.entries()) {
    for (const key of keys) {
      const owners = keyOwners.get(key) || new Set<string>();
      owners.add(figureId);
      keyOwners.set(key, owners);
    }
  }

  const keyToFigureId = new Map<string, string>();
  const keyTokenCount = new Map<string, number>();
  for (const [key, owners] of keyOwners.entries()) {
    if (owners.size !== 1) continue;
    const [figureId] = Array.from(owners.values());
    keyToFigureId.set(key, figureId);
    keyTokenCount.set(key, wordCount(key));
  }

  const primaryMentionKeyByFigure = new Map<string, string>();
  for (const figure of figures) {
    const canonicalNorm = normalizeText(figure.canonical_name);
    if (canonicalNorm && keyToFigureId.get(canonicalNorm) === figure.id) {
      primaryMentionKeyByFigure.set(figure.id, canonicalNorm);
      continue;
    }
    const keys = Array.from(rawKeysByFigure.get(figure.id) || []);
    const picked = keys.find((key) => keyToFigureId.get(key) === figure.id);
    if (picked) {
      primaryMentionKeyByFigure.set(figure.id, picked);
    }
  }

  return { keyToFigureId, primaryMentionKeyByFigure, contextStringsByFigure, keyTokenCount };
}

function findMentionedFigureIds(
  text: string,
  keyToFigureId: Map<string, string>,
  excludeFigureId: string,
  contextStringsByFigure: Map<string, Set<string>>,
  options: {
    requireMultiTokenNames?: boolean;
    maxMatches?: number;
    keyTokenCount?: Map<string, number>;
  } = {}
): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const hay = ` ${normalized} `;
  const sourceContextHay = ` ${Array.from(contextStringsByFigure.get(excludeFigureId) || []).join(' ')} `;
  const hits: Array<{ figureId: string; keyLength: number; position: number }> = [];

  for (const [key, figureId] of keyToFigureId.entries()) {
    if (figureId === excludeFigureId) continue;
    if (options.requireMultiTokenNames && (options.keyTokenCount?.get(key) || 1) < 2) continue;
    if (sourceContextHay.includes(` ${key} `)) continue;
    const position = hay.indexOf(` ${key} `);
    if (position >= 0) {
      hits.push({ figureId, keyLength: key.length, position });
    }
  }

  hits.sort((a, b) => {
    if (b.keyLength !== a.keyLength) return b.keyLength - a.keyLength;
    return a.position - b.position;
  });

  const seen = new Set<string>();
  const results: string[] = [];
  for (const hit of hits) {
    if (seen.has(hit.figureId)) continue;
    seen.add(hit.figureId);
    results.push(hit.figureId);
    if (options.maxMatches && results.length >= options.maxMatches) break;
  }

  return results;
}

function hasInfluenceCue(text: string): boolean {
  const hay = ` ${normalizeText(text)} `;
  const cues = [
    'influenced',
    'influence on',
    'influence of',
    'influence',
    'influential',
    'inspired',
    'legacy',
    'impact on',
    'mentor',
    'mentored',
    'student of',
    'teacher of',
    'disciple of',
    'followed by',
    'successor to',
    'predecessor to',
    'built on',
    'borrowed from',
    'adapted from',
    'derived from',
    'response to',
    'critic of',
    'critique of',
    'opposed',
    'against',
    'rival',
    'debate with',
    'reacting to',
  ];
  return cues.some((cue) => hay.includes(` ${cue} `));
}

function inferTimelineEdge(
  sourceFigureId: string,
  targetFigureId: string,
  targetMentionKey: string | undefined,
  text: string
): { fromId: string; toId: string; direction: EdgeDirection; relationType: RelationType; weight: number; cue: string } {
  const hay = ` ${normalizeText(text)} `;
  if (!targetMentionKey) {
    return {
      fromId: sourceFigureId,
      toId: targetFigureId,
      direction: 'undirected',
      relationType: 'associated',
      weight: TIMELINE_WEIGHT_BY_STYLE.mention,
      cue: 'mention',
    };
  }

  const target = targetMentionKey;

  const receivedInfluencePatterns = [
    ` influenced by ${target} `,
    ` mentored by ${target} `,
    ` student of ${target} `,
    ` disciple of ${target} `,
    ` trained by ${target} `,
    ` under ${target} `,
  ];
  if (receivedInfluencePatterns.some((pattern) => hay.includes(pattern))) {
    const relationType = hay.includes(` mentored by ${target} `) ? 'mentored' : 'influenced';
    return {
      fromId: targetFigureId,
      toId: sourceFigureId,
      direction: 'directed',
      relationType,
      weight: TIMELINE_WEIGHT_BY_STYLE.directed,
      cue: 'received',
    };
  }

  const exertedInfluencePatterns = [
    ` influenced ${target} `,
    ` mentored ${target} `,
    ` mentor to ${target} `,
    ` teacher of ${target} `,
    ` taught ${target} `,
  ];
  if (exertedInfluencePatterns.some((pattern) => hay.includes(pattern))) {
    const relationType = hay.includes(` mentored ${target} `) || hay.includes(` mentor to ${target} `) ? 'mentored' : 'influenced';
    return {
      fromId: sourceFigureId,
      toId: targetFigureId,
      direction: 'directed',
      relationType,
      weight: TIMELINE_WEIGHT_BY_STYLE.directed,
      cue: 'exerted',
    };
  }

  const rivalryPatterns = [
    ` rivalry with ${target} `,
    ` rival of ${target} `,
    ` conflict with ${target} `,
    ` war with ${target} `,
    ` debate with ${target} `,
  ];
  if (rivalryPatterns.some((pattern) => hay.includes(pattern))) {
    return {
      fromId: sourceFigureId,
      toId: targetFigureId,
      direction: 'undirected',
      relationType: 'rival',
      weight: TIMELINE_WEIGHT_BY_STYLE.rival,
      cue: 'rival',
    };
  }

  return {
    fromId: sourceFigureId,
    toId: targetFigureId,
    direction: 'undirected',
    relationType: 'associated',
    weight: TIMELINE_WEIGHT_BY_STYLE.mention,
    cue: 'mention',
  };
}

function classifySourceFamily(source: ResearchSourceRow): { family: EvidenceFamily; weight: number; provider: string | null } {
  const metadata = parseJsonSafe<Record<string, unknown>>(source.metadata, {});
  const providerRaw = metadata.provider;
  const provider = typeof providerRaw === 'string' ? providerRaw.toLowerCase() : null;

  if (
    source.source_corpus === 'wikisource' ||
    source.source_corpus === 'project_gutenberg' ||
    source.source_corpus === 'internet_archive'
  ) {
    return { family: 'primary_text', weight: SOURCE_FAMILY_WEIGHT.primary_text, provider };
  }

  if (provider === 'openalex' || provider === 'crossref') {
    return { family: 'scholarship', weight: SOURCE_FAMILY_WEIGHT.scholarship, provider };
  }

  if (provider === 'sep') {
    return { family: 'reference', weight: 0.28, provider };
  }

  return { family: 'reference', weight: SOURCE_FAMILY_WEIGHT.reference, provider };
}

function evidenceDedupKey(evidence: EvidenceDraft): string {
  return [
    evidence.kind,
    evidence.sourceTable,
    evidence.sourceRowId ?? '',
    evidence.excerpt,
  ].join('|');
}

function scoreEdge(
  edge: EdgeDraft,
  minEvidenceItems: number,
  minSourceFamilies: number,
  approvedThreshold: number
): FinalEdge | null {
  const dedupedByKey = new Map<string, EvidenceDraft>();
  for (const item of edge.evidence) {
    const key = evidenceDedupKey(item);
    const existing = dedupedByKey.get(key);
    if (!existing || item.weight > existing.weight) {
      dedupedByKey.set(key, item);
    }
  }

  const byKind = new Map<EvidenceKind, EvidenceDraft[]>();
  for (const item of dedupedByKey.values()) {
    const bucket = byKind.get(item.kind) || [];
    bucket.push(item);
    byKind.set(item.kind, bucket);
  }
  for (const bucket of byKind.values()) {
    bucket.sort((a, b) => b.weight - a.weight);
  }

  const selected: EvidenceDraft[] = [];
  const orderedKinds: EvidenceKind[] = ['timeline_ref', 'source_excerpt', 'snippet_match', 'llm_seed'];
  for (const kind of orderedKinds) {
    const bucket = byKind.get(kind) || [];
    selected.push(...bucket.slice(0, EVIDENCE_KIND_CAPS[kind]));
  }

  const supportCount = selected.length;
  const sourceFamilyCount = new Set(selected.map((item) => item.family)).size;
  const hasNonSeed = selected.some((item) => item.kind !== 'llm_seed');
  if (supportCount < minEvidenceItems || sourceFamilyCount < minSourceFamilies || !hasNonSeed) {
    return null;
  }

  const totalWeight = selected.reduce((acc, item) => acc + item.weight, 0);
  const evidenceScore = round3(1 - Math.exp(-1.15 * totalWeight));
  const familyBonus = Math.min(0.14, 0.035 * Math.max(0, sourceFamilyCount - 1));
  const supportBonus = Math.min(0.12, 0.025 * Math.min(5, Math.max(0, supportCount - 1)));
  const confidence = round3(Math.min(1, evidenceScore + familyBonus + supportBonus));
  const status: 'candidate' | 'approved' = confidence >= approvedThreshold ? 'approved' : 'candidate';

  return {
    fromId: edge.fromId,
    toId: edge.toId,
    direction: edge.direction,
    relationType: edge.relationType,
    evidenceScore,
    confidence,
    supportCount,
    sourceFamilyCount,
    status,
    evidence: selected,
  };
}

function orientByChronology(
  leftId: string,
  rightId: string,
  figureYearById: Map<string, { birthYear: number | null; deathYear: number | null }>,
  minGap: number
): { fromId: string; toId: string; gapYears: number } | null {
  const left = figureYearById.get(leftId);
  const right = figureYearById.get(rightId);
  if (!left || !right) return null;

  if (left.birthYear !== null && right.birthYear !== null) {
    const gap = Math.abs(right.birthYear - left.birthYear);
    if (gap < minGap) return null;
    return left.birthYear < right.birthYear
      ? { fromId: leftId, toId: rightId, gapYears: gap }
      : { fromId: rightId, toId: leftId, gapYears: gap };
  }

  // Fallback: if one dies well before the other is born, orient by death->birth ordering.
  if (left.deathYear !== null && right.birthYear !== null && right.birthYear - left.deathYear >= minGap) {
    return { fromId: leftId, toId: rightId, gapYears: right.birthYear - left.deathYear };
  }
  if (right.deathYear !== null && left.birthYear !== null && left.birthYear - right.deathYear >= minGap) {
    return { fromId: rightId, toId: leftId, gapYears: left.birthYear - right.deathYear };
  }

  return null;
}

function ensureInfluenceTablesExist(db: Database.Database) {
  const tableNames = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('influence_edges', 'influence_edge_evidence')`
    )
    .all() as Array<{ name: string }>;
  const found = new Set(tableNames.map((row) => row.name));
  if (!found.has('influence_edges') || !found.has('influence_edge_evidence')) {
    throw new Error(
      'Missing influence tables. Run: npm run research:migrate -- --migration=scripts/migrations/20260211_influence_edges.sql'
    );
  }
}

function publishEdges(
  db: Database.Database,
  finalEdges: FinalEdge[],
  args: CliArgs,
  targetFigureIds: string[]
): PublishResult {
  ensureInfluenceTablesExist(db);

  const now = Math.floor(Date.now() / 1000);
  let replacedRows = 0;
  let insertedEdges = 0;
  let updatedEdges = 0;
  let evidenceRows = 0;

  const placeholders = targetFigureIds.map(() => '?').join(',');

  const findEdgeStmt = db.prepare(
    `
    SELECT id
    FROM influence_edges
    WHERE from_figure_id = ?
      AND to_figure_id = ?
      AND direction = ?
      AND relation_type = ?
    LIMIT 1
    `
  );
  const insertEdgeStmt = db.prepare(
    `
    INSERT INTO influence_edges (
      from_figure_id, to_figure_id, direction, relation_type, confidence, evidence_score,
      support_count, source_family_count, status, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  );
  const updateEdgeStmt = db.prepare(
    `
    UPDATE influence_edges
    SET confidence = ?,
        evidence_score = ?,
        support_count = ?,
        source_family_count = ?,
        status = ?,
        metadata = ?,
        updated_at = ?
    WHERE id = ?
    `
  );
  const deleteEvidenceForEdgeStmt = db.prepare(`DELETE FROM influence_edge_evidence WHERE edge_id = ?`);
  const insertEvidenceStmt = db.prepare(
    `
    INSERT INTO influence_edge_evidence (
      edge_id, evidence_kind, source_table, source_row_id, excerpt, weight, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  );

  const tx = db.transaction(() => {
    if (args.replaceExisting && targetFigureIds.length > 0) {
      const deleteSql = `
        DELETE FROM influence_edges
        WHERE json_extract(metadata, '$.generated_by') IN ('influence_builder_v1', 'influence_builder_v2', 'influence_builder_v3')
          AND (from_figure_id IN (${placeholders}) OR to_figure_id IN (${placeholders}))
      `;
      const res = db.prepare(deleteSql).run(...targetFigureIds, ...targetFigureIds);
      replacedRows = res.changes;
    }

    for (const edge of finalEdges) {
      const metadata = JSON.stringify({
        generated_by: 'influence_builder_v3',
        algorithm: 'evidence_family_scoring_v3',
        relation_type: edge.relationType,
        direction: edge.direction,
      });

      const existing = findEdgeStmt.get(
        edge.fromId,
        edge.toId,
        edge.direction,
        edge.relationType
      ) as { id: number } | undefined;

      let edgeId: number;
      if (existing?.id) {
        updateEdgeStmt.run(
          edge.confidence,
          edge.evidenceScore,
          edge.supportCount,
          edge.sourceFamilyCount,
          edge.status,
          metadata,
          now,
          existing.id
        );
        edgeId = existing.id;
        updatedEdges += 1;
      } else {
        const result = insertEdgeStmt.run(
          edge.fromId,
          edge.toId,
          edge.direction,
          edge.relationType,
          edge.confidence,
          edge.evidenceScore,
          edge.supportCount,
          edge.sourceFamilyCount,
          edge.status,
          metadata,
          now,
          now
        );
        edgeId = Number(result.lastInsertRowid);
        insertedEdges += 1;
      }

      deleteEvidenceForEdgeStmt.run(edgeId);
      for (const item of edge.evidence) {
        insertEvidenceStmt.run(
          edgeId,
          item.kind,
          item.sourceTable,
          item.sourceRowId,
          item.excerpt,
          item.weight,
          JSON.stringify(item.metadata),
          now,
          now
        );
        evidenceRows += 1;
      }
    }
  });

  tx();
  return { insertedEdges, updatedEdges, evidenceRows, replacedRows };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new Database(args.dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  try {
    const figures = db
      .prepare(
        `
        SELECT id, canonical_name, birth_year, death_year, related_figures
        FROM figures
        WHERE llm_consensus_rank IS NOT NULL
        ORDER BY llm_consensus_rank ASC
        LIMIT ? OFFSET ?
        `
      )
      .all(args.top, args.offset) as FigureRow[];

    if (figures.length === 0) {
      throw new Error('No figures found for selected top/offset window.');
    }

    const figureIds = figures.map((row) => row.id);
    const figureNameById = new Map(figures.map((row) => [row.id, row.canonical_name]));
    const figureYearById = new Map(
      figures.map((row) => [
        row.id,
        {
          birthYear: row.birth_year,
          deathYear: row.death_year,
        },
      ])
    );
    const inTopSet = new Set(figureIds);
    const placeholders = figureIds.map(() => '?').join(',');

    const aliasRows = db
      .prepare(`SELECT figure_id, alias FROM name_aliases WHERE figure_id IN (${placeholders})`)
      .all(...figureIds) as AliasRow[];

    const { keyToFigureId, primaryMentionKeyByFigure, contextStringsByFigure, keyTokenCount } = buildMentionKeys(figures, aliasRows);
    const edges = new Map<string, EdgeDraft>();

    let llmSeedEvidenceCount = 0;
    for (const figure of figures) {
      const parsed = parseJsonSafe<RelatedFigureSeed[]>(figure.related_figures, []);
      for (const item of parsed) {
        if (!item || typeof item.id !== 'string') continue;
        if (!inTopSet.has(item.id) || item.id === figure.id) continue;
        const relationship = typeof item.relationship === 'string' ? item.relationship : '';
        const inferredSeed = inferSeedRelationshipEdge(figure.id, item.id, relationship);
        addEdgeEvidence(
          edges,
          {
            fromId: inferredSeed.fromId,
            toId: inferredSeed.toId,
            direction: inferredSeed.direction,
            relationType: inferredSeed.relationType,
          },
          {
            kind: 'llm_seed',
            family: 'llm_seed',
            sourceTable: 'figures',
            sourceRowId: null,
            excerpt: truncate(`LLM related_figures seed: ${relationship || 'related'}`, 180),
            weight: inferredSeed.weight,
            metadata: {
              relationship: relationship || null,
              generated_from: figure.id,
              cue: inferredSeed.cue,
            },
          }
        );
        llmSeedEvidenceCount += 1;
      }
    }

    const assessmentRows = db
      .prepare(
        `
        SELECT id, figure_id, status, generated_at
        FROM figure_assessments
        WHERE assessment_kind = 'timeline_events'
          AND status IN ('draft', 'published')
          AND figure_id IN (${placeholders})
        ORDER BY figure_id ASC,
                 CASE status WHEN 'published' THEN 0 ELSE 1 END ASC,
                 generated_at DESC,
                 id DESC
        `
      )
      .all(...figureIds) as AssessmentRow[];

    const chosenAssessmentIdByFigure = new Map<string, number>();
    for (const row of assessmentRows) {
      if (!chosenAssessmentIdByFigure.has(row.figure_id)) {
        chosenAssessmentIdByFigure.set(row.figure_id, row.id);
      }
    }

    const chosenAssessmentIds = Array.from(chosenAssessmentIdByFigure.values());
    let timelineMentionEvidenceCount = 0;
    if (chosenAssessmentIds.length > 0) {
      const assessmentPlaceholders = chosenAssessmentIds.map(() => '?').join(',');
      const events = db
        .prepare(
          `
          SELECT id, figure_id, event_label, event_description, metadata
          FROM figure_timeline_events
          WHERE assessment_id IN (${assessmentPlaceholders})
          ORDER BY figure_id ASC, sort_index ASC, id ASC
          `
        )
        .all(...chosenAssessmentIds) as TimelineEventRow[];

      for (const event of events) {
        const text = `${event.event_label || ''} ${event.event_description || ''}`.trim();
        if (!text) continue;
        const mentioned = findMentionedFigureIds(text, keyToFigureId, event.figure_id, contextStringsByFigure, {
          keyTokenCount,
        });
        if (mentioned.length === 0) continue;

        for (const targetId of mentioned) {
          if (!inTopSet.has(targetId) || targetId === event.figure_id) continue;
          const inferred = inferTimelineEdge(
            event.figure_id,
            targetId,
            primaryMentionKeyByFigure.get(targetId),
            text
          );

          const eventMeta = parseJsonSafe<Record<string, unknown>>(event.metadata, {});
          addEdgeEvidence(
            edges,
            {
              fromId: inferred.fromId,
              toId: inferred.toId,
              direction: inferred.direction,
              relationType: inferred.relationType,
            },
            {
              kind: 'timeline_ref',
              family: 'timeline',
              sourceTable: 'figure_timeline_events',
              sourceRowId: event.id,
              excerpt: truncate(`${event.event_label}${event.event_description ? ` — ${event.event_description}` : ''}`),
              weight: inferred.weight,
              metadata: {
                cue: inferred.cue,
                source_ref_ids: eventMeta.source_ref_ids ?? [],
              },
            }
          );
          timelineMentionEvidenceCount += 1;
        }
      }
    }

    const sourceRows = db
      .prepare(
        `
        SELECT id, figure_id, source_corpus, title, snippet, metadata, source_url
        FROM figure_research_sources
        WHERE figure_id IN (${placeholders})
          AND curation_status IN ('auto', 'reviewed', 'approved')
        ORDER BY id ASC
        `
      )
      .all(...figureIds) as ResearchSourceRow[];

    let sourceMentionEvidenceCount = 0;
    for (const source of sourceRows) {
      const text = `${source.title || ''} ${source.snippet || ''}`.trim();
      if (!text) continue;
      const sourceClass = classifySourceFamily(source);
      const isWikipediaSections = sourceClass.provider === 'wikipedia_sections';
      const sourceHasInfluenceCue = hasInfluenceCue(text);
      const hasCue = isWikipediaSections ? sourceHasInfluenceCue : false;

      const mentioned = findMentionedFigureIds(text, keyToFigureId, source.figure_id, contextStringsByFigure, {
        requireMultiTokenNames: isWikipediaSections,
        maxMatches: isWikipediaSections ? (hasCue ? 4 : 2) : 5,
        keyTokenCount,
      });
      if (mentioned.length === 0) continue;

      for (const targetId of mentioned) {
        if (!inTopSet.has(targetId) || targetId === source.figure_id) continue;
        const adjustedWeight = isWikipediaSections
          ? hasCue
            ? Math.max(0.18, sourceClass.weight - 0.05)
            : Math.max(0.14, sourceClass.weight - 0.1)
          : sourceClass.weight;
        addEdgeEvidence(
          edges,
          {
            fromId: source.figure_id,
            toId: targetId,
            direction: 'undirected',
            relationType: 'associated',
          },
          {
            kind: 'source_excerpt',
            family: sourceClass.family,
            sourceTable: 'figure_research_sources',
            sourceRowId: source.id,
            excerpt: truncate(`${source.title}${source.snippet ? ` — ${source.snippet}` : ''}`),
            weight: adjustedWeight,
            metadata: {
              source_corpus: source.source_corpus,
              provider: sourceClass.provider,
              source_url: source.source_url,
              influence_cue: sourceHasInfluenceCue,
            },
          }
        );
        sourceMentionEvidenceCount += 1;
      }
    }

    const snippetRows = db
      .prepare(
        `
        SELECT id, figure_id, corpus, source_title, snippet, source_url
        FROM figure_historical_snippets
        WHERE figure_id IN (${placeholders})
          AND curation_status IN ('auto', 'reviewed', 'approved')
        ORDER BY id ASC
        `
      )
      .all(...figureIds) as HistoricalSnippetRow[];

    let snippetMentionEvidenceCount = 0;
    for (const snippet of snippetRows) {
      const text = `${snippet.source_title || ''} ${snippet.snippet || ''}`.trim();
      if (!text) continue;
      const mentioned = findMentionedFigureIds(text, keyToFigureId, snippet.figure_id, contextStringsByFigure, {
        keyTokenCount,
        maxMatches: 4,
      });
      if (mentioned.length === 0) continue;
      const weight = snippet.corpus.startsWith('britannica_') ? 0.16 : SOURCE_FAMILY_WEIGHT.historical_snippet;

      for (const targetId of mentioned) {
        if (!inTopSet.has(targetId) || targetId === snippet.figure_id) continue;
        addEdgeEvidence(
          edges,
          {
            fromId: snippet.figure_id,
            toId: targetId,
            direction: 'undirected',
            relationType: 'associated',
          },
          {
            kind: 'snippet_match',
            family: 'historical_snippet',
            sourceTable: 'figure_historical_snippets',
            sourceRowId: snippet.id,
            excerpt: truncate(`${snippet.source_title || snippet.corpus}${snippet.snippet ? ` — ${snippet.snippet}` : ''}`),
            weight,
            metadata: {
              corpus: snippet.corpus,
              source_url: snippet.source_url,
            },
          }
        );
        snippetMentionEvidenceCount += 1;
      }
    }

    const preliminary: FinalEdge[] = [];
    for (const draft of edges.values()) {
      const scored = scoreEdge(
        draft,
        args.minEvidenceItems,
        args.minSourceFamilies,
        args.approvedThreshold
      );
      if (!scored) continue;
      preliminary.push(scored);
    }

    const chronologyAugmented: FinalEdge[] = [];
    let chronologyDirectedAdded = 0;
    if (args.dagAugment) {
      for (const edge of preliminary) {
        if (edge.direction !== 'undirected') continue;
        if (edge.relationType !== 'associated') continue;
        if (edge.supportCount < args.minEvidenceItems) continue;
        if (edge.sourceFamilyCount < args.minSourceFamilies) continue;
        if (edge.confidence < args.chronoMinConfidence) continue;
        const hasDirectionalHint = edge.evidence.some((item) => {
          if (item.kind === 'timeline_ref') {
            const cue = typeof item.metadata.cue === 'string' ? item.metadata.cue : '';
            return cue === 'received' || cue === 'exerted' || cue === 'rival';
          }
          if (item.kind === 'source_excerpt') {
            return item.metadata.influence_cue === true;
          }
          if (item.kind === 'llm_seed') {
            const cue = typeof item.metadata.cue === 'string' ? item.metadata.cue : '';
            return cue !== 'seed-associated';
          }
          return false;
        });
        if (!hasDirectionalHint) continue;

        const orientation = orientByChronology(
          edge.fromId,
          edge.toId,
          figureYearById,
          args.chronoMinGap
        );
        if (!orientation) continue;

        const chronologyEvidence: EvidenceDraft = {
          kind: 'source_excerpt',
          family: 'reference',
          sourceTable: 'figures',
          sourceRowId: null,
          excerpt: truncate(
            `Chronology inference: ${figureNameById.get(orientation.fromId) || orientation.fromId} predates ${figureNameById.get(orientation.toId) || orientation.toId} by ~${orientation.gapYears} years.`,
            200
          ),
          weight: args.chronoWeight,
          metadata: {
            inference: 'chronology',
            gap_years: orientation.gapYears,
            min_gap: args.chronoMinGap,
          },
        };

        const draft: EdgeDraft = {
          fromId: orientation.fromId,
          toId: orientation.toId,
          direction: 'directed',
          relationType: 'influenced',
          evidence: [...edge.evidence, chronologyEvidence],
        };

        const rescored = scoreEdge(
          draft,
          args.minEvidenceItems,
          args.minSourceFamilies,
          args.approvedThreshold
        );
        if (!rescored) continue;
        chronologyAugmented.push(rescored);
        chronologyDirectedAdded += 1;
      }
    }

    const preliminaryWithAugmentation = [...preliminary, ...chronologyAugmented];

    const directedPairs = new Set<string>();
    for (const edge of preliminaryWithAugmentation) {
      if (edge.direction !== 'directed') continue;
      const [left, right] = canonicalUndirected(edge.fromId, edge.toId);
      directedPairs.add(`${left}|${right}`);
    }

    const finalEdgesRaw = preliminaryWithAugmentation.filter((edge) => {
      if (edge.direction !== 'undirected') return true;
      const [left, right] = canonicalUndirected(edge.fromId, edge.toId);
      return !directedPairs.has(`${left}|${right}`);
    });

    const finalEdgeByKey = new Map<string, FinalEdge>();
    for (const edge of finalEdgesRaw) {
      const key = edgeKey(edge.fromId, edge.toId, edge.direction, edge.relationType);
      const existing = finalEdgeByKey.get(key);
      if (!existing || edge.confidence > existing.confidence) {
        finalEdgeByKey.set(key, edge);
      }
    }
    const finalEdges = Array.from(finalEdgeByKey.values());

    finalEdges.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.evidenceScore !== a.evidenceScore) return b.evidenceScore - a.evidenceScore;
      return `${a.fromId}:${a.toId}`.localeCompare(`${b.fromId}:${b.toId}`);
    });

    const approvedCount = finalEdges.filter((edge) => edge.status === 'approved').length;
    const candidateCount = finalEdges.length - approvedCount;
    const evidenceCount = finalEdges.reduce((acc, edge) => acc + edge.evidence.length, 0);

    const report = {
      generatedAt: new Date().toISOString(),
      config: {
        top: args.top,
        offset: args.offset,
        minEvidenceItems: args.minEvidenceItems,
        minSourceFamilies: args.minSourceFamilies,
        approvedThreshold: args.approvedThreshold,
        dagAugment: args.dagAugment,
        chronoMinGap: args.chronoMinGap,
        chronoWeight: args.chronoWeight,
        chronoMinConfidence: args.chronoMinConfidence,
        algorithm: 'influence_builder_v3',
      },
      inventory: {
        figuresConsidered: figures.length,
        relatedSeedEvidence: llmSeedEvidenceCount,
        timelineMentionEvidence: timelineMentionEvidenceCount,
        sourceMentionEvidence: sourceMentionEvidenceCount,
        snippetMentionEvidence: snippetMentionEvidenceCount,
        chronologyDirectedAdded,
      },
      results: {
        edges: finalEdges.length,
        approved: approvedCount,
        candidate: candidateCount,
        evidenceRows: evidenceCount,
        directed: finalEdges.filter((edge) => edge.direction === 'directed').length,
        undirected: finalEdges.filter((edge) => edge.direction === 'undirected').length,
      },
      edges: finalEdges.map((edge) => ({
        ...edge,
        fromName: figureNameById.get(edge.fromId) || edge.fromId,
        toName: figureNameById.get(edge.toId) || edge.toId,
      })),
    };

    await mkdir(path.dirname(args.reportPath), { recursive: true });
    await writeFile(args.reportPath, JSON.stringify(report, null, 2), 'utf8');

    let publishResult: PublishResult | null = null;
    if (args.publish) {
      publishResult = publishEdges(db, finalEdges, args, figureIds);
    }

    console.log(
      JSON.stringify(
        {
          mode: args.publish ? 'publish' : 'dry-run',
          reportPath: args.reportPath,
          figuresConsidered: figures.length,
          rawEdgeCandidates: edges.size,
          chronologyDirectedAdded,
          finalEdges: finalEdges.length,
          approved: approvedCount,
          candidate: candidateCount,
          evidenceRows: evidenceCount,
          directed: finalEdges.filter((edge) => edge.direction === 'directed').length,
          undirected: finalEdges.filter((edge) => edge.direction === 'undirected').length,
          publishResult,
        },
        null,
        2
      )
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

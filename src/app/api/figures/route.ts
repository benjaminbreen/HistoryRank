import { NextRequest, NextResponse } from 'next/server';
import { db, figures, rankings, nameAliases, importLogs } from '@/lib/db';
import { asc, desc, like, eq, sql, isNotNull, and, inArray, or } from 'drizzle-orm';
import { getVarianceLevel } from '@/types';
import type { FigureRow, FiguresResponse, BadgeType } from '@/types';
import { dot, embedQuery, loadFigureEmbeddings, normalizeVector } from '@/lib/embeddings';
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

// Cache for LLM rank lookup
let llmRankCache: Map<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

// Cache for weighted rank lookup
let weightedRankCache: Map<string, number> | null = null;
let weightedRankCacheTimestamp = 0;
let weightedNormalizedRankCache: Map<string, number> | null = null;
let weightedNormalizedRankCacheTimestamp = 0;
let weightedRobustRankCache: Map<string, number> | null = null;
let weightedRobustRankCacheTimestamp = 0;

// Cache for name aliases/merges (used by V2/V3 ingestion)
let aliasMapCache: Map<string, string> | null = null;
let aliasMapCacheTimestamp = 0;
let mergeRemapCache: Map<string, string> | null = null;
let mergeRemapCacheTimestamp = 0;

// Cache for V2 rank lookup
let v2RankCache: Map<string, number> | null = null;
let v2RankCacheTimestamp = 0;
let v2MetaCache: { listCount: number; modelCount: number; orderedIds: string[] } | null = null;
// Cache for V3 rank lookup
let v3RankCache: Map<string, number> | null = null;
let v3RankCacheTimestamp = 0;
let v3MetaCache: { listCount: number; modelCount: number; orderedIds: string[] } | null = null;

// Model quality weights based on automated + LLM assessment
// Higher = more reliable/higher quality lists
// Weights derived from: pattern collapse severity, duplicate rates, LLM qualitative scores
// Keys are exact source names from the database (lowercase)
const MODEL_WEIGHTS: Record<string, number> = {
  // Tier S - Excellent (weight 1.0)
  'claude-opus-4.5': 1.0,
  'gpt-5.2-thinking': 0.79,

  // Tier A - Strong (weight 0.8-0.85)
  'claude-sonnet-4.5': 0.54,
  'gemini-pro-3': 0.33,
  'gemini-flash-3-preview': 0.29,

  // Tier B - Usable (weight 0.6-0.7)
  'grok-4': 0.29,
  'grok-4.1-fast': 0.18,

  // Tier C - Problematic (weight 0.2-0.4)
  'deepseek-v3.2': 0.18,       // High variance, some lists broken with K-pop
  'qwen3-235b-a22b': 0.26,     // Looping bug, Socrates 27x
  'glm-4.7': 0.11,             // 512-sequence sports collapse

  // Tier F - Severe issues (weight 0.15)
  'mistral-large-3': 0.05,     // 328-571 pattern collapse
};

// Canonical model weights for Weighted v3 (merge variants like gpt-5.2-thinking)
const V3_MODEL_WEIGHTS: Record<string, number> = {
  'claude-opus-4.5': 0.806,
  'gemini-flash-3-preview': 0.805,
  'claude-sonnet-4.5': 0.803,
  'grok-4.1-fast': 0.760,
  'deepseek-v3.2': 0.753,
  'gpt-5.2': 0.752,
  'glm-4.7': 0.748,
  'gemini-pro-3': 0.738,
  'qwen3-235b-a22b': 0.721,
  'grok-4': 0.718,
  'mistral-large-3': 0.677,
};

const V2_DIR = path.join(process.cwd(), 'data', 'raw_v2');
const V3_DIR = path.join(process.cwd(), 'data', 'raw_v3');
const OVERRIDES_FILE = path.join(process.cwd(), 'data', 'figure-overrides.json');
const GROUP_EXCLUDE = new Set([
  'the-beatles',
]);

// Exclude worst-performing lists from weighted v3 (February 2026 review)
const WEIGHTED_V3_EXCLUDED_LISTS = new Set([
  'GLM 4.7 LIST 3 (January 14, 2026).txt',
  'Mistral Large 3 LIST 5 (January 18, 2026).txt',
  'Qwen3 235B A22B LIST 7 (January 14, 2026).txt',
  'GLM 4.7 LIST 2 (January 14, 2026).txt',
  'Grok 4 LIST 1 (January 14, 2026).txt',
  'Mistral Large 3 LIST 4 (January 17, 2026).txt',
  'Grok 4.1 Fast LIST 1 (January 14, 2026).txt',
  'Mistral Large 3 LIST 1 (January 15, 2026).txt',
  'Grok 4 LIST 3 (January 14, 2026).txt',
  'Claude Sonnet 4.5 LIST 3 (January 12, 2025).txt',
]);

// Cache for stats
let statsCache: { totalLists: number; totalModels: number } | null = null;
let statsCacheTimestamp = 0;
let weightedStatsCache: { totalLists: number; totalModels: number } | null = null;
let weightedStatsCacheTimestamp = 0;
let weightedV3StatsCache: { totalLists: number; totalModels: number } | null = null;
let weightedV3StatsCacheTimestamp = 0;

// Cache for badge data (source averages per figure)
interface SourceAverage {
  source: string;
  avgRank: number;
}
let badgeDataCache: Map<string, SourceAverage[]> | null = null;
let badgeDataCacheTimestamp = 0;
let modelFavoriteCache: Record<string, Set<string>> | null = null;
let modelFavoriteCacheTimestamp = 0;

// Thresholds for badges (calibrated for global pageviews across 10 languages)
// Targets: ~50-100 figures per badge type for hidden-gem, under-the-radar, global-icon
const BADGE_THRESHOLDS = {
  // Model favorites
  MODEL_FAVORITE_DIFF: 400,      // Model ranks 400+ higher than consensus
  MODEL_FAVORITE_MAX_MODEL_RANK: 150, // Model must rank figure very highly
  MODEL_FAVORITE_MIN_CONSENSUS_RANK: 300, // Must diverge from consensus

  // LLM vs HPI comparison
  LEGACY_LEANING_DIFF: 300,     // Pantheon ranks 300+ higher than LLM
  LLM_FAVORITE_DIFF: 300,       // LLM ranks 300+ higher than HPI

  // Popular (was "hyped") - high attention, lower rank
  POPULAR_PAGEVIEWS: 8000000,   // 8M+ global pageviews
  POPULAR_MIN_RANK: 300,        // Must be ranked lower than 300

  // Hidden Gem - high rank + low attention + STRONG consensus (~15-25 figures)
  // Differentiator: requires strong LLM agreement (low variance)
  HIDDEN_GEM_MAX_RANK: 350,     // Top 350 by LLM
  HIDDEN_GEM_MIN_RANK: 21,      // Exclude top 20 (already famous)
  HIDDEN_GEM_MAX_PAGEVIEWS: 1500000, // Under 1.5M global pageviews
  HIDDEN_GEM_MAX_VARIANCE: 0.4,     // Must have strong LLM consensus

  // Under the Radar - high rank + moderate ngram (historically present but fading) + low attention
  // Differentiator: uses ngram to find figures who were in scholarly books but now overlooked
  UNDER_RADAR_MAX_RANK: 300,    // Top 300 by LLM
  UNDER_RADAR_MAX_PAGEVIEWS: 1000000, // Under 1M global pageviews
  UNDER_RADAR_MIN_NGRAM_PCT: 40, // Must have moderate historical book presence
  UNDER_RADAR_MAX_NGRAM_PCT: 75, // But not dominant in books (those go to historians-favorite)

  // Global Icon - popular outside Anglophone world (~50-80 figures)
  // Requires either Chinese model preference OR low English pageview % + minimum pageviews
  GLOBAL_ICON_MODEL_DIFF: 50,   // Chinese models rank 50+ higher than Western
  GLOBAL_ICON_MAX_ENGLISH_PCT: 50, // English pageviews < 50% of total
  GLOBAL_ICON_MAX_RANK: 700,    // Top 700 by LLM
  GLOBAL_ICON_MIN_PAGEVIEWS: 500000, // Must have at least 500K pageviews to be "notable"

  // Universal Recognition - high across ALL sources including scholarly
  UNIVERSAL_MAX_LLM_RANK: 150,  // Top 150 by LLM consensus
  UNIVERSAL_MAX_HPI_RANK: 150,  // Top 150 by Pantheon
  UNIVERSAL_MIN_PAGEVIEWS: 2000000, // At least 2M pageviews
  UNIVERSAL_MIN_NGRAM_PCT: 80,  // Top 20% in book mentions (scholarly staying power)

  // Historian's Favorite - high ngram (scholarly) + low pageviews + middle ranks
  HISTORIANS_FAV_MIN_NGRAM_PCT: 80,   // Top 20% in book mentions
  HISTORIANS_FAV_MAX_PAGEVIEWS: 400000, // Under 400K pageviews
  HISTORIANS_FAV_MIN_RANK: 250,       // Not top tier
  HISTORIANS_FAV_MAX_RANK: 900,       // But still recognized

  // Underwritten - low ngram but high LLM rank (underrepresented in English scholarship)
  UNDERWRITTEN_MAX_NGRAM_PCT: 25,     // Bottom 25% in book mentions (or null)
  UNDERWRITTEN_MAX_RANK: 500,         // LLMs recognize importance
  UNDERWRITTEN_MIN_PAGEVIEWS: 100000, // Must be notable enough to matter
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getAliasMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (aliasMapCache && now - aliasMapCacheTimestamp < CACHE_TTL) {
    return aliasMapCache;
  }

  const rows = await db
    .select({ alias: nameAliases.alias, figureId: nameAliases.figureId })
    .from(nameAliases);

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.alias, row.figureId);
  }

  aliasMapCache = map;
  aliasMapCacheTimestamp = now;
  return map;
}

function getMergeRemap(): Map<string, string> {
  const now = Date.now();
  if (mergeRemapCache && now - mergeRemapCacheTimestamp < CACHE_TTL) {
    return mergeRemapCache;
  }

  const remap = new Map<string, string>();
  if (fs.existsSync(OVERRIDES_FILE)) {
    const overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')) as { merges?: Record<string, string[]> };
    const merges = overrides.merges || {};
    for (const [keepId, deleteIds] of Object.entries(merges)) {
      for (const deleteId of deleteIds) remap.set(deleteId, keepId);
    }
  }

  mergeRemapCache = remap;
  mergeRemapCacheTimestamp = now;
  return remap;
}

type RankAccumulator = Map<string, Map<string, { sum: number; count: number }>>;

async function loadV2V3Rankings(excludedFiles?: Set<string>): Promise<{ sources: Set<string>; ranks: RankAccumulator; listLengths: Map<string, number> }> {
  const aliasMap = await getAliasMap();
  const mergeRemap = getMergeRemap();

  const sources = new Set<string>();
  const ranks: RankAccumulator = new Map();
  const listLengths = new Map<string, number>();

  const loadDir = (dir: string, version: 'v2' | 'v3') => {
    if (!fs.existsSync(dir)) return;
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.txt') && !f.endsWith('.quality.txt') && !f.endsWith('.failed.txt') && !f.endsWith('.raw.txt') && !f.endsWith('.repaired.txt'))
      .sort();

    for (const file of files) {
      if (excludedFiles?.has(file)) continue;
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const start = content.indexOf('[');
      const end = content.lastIndexOf(']');
      if (start === -1 || end === -1 || end <= start) continue;
      let entries: Array<{ rank?: number; name: string }> = [];
      try {
        entries = JSON.parse(content.slice(start, end + 1));
      } catch {
        continue;
      }
      if (!Array.isArray(entries) || entries.length === 0) continue;

      const model = version === 'v2'
        ? file.replace(/\.txt$/, '').split(' V2 LIST ')[0].trim()
        : file.replace(/\.txt$/, '').split(' V3 LIST ')[0].trim();
      sources.add(model);
      const existingLen = listLengths.get(model) || 0;
      if (entries.length > existingLen) listLengths.set(model, entries.length);

      const listRanks = new Map<string, number>();
      entries.forEach((entry, idx) => {
        if (!entry?.name) return;
        const nameNorm = normalizeName(entry.name);
        const figureId = aliasMap.get(nameNorm);
        if (!figureId) return;
        const mergedId = mergeRemap.get(figureId) || figureId;
        const rank = typeof entry.rank === 'number' ? entry.rank : idx + 1;
        if (listRanks.has(mergedId)) {
          const existing = listRanks.get(mergedId) as number;
          if (rank < existing) listRanks.set(mergedId, rank);
          return;
        }
        listRanks.set(mergedId, rank);
      });

      for (const [figureId, rank] of listRanks.entries()) {
        if (GROUP_EXCLUDE.has(figureId)) continue;
        const figMap = ranks.get(figureId) || new Map<string, { sum: number; count: number }>();
        ranks.set(figureId, figMap);
        const record = figMap.get(model) || { sum: 0, count: 0 };
        record.sum += rank;
        record.count += 1;
        figMap.set(model, record);
      }
    }
  };

  loadDir(V2_DIR, 'v2');
  loadDir(V3_DIR, 'v3');

  return { sources, ranks, listLengths };
}

async function getBadgeData(): Promise<Map<string, SourceAverage[]>> {
  const now = Date.now();
  if (badgeDataCache && now - badgeDataCacheTimestamp < CACHE_TTL) {
    return badgeDataCache;
  }

  // Get average rank per source per figure
  const rows = await db
    .select({
      figureId: rankings.figureId,
      source: rankings.source,
      avgRank: sql<number>`avg(${rankings.rank})`,
    })
    .from(rankings)
    .groupBy(rankings.figureId, rankings.source);

  const lookup = new Map<string, SourceAverage[]>();
  for (const row of rows) {
    const existing = lookup.get(row.figureId) || [];
    existing.push({ source: row.source, avgRank: Number(row.avgRank) });
    lookup.set(row.figureId, existing);
  }

  badgeDataCache = lookup;
  badgeDataCacheTimestamp = now;
  return lookup;
}

async function getModelFavoriteCaps(): Promise<Record<string, Set<string>>> {
  const now = Date.now();
  if (modelFavoriteCache && now - modelFavoriteCacheTimestamp < CACHE_TTL) {
    return modelFavoriteCache;
  }

  const badgeData = await getBadgeData();
  const ranked = await db
    .select({ id: figures.id, llmConsensusRank: figures.llmConsensusRank })
    .from(figures)
    .where(isNotNull(figures.llmConsensusRank));

  const candidates: Record<string, Array<{ id: string; score: number }>> = {
    claude: [],
    gpt: [],
    gemini: [],
    deepseek: [],
    qwen: [],
  };

  for (const fig of ranked) {
    const sourceAverages = badgeData.get(fig.id) || [];
    const modelAvgs: Record<string, number | null> = {
      claude: null,
      gpt: null,
      gemini: null,
      deepseek: null,
      qwen: null,
    };

    const avgFor = (needle: string) => {
      const avgs = sourceAverages.filter(s => s.source.includes(needle)).map(s => s.avgRank);
      return avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
    };

    modelAvgs.claude = avgFor('claude');
    modelAvgs.gpt = avgFor('gpt');
    modelAvgs.gemini = avgFor('gemini');
    modelAvgs.deepseek = avgFor('deepseek');
    modelAvgs.qwen = avgFor('qwen');

    for (const [model, avg] of Object.entries(modelAvgs)) {
      if (avg === null || fig.llmConsensusRank === null) continue;
      if (
        fig.llmConsensusRank - avg >= BADGE_THRESHOLDS.MODEL_FAVORITE_DIFF &&
        avg <= BADGE_THRESHOLDS.MODEL_FAVORITE_MAX_MODEL_RANK &&
        fig.llmConsensusRank >= BADGE_THRESHOLDS.MODEL_FAVORITE_MIN_CONSENSUS_RANK
      ) {
        candidates[model].push({ id: fig.id, score: fig.llmConsensusRank - avg });
      }
    }
  }

  const capped: Record<string, Set<string>> = {
    claude: new Set(),
    gpt: new Set(),
    gemini: new Set(),
    deepseek: new Set(),
    qwen: new Set(),
  };

  for (const model of Object.keys(candidates)) {
    candidates[model]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .forEach((item) => capped[model].add(item.id));
  }

  modelFavoriteCache = capped;
  modelFavoriteCacheTimestamp = now;
  return capped;
}

function calculateBadges(
  figureId: string,
  llmConsensusRank: number | null,
  hpiRank: number | null,
  pageviews: number | null,
  sourceAverages: SourceAverage[],
  varianceScore?: number | null,
  modelFavoriteCaps?: Record<string, Set<string>>,
  englishPageviews?: number | null,
  ngramPercentile?: number | null,
  era?: string | null,
  domain?: string | null
): BadgeType[] {
  const badges: BadgeType[] = [];

  // Skip if no LLM consensus rank
  if (llmConsensusRank === null) return badges;

  const modelCoverage = sourceAverages.length;

  // Calculate model family averages
  const claudeAvgs = sourceAverages.filter(s => s.source.includes('claude')).map(s => s.avgRank);
  const gptAvgs = sourceAverages.filter(s => s.source.includes('gpt')).map(s => s.avgRank);
  const geminiAvgs = sourceAverages.filter(s => s.source.includes('gemini')).map(s => s.avgRank);
  const deepseekAvgs = sourceAverages.filter(s => s.source.includes('deepseek')).map(s => s.avgRank);
  const qwenAvgs = sourceAverages.filter(s => s.source.includes('qwen')).map(s => s.avgRank);

  const claudeAvg = claudeAvgs.length > 0 ? claudeAvgs.reduce((a, b) => a + b, 0) / claudeAvgs.length : null;
  const gptAvg = gptAvgs.length > 0 ? gptAvgs.reduce((a, b) => a + b, 0) / gptAvgs.length : null;
  const geminiAvg = geminiAvgs.length > 0 ? geminiAvgs.reduce((a, b) => a + b, 0) / geminiAvgs.length : null;
  const deepseekAvg = deepseekAvgs.length > 0 ? deepseekAvgs.reduce((a, b) => a + b, 0) / deepseekAvgs.length : null;
  const qwenAvg = qwenAvgs.length > 0 ? qwenAvgs.reduce((a, b) => a + b, 0) / qwenAvgs.length : null;

  // Calculate Chinese vs Western model averages for global-icon badge
  const chineseModelAvg = (deepseekAvg !== null && qwenAvg !== null)
    ? (deepseekAvg + qwenAvg) / 2
    : deepseekAvg ?? qwenAvg;
  const westernModelAvgs = [claudeAvg, gptAvg, geminiAvg].filter(a => a !== null) as number[];
  const westernModelAvg = westernModelAvgs.length > 0
    ? westernModelAvgs.reduce((a, b) => a + b, 0) / westernModelAvgs.length
    : null;

  // Check if a model ranks this figure much higher than consensus
  if (
    claudeAvg !== null &&
    modelCoverage >= 3 &&
    llmConsensusRank - claudeAvg >= BADGE_THRESHOLDS.MODEL_FAVORITE_DIFF &&
    claudeAvg <= BADGE_THRESHOLDS.MODEL_FAVORITE_MAX_MODEL_RANK &&
    llmConsensusRank >= BADGE_THRESHOLDS.MODEL_FAVORITE_MIN_CONSENSUS_RANK
  ) {
    if (!modelFavoriteCaps || modelFavoriteCaps.claude?.has(figureId)) {
      badges.push('claude-favorite');
    }
  }
  if (
    gptAvg !== null &&
    modelCoverage >= 3 &&
    llmConsensusRank - gptAvg >= BADGE_THRESHOLDS.MODEL_FAVORITE_DIFF &&
    gptAvg <= BADGE_THRESHOLDS.MODEL_FAVORITE_MAX_MODEL_RANK &&
    llmConsensusRank >= BADGE_THRESHOLDS.MODEL_FAVORITE_MIN_CONSENSUS_RANK
  ) {
    if (!modelFavoriteCaps || modelFavoriteCaps.gpt?.has(figureId)) {
      badges.push('gpt-favorite');
    }
  }
  if (
    geminiAvg !== null &&
    modelCoverage >= 3 &&
    llmConsensusRank - geminiAvg >= BADGE_THRESHOLDS.MODEL_FAVORITE_DIFF &&
    geminiAvg <= BADGE_THRESHOLDS.MODEL_FAVORITE_MAX_MODEL_RANK &&
    llmConsensusRank >= BADGE_THRESHOLDS.MODEL_FAVORITE_MIN_CONSENSUS_RANK
  ) {
    if (!modelFavoriteCaps || modelFavoriteCaps.gemini?.has(figureId)) {
      badges.push('gemini-favorite');
    }
  }
  if (
    deepseekAvg !== null &&
    modelCoverage >= 3 &&
    llmConsensusRank - deepseekAvg >= BADGE_THRESHOLDS.MODEL_FAVORITE_DIFF &&
    deepseekAvg <= BADGE_THRESHOLDS.MODEL_FAVORITE_MAX_MODEL_RANK &&
    llmConsensusRank >= BADGE_THRESHOLDS.MODEL_FAVORITE_MIN_CONSENSUS_RANK
  ) {
    if (!modelFavoriteCaps || modelFavoriteCaps.deepseek?.has(figureId)) {
      badges.push('deepseek-favorite');
    }
  }
  if (
    qwenAvg !== null &&
    modelCoverage >= 3 &&
    llmConsensusRank - qwenAvg >= BADGE_THRESHOLDS.MODEL_FAVORITE_DIFF &&
    qwenAvg <= BADGE_THRESHOLDS.MODEL_FAVORITE_MAX_MODEL_RANK &&
    llmConsensusRank >= BADGE_THRESHOLDS.MODEL_FAVORITE_MIN_CONSENSUS_RANK
  ) {
    if (!modelFavoriteCaps || modelFavoriteCaps.qwen?.has(figureId)) {
      badges.push('qwen-favorite');
    }
  }

  // Legacy leaning: Pantheon much higher than LLM (require coverage)
  if (modelCoverage >= 3 && hpiRank !== null && llmConsensusRank - hpiRank >= BADGE_THRESHOLDS.LEGACY_LEANING_DIFF) {
    badges.push('legacy-leaning');
  }

  // LLM favorite: LLM much higher than HPI
  if (modelCoverage >= 3 && hpiRank !== null && hpiRank - llmConsensusRank >= BADGE_THRESHOLDS.LLM_FAVORITE_DIFF) {
    badges.push('llm-favorite');
  }

  // Popular (was "hyped"): High pageviews but not top ranked
  if (
    pageviews !== null &&
    pageviews >= BADGE_THRESHOLDS.POPULAR_PAGEVIEWS &&
    llmConsensusRank >= BADGE_THRESHOLDS.POPULAR_MIN_RANK
  ) {
    badges.push('popular');
  }

  // Universal Recognition: High across ALL sources (LLM, HPI, pageviews, AND scholarly)
  if (
    pageviews !== null &&
    hpiRank !== null &&
    ngramPercentile != null &&
    llmConsensusRank <= BADGE_THRESHOLDS.UNIVERSAL_MAX_LLM_RANK &&
    hpiRank <= BADGE_THRESHOLDS.UNIVERSAL_MAX_HPI_RANK &&
    pageviews >= BADGE_THRESHOLDS.UNIVERSAL_MIN_PAGEVIEWS &&
    ngramPercentile >= BADGE_THRESHOLDS.UNIVERSAL_MIN_NGRAM_PCT
  ) {
    badges.push('universal-recognition');
  }

  // Global Icon: Popular outside Anglophone world
  // Qualifies if EITHER: Chinese models rank higher than Western OR low English pageview %
  // Must also have minimum pageviews to be considered globally notable
  if (
    pageviews !== null &&
    pageviews >= BADGE_THRESHOLDS.GLOBAL_ICON_MIN_PAGEVIEWS &&
    llmConsensusRank <= BADGE_THRESHOLDS.GLOBAL_ICON_MAX_RANK
  ) {
    const englishPct = englishPageviews != null ? (englishPageviews / pageviews) * 100 : 100;
    const modelDiff = (chineseModelAvg !== null && westernModelAvg !== null)
      ? westernModelAvg - chineseModelAvg
      : 0;

    // Qualifies if: strong Chinese model preference OR low English pageviews
    const hasChinesePreference = modelDiff >= BADGE_THRESHOLDS.GLOBAL_ICON_MODEL_DIFF;
    const hasLowEnglish = englishPct < BADGE_THRESHOLDS.GLOBAL_ICON_MAX_ENGLISH_PCT;

    if (hasChinesePreference || hasLowEnglish) {
      badges.push('global-icon');
    }
  }

  // Hidden Gem: High rank + low attention + strong LLM consensus
  if (
    pageviews !== null &&
    pageviews > 0 &&
    modelCoverage >= 3 &&
    varianceScore != null &&
    llmConsensusRank <= BADGE_THRESHOLDS.HIDDEN_GEM_MAX_RANK &&
    llmConsensusRank >= BADGE_THRESHOLDS.HIDDEN_GEM_MIN_RANK &&
    varianceScore <= BADGE_THRESHOLDS.HIDDEN_GEM_MAX_VARIANCE &&
    pageviews <= BADGE_THRESHOLDS.HIDDEN_GEM_MAX_PAGEVIEWS
  ) {
    badges.push('hidden-gem');
  }

  // Under the Radar: High rank + moderate ngram (historically present but fading) + low attention
  if (
    pageviews !== null &&
    pageviews > 0 &&
    ngramPercentile != null &&
    llmConsensusRank <= BADGE_THRESHOLDS.UNDER_RADAR_MAX_RANK &&
    ngramPercentile >= BADGE_THRESHOLDS.UNDER_RADAR_MIN_NGRAM_PCT &&
    ngramPercentile <= BADGE_THRESHOLDS.UNDER_RADAR_MAX_NGRAM_PCT &&
    pageviews <= BADGE_THRESHOLDS.UNDER_RADAR_MAX_PAGEVIEWS
  ) {
    badges.push('under-the-radar');
  }

  // Historian's Favorite: High ngram (scholarly) + low pageviews + middle ranks
  if (
    ngramPercentile != null &&
    pageviews != null &&
    ngramPercentile >= BADGE_THRESHOLDS.HISTORIANS_FAV_MIN_NGRAM_PCT &&
    pageviews > 0 &&
    pageviews <= BADGE_THRESHOLDS.HISTORIANS_FAV_MAX_PAGEVIEWS &&
    llmConsensusRank >= BADGE_THRESHOLDS.HISTORIANS_FAV_MIN_RANK &&
    llmConsensusRank <= BADGE_THRESHOLDS.HISTORIANS_FAV_MAX_RANK
  ) {
    badges.push('historians-favorite');
  }

  // Underwritten: Low ngram but high LLM rank (underrepresented in English scholarship)
  // Filter out contemporary celebrities by requiring historical era or serious domain
  const isHistoricalOrSerious = era !== 'Contemporary' ||
    ['Politics', 'Science', 'Philosophy', 'Religion', 'Military', 'Arts'].includes(domain || '');

  if (
    (ngramPercentile == null || ngramPercentile <= BADGE_THRESHOLDS.UNDERWRITTEN_MAX_NGRAM_PCT) &&
    llmConsensusRank <= BADGE_THRESHOLDS.UNDERWRITTEN_MAX_RANK &&
    isHistoricalOrSerious &&
    pageviews != null &&
    pageviews >= BADGE_THRESHOLDS.UNDERWRITTEN_MIN_PAGEVIEWS
  ) {
    badges.push('underwritten');
  }

  if (badges.length === 0) return badges;

  // Priority order for displaying a single badge (hidden-gem is the "trump" badge)
  const priority: BadgeType[] = [
    'hidden-gem',
    'under-the-radar',
    'historians-favorite',
    'underwritten',
    'universal-recognition',
    'global-icon',
    'popular',
    'llm-favorite',
    'legacy-leaning',
    'claude-favorite',
    'gpt-favorite',
    'gemini-favorite',
    'deepseek-favorite',
    'qwen-favorite',
  ];

  for (const type of priority) {
    if (badges.includes(type)) {
      return [type];
    }
  }

  return [];
}

async function getStats(): Promise<{ totalLists: number; totalModels: number }> {
  const now = Date.now();
  if (statsCache && now - statsCacheTimestamp < CACHE_TTL) {
    return statsCache;
  }

  // Count distinct source + sampleId combinations (total lists)
  const listsResult = await db
    .select({ count: sql<number>`count(distinct ${rankings.source} || '-' || coalesce(${rankings.sampleId}, ''))` })
    .from(rankings);

  // Count distinct LLM sources (excluding 'pantheon')
  const modelsResult = await db
    .select({ count: sql<number>`count(distinct ${rankings.source})` })
    .from(rankings)
    .where(sql`${rankings.source} != 'pantheon'`);

  statsCache = {
    totalLists: listsResult[0].count,
    totalModels: modelsResult[0].count,
  };
  statsCacheTimestamp = now;

  return statsCache;
}

function getListFiles(dir: string, version: 'v2' | 'v3'): string[] {
  if (!fs.existsSync(dir)) return [];
  const token = version === 'v2' ? ' V2 LIST ' : ' V3 LIST ';
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.txt') && f.includes(token))
    .filter((f) => !f.endsWith('.quality.txt') && !f.endsWith('.failed.txt') && !f.endsWith('.raw.txt') && !f.endsWith('.repaired.txt'))
    .sort();
}

function inferModelFromList(file: string, version: 'v2' | 'v3'): string {
  const base = file.replace(/\.txt$/, '');
  const token = version === 'v2' ? ' V2 LIST ' : ' V3 LIST ';
  const parts = base.split(token);
  return parts[0].trim();
}

async function getWeightedStats(): Promise<{ totalLists: number; totalModels: number }> {
  const now = Date.now();
  if (weightedStatsCache && now - weightedStatsCacheTimestamp < CACHE_TTL) {
    return weightedStatsCache;
  }

  const listStats = await getStats();

  const v2Files = getListFiles(V2_DIR, 'v2');
  const v3Files = getListFiles(V3_DIR, 'v3');
  const v2Models = new Set(v2Files.map((file) => inferModelFromList(file, 'v2')));
  const v3Models = new Set(v3Files.map((file) => inferModelFromList(file, 'v3')));

  const modelRows = await db
    .select({ source: rankings.source })
    .from(rankings)
    .where(sql`${rankings.source} != 'pantheon'`)
    .groupBy(rankings.source);
  const modelSet = new Set(modelRows.map((row) => row.source));
  for (const model of v2Models) modelSet.add(model);
  for (const model of v3Models) modelSet.add(model);

  weightedStatsCache = {
    totalLists: listStats.totalLists + v2Files.length + v3Files.length,
    totalModels: modelSet.size,
  };
  weightedStatsCacheTimestamp = now;

  return weightedStatsCache;
}

async function getWeightedV3Stats(): Promise<{ totalLists: number; totalModels: number }> {
  const now = Date.now();
  if (weightedV3StatsCache && now - weightedV3StatsCacheTimestamp < CACHE_TTL) {
    return weightedV3StatsCache;
  }

  const excluded = Array.from(WEIGHTED_V3_EXCLUDED_LISTS);

  // Count distinct source + sampleId combinations for v1, excluding flagged filenames
  let listCount = 0;
  const listRows = await db
    .select({ source: rankings.source, sampleId: rankings.sampleId })
    .from(rankings)
    .where(sql`${rankings.source} != 'pantheon'`)
    .groupBy(rankings.source, rankings.sampleId);

  const excludedKeys = new Set<string>();
  if (excluded.length > 0) {
    const excludedRows = await db
      .select({ source: importLogs.source, sampleId: importLogs.sampleId })
      .from(importLogs)
      .where(inArray(importLogs.filename, excluded));
    for (const row of excludedRows) {
      excludedKeys.add(`${row.source}::${row.sampleId ?? ''}`);
    }
  }

  for (const row of listRows) {
    if (excludedKeys.has(`${row.source}::${row.sampleId ?? ''}`)) continue;
    listCount += 1;
  }

  const v2Files = getListFiles(V2_DIR, 'v2').filter((f) => !WEIGHTED_V3_EXCLUDED_LISTS.has(f));
  const v3Files = getListFiles(V3_DIR, 'v3').filter((f) => !WEIGHTED_V3_EXCLUDED_LISTS.has(f));
  listCount += v2Files.length + v3Files.length;

  // Canonicalized model count
  const modelSet = new Set<string>();
  const modelRows = listRows;
  for (const row of modelRows) {
    if (excludedKeys.has(`${row.source}::${row.sampleId ?? ''}`)) continue;
    modelSet.add(getCanonicalModelId(row.source.toLowerCase()));
  }

  const v2Models = new Set(v2Files.map((file) => inferModelFromList(file, 'v2')));
  const v3Models = new Set(v3Files.map((file) => inferModelFromList(file, 'v3')));
  for (const model of v2Models) modelSet.add(getCanonicalModelId(model.toLowerCase()));
  for (const model of v3Models) modelSet.add(getCanonicalModelId(model.toLowerCase()));

  weightedV3StatsCache = {
    totalLists: listCount,
    totalModels: modelSet.size,
  };
  weightedV3StatsCacheTimestamp = now;

  return weightedV3StatsCache;
}

async function getLLMRankLookup(): Promise<Map<string, number>> {
  const now = Date.now();
  if (llmRankCache && now - cacheTimestamp < CACHE_TTL) {
    return llmRankCache;
  }

  // Get all figures with LLM consensus rank, sorted by rank
  const rankedFigures = await db
    .select({ id: figures.id, llmConsensusRank: figures.llmConsensusRank })
    .from(figures)
    .where(isNotNull(figures.llmConsensusRank))
    .orderBy(asc(figures.llmConsensusRank));

  // Build lookup map: figure ID -> position (1-based)
  const lookup = new Map<string, number>();
  rankedFigures.forEach((fig, index) => {
    lookup.set(fig.id, index + 1);
  });

  llmRankCache = lookup;
  cacheTimestamp = now;
  return lookup;
}

// Get weight for a model source string
function getModelWeight(source: string): number {
  const sourceLower = source.toLowerCase();

  // Direct lookup first
  if (MODEL_WEIGHTS[sourceLower] !== undefined) {
    return MODEL_WEIGHTS[sourceLower];
  }

  // Default weight for unknown models
  return 0.5;
}

function getCanonicalModelId(sourceLower: string): string {
  if (sourceLower.includes('gpt-5.2')) return 'gpt-5.2';
  if (sourceLower.includes('claude-opus-4.5')) return 'claude-opus-4.5';
  if (sourceLower.includes('claude-sonnet-4.5')) return 'claude-sonnet-4.5';
  if (sourceLower.includes('grok-4.1-fast')) return 'grok-4.1-fast';
  if (sourceLower.includes('grok-4')) return 'grok-4';
  if (sourceLower.includes('deepseek-v3.2')) return 'deepseek-v3.2';
  if (sourceLower.includes('glm-4.7')) return 'glm-4.7';
  if (sourceLower.includes('mistral-large-3')) return 'mistral-large-3';
  if (sourceLower.includes('qwen3') && sourceLower.includes('235') && sourceLower.includes('a22b')) {
    return 'qwen3-235b-a22b';
  }
  if (sourceLower.includes('gemini') && sourceLower.includes('flash') && sourceLower.includes('3')) {
    return 'gemini-flash-3-preview';
  }
  if (sourceLower.includes('gemini') && sourceLower.includes('pro') && sourceLower.includes('3')) {
    return 'gemini-pro-3';
  }
  return sourceLower;
}

function getV3ModelWeight(source: string): number {
  const canonical = getCanonicalModelId(source.toLowerCase());
  if (V3_MODEL_WEIGHTS[canonical] !== undefined) {
    return V3_MODEL_WEIGHTS[canonical];
  }
  return 0.5;
}

async function getWeightedRankLookup(): Promise<Map<string, number>> {
  const now = Date.now();
  if (weightedRankCache && now - weightedRankCacheTimestamp < CACHE_TTL) {
    return weightedRankCache;
  }

  const mergeRemap = getMergeRemap();

  // Get all rankings grouped by figure
  const excludedKeys = new Set<string>();
  if (WEIGHTED_V3_EXCLUDED_LISTS.size > 0) {
    const excludedRows = await db
      .select({
        source: importLogs.source,
        sampleId: importLogs.sampleId,
        filename: importLogs.filename,
      })
      .from(importLogs)
      .where(inArray(importLogs.filename, Array.from(WEIGHTED_V3_EXCLUDED_LISTS)));
    for (const row of excludedRows) {
      excludedKeys.add(`${row.source}::${row.sampleId ?? ''}`);
    }
  }

  const allRankings = await db
    .select({
      figureId: rankings.figureId,
      source: rankings.source,
      sampleId: rankings.sampleId,
      rank: rankings.rank,
    })
    .from(rankings)
    .where(sql`${rankings.source} != 'pantheon'`);

  // Get unique model sources and their weights
  const modelSources = new Set<string>();
  for (const row of allRankings) {
    modelSources.add(row.source);
  }

  // Load V2/V3 lists and include their model sources
  const v2v3 = await loadV2V3Rankings(WEIGHTED_V3_EXCLUDED_LISTS);
  for (const source of v2v3.sources) {
    modelSources.add(source);
  }

  // Track max rank per source to normalize missing-rank penalty by list size
  const maxRankBySource = new Map<string, number>();
  for (const row of allRankings) {
    const current = maxRankBySource.get(row.source) || 0;
    if (row.rank > current) maxRankBySource.set(row.source, row.rank);
  }
  for (const [source, length] of v2v3.listLengths.entries()) {
    const current = maxRankBySource.get(source) || 0;
    if (length > current) maxRankBySource.set(source, length);
  }

  // Calculate total possible weight (sum of all model weights)
  // This is used to normalize across all figures
  const modelWeightsMap = new Map<string, number>();
  let totalPossibleWeight = 0;
  for (const source of modelSources) {
    const weight = getModelWeight(source);
    modelWeightsMap.set(source, weight);
    totalPossibleWeight += weight;
  }

  // Group rankings by figure and track which models ranked each figure
  const figureRankings = new Map<string, {
    sourcesWithRanks: Map<string, { sum: number; count: number }>;
  }>();

  for (const row of allRankings) {
    const mergedId = mergeRemap.get(row.figureId) || row.figureId;
    if (GROUP_EXCLUDE.has(mergedId)) continue;
    if (!figureRankings.has(mergedId)) {
      figureRankings.set(mergedId, { sourcesWithRanks: new Map() });
    }
    const figData = figureRankings.get(mergedId)!;

    if (!figData.sourcesWithRanks.has(row.source)) {
      figData.sourcesWithRanks.set(row.source, { sum: 0, count: 0 });
    }
    const sourceData = figData.sourcesWithRanks.get(row.source)!;
    sourceData.sum += row.rank;
    sourceData.count += 1;
  }

  // Fold V2/V3 ranks into per-source aggregates
  for (const [figureId, sourceMap] of v2v3.ranks.entries()) {
    if (!figureRankings.has(figureId)) {
      figureRankings.set(figureId, { sourcesWithRanks: new Map() });
    }
    const figData = figureRankings.get(figureId)!;
    for (const [source, rankData] of sourceMap.entries()) {
      if (!figData.sourcesWithRanks.has(source)) {
        figData.sourcesWithRanks.set(source, { sum: 0, count: 0 });
      }
      const sourceData = figData.sourcesWithRanks.get(source)!;
      sourceData.sum += rankData.sum;
      sourceData.count += rankData.count;
    }
  }

  // Compute weighted averages with imputed ranks for missing models
  const weightedAverages: Array<{ id: string; avgRank: number }> = [];

  for (const [figureId, figData] of figureRankings) {
    let weightedSum = 0;

    // Add actual rankings
    for (const [source, rankData] of figData.sourcesWithRanks) {
      const avgRankForSource = rankData.sum / rankData.count;
      const weight = modelWeightsMap.get(source) || 0.5;
      weightedSum += avgRankForSource * weight;
    }

    // Add imputed rankings for missing models (list-length aware)
    for (const [source, weight] of modelWeightsMap) {
      if (!figData.sourcesWithRanks.has(source)) {
        const maxRank = maxRankBySource.get(source) || 1000;
        weightedSum += (maxRank + 1) * weight;
      }
    }

    // Divide by total possible weight (not just actual weight)
    // This ensures figures with less coverage are penalized appropriately
    weightedAverages.push({
      id: figureId,
      avgRank: weightedSum / totalPossibleWeight,
    });
  }

  // Sort by weighted average rank
  weightedAverages.sort((a, b) => a.avgRank - b.avgRank);

  // Build lookup map: figure ID -> position (1-based)
  const lookup = new Map<string, number>();
  weightedAverages.forEach((fig, index) => {
    lookup.set(fig.id, index + 1);
  });

  weightedRankCache = lookup;
  weightedRankCacheTimestamp = now;
  return lookup;
}

async function getWeightedNormalizedRankLookup(): Promise<Map<string, number>> {
  const now = Date.now();
  if (weightedNormalizedRankCache && now - weightedNormalizedRankCacheTimestamp < CACHE_TTL) {
    return weightedNormalizedRankCache;
  }

  const mergeRemap = getMergeRemap();

  const allRankings = await db
    .select({
      figureId: rankings.figureId,
      source: rankings.source,
      rank: rankings.rank,
    })
    .from(rankings)
    .where(sql`${rankings.source} != 'pantheon'`);

  const modelSources = new Set<string>();
  const maxRankBySource = new Map<string, number>();
  const figureRankings = new Map<string, { sourcesWithRanks: Map<string, { sum: number; count: number }> }>();

  for (const row of allRankings) {
    modelSources.add(row.source);
    const currentMax = maxRankBySource.get(row.source) || 0;
    if (row.rank > currentMax) maxRankBySource.set(row.source, row.rank);

    const mergedId = mergeRemap.get(row.figureId) || row.figureId;
    if (GROUP_EXCLUDE.has(mergedId)) continue;

    if (!figureRankings.has(mergedId)) {
      figureRankings.set(mergedId, { sourcesWithRanks: new Map() });
    }
    const figData = figureRankings.get(mergedId)!;
    if (!figData.sourcesWithRanks.has(row.source)) {
      figData.sourcesWithRanks.set(row.source, { sum: 0, count: 0 });
    }
    const sourceData = figData.sourcesWithRanks.get(row.source)!;
    sourceData.sum += row.rank;
    sourceData.count += 1;
  }

  const v2v3 = await loadV2V3Rankings();
  for (const source of v2v3.sources) {
    modelSources.add(source);
  }
  for (const [source, length] of v2v3.listLengths.entries()) {
    const currentMax = maxRankBySource.get(source) || 0;
    if (length > currentMax) maxRankBySource.set(source, length);
  }

  for (const [figureId, sourceMap] of v2v3.ranks.entries()) {
    if (!figureRankings.has(figureId)) {
      figureRankings.set(figureId, { sourcesWithRanks: new Map() });
    }
    const figData = figureRankings.get(figureId)!;
    for (const [source, rankData] of sourceMap.entries()) {
      if (!figData.sourcesWithRanks.has(source)) {
        figData.sourcesWithRanks.set(source, { sum: 0, count: 0 });
      }
      const sourceData = figData.sourcesWithRanks.get(source)!;
      sourceData.sum += rankData.sum;
      sourceData.count += rankData.count;
    }
  }

  const modelWeightsMap = new Map<string, number>();
  let totalPossibleWeight = 0;
  for (const source of modelSources) {
    const weight = getModelWeight(source);
    modelWeightsMap.set(source, weight);
    totalPossibleWeight += weight;
  }

  const weightedAverages: Array<{ id: string; avgRank: number }> = [];

  for (const [figureId, figData] of figureRankings) {
    let weightedSum = 0;
    for (const [source, rankData] of figData.sourcesWithRanks) {
      const avgRankForSource = rankData.sum / rankData.count;
      const maxRank = maxRankBySource.get(source) || 1000;
      const denom = Math.max(1, maxRank - 1);
      const percentile = Math.min(1, Math.max(0, (avgRankForSource - 1) / denom));
      const weight = modelWeightsMap.get(source) || 0.5;
      weightedSum += percentile * weight;
    }

    for (const [source, weight] of modelWeightsMap) {
      if (!figData.sourcesWithRanks.has(source)) {
        weightedSum += 1 * weight;
      }
    }

    weightedAverages.push({
      id: figureId,
      avgRank: weightedSum / totalPossibleWeight,
    });
  }

  weightedAverages.sort((a, b) => a.avgRank - b.avgRank);
  const lookup = new Map<string, number>();
  weightedAverages.forEach((fig, index) => {
    lookup.set(fig.id, index + 1);
  });

  weightedNormalizedRankCache = lookup;
  weightedNormalizedRankCacheTimestamp = now;
  return lookup;
}

async function getWeightedRobustRankLookup(): Promise<Map<string, number>> {
  const now = Date.now();
  if (weightedRobustRankCache && now - weightedRobustRankCacheTimestamp < CACHE_TTL) {
    return weightedRobustRankCache;
  }

  const mergeRemap = getMergeRemap();

  const allRankings = await db
    .select({
      figureId: rankings.figureId,
      source: rankings.source,
      rank: rankings.rank,
    })
    .from(rankings)
    .where(sql`${rankings.source} != 'pantheon'`);

  const modelSources = new Set<string>();
  const maxRankByModel = new Map<string, number>();
  const figureRankings = new Map<string, { sourcesWithRanks: Map<string, { sum: number; count: number }> }>();

  for (const row of allRankings) {
    const canonical = getCanonicalModelId(row.source.toLowerCase());
    modelSources.add(canonical);
    const currentMax = maxRankByModel.get(canonical) || 0;
    if (row.rank > currentMax) maxRankByModel.set(canonical, row.rank);

    const mergedId = mergeRemap.get(row.figureId) || row.figureId;
    if (GROUP_EXCLUDE.has(mergedId)) continue;

    if (!figureRankings.has(mergedId)) {
      figureRankings.set(mergedId, { sourcesWithRanks: new Map() });
    }
    const figData = figureRankings.get(mergedId)!;
    if (!figData.sourcesWithRanks.has(canonical)) {
      figData.sourcesWithRanks.set(canonical, { sum: 0, count: 0 });
    }
    const sourceData = figData.sourcesWithRanks.get(canonical)!;
    sourceData.sum += row.rank;
    sourceData.count += 1;
  }

  const v2v3 = await loadV2V3Rankings();
  for (const source of v2v3.sources) {
    const canonical = getCanonicalModelId(source.toLowerCase());
    modelSources.add(canonical);
  }
  for (const [source, length] of v2v3.listLengths.entries()) {
    const canonical = getCanonicalModelId(source.toLowerCase());
    const currentMax = maxRankByModel.get(canonical) || 0;
    if (length > currentMax) maxRankByModel.set(canonical, length);
  }

  for (const [figureId, sourceMap] of v2v3.ranks.entries()) {
    if (!figureRankings.has(figureId)) {
      figureRankings.set(figureId, { sourcesWithRanks: new Map() });
    }
    const figData = figureRankings.get(figureId)!;
    for (const [source, rankData] of sourceMap.entries()) {
      const canonical = getCanonicalModelId(source.toLowerCase());
      if (!figData.sourcesWithRanks.has(canonical)) {
        figData.sourcesWithRanks.set(canonical, { sum: 0, count: 0 });
      }
      const sourceData = figData.sourcesWithRanks.get(canonical)!;
      sourceData.sum += rankData.sum;
      sourceData.count += rankData.count;
    }
  }

  const modelWeightsMap = new Map<string, number>();
  let totalPossibleWeight = 0;
  const globalMaxRank = Math.max(1, ...Array.from(maxRankByModel.values()));
  for (const source of modelSources) {
    const baseWeight = getV3ModelWeight(source);
    const maxRank = maxRankByModel.get(source) || globalMaxRank;
    const coveragePct = Math.min(1, Math.max(0, maxRank / globalMaxRank));
    const weight = baseWeight * Math.sqrt(coveragePct);
    modelWeightsMap.set(source, weight);
    totalPossibleWeight += weight;
  }

  const weightedAverages: Array<{ id: string; avgRank: number }> = [];

  for (const [figureId, figData] of figureRankings) {
    const perSource = Array.from(figData.sourcesWithRanks.entries()).map(([source, rankData]) => ({
      source,
      avg: rankData.sum / rankData.count,
    }));

    let weightedSum = 0;
    const present = new Set<string>();
    for (const { source, avg } of perSource) {
      present.add(source);
      const weight = modelWeightsMap.get(source) || 0.5;
      weightedSum += avg * weight;
    }

    // Missing models get list-length-aware penalty
    for (const [source, weight] of modelWeightsMap) {
      if (!present.has(source)) {
        const maxRank = maxRankByModel.get(source) || globalMaxRank;
        weightedSum += (maxRank + 1) * weight;
      }
    }

    const baseAvg = weightedSum / totalPossibleWeight;
    const coveragePct = present.size / Math.max(1, modelWeightsMap.size);
    const priorMean = (globalMaxRank + 1) / 2;
    const k = 5; // strength of shrinkage prior
    const shrinkage = k * (1 - coveragePct);
    const shrunkAvg = (baseAvg * totalPossibleWeight + priorMean * shrinkage) / (totalPossibleWeight + shrinkage);

    weightedAverages.push({
      id: figureId,
      avgRank: shrunkAvg,
    });
  }

  weightedAverages.sort((a, b) => a.avgRank - b.avgRank);
  const lookup = new Map<string, number>();
  weightedAverages.forEach((fig, index) => {
    lookup.set(fig.id, index + 1);
  });

  weightedRobustRankCache = lookup;
  weightedRobustRankCacheTimestamp = now;
  return lookup;
}

async function getV2RankLookup(): Promise<{ rankLookup: Map<string, number>; orderedIds: string[]; listCount: number; modelCount: number }> {
  const now = Date.now();
  if (v2RankCache && v2MetaCache && now - v2RankCacheTimestamp < CACHE_TTL) {
    return { rankLookup: v2RankCache, orderedIds: v2MetaCache.orderedIds, listCount: v2MetaCache.listCount, modelCount: v2MetaCache.modelCount };
  }

  const v2Path = path.join(process.cwd(), 'data', 'derived', 'v2-consensus.json');
  if (!fs.existsSync(v2Path)) {
    return { rankLookup: new Map(), orderedIds: [], listCount: 0, modelCount: 0 };
  }

  const payload = JSON.parse(fs.readFileSync(v2Path, 'utf8')) as {
    listCount: number;
    modelCount: number;
    figures: Array<{ id: string; avgRank: number }>;
  };

  const lookup = new Map<string, number>();
  const orderedIds: string[] = [];
  payload.figures.forEach((fig, index) => {
    lookup.set(fig.id, index + 1);
    orderedIds.push(fig.id);
  });

  v2RankCache = lookup;
  v2MetaCache = { listCount: payload.listCount, modelCount: payload.modelCount, orderedIds };
  v2RankCacheTimestamp = now;

  return { rankLookup: lookup, orderedIds, listCount: payload.listCount, modelCount: payload.modelCount };
}

async function getV3RankLookup(): Promise<{ rankLookup: Map<string, number>; orderedIds: string[]; listCount: number; modelCount: number } | null> {
  const now = Date.now();
  if (v3RankCache && v3MetaCache && now - v3RankCacheTimestamp < CACHE_TTL) {
    return { rankLookup: v3RankCache, orderedIds: v3MetaCache.orderedIds, listCount: v3MetaCache.listCount, modelCount: v3MetaCache.modelCount };
  }

  const v3Path = path.join(process.cwd(), 'data', 'derived', 'v3-consensus.json');
  if (!fs.existsSync(v3Path)) {
    return null;
  }

  const payload = JSON.parse(fs.readFileSync(v3Path, 'utf8')) as {
    listCount: number;
    modelCount: number;
    figures: Array<{ id: string; avgRank: number }>;
  };

  const lookup = new Map<string, number>();
  const orderedIds = payload.figures
    .sort((a, b) => a.avgRank - b.avgRank)
    .map((entry) => {
      lookup.set(entry.id, entry.avgRank);
      return entry.id;
    });

  v3RankCache = lookup;
  v3MetaCache = { listCount: payload.listCount, modelCount: payload.modelCount, orderedIds };
  v3RankCacheTimestamp = now;

  return { rankLookup: lookup, orderedIds, listCount: payload.listCount, modelCount: payload.modelCount };
}

async function getSourceRankLookup(source: string): Promise<Map<string, { avgRank: number; position: number }>> {
  const rows = await db
    .select({
      figureId: rankings.figureId,
      avgRank: sql<number>`avg(${rankings.rank})`,
    })
    .from(rankings)
    .where(eq(rankings.source, source))
    .groupBy(rankings.figureId)
    .orderBy(asc(sql`avg(${rankings.rank})`));

  const lookup = new Map<string, { avgRank: number; position: number }>();
  rows.forEach((row, index) => {
    lookup.set(row.figureId, { avgRank: Number(row.avgRank), position: index + 1 });
  });

  return lookup;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('mode');

  // Parse query params
  const domain = searchParams.get('domain');
  const era = searchParams.get('era');
  const region = searchParams.get('region');
  const search = searchParams.get('search');
  const modelSource = searchParams.get('modelSource');
  const weighted = searchParams.get('weighted') === 'true';
  const weighted2 = searchParams.get('weighted2') === 'true';
  const weighted3 = searchParams.get('weighted3') === 'true';
  const useV2 = searchParams.get('v2') === 'true';
  const useV3 = searchParams.get('v3') === 'true';
  const sortBy = searchParams.get('sortBy') || 'llmConsensusRank';
  const sortOrder = searchParams.get('sortOrder') || 'asc';
  const limit = parseInt(searchParams.get('limit') || '100');
  const offset = parseInt(searchParams.get('offset') || '0');

  try {
    if (mode === 'all') {
      const allFigures = await db
        .select({
          id: figures.id,
          name: figures.canonicalName,
          domain: figures.domain,
          era: figures.era,
          birthYear: figures.birthYear,
          deathYear: figures.deathYear,
          rank: figures.llmConsensusRank,
        })
        .from(figures)
        .orderBy(asc(figures.canonicalName));

      return NextResponse.json({
        figures: allFigures,
        total: allFigures.length,
      });
    }

    if (mode === 'minimal') {
      const id = searchParams.get('id');
      if (!id) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 });
      }

      const figure = await db.query.figures.findFirst({
        where: eq(figures.id, id),
        columns: {
          id: true,
          canonicalName: true,
          birthYear: true,
          deathYear: true,
          occupation: true,
          domain: true,
          era: true,
          regionSub: true,
          birthPolity: true,
          birthPlace: true,
          birthLat: true,
          birthLon: true,
          wikipediaSlug: true,
          wikipediaExtract: true,
          hpiRank: true,
          llmConsensusRank: true,
          varianceScore: true,
          pageviewsGlobal: true,
          ngramPercentile: true,
        },
      });

      if (!figure) {
        return NextResponse.json({ error: 'Figure not found' }, { status: 404 });
      }

      const allRankings = await db.query.rankings.findMany({
        where: eq(rankings.figureId, id),
      });

      const rankingsBySource = new Map<string, typeof allRankings[0]>();
      for (const r of allRankings) {
        if (!rankingsBySource.has(r.source)) {
          rankingsBySource.set(r.source, r);
        }
      }

      return NextResponse.json(
        {
          figure: {
            ...figure,
            _minimal: true,
          },
          rankings: Array.from(rankingsBySource.values()),
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          },
        }
      );
    }

    if (search) {
      const normalized = search.toLowerCase();
      const likeTerm = `%${normalized.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

      const filterConditions = [];
      if (domain) filterConditions.push(eq(figures.domain, domain));
      if (era) filterConditions.push(eq(figures.era, era));
      if (region) filterConditions.push(eq(figures.regionSub, region));
      const filterClause = filterConditions.length > 0
        ? (filterConditions.length === 1 ? filterConditions[0] : and(...filterConditions))
        : undefined;

      const lexicalRows = await db
        .select({
          id: figures.id,
          name: figures.canonicalName,
          occupation: figures.occupation,
          domain: figures.domain,
          era: figures.era,
          regionSub: figures.regionSub,
          regionMacro: figures.regionMacro,
          wikipediaExtract: figures.wikipediaExtract,
        })
        .from(figures)
        .where(
          filterClause
            ? and(
                filterClause,
                or(
                  sql`lower(${figures.canonicalName}) like ${likeTerm} escape '\\'`,
                  sql`lower(${figures.wikipediaExtract}) like ${likeTerm} escape '\\'`,
                  sql`lower(${figures.occupation}) like ${likeTerm} escape '\\'`,
                  sql`lower(${figures.domain}) like ${likeTerm} escape '\\'`,
                  sql`lower(${figures.era}) like ${likeTerm} escape '\\'`,
                  sql`lower(${figures.regionSub}) like ${likeTerm} escape '\\'`,
                  sql`lower(${figures.regionMacro}) like ${likeTerm} escape '\\'`
                )
              )
            : or(
                sql`lower(${figures.canonicalName}) like ${likeTerm} escape '\\'`,
                sql`lower(${figures.wikipediaExtract}) like ${likeTerm} escape '\\'`,
                sql`lower(${figures.occupation}) like ${likeTerm} escape '\\'`,
                sql`lower(${figures.domain}) like ${likeTerm} escape '\\'`,
                sql`lower(${figures.era}) like ${likeTerm} escape '\\'`,
                sql`lower(${figures.regionSub}) like ${likeTerm} escape '\\'`,
                sql`lower(${figures.regionMacro}) like ${likeTerm} escape '\\'`
              )
        )
        .limit(400);

      const lexicalScores = new Map<string, number>();
      const terms = normalized.split(/\s+/).filter(Boolean);
      for (const row of lexicalRows) {
        const name = row.name?.toLowerCase() || '';
        const occupation = row.occupation?.toLowerCase() || '';
        const rowDomain = row.domain?.toLowerCase() || '';
        const rowEra = row.era?.toLowerCase() || '';
        const regionSub = row.regionSub?.toLowerCase() || '';
        const regionMacro = row.regionMacro?.toLowerCase() || '';
        const extract = row.wikipediaExtract?.toLowerCase() || '';

        let score = 0;
        if (name.includes(normalized)) score += 3;
        if (occupation.includes(normalized)) score += 2;
        if (rowDomain.includes(normalized)) score += 1.5;
        if (rowEra.includes(normalized)) score += 1;
        if (regionSub.includes(normalized) || regionMacro.includes(normalized)) score += 1;
        if (extract.includes(normalized)) score += 0.5;

        for (const term of terms) {
          if (term.length < 3) continue;
          if (name.includes(term)) score += 1.5;
          if (occupation.includes(term)) score += 1;
          if (rowDomain.includes(term)) score += 0.5;
          if (extract.includes(term)) score += 0.25;
        }

        if (score > 0) lexicalScores.set(row.id, score);
      }

      const smartSearch = request.nextUrl.searchParams.get('smart') !== 'false';
      let semanticScores = new Map<string, number>();
      if (smartSearch && process.env.OPENAI_API_KEY) {
        try {
          const embeddingsIndex = loadFigureEmbeddings();
          if (embeddingsIndex) {
            const queryEmbedding = normalizeVector(await embedQuery(search));
            semanticScores = new Map(
              embeddingsIndex.figures.map((entry) => [entry.id, dot(entry.vector, queryEmbedding)])
            );
          }
        } catch (error) {
          console.warn('[search] Semantic search failed, using lexical only', error);
        }
      }

      const semanticMax = Math.max(0, ...semanticScores.values());
      const lexicalMax = Math.max(0, ...lexicalScores.values());
      const semanticWeight = semanticScores.size ? 0.7 : 0;
      const lexicalWeight = lexicalScores.size ? 0.3 : 1;

      const combinedScores = new Map<string, number>();
      const allIds = new Set<string>([...semanticScores.keys(), ...lexicalScores.keys()]);
      allIds.forEach((id) => {
        const semantic = semanticMax > 0 ? (semanticScores.get(id) || 0) / semanticMax : 0;
        const lexicalScore = lexicalMax > 0 ? (lexicalScores.get(id) || 0) / lexicalMax : 0;
        const combined = semantic * semanticWeight + lexicalScore * lexicalWeight;
        if (combined > 0) combinedScores.set(id, combined);
      });

      let rankedIds = Array.from(combinedScores.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);

      if (filterClause) {
        const filteredRows = await db
          .select({ id: figures.id })
          .from(figures)
          .where(filterClause);
        const allowed = new Set(filteredRows.map((row) => row.id));
        rankedIds = rankedIds.filter((id) => allowed.has(id));
      }

      const v2Data = useV2 ? await getV2RankLookup() : null;
      const v3Data = useV3 ? await getV3RankLookup() : null;
      if ((useV3 && v3Data) || (useV2 && v2Data)) {
        const allowed = new Set((useV3 && v3Data ? v3Data.orderedIds : v2Data?.orderedIds) || []);
        rankedIds = rankedIds.filter((id) => allowed.has(id));
      }

      const total = rankedIds.length;
      const pagedIds = rankedIds.slice(offset, offset + limit);

      if (pagedIds.length === 0) {
        const stats = weighted3
          ? await getWeightedV3Stats()
          : (weighted || weighted2)
            ? await getWeightedStats()
            : await getStats();
        return NextResponse.json({ figures: [], total, stats });
      }

      const results = await db
        .select()
        .from(figures)
        .where(inArray(figures.id, pagedIds));

      const rowsById = new Map(results.map((row) => [row.id, row]));
      const rankLookup = useV3
        ? (v3Data?.rankLookup || new Map())
        : useV2
          ? (v2Data?.rankLookup || new Map())
          : weighted3
            ? await getWeightedRobustRankLookup()
            : weighted2
              ? await getWeightedNormalizedRankLookup()
              : weighted
                ? await getWeightedRankLookup()
                : await getLLMRankLookup();

      const v2DisplayRank = useV2 && v2Data
        ? new Map(v2Data.orderedIds.map((id, idx) => [id, idx + 1]))
        : null;
      const v3DisplayRank = useV3 && v3Data
        ? new Map(v3Data.orderedIds.map((id, idx) => [id, idx + 1]))
        : null;
      const sourceLookup = modelSource ? await getSourceRankLookup(modelSource) : null;
      const badgeData = await getBadgeData();
      const modelFavoriteCaps = await getModelFavoriteCaps();

      const figureRows: FigureRow[] = pagedIds
        .map((id) => rowsById.get(id))
        .filter(Boolean)
        .map((fig) => ({
          id: fig!.id,
          name: fig!.canonicalName,
          birthYear: fig!.birthYear,
          domain: fig!.domain,
          era: fig!.era,
          regionSub: fig!.regionSub,
          hpiRank: fig!.hpiRank,
          llmRank: sourceLookup
            ? (sourceLookup.get(fig!.id)?.position || null)
            : useV3
              ? (v3DisplayRank?.get(fig!.id) || null)
              : useV2
                ? (v2DisplayRank?.get(fig!.id) || null)
                : (rankLookup.get(fig!.id) || null),
          llmConsensusRank: fig!.llmConsensusRank,
          varianceScore: fig!.varianceScore,
          pageviews: fig!.pageviewsGlobal ?? fig!.pageviews2025,
          varianceLevel: getVarianceLevel(fig!.varianceScore),
          badges: calculateBadges(fig!.id, fig!.llmConsensusRank, fig!.hpiRank, fig!.pageviewsGlobal ?? fig!.pageviews2025, badgeData.get(fig!.id) || [], fig!.varianceScore, modelFavoriteCaps, fig!.pageviews2025, fig!.ngramPercentile, fig!.era, fig!.domain),
          wikipediaSlug: fig!.wikipediaSlug,
        }));

      const stats = weighted3
        ? await getWeightedV3Stats()
        : (weighted || weighted2)
          ? await getWeightedStats()
          : await getStats();
      const effectiveStats = useV3 && v3Data
        ? { totalLists: v3Data.listCount, totalModels: v3Data.modelCount }
        : useV2 && v2Data
          ? { totalLists: v2Data.listCount, totalModels: v2Data.modelCount }
        : stats;
      const response: FiguresResponse = {
        figures: figureRows,
        total,
        stats: effectiveStats,
      };

      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    }

    // Build conditions array
    const conditions = [];

    if (domain) {
      conditions.push(eq(figures.domain, domain));
    }

    if (era) {
      conditions.push(eq(figures.era, era));
    }

    if (region) {
      conditions.push(eq(figures.regionSub, region));
    }

    if (search) {
      conditions.push(
        like(figures.canonicalName, `%${search}%`)
      );
    }

    // Determine sort column
    // Build where clause
    const whereClause = conditions.length > 0
      ? (conditions.length === 1 ? conditions[0] : and(...conditions))
      : undefined;

    if (useV3 || useV2) {
      const v3Data = useV3 ? await getV3RankLookup() : null;
      const v2Data = !useV3 ? await getV2RankLookup() : null;
      const data = useV3 ? v3Data : v2Data;
      if (!data) {
        return NextResponse.json(
          { error: useV3 ? 'V3 consensus data not found. Run scripts/build-v3-consensus.ts first.' : 'V2 consensus data not found. Run scripts/build-v2-consensus.ts first.' },
          { status: 400 }
        );
      }
      let orderedIds = data.orderedIds;
      const displayRank = new Map(orderedIds.map((id, idx) => [id, idx + 1]));

      if (whereClause) {
        const allowedRows = await db
          .select({ id: figures.id })
          .from(figures)
          .where(whereClause);
        const allowed = new Set(allowedRows.map((row) => row.id));
        orderedIds = orderedIds.filter((id) => allowed.has(id));
      }

      const total = orderedIds.length;
      const pagedIds = orderedIds.slice(offset, offset + limit);

      if (pagedIds.length === 0) {
        return NextResponse.json({ figures: [], total, stats: { totalLists: data.listCount, totalModels: data.modelCount } });
      }

      const results = await db
        .select()
        .from(figures)
        .where(inArray(figures.id, pagedIds));

      const rowsById = new Map(results.map((row) => [row.id, row]));
      const badgeData = await getBadgeData();
      const modelFavoriteCaps = await getModelFavoriteCaps();

      const figureRows: FigureRow[] = pagedIds
        .map((id) => rowsById.get(id))
        .filter(Boolean)
        .map((fig) => ({
          id: fig!.id,
          name: fig!.canonicalName,
          birthYear: fig!.birthYear,
          domain: fig!.domain,
          era: fig!.era,
          regionSub: fig!.regionSub,
          hpiRank: fig!.hpiRank,
          llmRank: displayRank.get(fig!.id) || null,
          llmConsensusRank: fig!.llmConsensusRank,
          varianceScore: fig!.varianceScore,
          pageviews: fig!.pageviewsGlobal ?? fig!.pageviews2025,
          varianceLevel: getVarianceLevel(fig!.varianceScore),
          badges: calculateBadges(fig!.id, fig!.llmConsensusRank, fig!.hpiRank, fig!.pageviewsGlobal ?? fig!.pageviews2025, badgeData.get(fig!.id) || [], fig!.varianceScore, modelFavoriteCaps, fig!.pageviews2025, fig!.ngramPercentile, fig!.era, fig!.domain),
          wikipediaSlug: fig!.wikipediaSlug,
        }));

      const response: FiguresResponse = {
        figures: figureRows,
        total,
        stats: { totalLists: data.listCount, totalModels: data.modelCount },
      };

      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    }

    if ((weighted || weighted2 || weighted3) && (sortBy === 'llmRank' || sortBy === 'llmConsensusRank')) {
      const rankLookup = weighted3
        ? await getWeightedRobustRankLookup()
        : weighted2
          ? await getWeightedNormalizedRankLookup()
          : await getWeightedRankLookup();
      let orderedIds = Array.from(rankLookup.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => id);

      if (whereClause) {
        const allowedRows = await db
          .select({ id: figures.id })
          .from(figures)
          .where(whereClause);
        const allowed = new Set(allowedRows.map((row) => row.id));
        orderedIds = orderedIds.filter((id) => allowed.has(id));
      }

      const total = orderedIds.length;
      const pagedIds = orderedIds.slice(offset, offset + limit);

      if (pagedIds.length === 0) {
        const stats = weighted3 ? await getWeightedV3Stats() : await getWeightedStats();
        return NextResponse.json({ figures: [], total, stats });
      }

      const results = await db
        .select()
        .from(figures)
        .where(inArray(figures.id, pagedIds));

      const rowsById = new Map(results.map((row) => [row.id, row]));
      const badgeData = await getBadgeData();
      const modelFavoriteCaps = await getModelFavoriteCaps();

      const figureRows: FigureRow[] = pagedIds
        .map((id) => rowsById.get(id))
        .filter(Boolean)
        .map((fig) => ({
          id: fig!.id,
          name: fig!.canonicalName,
          birthYear: fig!.birthYear,
          domain: fig!.domain,
          era: fig!.era,
          regionSub: fig!.regionSub,
          hpiRank: fig!.hpiRank,
          llmRank: rankLookup.get(fig!.id) || null,
          llmConsensusRank: fig!.llmConsensusRank,
          varianceScore: fig!.varianceScore,
          pageviews: fig!.pageviewsGlobal ?? fig!.pageviews2025,
          varianceLevel: getVarianceLevel(fig!.varianceScore),
          badges: calculateBadges(fig!.id, fig!.llmConsensusRank, fig!.hpiRank, fig!.pageviewsGlobal ?? fig!.pageviews2025, badgeData.get(fig!.id) || [], fig!.varianceScore, modelFavoriteCaps, fig!.pageviews2025, fig!.ngramPercentile, fig!.era, fig!.domain),
          wikipediaSlug: fig!.wikipediaSlug,
        }));

      const stats = weighted3 ? await getWeightedV3Stats() : await getWeightedStats();
      const response: FiguresResponse = {
        figures: figureRows,
        total,
        stats,
      };

      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    }

    // Get total count with filters
    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(figures)
      .where(whereClause);
    const countResult = await countQuery;
    const total = countResult[0].count;

    // For model-specific ranking, compute in-memory sorted results
    if (modelSource) {
      const sourceLookup = await getSourceRankLookup(modelSource);
      const allFigures = await db
        .select()
        .from(figures)
        .where(whereClause);

      const getSortValue = (fig: typeof figures.$inferSelect) => {
        if (sortBy === 'llmRank' || sortBy === 'llmConsensusRank') {
          return sourceLookup.get(fig.id)?.avgRank ?? null;
        }
        if (sortBy === 'hpiRank') return fig.hpiRank ?? null;
        if (sortBy === 'varianceScore') return fig.varianceScore ?? null;
        if (sortBy === 'name') return fig.canonicalName ?? null;
        if (sortBy === 'domain') return fig.domain ?? null;
        if (sortBy === 'era') return fig.era ?? null;
        if (sortBy === 'regionSub') return fig.regionSub ?? null;
        if (sortBy === 'pageviews') return fig.pageviewsGlobal ?? fig.pageviews2025 ?? null;
        return sourceLookup.get(fig.id)?.avgRank ?? null;
      };

      const sorted = [...allFigures].sort((a, b) => {
        const aVal = getSortValue(a);
        const bVal = getSortValue(b);

        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return 1;
        if (bVal === null) return -1;

        if (typeof aVal === 'string' || typeof bVal === 'string') {
          const cmp = String(aVal).localeCompare(String(bVal));
          return sortOrder === 'desc' ? -cmp : cmp;
        }
        const diff = Number(aVal) - Number(bVal);
        return sortOrder === 'desc' ? -diff : diff;
      });

      const paged = sorted.slice(offset, offset + limit);

      // Get badge data for badge calculation
      const badgeData = await getBadgeData();
      const modelFavoriteCaps = await getModelFavoriteCaps();

      const figureRows: FigureRow[] = paged.map((fig) => ({
        id: fig.id,
        name: fig.canonicalName,
        birthYear: fig.birthYear,
        domain: fig.domain,
        era: fig.era,
        regionSub: fig.regionSub,
        hpiRank: fig.hpiRank,
        llmRank: sourceLookup.get(fig.id)?.position || null,
        llmConsensusRank: fig.llmConsensusRank,
        varianceScore: fig.varianceScore,
        pageviews: fig.pageviewsGlobal ?? fig.pageviews2025,
        varianceLevel: getVarianceLevel(fig.varianceScore),
        badges: calculateBadges(fig.id, fig.llmConsensusRank, fig.hpiRank, fig.pageviewsGlobal ?? fig.pageviews2025, badgeData.get(fig.id) || [], fig.varianceScore, modelFavoriteCaps, fig.pageviews2025, fig.ngramPercentile, fig.era, fig.domain),
        wikipediaSlug: fig.wikipediaSlug,
      }));

      const stats = weighted3
        ? await getWeightedV3Stats()
        : (weighted || weighted2)
          ? await getWeightedStats()
          : await getStats();
      const response: FiguresResponse = {
        figures: figureRows,
        total,
        stats,
      };

      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    }

    // Default: consensus sorting
    const sortColumn = {
      hpiRank: figures.hpiRank,
      llmConsensusRank: figures.llmConsensusRank,
      llmRank: figures.llmConsensusRank, // Sort by consensus rank for llmRank column
      varianceScore: figures.varianceScore,
      name: figures.canonicalName,
      domain: figures.domain,
      era: figures.era,
      regionSub: figures.regionSub,
      pageviews: figures.pageviewsGlobal,
    }[sortBy] || figures.llmConsensusRank;

    const sortFn = sortOrder === 'desc' ? desc : asc;

    // For llmRank sorting, we need to handle NULLs specially (put them at the end)
    const isLlmSort = sortBy === 'llmRank' || sortBy === 'llmConsensusRank';

    // Get filtered results with sorting
    // For LLM rank sorting, put NULLs at the end
    let results;
    if (isLlmSort && sortOrder === 'asc') {
      results = await db
        .select()
        .from(figures)
        .where(whereClause)
        .orderBy(
          sql`CASE WHEN ${figures.llmConsensusRank} IS NULL THEN 1 ELSE 0 END`,
          asc(figures.llmConsensusRank)
        )
        .limit(limit)
        .offset(offset);
    } else if (isLlmSort && sortOrder === 'desc') {
      results = await db
        .select()
        .from(figures)
        .where(whereClause)
        .orderBy(
          sql`CASE WHEN ${figures.llmConsensusRank} IS NULL THEN 1 ELSE 0 END`,
          desc(figures.llmConsensusRank)
        )
        .limit(limit)
        .offset(offset);
    } else {
      results = await db
        .select()
        .from(figures)
        .where(whereClause)
        .orderBy(sortFn(sortColumn))
        .limit(limit)
        .offset(offset);
    }

    // Get rank lookup (weighted or regular) and badge data
    const rankLookup = weighted
      ? await getWeightedRankLookup()
      : await getLLMRankLookup();
    const badgeData = await getBadgeData();
    const modelFavoriteCaps = await getModelFavoriteCaps();

    // If weighted mode and sorting by LLM rank, re-sort results by weighted rank
    let finalResults = results;
    if (weighted && (sortBy === 'llmRank' || sortBy === 'llmConsensusRank')) {
      finalResults = [...results].sort((a, b) => {
        const aRank = rankLookup.get(a.id) ?? 99999;
        const bRank = rankLookup.get(b.id) ?? 99999;
        return sortOrder === 'desc' ? bRank - aRank : aRank - bRank;
      });
    }

    // Transform to FigureRow with LLM rank and badges
    const figureRows: FigureRow[] = finalResults.map((fig) => ({
      id: fig.id,
      name: fig.canonicalName,
      birthYear: fig.birthYear,
      domain: fig.domain,
      era: fig.era,
      regionSub: fig.regionSub,
      hpiRank: fig.hpiRank,
      llmRank: rankLookup.get(fig.id) || null,
      llmConsensusRank: fig.llmConsensusRank,
      varianceScore: fig.varianceScore,
      pageviews: fig.pageviewsGlobal ?? fig.pageviews2025,
      varianceLevel: getVarianceLevel(fig.varianceScore),
      badges: calculateBadges(fig.id, fig.llmConsensusRank, fig.hpiRank, fig.pageviewsGlobal ?? fig.pageviews2025, badgeData.get(fig.id) || [], fig.varianceScore, modelFavoriteCaps, fig.pageviews2025, fig.ngramPercentile, fig.era, fig.domain),
      wikipediaSlug: fig.wikipediaSlug,
    }));

    const stats = weighted3
      ? await getWeightedV3Stats()
      : weighted
        ? await getWeightedStats()
        : await getStats();
    const response: FiguresResponse = {
      figures: figureRows,
      total,
      stats,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error fetching figures:', err.message, err.stack);
    return NextResponse.json(
      { error: 'Failed to fetch figures', detail: err.message },
      { status: 500 }
    );
  }
}

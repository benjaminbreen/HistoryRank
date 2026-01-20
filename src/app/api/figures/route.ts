import { NextRequest, NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { asc, desc, like, eq, sql, isNotNull, and } from 'drizzle-orm';
import { getVarianceLevel } from '@/types';
import type { FigureRow, FiguresResponse, BadgeType } from '@/types';

export const runtime = 'nodejs';

// Cache for LLM rank lookup
let llmRankCache: Map<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

// Cache for weighted rank lookup
let weightedRankCache: Map<string, number> | null = null;
let weightedRankCacheTimestamp = 0;

// Model quality weights based on automated + LLM assessment
// Higher = more reliable/higher quality lists
// Weights derived from: pattern collapse severity, duplicate rates, LLM qualitative scores
// Keys are exact source names from the database (lowercase)
const MODEL_WEIGHTS: Record<string, number> = {
  // Tier S - Excellent (weight 1.0)
  'claude-opus-4.5': 1.0,
  'gpt-5.2-thinking': 1.0,

  // Tier A - Strong (weight 0.8-0.85)
  'claude-sonnet-4.5': 0.85,
  'gemini-flash-3-preview': 0.80,
  'gemini-pro-3': 0.75,

  // Tier B - Usable (weight 0.6-0.7)
  'grok-4': 0.70,
  'grok-4.1-fast': 0.60,

  // Tier C - Problematic (weight 0.2-0.4)
  'deepseek-v3.2': 0.40,       // High variance, some lists broken with K-pop
  'qwen3-235b-a22b': 0.25,     // Looping bug, Socrates 27x
  'glm-4.7': 0.20,             // 512-sequence sports collapse

  // Tier F - Severe issues (weight 0.15)
  'mistral-large-3': 0.15,     // 328-571 pattern collapse
};

// Cache for stats
let statsCache: { totalLists: number; totalModels: number } | null = null;
let statsCacheTimestamp = 0;

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

async function getWeightedRankLookup(): Promise<Map<string, number>> {
  const now = Date.now();
  if (weightedRankCache && now - weightedRankCacheTimestamp < CACHE_TTL) {
    return weightedRankCache;
  }

  // Imputed rank for figures not ranked by a model (outside top 1000)
  const IMPUTED_RANK = 1001;

  // Get all rankings grouped by figure
  const allRankings = await db
    .select({
      figureId: rankings.figureId,
      source: rankings.source,
      rank: rankings.rank,
    })
    .from(rankings)
    .where(sql`${rankings.source} != 'pantheon'`);

  // Get unique model sources and their weights
  const modelSources = new Set<string>();
  for (const row of allRankings) {
    modelSources.add(row.source);
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
    if (!figureRankings.has(row.figureId)) {
      figureRankings.set(row.figureId, { sourcesWithRanks: new Map() });
    }
    const figData = figureRankings.get(row.figureId)!;

    if (!figData.sourcesWithRanks.has(row.source)) {
      figData.sourcesWithRanks.set(row.source, { sum: 0, count: 0 });
    }
    const sourceData = figData.sourcesWithRanks.get(row.source)!;
    sourceData.sum += row.rank;
    sourceData.count += 1;
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

    // Add imputed rankings for missing models
    for (const [source, weight] of modelWeightsMap) {
      if (!figData.sourcesWithRanks.has(source)) {
        weightedSum += IMPUTED_RANK * weight;
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

  // Parse query params
  const domain = searchParams.get('domain');
  const era = searchParams.get('era');
  const region = searchParams.get('region');
  const search = searchParams.get('search');
  const modelSource = searchParams.get('modelSource');
  const weighted = searchParams.get('weighted') === 'true';
  const sortBy = searchParams.get('sortBy') || 'llmConsensusRank';
  const sortOrder = searchParams.get('sortOrder') || 'asc';
  const limit = parseInt(searchParams.get('limit') || '100');
  const offset = parseInt(searchParams.get('offset') || '0');

  try {
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

      const stats = await getStats();
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

    const stats = await getStats();
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

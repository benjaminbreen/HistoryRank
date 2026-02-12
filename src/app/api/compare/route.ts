import { NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { ne } from 'drizzle-orm';
import { SOURCE_LABELS } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

interface CoverageDistribution {
  modelCount: number;
  figureCount: number;
  percentage: number;
}

interface ModelReach {
  source: string;
  label: string;
  uniqueFigures: number;
  uniqueOnlyFigures: number;
  totalRankings: number;
  listCount: number;
}

interface ConsensusByTier {
  tier: string;
  rankRange: string;
  figureCount: number;
  avgModelCoverage: number;
  avgVariance: number;
  highCoveragePercent: number;
}

interface VarianceDistribution {
  bucket: string;
  count: number;
  percentage: number;
}

interface KeyFinding {
  type: 'warning' | 'success' | 'info';
  title: string;
  description: string;
  metric?: string;
}

export interface InsightsResponse {
  totalFigures: number;
  totalRankings: number;
  totalModels: number;
  totalLists: number;
  fullCoverageFigures: number;
  avgModelCoverage: number;
  coverageDistribution: CoverageDistribution[];
  modelReach: ModelReach[];
  consensusByTier: ConsensusByTier[];
  varianceDistribution: VarianceDistribution[];
  keyFindings: KeyFinding[];
}

interface FigureReference {
  id: string;
  name: string;
  rank: number;
}

interface OutlierReference {
  id: string;
  name: string;
  diff: number;
  modelRank: number;
  consensusRank: number;
  direction: 'higher' | 'lower';
}

interface ModelStats {
  source: string;
  label: string;
  figureCount: number;
  sampleCount: number;
  avgRank: number;
  topPicks: FigureReference[];
  outliers: OutlierReference[];
  domainBias: Array<{ domain: string; avgRank: number; diff: number; figureCount: number }>;
  eraBias: Array<{ era: string; avgRank: number; diff: number; figureCount: number }>;
  consistency: number;
  consistencyRank: number;
  avgCorrelation: number;
  correlationRank: number;
  distinctiveTraits: string[];
}

interface ControversialFigure {
  id: string;
  name: string;
  domain: string | null;
  era: string | null;
  birthYear: number | null;
  varianceScore: number;
  modelRanks: Array<{ source: string; label: string; rank: number }>;
}

interface PairwiseCorrelation {
  source1: string;
  source2: string;
  correlation: number;
  commonFigures: number;
}

interface DomainBreakdown {
  domain: string;
  models: Array<{ source: string; label: string; avgRank: number }>;
}

interface EraBreakdown {
  era: string;
  models: Array<{ source: string; label: string; avgRank: number }>;
}

export interface LLMComparisonResponse {
  models: ModelStats[];
  correlationMatrix: PairwiseCorrelation[];
  controversialFigures: ControversialFigure[];
  domainBreakdown: DomainBreakdown[];
  eraBreakdown: EraBreakdown[];
}

interface GeoRegionStat {
  region: string;
  modelCount: number;
  baselineCount: number;
  modelPct: number;
  baselinePct: number;
  diffPct: number;
  overIndex: number | null;
  zScore: number;
}

interface GeoBiasModel {
  source: string;
  label: string;
  sampleSize: number;
  listCount: number;
  jsDivergence: number;
  regions: GeoRegionStat[];
  topPositive: Array<{ region: string; diffPct: number; modelPct: number; baselinePct: number }>;
  topNegative: Array<{ region: string; diffPct: number; modelPct: number; baselinePct: number }>;
}

export interface GeoBiasResponse {
  topN: number;
  totalModels: number;
  baselineSampleSize: number;
  regions: string[];
  baseline: Array<{ region: string; count: number; pct: number }>;
  regionCentroids: Array<{ region: string; lat: number; lon: number; sampleCount: number }>;
  models: GeoBiasModel[];
}

function incrementCount(counter: Map<string, number>, key: string) {
  counter.set(key, (counter.get(key) || 0) + 1);
}

function getBirthRegion(fig: { regionSub: string | null; regionMacro: string | null }): string | null {
  const raw = (fig.regionSub || fig.regionMacro || '').trim();
  return raw.length > 0 ? raw : null;
}

function twoProportionZ(countModel: number, nModel: number, countBase: number, nBase: number): number {
  if (nModel <= 0 || nBase <= 0) return 0;
  const pModel = countModel / nModel;
  const pBase = countBase / nBase;
  const pooled = (countModel + countBase) / (nModel + nBase);
  const se = Math.sqrt(pooled * (1 - pooled) * ((1 / nModel) + (1 / nBase)));
  if (!Number.isFinite(se) || se === 0) return 0;
  return (pModel - pBase) / se;
}

function jensenShannonDivergence(p: number[], q: number[]): number {
  const epsilon = 1e-12;
  const normalize = (arr: number[]) => {
    const adjusted = arr.map((v) => Math.max(v, epsilon));
    const sum = adjusted.reduce((acc, v) => acc + v, 0);
    return adjusted.map((v) => v / sum);
  };
  const pNorm = normalize(p);
  const qNorm = normalize(q);
  const m = pNorm.map((v, i) => (v + qNorm[i]) / 2);
  const kl = (a: number[], b: number[]) => a.reduce((acc, v, i) => acc + v * Math.log2(v / b[i]), 0);
  return 0.5 * kl(pNorm, m) + 0.5 * kl(qNorm, m);
}

function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const n = x.length;

  const rankArray = (arr: number[]) => {
    const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    sorted.forEach((item, rank) => {
      ranks[item.i] = rank + 1;
    });
    return ranks;
  };

  const xRanks = rankArray(x);
  const yRanks = rankArray(y);

  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = xRanks[i] - yRanks[i];
    sumD2 += d * d;
  }

  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

async function getGeoBias(): Promise<GeoBiasResponse> {
  const topN = 500;
  const [allRankings, allFigures] = await Promise.all([
    db
      .select()
      .from(rankings)
      .where(ne(rankings.source, 'pantheon')),
    db.select().from(figures),
  ]);

  const figureMap = new Map(allFigures.map((f) => [f.id, f]));
  const sourceFigureRanks = new Map<string, Map<string, { sum: number; count: number }>>();
  const sourceSampleIds = new Map<string, Set<string>>();

  for (const row of allRankings) {
    if (!sourceFigureRanks.has(row.source)) {
      sourceFigureRanks.set(row.source, new Map());
      sourceSampleIds.set(row.source, new Set());
    }
    const figureRankMap = sourceFigureRanks.get(row.source)!;
    if (!figureRankMap.has(row.figureId)) {
      figureRankMap.set(row.figureId, { sum: 0, count: 0 });
    }
    const current = figureRankMap.get(row.figureId)!;
    current.sum += row.rank;
    current.count += 1;
    if (row.sampleId) sourceSampleIds.get(row.source)!.add(row.sampleId);
  }

  const baselineCounts = new Map<string, number>();
  let baselineSampleSize = 0;
  const baselineRanked = allFigures
    .filter((f) => f.llmConsensusRank !== null)
    .sort((a, b) => (a.llmConsensusRank ?? 999999) - (b.llmConsensusRank ?? 999999));

  for (const fig of baselineRanked) {
    if (baselineSampleSize >= topN) break;
    const region = getBirthRegion(fig);
    if (!region) continue;
    incrementCount(baselineCounts, region);
    baselineSampleSize += 1;
  }

  const baselineRows = Array.from(baselineCounts.entries())
    .map(([region, count]) => ({
      region,
      count,
      pct: baselineSampleSize > 0 ? (count / baselineSampleSize) * 100 : 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  const allRegions = new Set(baselineRows.map((entry) => entry.region));
  const modelRaw = Array.from(sourceFigureRanks.entries()).map(([source, figureRankMap]) => {
    const ranked = Array.from(figureRankMap.entries())
      .map(([figureId, stats]) => ({ figureId, avgRank: stats.sum / stats.count }))
      .sort((a, b) => a.avgRank - b.avgRank);

    const counts = new Map<string, number>();
    let sampleSize = 0;
    for (const entry of ranked) {
      if (sampleSize >= topN) break;
      const fig = figureMap.get(entry.figureId);
      if (!fig) continue;
      const region = getBirthRegion(fig);
      if (!region) continue;
      incrementCount(counts, region);
      sampleSize += 1;
    }

    for (const region of counts.keys()) {
      allRegions.add(region);
    }

    return {
      source,
      label: SOURCE_LABELS[source] || source,
      counts,
      sampleSize,
      listCount: sourceSampleIds.get(source)?.size || 1,
    };
  });

  const regions = Array.from(allRegions).sort((a, b) => {
    const aPct = baselineSampleSize > 0 ? ((baselineCounts.get(a) || 0) / baselineSampleSize) : 0;
    const bPct = baselineSampleSize > 0 ? ((baselineCounts.get(b) || 0) / baselineSampleSize) : 0;
    if (aPct !== bPct) return bPct - aPct;
    return a.localeCompare(b);
  });

  const baselineProbVector = regions.map((region) =>
    baselineSampleSize > 0 ? ((baselineCounts.get(region) || 0) / baselineSampleSize) : 0
  );

  const centroidAccumulator = new Map<string, { latSum: number; lonSum: number; count: number }>();
  for (const fig of allFigures) {
    const region = getBirthRegion(fig);
    if (!region || !allRegions.has(region)) continue;
    const lat = typeof fig.birthLat === 'number' ? fig.birthLat : null;
    const lon = typeof fig.birthLon === 'number' ? fig.birthLon : null;
    if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!centroidAccumulator.has(region)) {
      centroidAccumulator.set(region, { latSum: 0, lonSum: 0, count: 0 });
    }
    const current = centroidAccumulator.get(region)!;
    current.latSum += lat;
    current.lonSum += lon;
    current.count += 1;
  }

  const regionCentroids = regions
    .map((region) => {
      const agg = centroidAccumulator.get(region);
      if (!agg || agg.count === 0) return null;
      return {
        region,
        lat: agg.latSum / agg.count,
        lon: agg.lonSum / agg.count,
        sampleCount: agg.count,
      };
    })
    .filter((entry): entry is { region: string; lat: number; lon: number; sampleCount: number } => entry !== null);

  const models: GeoBiasModel[] = modelRaw.map((model) => {
    const regionStats: GeoRegionStat[] = regions.map((region) => {
      const modelCount = model.counts.get(region) || 0;
      const baselineCount = baselineCounts.get(region) || 0;
      const modelPct = model.sampleSize > 0 ? (modelCount / model.sampleSize) * 100 : 0;
      const baselinePct = baselineSampleSize > 0 ? (baselineCount / baselineSampleSize) * 100 : 0;
      const diffPct = modelPct - baselinePct;
      const overIndex = baselinePct > 0 ? (diffPct / baselinePct) : null;
      const zScore = twoProportionZ(modelCount, model.sampleSize, baselineCount, baselineSampleSize);
      return {
        region,
        modelCount,
        baselineCount,
        modelPct,
        baselinePct,
        diffPct,
        overIndex: overIndex !== null && Number.isFinite(overIndex) ? overIndex : null,
        zScore: Number.isFinite(zScore) ? zScore : 0,
      };
    });

    const modelProbVector = regions.map((region) =>
      model.sampleSize > 0 ? ((model.counts.get(region) || 0) / model.sampleSize) : 0
    );
    const jsDivergence = jensenShannonDivergence(modelProbVector, baselineProbVector);

    const topPositive = [...regionStats]
      .sort((a, b) => b.diffPct - a.diffPct)
      .filter((entry) => entry.diffPct > 0)
      .slice(0, 3)
      .map((entry) => ({
        region: entry.region,
        diffPct: entry.diffPct,
        modelPct: entry.modelPct,
        baselinePct: entry.baselinePct,
      }));

    const topNegative = [...regionStats]
      .sort((a, b) => a.diffPct - b.diffPct)
      .filter((entry) => entry.diffPct < 0)
      .slice(0, 3)
      .map((entry) => ({
        region: entry.region,
        diffPct: entry.diffPct,
        modelPct: entry.modelPct,
        baselinePct: entry.baselinePct,
      }));

    return {
      source: model.source,
      label: model.label,
      sampleSize: model.sampleSize,
      listCount: model.listCount,
      jsDivergence: Number.isFinite(jsDivergence) ? jsDivergence : 0,
      regions: regionStats,
      topPositive,
      topNegative,
    };
  });

  models.sort((a, b) => b.jsDivergence - a.jsDivergence);

  return {
    topN,
    totalModels: models.length,
    baselineSampleSize,
    regions,
    baseline: baselineRows,
    regionCentroids,
    models,
  };
}

async function getInsights(): Promise<InsightsResponse> {
  const allRankings = await db
    .select()
    .from(rankings)
    .where(ne(rankings.source, 'pantheon'));

  const allFigures = await db.select().from(figures);
  const figureMap = new Map(allFigures.map(f => [f.id, f]));

  const sources = [...new Set(allRankings.map(r => r.source))].sort();
  const totalModels = sources.length;

  const sourceStats = new Map<string, { figures: Set<string>; samples: Set<string>; total: number }>();
  for (const source of sources) {
    sourceStats.set(source, { figures: new Set(), samples: new Set(), total: 0 });
  }

  const figureCoverage = new Map<string, Set<string>>();

  for (const r of allRankings) {
    const stats = sourceStats.get(r.source)!;
    stats.figures.add(r.figureId);
    if (r.sampleId) stats.samples.add(r.sampleId);
    stats.total++;

    if (!figureCoverage.has(r.figureId)) {
      figureCoverage.set(r.figureId, new Set());
    }
    figureCoverage.get(r.figureId)!.add(r.source);
  }

  const coverageCounts = new Map<number, number>();
  for (let i = 1; i <= totalModels; i++) {
    coverageCounts.set(i, 0);
  }

  let totalCoverage = 0;
  for (const sourcesSet of figureCoverage.values()) {
    const count = sourcesSet.size;
    coverageCounts.set(count, (coverageCounts.get(count) || 0) + 1);
    totalCoverage += count;
  }

  const totalFiguresRanked = figureCoverage.size;
  const coverageDistribution: CoverageDistribution[] = [];
  for (let i = totalModels; i >= 1; i--) {
    const count = coverageCounts.get(i) || 0;
    coverageDistribution.push({
      modelCount: i,
      figureCount: count,
      percentage: Math.round((count / totalFiguresRanked) * 100),
    });
  }

  const modelReach: ModelReach[] = [];
  for (const source of sources) {
    const stats = sourceStats.get(source)!;
    let uniqueOnly = 0;
    for (const figureId of stats.figures) {
      const figSources = figureCoverage.get(figureId);
      if (figSources && figSources.size === 1) {
        uniqueOnly++;
      }
    }

    modelReach.push({
      source,
      label: SOURCE_LABELS[source] || source,
      uniqueFigures: stats.figures.size,
      uniqueOnlyFigures: uniqueOnly,
      totalRankings: stats.total,
      listCount: stats.samples.size || 1,
    });
  }
  modelReach.sort((a, b) => b.uniqueFigures - a.uniqueFigures);

  const tiers = [
    { tier: 'Top 50', min: 1, max: 50 },
    { tier: 'Top 100', min: 51, max: 100 },
    { tier: '100-250', min: 101, max: 250 },
    { tier: '250-500', min: 251, max: 500 },
    { tier: '500-1000', min: 501, max: 1000 },
    { tier: '1000+', min: 1001, max: 999999 },
  ];

  const consensusByTier: ConsensusByTier[] = [];
  for (const t of tiers) {
    const tierFigures = allFigures.filter(f =>
      f.llmConsensusRank !== null &&
      f.llmConsensusRank >= t.min &&
      f.llmConsensusRank <= t.max
    );

    if (tierFigures.length === 0) continue;

    let totalModelCoverage = 0;
    let totalVariance = 0;
    let highCoverageCount = 0;
    let varianceCount = 0;

    for (const fig of tierFigures) {
      const coverage = figureCoverage.get(fig.id)?.size || 0;
      totalModelCoverage += coverage;
      if (coverage >= 8) highCoverageCount++;
      if (fig.varianceScore !== null) {
        totalVariance += fig.varianceScore;
        varianceCount++;
      }
    }

    consensusByTier.push({
      tier: t.tier,
      rankRange: t.max < 999999 ? `#${t.min}-${t.max}` : `#${t.min}+`,
      figureCount: tierFigures.length,
      avgModelCoverage: Math.round((totalModelCoverage / tierFigures.length) * 10) / 10,
      avgVariance: varianceCount > 0 ? Math.round((totalVariance / varianceCount) * 100) / 100 : 0,
      highCoveragePercent: Math.round((highCoverageCount / tierFigures.length) * 100),
    });
  }

  const varianceBuckets = [
    { label: '0.0-0.2 (Strong)', min: 0, max: 0.2 },
    { label: '0.2-0.4 (Good)', min: 0.2, max: 0.4 },
    { label: '0.4-0.6 (Moderate)', min: 0.4, max: 0.6 },
    { label: '0.6-0.8 (Weak)', min: 0.6, max: 0.8 },
    { label: '0.8-1.0 (Contested)', min: 0.8, max: 1.01 },
  ];

  const figuresWithVariance = allFigures.filter(f => f.varianceScore !== null);
  const varianceDistribution: VarianceDistribution[] = varianceBuckets.map(bucket => {
    const count = figuresWithVariance.filter(f =>
      f.varianceScore! >= bucket.min && f.varianceScore! < bucket.max
    ).length;
    return {
      bucket: bucket.label,
      count,
      percentage: Math.round((count / figuresWithVariance.length) * 100),
    };
  });

  const keyFindings: KeyFinding[] = [];

  const avgCoverage = totalFiguresRanked === 0 ? 0 : (totalCoverage / totalFiguresRanked);
  if (avgCoverage < totalModels * 0.4) {
    keyFindings.push({
      type: 'warning',
      title: 'Low Model Agreement',
      description: 'Most figures appear in fewer than half of the models.',
      metric: `${Math.round(avgCoverage)} avg models per figure`,
    });
  } else if (avgCoverage > totalModels * 0.6) {
    keyFindings.push({
      type: 'success',
      title: 'Strong Model Coverage',
      description: 'Figures are well covered across models.',
      metric: `${Math.round(avgCoverage)} avg models per figure`,
    });
  }

  const fullCoverageCount = coverageCounts.get(totalModels) || 0;
  if (fullCoverageCount < 20) {
    keyFindings.push({
      type: 'info',
      title: 'No Universal Consensus',
      description: 'Few figures appear in all models, showing diverse views.',
      metric: `${fullCoverageCount} figures in all ${totalModels} models`,
    });
  }

  return {
    totalFigures: allFigures.length,
    totalRankings: allRankings.length,
    totalModels,
    totalLists: allRankings.reduce((acc, r) => acc + (r.sampleId ? 1 : 0), 0),
    fullCoverageFigures: fullCoverageCount,
    avgModelCoverage: Math.round(avgCoverage * 10) / 10,
    coverageDistribution,
    modelReach,
    consensusByTier,
    varianceDistribution,
    keyFindings,
  };
}

async function getLLMComparison(): Promise<LLMComparisonResponse> {
  const allRankings = await db
    .select()
    .from(rankings)
    .where(ne(rankings.source, 'pantheon'));

  const allFigures = await db.select().from(figures);
  const figureMap = new Map(allFigures.map(f => [f.id, f]));

  const sources = [...new Set(allRankings.map(r => r.source))].sort();

  const figureSourceRanks: Map<string, Map<string, { sum: number; count: number; ranks: number[] }>> = new Map();
  const sourceSampleIds: Map<string, Set<string>> = new Map();

  for (const r of allRankings) {
    if (!figureSourceRanks.has(r.figureId)) {
      figureSourceRanks.set(r.figureId, new Map());
    }
    const sourceMap = figureSourceRanks.get(r.figureId)!;
    if (!sourceMap.has(r.source)) {
      sourceMap.set(r.source, { sum: 0, count: 0, ranks: [] });
    }
    const data = sourceMap.get(r.source)!;
    data.sum += r.rank;
    data.count += 1;
    data.ranks.push(r.rank);

    if (!sourceSampleIds.has(r.source)) {
      sourceSampleIds.set(r.source, new Set());
    }
    if (r.sampleId) {
      sourceSampleIds.get(r.source)!.add(r.sampleId);
    }
  }

  const figureAvgRanks: Map<string, Map<string, number>> = new Map();
  for (const [figureId, sourceMap] of figureSourceRanks) {
    figureAvgRanks.set(figureId, new Map());
    for (const [source, data] of sourceMap) {
      figureAvgRanks.get(figureId)!.set(source, data.sum / data.count);
    }
  }

  const correlationMatrix: PairwiseCorrelation[] = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i; j < sources.length; j++) {
      const s1 = sources[i];
      const s2 = sources[j];

      const commonFigures: { rank1: number; rank2: number }[] = [];
      for (const sourceMap of figureAvgRanks.values()) {
        const r1 = sourceMap.get(s1);
        const r2 = sourceMap.get(s2);
        if (r1 !== undefined && r2 !== undefined) {
          commonFigures.push({ rank1: r1, rank2: r2 });
        }
      }

      const correlation = i === j ? 1 : spearmanCorrelation(
        commonFigures.map(f => f.rank1),
        commonFigures.map(f => f.rank2)
      );

      correlationMatrix.push({
        source1: s1,
        source2: s2,
        correlation: Math.round(correlation * 100) / 100,
        commonFigures: commonFigures.length,
      });

      if (i !== j) {
        correlationMatrix.push({
          source1: s2,
          source2: s1,
          correlation: Math.round(correlation * 100) / 100,
          commonFigures: commonFigures.length,
        });
      }
    }
  }

  const modelBasicStats: Array<{
    source: string;
    figuresWithSource: Array<{ id: string; avgRank: number; consensusRank: number | null }>;
    domainRanks: Map<string, number[]>;
    eraRanks: Map<string, number[]>;
    overallAvg: number;
    consistency: number;
  }> = [];

  for (const source of sources) {
    const figuresWithSource: Array<{ id: string; avgRank: number; consensusRank: number | null }> = [];
    const domainRanks: Map<string, number[]> = new Map();
    const eraRanks: Map<string, number[]> = new Map();

    for (const [figureId, sourceMap] of figureAvgRanks) {
      const rank = sourceMap.get(source);
      if (rank !== undefined) {
        const fig = figureMap.get(figureId);
        figuresWithSource.push({
          id: figureId,
          avgRank: rank,
          consensusRank: fig?.llmConsensusRank ?? null,
        });

        const domain = fig?.domain || 'Other';
        if (!domainRanks.has(domain)) {
          domainRanks.set(domain, []);
        }
        domainRanks.get(domain)!.push(rank);

        const era = fig?.era || 'Other';
        if (!eraRanks.has(era)) {
          eraRanks.set(era, []);
        }
        eraRanks.get(era)!.push(rank);
      }
    }

    const overallAvg = figuresWithSource.reduce((sum, f) => sum + f.avgRank, 0) / figuresWithSource.length;

    let consistency = 1;
    const sampleRanks = new Map<string, number[]>();
    for (const r of allRankings.filter(r => r.source === source)) {
      if (!r.sampleId) continue;
      if (!sampleRanks.has(r.sampleId)) sampleRanks.set(r.sampleId, []);
      sampleRanks.get(r.sampleId)!.push(r.rank);
    }
    const sampleAvgs = Array.from(sampleRanks.values()).map(ranks => ranks.reduce((a, b) => a + b, 0) / ranks.length);
    if (sampleAvgs.length > 1) {
      const avg = sampleAvgs.reduce((a, b) => a + b, 0) / sampleAvgs.length;
      const variance = sampleAvgs.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / sampleAvgs.length;
      consistency = 1 / (1 + variance / 1000);
    }

    modelBasicStats.push({
      source,
      figuresWithSource,
      domainRanks,
      eraRanks,
      overallAvg,
      consistency,
    });
  }

  const modelStats: ModelStats[] = modelBasicStats.map((stat) => {
    const topPicks = [...stat.figuresWithSource]
      .sort((a, b) => a.avgRank - b.avgRank)
      .slice(0, 3)
      .map(f => ({
        id: f.id,
        name: figureMap.get(f.id)?.canonicalName || f.id,
        rank: Math.round(f.avgRank),
      }));

    const outliers = [...stat.figuresWithSource]
      .filter(f => f.consensusRank !== null)
      .map(f => ({
        id: f.id,
        name: figureMap.get(f.id)?.canonicalName || f.id,
        diff: Math.round(f.consensusRank! - f.avgRank),
        modelRank: Math.round(f.avgRank),
        consensusRank: Math.round(f.consensusRank!),
        direction: (f.avgRank < f.consensusRank! ? 'higher' : 'lower') as 'higher' | 'lower',
      }))
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 3);

    const domainBias = [...stat.domainRanks.entries()].map(([domain, ranks]) => {
      const avgRank = ranks.reduce((sum, r) => sum + r, 0) / ranks.length;
      return {
        domain,
        avgRank: Math.round(avgRank),
        diff: Math.round(stat.overallAvg - avgRank),
        figureCount: ranks.length,
      };
    });

    const eraBias = [...stat.eraRanks.entries()].map(([era, ranks]) => {
      const avgRank = ranks.reduce((sum, r) => sum + r, 0) / ranks.length;
      return {
        era,
        avgRank: Math.round(avgRank),
        diff: Math.round(stat.overallAvg - avgRank),
        figureCount: ranks.length,
      };
    });

    const avgCorrelation = correlationMatrix
      .filter(c => c.source1 === stat.source && c.source2 !== stat.source)
      .reduce((sum, c) => sum + c.correlation, 0) / Math.max(1, sources.length - 1);

    return {
      source: stat.source,
      label: SOURCE_LABELS[stat.source] || stat.source,
      figureCount: stat.figuresWithSource.length,
      sampleCount: sourceSampleIds.get(stat.source)?.size || 1,
      avgRank: Math.round(stat.overallAvg),
      topPicks,
      outliers,
      domainBias: domainBias.sort((a, b) => b.diff - a.diff).slice(0, 5),
      eraBias: eraBias.sort((a, b) => b.diff - a.diff).slice(0, 5),
      consistency: Math.round(stat.consistency * 100) / 100,
      consistencyRank: 0,
      avgCorrelation: Math.round(avgCorrelation * 100) / 100,
      correlationRank: 0,
      distinctiveTraits: [],
    };
  });

  modelStats.sort((a, b) => b.consistency - a.consistency);
  modelStats.forEach((m, i) => (m.consistencyRank = i + 1));
  modelStats.sort((a, b) => b.avgCorrelation - a.avgCorrelation);
  modelStats.forEach((m, i) => (m.correlationRank = i + 1));

  const controversialFigures: ControversialFigure[] = allFigures
    .filter(f => f.varianceScore !== null && f.varianceScore > 0.6)
    .sort((a, b) => (b.varianceScore || 0) - (a.varianceScore || 0))
    .slice(0, 10)
    .map(f => ({
      id: f.id,
      name: f.canonicalName,
      domain: f.domain,
      era: f.era,
      birthYear: f.birthYear,
      varianceScore: f.varianceScore || 0,
      modelRanks: sources
        .map(source => ({
          source,
          label: SOURCE_LABELS[source] || source,
          rank: Math.round(figureAvgRanks.get(f.id)?.get(source) || 0),
        }))
        .filter(r => r.rank > 0),
    }));

  const domainBreakdown: DomainBreakdown[] = [];
  const eraBreakdown: EraBreakdown[] = [];

  const domains = [...new Set(allFigures.map(f => f.domain || 'Other'))];
  const eras = [...new Set(allFigures.map(f => f.era || 'Other'))];

  for (const domain of domains) {
    const models = sources.map(source => {
      const ranks = modelBasicStats
        .find(m => m.source === source)
        ?.figuresWithSource.filter(f => figureMap.get(f.id)?.domain === domain)
        .map(f => f.avgRank) || [];
      const avgRank = ranks.length ? ranks.reduce((sum, r) => sum + r, 0) / ranks.length : 0;
      return { source, label: SOURCE_LABELS[source] || source, avgRank: Math.round(avgRank) };
    });
    domainBreakdown.push({ domain, models });
  }

  for (const era of eras) {
    const models = sources.map(source => {
      const ranks = modelBasicStats
        .find(m => m.source === source)
        ?.figuresWithSource.filter(f => figureMap.get(f.id)?.era === era)
        .map(f => f.avgRank) || [];
      const avgRank = ranks.length ? ranks.reduce((sum, r) => sum + r, 0) / ranks.length : 0;
      return { source, label: SOURCE_LABELS[source] || source, avgRank: Math.round(avgRank) };
    });
    eraBreakdown.push({ era, models });
  }

  return {
    models: modelStats,
    correlationMatrix,
    controversialFigures,
    domainBreakdown,
    eraBreakdown,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'llm';

  try {
    if (mode === 'geo-bias') {
      return NextResponse.json(await getGeoBias());
    }
    if (mode === 'insights') {
      return NextResponse.json(await getInsights());
    }
    return NextResponse.json(await getLLMComparison());
  } catch (error) {
    console.error('Compare API error:', error);
    return NextResponse.json({ error: 'Failed to fetch comparison data' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { sql, ne } from 'drizzle-orm';
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
    if (mode === 'insights') {
      return NextResponse.json(await getInsights());
    }
    return NextResponse.json(await getLLMComparison());
  } catch (error) {
    console.error('Compare API error:', error);
    return NextResponse.json({ error: 'Failed to fetch comparison data' }, { status: 500 });
  }
}

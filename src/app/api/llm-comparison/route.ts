import { NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { sql, ne } from 'drizzle-orm';
import { SOURCE_LABELS } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

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
  direction: 'higher' | 'lower'; // higher = model ranks higher than consensus
}

interface ModelStats {
  source: string;
  label: string;
  figureCount: number;
  sampleCount: number;
  avgRank: number;
  topPicks: FigureReference[]; // Top 3 picks
  outliers: OutlierReference[]; // Top 3 outliers
  domainBias: Array<{ domain: string; avgRank: number; diff: number; figureCount: number }>;
  eraBias: Array<{ era: string; avgRank: number; diff: number; figureCount: number }>;
  consistency: number; // 0-1, how consistent across samples
  consistencyRank: number; // 1 = most consistent
  avgCorrelation: number; // Average correlation with other models
  correlationRank: number; // 1 = most aligned with others
  distinctiveTraits: string[]; // Procedurally generated insights
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

export interface LLMComparisonResponse {
  models: ModelStats[];
  correlationMatrix: PairwiseCorrelation[];
  controversialFigures: ControversialFigure[];
  domainBreakdown: DomainBreakdown[];
  eraBreakdown: DomainBreakdown[];
}

// Calculate Spearman correlation coefficient
function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;

  // Rank the values
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

  // Calculate sum of squared differences
  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = xRanks[i] - yRanks[i];
    sumD2 += d * d;
  }

  // Spearman formula
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

export async function GET() {
  try {
    // Get all LLM rankings (exclude pantheon)
    const allRankings = await db
      .select()
      .from(rankings)
      .where(ne(rankings.source, 'pantheon'));

    // Get all figures with their consensus ranks
    const allFigures = await db.select().from(figures);
    const figureMap = new Map(allFigures.map(f => [f.id, f]));

    // Get unique sources
    const sources = [...new Set(allRankings.map(r => r.source))].sort();

    // Build per-figure, per-source average ranks
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

      // Track sample IDs per source
      if (!sourceSampleIds.has(r.source)) {
        sourceSampleIds.set(r.source, new Set());
      }
      if (r.sampleId) {
        sourceSampleIds.get(r.source)!.add(r.sampleId);
      }
    }

    // Calculate average rank per figure per source
    const figureAvgRanks: Map<string, Map<string, number>> = new Map();
    for (const [figureId, sourceMap] of figureSourceRanks) {
      figureAvgRanks.set(figureId, new Map());
      for (const [source, data] of sourceMap) {
        figureAvgRanks.get(figureId)!.set(source, data.sum / data.count);
      }
    }

    // Calculate pairwise correlations
    const correlationMatrix: PairwiseCorrelation[] = [];
    for (let i = 0; i < sources.length; i++) {
      for (let j = i; j < sources.length; j++) {
        const s1 = sources[i];
        const s2 = sources[j];

        // Find common figures
        const commonFigures: { rank1: number; rank2: number }[] = [];
        for (const [figureId, sourceMap] of figureAvgRanks) {
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

        // Add reverse pair if not diagonal
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

    // Calculate model stats (first pass - basic stats)
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

          // Track domain ranks
          const domain = fig?.domain || 'Other';
          if (!domainRanks.has(domain)) {
            domainRanks.set(domain, []);
          }
          domainRanks.get(domain)!.push(rank);

          // Track era ranks
          const era = fig?.era || 'Unknown';
          if (!eraRanks.has(era)) {
            eraRanks.set(era, []);
          }
          eraRanks.get(era)!.push(rank);
        }
      }

      const overallAvg = figuresWithSource.reduce((s, f) => s + f.avgRank, 0) / figuresWithSource.length;

      // Calculate consistency
      let totalVariance = 0;
      let varianceCount = 0;
      for (const [figureId, sourceMap] of figureSourceRanks) {
        const data = sourceMap.get(source);
        if (data && data.ranks.length > 1) {
          const mean = data.sum / data.count;
          const variance = data.ranks.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / data.ranks.length;
          totalVariance += Math.sqrt(variance) / mean;
          varianceCount++;
        }
      }
      const avgCV = varianceCount > 0 ? totalVariance / varianceCount : 0;
      const consistency = Math.max(0, 1 - avgCV);

      modelBasicStats.push({
        source,
        figuresWithSource,
        domainRanks,
        eraRanks,
        overallAvg,
        consistency,
      });
    }

    // Calculate consistency rankings
    const consistencyRanks = [...modelBasicStats]
      .sort((a, b) => b.consistency - a.consistency)
      .map((m, i) => ({ source: m.source, rank: i + 1 }));

    // Calculate average correlations per model
    const avgCorrelations: Map<string, number> = new Map();
    for (const source of sources) {
      const correlationsWithOthers = correlationMatrix
        .filter(c => c.source1 === source && c.source2 !== source)
        .map(c => c.correlation);
      const avg = correlationsWithOthers.length > 0
        ? correlationsWithOthers.reduce((s, c) => s + c, 0) / correlationsWithOthers.length
        : 0;
      avgCorrelations.set(source, avg);
    }

    const correlationRanks = [...avgCorrelations.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([source], i) => ({ source, rank: i + 1 }));

    // Build final model stats
    const models: ModelStats[] = [];
    for (const basic of modelBasicStats) {
      const { source, figuresWithSource, domainRanks, eraRanks, overallAvg, consistency } = basic;

      // Sort by rank to find top picks
      const sorted = [...figuresWithSource].sort((a, b) => a.avgRank - b.avgRank);
      const topPicks: FigureReference[] = sorted.slice(0, 3).map(f => {
        const fig = figureMap.get(f.id);
        return {
          id: f.id,
          name: fig?.canonicalName || f.id,
          rank: Math.round(f.avgRank),
        };
      });

      // Find top 3 outliers (largest absolute diff from consensus)
      const outlierCandidates = figuresWithSource
        .filter(f => f.consensusRank !== null)
        .map(f => {
          const diff = f.avgRank - f.consensusRank!;
          const fig = figureMap.get(f.id);
          return {
            id: f.id,
            name: fig?.canonicalName || f.id,
            diff: Math.round(diff),
            modelRank: Math.round(f.avgRank),
            consensusRank: Math.round(f.consensusRank!),
            direction: (diff < 0 ? 'higher' : 'lower') as 'higher' | 'lower',
            absDiff: Math.abs(diff),
          };
        })
        .sort((a, b) => b.absDiff - a.absDiff);

      const outliers: OutlierReference[] = outlierCandidates.slice(0, 8).map(o => ({
        id: o.id,
        name: o.name,
        diff: o.diff,
        modelRank: o.modelRank,
        consensusRank: o.consensusRank,
        direction: o.direction,
      }));

      // Calculate domain bias with figure counts
      const domainBias: ModelStats['domainBias'] = [];
      for (const [domain, ranks] of domainRanks) {
        const domainAvg = ranks.reduce((s, r) => s + r, 0) / ranks.length;
        domainBias.push({
          domain,
          avgRank: Math.round(domainAvg),
          diff: Math.round(overallAvg - domainAvg),
          figureCount: ranks.length,
        });
      }
      domainBias.sort((a, b) => b.diff - a.diff);

      // Calculate era bias with figure counts
      const eraBias: ModelStats['eraBias'] = [];
      for (const [era, ranks] of eraRanks) {
        const eraAvg = ranks.reduce((s, r) => s + r, 0) / ranks.length;
        eraBias.push({
          era,
          avgRank: Math.round(eraAvg),
          diff: Math.round(overallAvg - eraAvg),
          figureCount: ranks.length,
        });
      }
      eraBias.sort((a, b) => b.diff - a.diff);

      const consistencyRank = consistencyRanks.find(c => c.source === source)?.rank || sources.length;
      const correlationRank = correlationRanks.find(c => c.source === source)?.rank || sources.length;
      const avgCorrelation = avgCorrelations.get(source) || 0;

      // Generate distinctive traits
      const distinctiveTraits: string[] = [];
      const modelLabel = SOURCE_LABELS[source] || source;
      const shortName = modelLabel.split(' ').slice(-1)[0]; // e.g., "Opus", "Sonnet", "Flash"

      // Consistency insight
      if (consistencyRank === 1) {
        distinctiveTraits.push(`${shortName} is the most self-consistent model, producing similar rankings across its ${sourceSampleIds.get(source)?.size || 1} independent samples.`);
      } else if (consistencyRank === sources.length) {
        distinctiveTraits.push(`${shortName} shows the most variation between its samples, suggesting less deterministic ranking criteria.`);
      }

      // Correlation insight
      if (correlationRank === 1) {
        distinctiveTraits.push(`Among all models, ${shortName} aligns most closely with the group consensus (${Math.round(avgCorrelation * 100)}% average correlation).`);
      } else if (correlationRank === sources.length) {
        distinctiveTraits.push(`${shortName} is the most independent thinker, diverging most from what other models agree on.`);
      }

      // Domain bias insight
      const topDomain = domainBias[0];
      const bottomDomain = domainBias[domainBias.length - 1];
      if (topDomain && topDomain.diff > 15) {
        distinctiveTraits.push(`Shows a notable preference for ${topDomain.domain} figures, ranking them ${topDomain.diff} positions higher on average.`);
      }
      if (bottomDomain && bottomDomain.diff < -15) {
        distinctiveTraits.push(`Tends to undervalue ${bottomDomain.domain} compared to other domains.`);
      }

      // Era bias insight
      const topEra = eraBias[0];
      if (topEra && topEra.diff > 20) {
        distinctiveTraits.push(`Has an affinity for the ${topEra.era} era, consistently ranking those figures higher.`);
      }

      // Coverage insight
      const avgFigureCount = modelBasicStats.reduce((s, m) => s + m.figuresWithSource.length, 0) / modelBasicStats.length;
      if (figuresWithSource.length > avgFigureCount * 1.1) {
        distinctiveTraits.push(`Casts a wider net than most, ranking ${figuresWithSource.length} figures compared to the average of ${Math.round(avgFigureCount)}.`);
      } else if (figuresWithSource.length < avgFigureCount * 0.9) {
        distinctiveTraits.push(`More selective in scope, ranking ${figuresWithSource.length} figures vs. the average of ${Math.round(avgFigureCount)}.`);
      }

      models.push({
        source,
        label: SOURCE_LABELS[source] || source,
        figureCount: figuresWithSource.length,
        sampleCount: sourceSampleIds.get(source)?.size || 1,
        avgRank: Math.round(overallAvg),
        topPicks,
        outliers,
        domainBias: domainBias.slice(0, 6),
        eraBias: eraBias.slice(0, 6),
        consistency: Math.round(consistency * 100) / 100,
        consistencyRank,
        avgCorrelation: Math.round(avgCorrelation * 100) / 100,
        correlationRank,
        distinctiveTraits,
      });
    }

    // Get most controversial figures (highest variance)
    const controversialFigures: ControversialFigure[] = allFigures
      .filter(f => f.varianceScore !== null && f.varianceScore > 0.1)
      .sort((a, b) => (b.varianceScore || 0) - (a.varianceScore || 0))
      .slice(0, 20)
      .map(f => {
        const sourceMap = figureAvgRanks.get(f.id);
        const modelRanks: ControversialFigure['modelRanks'] = [];
        if (sourceMap) {
          for (const [source, rank] of sourceMap) {
            modelRanks.push({
              source,
              label: SOURCE_LABELS[source] || source,
              rank: Math.round(rank),
            });
          }
        }
        modelRanks.sort((a, b) => a.rank - b.rank);

        return {
          id: f.id,
          name: f.canonicalName,
          domain: f.domain,
          era: f.era,
          birthYear: f.birthYear,
          varianceScore: Math.round((f.varianceScore || 0) * 100) / 100,
          modelRanks,
        };
      });

    // Calculate domain breakdown
    const domainBreakdown: DomainBreakdown[] = [];
    const domains = [...new Set(allFigures.map(f => f.domain).filter(Boolean))] as string[];

    for (const domain of domains) {
      const domainModels: DomainBreakdown['models'] = [];
      for (const source of sources) {
        const ranks: number[] = [];
        for (const [figureId, sourceMap] of figureAvgRanks) {
          const fig = figureMap.get(figureId);
          if (fig?.domain === domain && sourceMap.has(source)) {
            ranks.push(sourceMap.get(source)!);
          }
        }
        if (ranks.length > 0) {
          domainModels.push({
            source,
            label: SOURCE_LABELS[source] || source,
            avgRank: Math.round(ranks.reduce((s, r) => s + r, 0) / ranks.length),
          });
        }
      }
      if (domainModels.length > 0) {
        domainBreakdown.push({ domain, models: domainModels });
      }
    }

    // Calculate era breakdown
    const eraBreakdown: DomainBreakdown[] = [];
    const eras = [...new Set(allFigures.map(f => f.era).filter(Boolean))] as string[];

    for (const era of eras) {
      const eraModels: DomainBreakdown['models'] = [];
      for (const source of sources) {
        const ranks: number[] = [];
        for (const [figureId, sourceMap] of figureAvgRanks) {
          const fig = figureMap.get(figureId);
          if (fig?.era === era && sourceMap.has(source)) {
            ranks.push(sourceMap.get(source)!);
          }
        }
        if (ranks.length > 0) {
          eraModels.push({
            source,
            label: SOURCE_LABELS[source] || source,
            avgRank: Math.round(ranks.reduce((s, r) => s + r, 0) / ranks.length),
          });
        }
      }
      if (eraModels.length > 0) {
        eraBreakdown.push({ domain: era, models: eraModels });
      }
    }

    const response: LLMComparisonResponse = {
      models,
      correlationMatrix,
      controversialFigures,
      domainBreakdown,
      eraBreakdown,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error in LLM comparison:', err.message, err.stack);
    return NextResponse.json(
      { error: 'Failed to compute LLM comparison', detail: err.message },
      { status: 500 }
    );
  }
}

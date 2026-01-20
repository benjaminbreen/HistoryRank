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
  uniqueOnlyFigures: number; // Figures only this model ranks
  totalRankings: number;
  listCount: number;
}

interface ConsensusByTier {
  tier: string;
  rankRange: string;
  figureCount: number;
  avgModelCoverage: number;
  avgVariance: number;
  highCoveragePercent: number; // % with 8+ models
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
  // Summary stats
  totalFigures: number;
  totalRankings: number;
  totalModels: number;
  totalLists: number;
  fullCoverageFigures: number;
  avgModelCoverage: number;

  // Detailed breakdowns
  coverageDistribution: CoverageDistribution[];
  modelReach: ModelReach[];
  consensusByTier: ConsensusByTier[];
  varianceDistribution: VarianceDistribution[];
  keyFindings: KeyFinding[];
}

export async function GET() {
  try {
    // Get all LLM rankings
    const allRankings = await db
      .select()
      .from(rankings)
      .where(ne(rankings.source, 'pantheon'));

    // Get all figures
    const allFigures = await db.select().from(figures);
    const figureMap = new Map(allFigures.map(f => [f.id, f]));

    // Get unique sources
    const sources = [...new Set(allRankings.map(r => r.source))].sort();
    const totalModels = sources.length;

    // Count figures per source and sample IDs
    const sourceStats = new Map<string, { figures: Set<string>; samples: Set<string>; total: number }>();
    for (const source of sources) {
      sourceStats.set(source, { figures: new Set(), samples: new Set(), total: 0 });
    }

    // Build figure coverage map
    const figureCoverage = new Map<string, Set<string>>();

    for (const r of allRankings) {
      // Track source stats
      const stats = sourceStats.get(r.source)!;
      stats.figures.add(r.figureId);
      if (r.sampleId) stats.samples.add(r.sampleId);
      stats.total++;

      // Track figure coverage
      if (!figureCoverage.has(r.figureId)) {
        figureCoverage.set(r.figureId, new Set());
      }
      figureCoverage.get(r.figureId)!.add(r.source);
    }

    // Calculate coverage distribution
    const coverageCounts = new Map<number, number>();
    for (let i = 1; i <= totalModels; i++) {
      coverageCounts.set(i, 0);
    }

    let totalCoverage = 0;
    for (const [_, sources] of figureCoverage) {
      const count = sources.size;
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

    // Calculate model reach with unique-only figures
    const modelReach: ModelReach[] = [];
    for (const source of sources) {
      const stats = sourceStats.get(source)!;

      // Find figures only ranked by this source
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

    // Calculate consensus by tier
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

    // Calculate variance distribution
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

    // Generate key findings
    const keyFindings: KeyFinding[] = [];

    // Coverage findings
    const fullCoverage = coverageCounts.get(totalModels) || 0;
    const fullCoveragePercent = Math.round((fullCoverage / totalFiguresRanked) * 100);
    const lowCoverage = (coverageCounts.get(1) || 0) + (coverageCounts.get(2) || 0) + (coverageCounts.get(3) || 0);
    const lowCoveragePercent = Math.round((lowCoverage / totalFiguresRanked) * 100);

    if (fullCoveragePercent < 10) {
      keyFindings.push({
        type: 'warning',
        title: 'Limited Full Consensus',
        description: `Only ${fullCoveragePercent}% of figures are ranked by all ${totalModels} models. Consider this when interpreting rankings outside the top tiers.`,
        metric: `${fullCoverage} figures`,
      });
    }

    if (lowCoveragePercent > 40) {
      keyFindings.push({
        type: 'warning',
        title: 'Many Low-Coverage Figures',
        description: `${lowCoveragePercent}% of figures appear in only 1-3 models. These rankings are less reliable.`,
        metric: `${lowCoverage} figures`,
      });
    }

    // Model reach finding
    const topModel = modelReach[0];
    const secondModel = modelReach[1];
    if (topModel && secondModel) {
      const gap = topModel.uniqueFigures - secondModel.uniqueFigures;
      if (gap > 300) {
        keyFindings.push({
          type: 'info',
          title: `${topModel.label} Has Broadest Reach`,
          description: `Ranks ${gap.toLocaleString()} more unique figures than any other model, including ${topModel.uniqueOnlyFigures} figures no other model ranks.`,
          metric: `${topModel.uniqueFigures.toLocaleString()} figures`,
        });
      }
    }

    // Consensus tier finding
    const top50Tier = consensusByTier.find(t => t.tier === 'Top 50');
    if (top50Tier && top50Tier.highCoveragePercent >= 90) {
      keyFindings.push({
        type: 'success',
        title: 'Strong Top-Tier Consensus',
        description: `${top50Tier.highCoveragePercent}% of top 50 figures have 8+ model coverage, indicating high reliability for the most prominent rankings.`,
        metric: `${top50Tier.avgModelCoverage} avg models`,
      });
    }

    // Variance finding
    const highVarianceCount = varianceDistribution
      .filter(v => v.bucket.includes('Weak') || v.bucket.includes('Contested'))
      .reduce((sum, v) => sum + v.count, 0);
    const highVariancePercent = Math.round((highVarianceCount / figuresWithVariance.length) * 100);

    if (highVariancePercent > 30) {
      keyFindings.push({
        type: 'warning',
        title: 'Significant Model Disagreement',
        description: `${highVariancePercent}% of ranked figures have weak or contested consensus (variance > 0.6). Use the weighted average to de-emphasize unreliable models.`,
        metric: `${highVarianceCount} figures`,
      });
    } else if (highVariancePercent < 15) {
      keyFindings.push({
        type: 'success',
        title: 'Good Model Agreement',
        description: `Only ${highVariancePercent}% of figures have high variance. Most rankings reflect genuine consensus across models.`,
        metric: `${figuresWithVariance.length - highVarianceCount} reliable`,
      });
    }

    // Calculate total lists
    let totalLists = 0;
    for (const stats of sourceStats.values()) {
      totalLists += stats.samples.size || 1;
    }

    const response: InsightsResponse = {
      totalFigures: totalFiguresRanked,
      totalRankings: allRankings.length,
      totalModels,
      totalLists,
      fullCoverageFigures: fullCoverage,
      avgModelCoverage: Math.round((totalCoverage / totalFiguresRanked) * 10) / 10,
      coverageDistribution,
      modelReach,
      consensusByTier,
      varianceDistribution,
      keyFindings,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error in insights:', err.message, err.stack);
    return NextResponse.json(
      { error: 'Failed to compute insights', detail: err.message },
      { status: 500 }
    );
  }
}

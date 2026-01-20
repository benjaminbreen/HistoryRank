import { NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { sql, ne, eq } from 'drizzle-orm';
import { SOURCE_LABELS } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

interface ModelSummary {
  source: string;
  label: string;
  slug: string;
  listCount: number;
  totalRankings: number;
  uniqueFigures: number;
  exclusiveFigures: number; // Figures only this model ranks

  grades: {
    overall: string;
    coverage: string;
    agreement: string;
    stability: string;
    diversity: string;
  };

  metrics: {
    coverageScore: number;      // 0-100
    agreementScore: number;     // 0-100 (correlation with consensus)
    stabilityScore: number;     // 0-100 (internal consistency)
    diversityScore: number;     // 0-100 (geographic/temporal spread)
  };

  biasFlags: number; // Count of medium/high bias indicators
  topStrength: string;
  topWeakness: string;
}

export interface BenchmarksOverviewResponse {
  models: ModelSummary[];
  totalFigures: number;
  totalRankings: number;
  totalLists: number;
  generatedAt: string;
}

// Convert score (0-100) to letter grade
function scoreToGrade(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 55) return 'C-';
  if (score >= 50) return 'D';
  return 'F';
}

// Calculate Spearman correlation
function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const n = x.length;

  const rankArray = (arr: number[]) => {
    const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    sorted.forEach((item, rank) => { ranks[item.i] = rank + 1; });
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

export async function GET() {
  try {
    // Get all LLM rankings
    const allRankings = await db
      .select()
      .from(rankings)
      .where(ne(rankings.source, 'pantheon'));

    // Get all figures with metadata
    const allFigures = await db.select().from(figures);
    const figureMap = new Map(allFigures.map(f => [f.id, f]));

    // Get unique sources
    const sources = [...new Set(allRankings.map(r => r.source))].sort();

    // Build comprehensive data structures
    const sourceStats = new Map<string, {
      figures: Set<string>;
      samples: Set<string>;
      total: number;
      ranksByFigure: Map<string, number[]>;
    }>();

    for (const source of sources) {
      sourceStats.set(source, {
        figures: new Set(),
        samples: new Set(),
        total: 0,
        ranksByFigure: new Map(),
      });
    }

    // Build figure coverage map (which models rank each figure)
    const figureCoverage = new Map<string, Set<string>>();

    // Build consensus ranks (average across all models)
    const figureAllRanks = new Map<string, number[]>();

    for (const r of allRankings) {
      const stats = sourceStats.get(r.source)!;
      stats.figures.add(r.figureId);
      if (r.sampleId) stats.samples.add(r.sampleId);
      stats.total++;

      // Track ranks per figure per source
      if (!stats.ranksByFigure.has(r.figureId)) {
        stats.ranksByFigure.set(r.figureId, []);
      }
      stats.ranksByFigure.get(r.figureId)!.push(r.rank);

      // Track figure coverage
      if (!figureCoverage.has(r.figureId)) {
        figureCoverage.set(r.figureId, new Set());
      }
      figureCoverage.get(r.figureId)!.add(r.source);

      // Track all ranks for consensus
      if (!figureAllRanks.has(r.figureId)) {
        figureAllRanks.set(r.figureId, []);
      }
      figureAllRanks.get(r.figureId)!.push(r.rank);
    }

    // Calculate consensus average ranks
    const consensusRanks = new Map<string, number>();
    for (const [figureId, ranks] of figureAllRanks) {
      consensusRanks.set(figureId, ranks.reduce((a, b) => a + b, 0) / ranks.length);
    }

    // Calculate max coverage for normalization
    const maxCoverage = Math.max(...[...sourceStats.values()].map(s => s.figures.size));

    // Get region/era distribution for diversity scoring
    const getRegion = (fig: typeof allFigures[0]): string => {
      const region = fig.regionMacro || 'Unknown';
      // Simplify to major regions
      if (region.includes('Europe') || region.includes('Western')) return 'Europe';
      if (region.includes('Asia') || region.includes('China') || region.includes('Japan') || region.includes('India')) return 'Asia';
      if (region.includes('Middle East') || region.includes('Arab') || region.includes('Persian')) return 'Middle East';
      if (region.includes('Africa')) return 'Africa';
      if (region.includes('America')) return 'Americas';
      return 'Other';
    };

    // Calculate overall regional distribution (consensus baseline)
    const consensusRegionDist = new Map<string, number>();
    for (const fig of allFigures) {
      if (fig.llmConsensusRank && fig.llmConsensusRank <= 500) {
        const region = getRegion(fig);
        consensusRegionDist.set(region, (consensusRegionDist.get(region) || 0) + 1);
      }
    }

    // Build model summaries
    const models: ModelSummary[] = [];

    for (const source of sources) {
      const stats = sourceStats.get(source)!;
      const listCount = stats.samples.size || 1;

      // Calculate exclusive figures (only this model ranks them)
      let exclusiveFigures = 0;
      for (const figureId of stats.figures) {
        const coverage = figureCoverage.get(figureId);
        if (coverage && coverage.size === 1) {
          exclusiveFigures++;
        }
      }

      // Coverage score (0-100)
      const coverageScore = Math.round((stats.figures.size / maxCoverage) * 100);

      // Agreement score - correlation with consensus
      const modelAvgRanks: number[] = [];
      const consensusAvgRanks: number[] = [];

      for (const [figureId, ranks] of stats.ranksByFigure) {
        const modelAvg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
        const consensusAvg = consensusRanks.get(figureId);
        if (consensusAvg !== undefined) {
          modelAvgRanks.push(modelAvg);
          consensusAvgRanks.push(consensusAvg);
        }
      }

      const correlation = spearmanCorrelation(modelAvgRanks, consensusAvgRanks);
      const agreementScore = Math.round(Math.max(0, correlation) * 100);

      // Stability score - internal consistency across lists
      let totalCV = 0;
      let cvCount = 0;

      for (const [figureId, ranks] of stats.ranksByFigure) {
        if (ranks.length > 1) {
          const mean = ranks.reduce((a, b) => a + b, 0) / ranks.length;
          const variance = ranks.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / ranks.length;
          const cv = Math.sqrt(variance) / mean; // Coefficient of variation
          totalCV += cv;
          cvCount++;
        }
      }

      const avgCV = cvCount > 0 ? totalCV / cvCount : 0;
      const stabilityScore = Math.round(Math.max(0, (1 - avgCV) * 100));

      // Diversity score - how well distributed across regions/eras
      const modelRegionDist = new Map<string, number>();
      let modelTop500Count = 0;

      for (const figureId of stats.figures) {
        const fig = figureMap.get(figureId);
        if (fig) {
          // Get model's average rank for this figure
          const ranks = stats.ranksByFigure.get(figureId);
          if (ranks) {
            const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
            if (avgRank <= 500) {
              const region = getRegion(fig);
              modelRegionDist.set(region, (modelRegionDist.get(region) || 0) + 1);
              modelTop500Count++;
            }
          }
        }
      }

      // Calculate diversity as inverse of Western-centricity
      const europeCount = modelRegionDist.get('Europe') || 0;
      const nonWesternRatio = modelTop500Count > 0
        ? (modelTop500Count - europeCount) / modelTop500Count
        : 0;

      // Diversity score: higher = more diverse (less Western-centric)
      // Baseline: ~45-50% European is typical, reward going lower
      const diversityScore = Math.round(Math.min(100, nonWesternRatio * 150));

      // Calculate overall grade (weighted average)
      const overallScore = Math.round(
        coverageScore * 0.25 +
        agreementScore * 0.30 +
        stabilityScore * 0.25 +
        diversityScore * 0.20
      );

      // Bias flags (simplified - will be more detailed in individual endpoint)
      let biasFlags = 0;
      if (diversityScore < 40) biasFlags++; // Western-centric
      if (stabilityScore < 70) biasFlags++; // Unstable

      // Check for recency bias (Modern era overrepresentation)
      const modernCount = [...stats.figures].filter(fid => {
        const fig = figureMap.get(fid);
        return fig?.era === 'Modern' || fig?.era === 'Contemporary';
      }).length;
      const modernRatio = stats.figures.size > 0 ? modernCount / stats.figures.size : 0;
      if (modernRatio > 0.45) biasFlags++; // Recency bias

      // Determine top strength and weakness
      const scores = [
        { name: 'coverage', score: coverageScore, strength: 'Broad historical knowledge', weakness: 'Limited historical coverage' },
        { name: 'agreement', score: agreementScore, strength: 'Strong consensus alignment', weakness: 'Divergent from consensus' },
        { name: 'stability', score: stabilityScore, strength: 'Highly consistent rankings', weakness: 'Inconsistent across runs' },
        { name: 'diversity', score: diversityScore, strength: 'Geographically diverse', weakness: 'Western-centric bias' },
      ];

      scores.sort((a, b) => b.score - a.score);
      const topStrength = scores[0].strength;
      const topWeakness = scores[scores.length - 1].weakness;

      models.push({
        source,
        label: SOURCE_LABELS[source] || source,
        slug: source,
        listCount,
        totalRankings: stats.total,
        uniqueFigures: stats.figures.size,
        exclusiveFigures,
        grades: {
          overall: scoreToGrade(overallScore),
          coverage: scoreToGrade(coverageScore),
          agreement: scoreToGrade(agreementScore),
          stability: scoreToGrade(stabilityScore),
          diversity: scoreToGrade(diversityScore),
        },
        metrics: {
          coverageScore,
          agreementScore,
          stabilityScore,
          diversityScore,
        },
        biasFlags,
        topStrength,
        topWeakness,
      });
    }

    // Sort by overall grade/score
    models.sort((a, b) => {
      const gradeOrder = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
      const aIdx = gradeOrder.indexOf(a.grades.overall);
      const bIdx = gradeOrder.indexOf(b.grades.overall);
      if (aIdx !== bIdx) return aIdx - bIdx;
      // Tiebreaker: total score
      const aTotal = a.metrics.coverageScore + a.metrics.agreementScore + a.metrics.stabilityScore + a.metrics.diversityScore;
      const bTotal = b.metrics.coverageScore + b.metrics.agreementScore + b.metrics.stabilityScore + b.metrics.diversityScore;
      return bTotal - aTotal;
    });

    // Calculate totals
    let totalLists = 0;
    for (const stats of sourceStats.values()) {
      totalLists += stats.samples.size || 1;
    }

    const response: BenchmarksOverviewResponse = {
      models,
      totalFigures: figureCoverage.size,
      totalRankings: allRankings.length,
      totalLists,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error in benchmarks overview:', err.message, err.stack);
    return NextResponse.json(
      { error: 'Failed to compute benchmarks', detail: err.message },
      { status: 500 }
    );
  }
}

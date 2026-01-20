import { NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { sql, ne, eq } from 'drizzle-orm';
import { SOURCE_LABELS } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

// Types
interface RegionBreakdown {
  region: string;
  count: number;
  percent: number;
  consensusPercent: number;
  diff: number;
}

interface EraBreakdown {
  era: string;
  count: number;
  percent: number;
  consensusPercent: number;
  diff: number;
}

interface DomainBreakdown {
  domain: string;
  count: number;
  percent: number;
  consensusPercent: number;
  diff: number;
}

interface BiasIndicator {
  type: string;
  label: string;
  score: number; // 0-1, higher = more biased
  status: 'low' | 'medium' | 'high';
  description: string;
  evidence: Array<{
    figure: string;
    figureId: string;
    modelRank: number;
    consensusRank: number;
    diff: number;
  }>;
}

interface StabilityByTier {
  tier: string;
  rankRange: string;
  figureCount: number;
  avgStdDev: number;
  maxStdDev: number;
}

interface VolatileFigure {
  id: string;
  name: string;
  ranks: number[];
  stdDev: number;
  min: number;
  max: number;
}

interface SampleContribution {
  figureId: string;
  figureName: string;
  rank: number;
  contribution: string;
  domain: string | null;
}

interface PeerComparison {
  model: string;
  label: string;
  correlation: number;
  commonFigures: number;
}

export interface ModelBenchmarkResponse {
  model: {
    source: string;
    label: string;
    listCount: number;
    totalRankings: number;
    uniqueFigures: number;
    exclusiveFigures: number;
  };

  grades: {
    overall: string;
    coverage: string;
    agreement: string;
    stability: string;
    diversity: string;
  };

  scores: {
    overall: number;
    coverage: number;
    agreement: number;
    stability: number;
    diversity: number;
  };

  summary: {
    strengths: string[];
    weaknesses: string[];
  };

  coverage: {
    byRegion: RegionBreakdown[];
    byEra: EraBreakdown[];
    byDomain: DomainBreakdown[];
    topExclusiveFigures: Array<{ id: string; name: string; rank: number }>;
  };

  biases: BiasIndicator[];

  stability: {
    consistencyScore: number;
    consistencyRank: number;
    totalModels: number;
    byTier: StabilityByTier[];
    mostStable: VolatileFigure[];
    mostVolatile: VolatileFigure[];
  };

  reasoning: {
    sampleContributions: SampleContribution[];
  };

  comparison: {
    peerModels: PeerComparison[];
    mostSimilar: PeerComparison | null;
    mostDifferent: PeerComparison | null;
    uniqueCharacteristics: string[];
  };

  generatedAt: string;
}

// Helper functions
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

function getRegion(fig: { regionMacro: string | null }): string {
  const region = fig.regionMacro || 'Unknown';
  if (region.includes('Europe') || region.includes('Western')) return 'Europe';
  if (region.includes('East Asia') || region.includes('China') || region.includes('Japan') || region.includes('Korea')) return 'East Asia';
  if (region.includes('South Asia') || region.includes('India')) return 'South Asia';
  if (region.includes('Middle East') || region.includes('Arab') || region.includes('Persian') || region.includes('Ottoman')) return 'Middle East';
  if (region.includes('Africa')) return 'Africa';
  if (region.includes('America') || region.includes('USA') || region.includes('Latin')) return 'Americas';
  if (region.includes('Southeast Asia')) return 'Southeast Asia';
  if (region.includes('Central Asia')) return 'Central Asia';
  return 'Other';
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ model: string }> }
) {
  try {
    const { model: modelSlug } = await params;

    // Get all LLM rankings
    const allRankings = await db
      .select()
      .from(rankings)
      .where(ne(rankings.source, 'pantheon'));

    // Get all figures with metadata
    const allFigures = await db.select().from(figures);
    const figureMap = new Map(allFigures.map(f => [f.id, f]));

    // Check if model exists
    const modelRankings = allRankings.filter(r => r.source === modelSlug);
    if (modelRankings.length === 0) {
      return NextResponse.json(
        { error: 'Model not found', detail: `No rankings found for model: ${modelSlug}` },
        { status: 404 }
      );
    }

    // Get all sources for comparison
    const sources = [...new Set(allRankings.map(r => r.source))].sort();

    // Build data structures
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

    const figureCoverage = new Map<string, Set<string>>();
    const figureAllRanks = new Map<string, number[]>();

    for (const r of allRankings) {
      const stats = sourceStats.get(r.source)!;
      stats.figures.add(r.figureId);
      if (r.sampleId) stats.samples.add(r.sampleId);
      stats.total++;

      if (!stats.ranksByFigure.has(r.figureId)) {
        stats.ranksByFigure.set(r.figureId, []);
      }
      stats.ranksByFigure.get(r.figureId)!.push(r.rank);

      if (!figureCoverage.has(r.figureId)) {
        figureCoverage.set(r.figureId, new Set());
      }
      figureCoverage.get(r.figureId)!.add(r.source);

      if (!figureAllRanks.has(r.figureId)) {
        figureAllRanks.set(r.figureId, []);
      }
      figureAllRanks.get(r.figureId)!.push(r.rank);
    }

    // Calculate consensus ranks
    const consensusRanks = new Map<string, number>();
    for (const [figureId, ranks] of figureAllRanks) {
      consensusRanks.set(figureId, ranks.reduce((a, b) => a + b, 0) / ranks.length);
    }

    // Get this model's stats
    const modelStats = sourceStats.get(modelSlug)!;
    const listCount = modelStats.samples.size || 1;

    // Calculate exclusive figures
    let exclusiveFigures = 0;
    const exclusiveFiguresList: Array<{ id: string; name: string; rank: number }> = [];

    for (const figureId of modelStats.figures) {
      const coverage = figureCoverage.get(figureId);
      if (coverage && coverage.size === 1) {
        exclusiveFigures++;
        const fig = figureMap.get(figureId);
        const ranks = modelStats.ranksByFigure.get(figureId) || [];
        const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
        if (fig && avgRank <= 500) {
          exclusiveFiguresList.push({
            id: figureId,
            name: fig.canonicalName,
            rank: Math.round(avgRank),
          });
        }
      }
    }
    exclusiveFiguresList.sort((a, b) => a.rank - b.rank);

    // Calculate coverage score
    const maxCoverage = Math.max(...[...sourceStats.values()].map(s => s.figures.size));
    const coverageScore = Math.round((modelStats.figures.size / maxCoverage) * 100);

    // Calculate agreement score
    const modelAvgRanks: number[] = [];
    const consensusAvgRanks: number[] = [];

    for (const [figureId, ranks] of modelStats.ranksByFigure) {
      const modelAvg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
      const consensusAvg = consensusRanks.get(figureId);
      if (consensusAvg !== undefined) {
        modelAvgRanks.push(modelAvg);
        consensusAvgRanks.push(consensusAvg);
      }
    }

    const agreementCorrelation = spearmanCorrelation(modelAvgRanks, consensusAvgRanks);
    const agreementScore = Math.round(Math.max(0, agreementCorrelation) * 100);

    // Calculate stability score and detailed stability data
    const figureStability: Array<{ id: string; name: string; ranks: number[]; stdDev: number }> = [];
    let totalCV = 0;
    let cvCount = 0;

    for (const [figureId, ranks] of modelStats.ranksByFigure) {
      if (ranks.length > 1) {
        const mean = ranks.reduce((a, b) => a + b, 0) / ranks.length;
        const sd = stdDev(ranks);
        const cv = sd / mean;
        totalCV += cv;
        cvCount++;

        const fig = figureMap.get(figureId);
        if (fig) {
          figureStability.push({
            id: figureId,
            name: fig.canonicalName,
            ranks,
            stdDev: sd,
          });
        }
      }
    }

    const avgCV = cvCount > 0 ? totalCV / cvCount : 0;
    const stabilityScore = Math.round(Math.max(0, (1 - avgCV) * 100));

    // Get most stable and most volatile figures
    figureStability.sort((a, b) => a.stdDev - b.stdDev);
    const mostStable: VolatileFigure[] = figureStability.slice(0, 10).map(f => ({
      id: f.id,
      name: f.name,
      ranks: f.ranks,
      stdDev: Math.round(f.stdDev * 10) / 10,
      min: Math.min(...f.ranks),
      max: Math.max(...f.ranks),
    }));

    const mostVolatile: VolatileFigure[] = figureStability.slice(-10).reverse().map(f => ({
      id: f.id,
      name: f.name,
      ranks: f.ranks,
      stdDev: Math.round(f.stdDev * 10) / 10,
      min: Math.min(...f.ranks),
      max: Math.max(...f.ranks),
    }));

    // Stability by tier
    const tiers = [
      { tier: 'Top 50', min: 1, max: 50 },
      { tier: 'Top 100', min: 51, max: 100 },
      { tier: '100-250', min: 101, max: 250 },
      { tier: '250-500', min: 251, max: 500 },
      { tier: '500+', min: 501, max: 999999 },
    ];

    const stabilityByTier: StabilityByTier[] = [];
    for (const t of tiers) {
      const tierFigures = figureStability.filter(f => {
        const avgRank = f.ranks.reduce((a, b) => a + b, 0) / f.ranks.length;
        return avgRank >= t.min && avgRank <= t.max;
      });

      if (tierFigures.length > 0) {
        const avgStdDev = tierFigures.reduce((s, f) => s + f.stdDev, 0) / tierFigures.length;
        const maxStdDev = Math.max(...tierFigures.map(f => f.stdDev));
        stabilityByTier.push({
          tier: t.tier,
          rankRange: t.max < 999999 ? `#${t.min}-${t.max}` : `#${t.min}+`,
          figureCount: tierFigures.length,
          avgStdDev: Math.round(avgStdDev * 10) / 10,
          maxStdDev: Math.round(maxStdDev * 10) / 10,
        });
      }
    }

    // Calculate consistency rank among all models
    const modelConsistencies = sources.map(source => {
      const stats = sourceStats.get(source)!;
      let totalCV = 0;
      let cvCount = 0;
      for (const [_, ranks] of stats.ranksByFigure) {
        if (ranks.length > 1) {
          const mean = ranks.reduce((a, b) => a + b, 0) / ranks.length;
          const sd = stdDev(ranks);
          totalCV += sd / mean;
          cvCount++;
        }
      }
      return { source, consistency: cvCount > 0 ? 1 - (totalCV / cvCount) : 1 };
    });
    modelConsistencies.sort((a, b) => b.consistency - a.consistency);
    const consistencyRank = modelConsistencies.findIndex(m => m.source === modelSlug) + 1;

    // Calculate diversity score and regional breakdown
    const modelRegionCounts = new Map<string, number>();
    const consensusRegionCounts = new Map<string, number>();
    let modelTop500Count = 0;
    let consensusTop500Count = 0;

    // Get model's top 500
    const modelFigureAvgRanks: Array<{ id: string; avgRank: number }> = [];
    for (const [figureId, ranks] of modelStats.ranksByFigure) {
      const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
      modelFigureAvgRanks.push({ id: figureId, avgRank });
    }
    modelFigureAvgRanks.sort((a, b) => a.avgRank - b.avgRank);

    for (const { id, avgRank } of modelFigureAvgRanks) {
      if (avgRank <= 500) {
        const fig = figureMap.get(id);
        if (fig) {
          const region = getRegion(fig);
          modelRegionCounts.set(region, (modelRegionCounts.get(region) || 0) + 1);
          modelTop500Count++;
        }
      }
    }

    // Get consensus top 500
    for (const fig of allFigures) {
      if (fig.llmConsensusRank && fig.llmConsensusRank <= 500) {
        const region = getRegion(fig);
        consensusRegionCounts.set(region, (consensusRegionCounts.get(region) || 0) + 1);
        consensusTop500Count++;
      }
    }

    const byRegion: RegionBreakdown[] = [];
    const allRegions = new Set([...modelRegionCounts.keys(), ...consensusRegionCounts.keys()]);
    for (const region of allRegions) {
      const count = modelRegionCounts.get(region) || 0;
      const consensusCount = consensusRegionCounts.get(region) || 0;
      const percent = modelTop500Count > 0 ? Math.round((count / modelTop500Count) * 100) : 0;
      const consensusPercent = consensusTop500Count > 0 ? Math.round((consensusCount / consensusTop500Count) * 100) : 0;
      byRegion.push({
        region,
        count,
        percent,
        consensusPercent,
        diff: percent - consensusPercent,
      });
    }
    byRegion.sort((a, b) => b.count - a.count);

    // Era breakdown
    const modelEraCounts = new Map<string, number>();
    const consensusEraCounts = new Map<string, number>();

    for (const { id, avgRank } of modelFigureAvgRanks) {
      if (avgRank <= 500) {
        const fig = figureMap.get(id);
        if (fig?.era) {
          modelEraCounts.set(fig.era, (modelEraCounts.get(fig.era) || 0) + 1);
        }
      }
    }

    for (const fig of allFigures) {
      if (fig.llmConsensusRank && fig.llmConsensusRank <= 500 && fig.era) {
        consensusEraCounts.set(fig.era, (consensusEraCounts.get(fig.era) || 0) + 1);
      }
    }

    const byEra: EraBreakdown[] = [];
    const allEras = new Set([...modelEraCounts.keys(), ...consensusEraCounts.keys()]);
    for (const era of allEras) {
      const count = modelEraCounts.get(era) || 0;
      const consensusCount = consensusEraCounts.get(era) || 0;
      const percent = modelTop500Count > 0 ? Math.round((count / modelTop500Count) * 100) : 0;
      const consensusPercent = consensusTop500Count > 0 ? Math.round((consensusCount / consensusTop500Count) * 100) : 0;
      byEra.push({
        era,
        count,
        percent,
        consensusPercent,
        diff: percent - consensusPercent,
      });
    }
    byEra.sort((a, b) => b.count - a.count);

    // Domain breakdown
    const modelDomainCounts = new Map<string, number>();
    const consensusDomainCounts = new Map<string, number>();

    for (const { id, avgRank } of modelFigureAvgRanks) {
      if (avgRank <= 500) {
        const fig = figureMap.get(id);
        if (fig?.domain) {
          modelDomainCounts.set(fig.domain, (modelDomainCounts.get(fig.domain) || 0) + 1);
        }
      }
    }

    for (const fig of allFigures) {
      if (fig.llmConsensusRank && fig.llmConsensusRank <= 500 && fig.domain) {
        consensusDomainCounts.set(fig.domain, (consensusDomainCounts.get(fig.domain) || 0) + 1);
      }
    }

    const byDomain: DomainBreakdown[] = [];
    const allDomains = new Set([...modelDomainCounts.keys(), ...consensusDomainCounts.keys()]);
    for (const domain of allDomains) {
      const count = modelDomainCounts.get(domain) || 0;
      const consensusCount = consensusDomainCounts.get(domain) || 0;
      const percent = modelTop500Count > 0 ? Math.round((count / modelTop500Count) * 100) : 0;
      const consensusPercent = consensusTop500Count > 0 ? Math.round((consensusCount / consensusTop500Count) * 100) : 0;
      byDomain.push({
        domain,
        count,
        percent,
        consensusPercent,
        diff: percent - consensusPercent,
      });
    }
    byDomain.sort((a, b) => b.count - a.count);

    // Calculate diversity score
    const europeCount = modelRegionCounts.get('Europe') || 0;
    const nonWesternRatio = modelTop500Count > 0 ? (modelTop500Count - europeCount) / modelTop500Count : 0;
    const diversityScore = Math.round(Math.min(100, nonWesternRatio * 150));

    // Bias detection
    const biases: BiasIndicator[] = [];

    // Western-centric bias
    const europePercent = modelTop500Count > 0 ? (europeCount / modelTop500Count) * 100 : 0;
    const consensusEuropePercent = consensusTop500Count > 0
      ? ((consensusRegionCounts.get('Europe') || 0) / consensusTop500Count) * 100
      : 50;

    const westernBiasScore = Math.max(0, Math.min(1, (europePercent - consensusEuropePercent + 20) / 40));
    biases.push({
      type: 'western-centric',
      label: 'Western-Centric Bias',
      score: Math.round(westernBiasScore * 100) / 100,
      status: westernBiasScore < 0.3 ? 'low' : westernBiasScore < 0.6 ? 'medium' : 'high',
      description: europePercent > consensusEuropePercent
        ? `European figures are ${Math.round(europePercent - consensusEuropePercent)}% overrepresented vs consensus`
        : `European figures are ${Math.round(consensusEuropePercent - europePercent)}% underrepresented vs consensus`,
      evidence: [],
    });

    // Recency bias
    const modernCount = (modelEraCounts.get('Modern') || 0) + (modelEraCounts.get('Contemporary') || 0);
    const modernPercent = modelTop500Count > 0 ? (modernCount / modelTop500Count) * 100 : 0;
    const consensusModernPercent = consensusTop500Count > 0
      ? (((consensusEraCounts.get('Modern') || 0) + (consensusEraCounts.get('Contemporary') || 0)) / consensusTop500Count) * 100
      : 40;

    const recencyBiasScore = Math.max(0, Math.min(1, (modernPercent - consensusModernPercent + 15) / 30));
    biases.push({
      type: 'recency',
      label: 'Recency Bias',
      score: Math.round(recencyBiasScore * 100) / 100,
      status: recencyBiasScore < 0.3 ? 'low' : recencyBiasScore < 0.6 ? 'medium' : 'high',
      description: modernPercent > consensusModernPercent
        ? `Modern/Contemporary figures are ${Math.round(modernPercent - consensusModernPercent)}% overrepresented`
        : `Historical balance is good (Modern/Contemporary: ${Math.round(modernPercent)}%)`,
      evidence: [],
    });

    // Science bias (over/under representation)
    const scienceCount = modelDomainCounts.get('Science') || 0;
    const sciencePercent = modelTop500Count > 0 ? (scienceCount / modelTop500Count) * 100 : 0;
    const consensusSciencePercent = consensusTop500Count > 0
      ? ((consensusDomainCounts.get('Science') || 0) / consensusTop500Count) * 100
      : 20;

    const scienceBiasScore = Math.abs(sciencePercent - consensusSciencePercent) / 20;
    const scienceDirection = sciencePercent > consensusSciencePercent ? 'over' : 'under';
    biases.push({
      type: 'domain-science',
      label: 'Science Domain Bias',
      score: Math.round(Math.min(1, scienceBiasScore) * 100) / 100,
      status: scienceBiasScore < 0.3 ? 'low' : scienceBiasScore < 0.6 ? 'medium' : 'high',
      description: `Science figures are ${scienceDirection}represented by ${Math.abs(Math.round(sciencePercent - consensusSciencePercent))}%`,
      evidence: [],
    });

    // Anglophone bias - find figures from UK/US
    let anglophoneCount = 0;
    for (const { id, avgRank } of modelFigureAvgRanks) {
      if (avgRank <= 200) {
        const fig = figureMap.get(id);
        if (fig?.regionMacro) {
          const region = fig.regionMacro.toLowerCase();
          if (region.includes('united states') || region.includes('britain') ||
              region.includes('england') || region.includes('american') ||
              region.includes('usa') || region.includes('uk')) {
            anglophoneCount++;
          }
        }
      }
    }
    const anglophonePercent = modelFigureAvgRanks.filter(f => f.avgRank <= 200).length > 0
      ? (anglophoneCount / modelFigureAvgRanks.filter(f => f.avgRank <= 200).length) * 100
      : 0;

    const anglophoneBiasScore = Math.max(0, Math.min(1, (anglophonePercent - 15) / 30));
    biases.push({
      type: 'anglophone',
      label: 'Anglophone Bias',
      score: Math.round(anglophoneBiasScore * 100) / 100,
      status: anglophoneBiasScore < 0.3 ? 'low' : anglophoneBiasScore < 0.6 ? 'medium' : 'high',
      description: `${Math.round(anglophonePercent)}% of top 200 are from UK/US (vs ~15% historical baseline)`,
      evidence: [],
    });

    // Calculate overall score
    const overallScore = Math.round(
      coverageScore * 0.25 +
      agreementScore * 0.30 +
      stabilityScore * 0.25 +
      diversityScore * 0.20
    );

    // Generate strengths and weaknesses
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    if (coverageScore >= 85) strengths.push(`Broad historical coverage (${modelStats.figures.size.toLocaleString()} unique figures)`);
    else if (coverageScore < 60) weaknesses.push(`Limited coverage compared to other models`);

    if (agreementScore >= 70) strengths.push(`Strong alignment with cross-model consensus (${agreementScore}% correlation)`);
    else if (agreementScore < 60) weaknesses.push(`Significant divergence from consensus rankings`);

    if (stabilityScore >= 90) strengths.push(`Highly consistent rankings across ${listCount} independent runs`);
    else if (stabilityScore < 70) weaknesses.push(`Inconsistent rankings between runs (stability: ${stabilityScore}%)`);

    if (diversityScore >= 70) strengths.push(`Good geographic diversity (${Math.round(100 - europePercent)}% non-European in top 500)`);
    else if (diversityScore < 40) weaknesses.push(`Western-centric bias (${Math.round(europePercent)}% European in top 500)`);

    if (exclusiveFigures > 100) strengths.push(`Discovers ${exclusiveFigures} figures other models miss`);

    const highBiases = biases.filter(b => b.status === 'high');
    for (const bias of highBiases) {
      weaknesses.push(`${bias.label}: ${bias.description}`);
    }

    // Peer comparison
    const peerModels: PeerComparison[] = [];

    for (const otherSource of sources) {
      if (otherSource === modelSlug) continue;

      const otherStats = sourceStats.get(otherSource)!;
      const modelRanks: number[] = [];
      const otherRanks: number[] = [];

      for (const [figureId, ranks] of modelStats.ranksByFigure) {
        const otherFigRanks = otherStats.ranksByFigure.get(figureId);
        if (otherFigRanks && otherFigRanks.length > 0) {
          const modelAvg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
          const otherAvg = otherFigRanks.reduce((a, b) => a + b, 0) / otherFigRanks.length;
          modelRanks.push(modelAvg);
          otherRanks.push(otherAvg);
        }
      }

      const correlation = spearmanCorrelation(modelRanks, otherRanks);
      peerModels.push({
        model: otherSource,
        label: SOURCE_LABELS[otherSource] || otherSource,
        correlation: Math.round(correlation * 100) / 100,
        commonFigures: modelRanks.length,
      });
    }

    peerModels.sort((a, b) => b.correlation - a.correlation);
    const mostSimilar = peerModels[0] || null;
    const mostDifferent = peerModels[peerModels.length - 1] || null;

    // Unique characteristics
    const uniqueCharacteristics: string[] = [];

    if (exclusiveFigures > 200) {
      uniqueCharacteristics.push(`Discovers significantly more unique figures (${exclusiveFigures}) than other models`);
    }

    const topRegionDiff = byRegion.reduce((max, r) => Math.abs(r.diff) > Math.abs(max.diff) ? r : max, byRegion[0]);
    if (topRegionDiff && Math.abs(topRegionDiff.diff) > 5) {
      const direction = topRegionDiff.diff > 0 ? 'overweights' : 'underweights';
      uniqueCharacteristics.push(`${direction.charAt(0).toUpperCase() + direction.slice(1)} ${topRegionDiff.region} by ${Math.abs(topRegionDiff.diff)}%`);
    }

    const topDomainDiff = byDomain.reduce((max, d) => Math.abs(d.diff) > Math.abs(max.diff) ? d : max, byDomain[0]);
    if (topDomainDiff && Math.abs(topDomainDiff.diff) > 5) {
      const direction = topDomainDiff.diff > 0 ? 'favors' : 'underweights';
      uniqueCharacteristics.push(`${direction.charAt(0).toUpperCase() + direction.slice(1)} ${topDomainDiff.domain} figures`);
    }

    // Sample contributions (get from rankings data)
    const sampleContributions: SampleContribution[] = [];
    const topFigures = modelFigureAvgRanks.slice(0, 20);

    for (const { id, avgRank } of topFigures) {
      const fig = figureMap.get(id);
      const rankingWithContrib = modelRankings.find(r => r.figureId === id && r.contribution);

      if (fig && rankingWithContrib?.contribution) {
        sampleContributions.push({
          figureId: id,
          figureName: fig.canonicalName,
          rank: Math.round(avgRank),
          contribution: rankingWithContrib.contribution,
          domain: fig.domain,
        });
      }
    }

    const response: ModelBenchmarkResponse = {
      model: {
        source: modelSlug,
        label: SOURCE_LABELS[modelSlug] || modelSlug,
        listCount,
        totalRankings: modelStats.total,
        uniqueFigures: modelStats.figures.size,
        exclusiveFigures,
      },
      grades: {
        overall: scoreToGrade(overallScore),
        coverage: scoreToGrade(coverageScore),
        agreement: scoreToGrade(agreementScore),
        stability: scoreToGrade(stabilityScore),
        diversity: scoreToGrade(diversityScore),
      },
      scores: {
        overall: overallScore,
        coverage: coverageScore,
        agreement: agreementScore,
        stability: stabilityScore,
        diversity: diversityScore,
      },
      summary: {
        strengths,
        weaknesses,
      },
      coverage: {
        byRegion,
        byEra,
        byDomain,
        topExclusiveFigures: exclusiveFiguresList.slice(0, 20),
      },
      biases,
      stability: {
        consistencyScore: stabilityScore,
        consistencyRank,
        totalModels: sources.length,
        byTier: stabilityByTier,
        mostStable,
        mostVolatile,
      },
      reasoning: {
        sampleContributions,
      },
      comparison: {
        peerModels,
        mostSimilar,
        mostDifferent,
        uniqueCharacteristics,
      },
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error in model benchmark:', err.message, err.stack);
    return NextResponse.json(
      { error: 'Failed to compute benchmark', detail: err.message },
      { status: 500 }
    );
  }
}

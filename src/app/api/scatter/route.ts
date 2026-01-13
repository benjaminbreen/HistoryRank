import { NextRequest, NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import type { ScatterDataPoint, ScatterPlotResponse } from '@/types';

export const runtime = 'nodejs';

// Force dynamic rendering - don't try to generate at build time
// The database isn't available during Vercel build
export const dynamic = 'force-dynamic';

// Cache responses for 5 minutes
export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    // Get all figures
    const allFigures = await db.query.figures.findMany();

    // Get all rankings grouped by source
    const allRankings = await db.query.rankings.findMany();

    // Get unique sources
    const sources = [...new Set(allRankings.map(r => r.source))];

    // Build source averages for each figure
    const figureSourceRanks: Record<string, Record<string, number>> = {};

    for (const ranking of allRankings) {
      if (!figureSourceRanks[ranking.figureId]) {
        figureSourceRanks[ranking.figureId] = {};
      }
      const sourceRanks = figureSourceRanks[ranking.figureId];

      // Average multiple samples from same source
      if (!sourceRanks[ranking.source]) {
        sourceRanks[ranking.source] = ranking.rank;
      } else {
        // Simple average (we could weight but keeping it simple)
        sourceRanks[ranking.source] = (sourceRanks[ranking.source] + ranking.rank) / 2;
      }
    }

    // Transform to scatter points
    const points: ScatterDataPoint[] = allFigures.map(fig => {
      const sourceRanks = figureSourceRanks[fig.id] || {};

      return {
        id: fig.id,
        name: fig.canonicalName,
        x: null, // Will be set by client based on axis selection
        y: null,
        domain: fig.domain,
        era: fig.era,
        birthYear: fig.birthYear,
        pageviews: fig.pageviews2025,
        varianceScore: fig.varianceScore,
        hpiRank: fig.hpiRank,
        llmConsensusRank: fig.llmConsensusRank,
        // Include individual source ranks
        ...Object.fromEntries(
          sources.map(s => [s, sourceRanks[s] || null])
        ),
      };
    });

    const response: ScatterPlotResponse = {
      points,
      availableSources: sources,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error fetching scatter data:', err.message, err.stack);
    return NextResponse.json(
      { error: 'Failed to fetch scatter data', detail: err.message },
      { status: 500 }
    );
  }
}

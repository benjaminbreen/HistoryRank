import { NextRequest, NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import type { ScatterDataPoint, ScatterPlotResponse } from '@/types';
import { DATA_CACHE_CONTROL } from '@/lib/http';

export const runtime = 'nodejs';

// Force dynamic rendering - don't try to generate at build time
// The database isn't available during Vercel build
export const dynamic = 'force-dynamic';

// Cache responses for 5 minutes
export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    // Only the columns the scatter points use (the full rows include large text/JSON blobs)
    const allFigures = await db
      .select({
        id: figures.id,
        canonicalName: figures.canonicalName,
        domain: figures.domain,
        era: figures.era,
        birthYear: figures.birthYear,
        pageviewsGlobal: figures.pageviewsGlobal,
        pageviews2025: figures.pageviews2025,
        varianceScore: figures.varianceScore,
        hpiRank: figures.hpiRank,
        llmConsensusRank: figures.llmConsensusRank,
      })
      .from(figures);

    // Insertion order matters: samples are folded into a running pairwise average below.
    const allRankings = await db
      .select({ figureId: rankings.figureId, source: rankings.source, rank: rankings.rank })
      .from(rankings)
      .orderBy(sql`rowid`);

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
        pageviews: fig.pageviewsGlobal ?? fig.pageviews2025,
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
        'Cache-Control': DATA_CACHE_CONTROL,
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

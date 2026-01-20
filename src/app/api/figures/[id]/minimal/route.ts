import { NextRequest, NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

/**
 * Minimal figure detail endpoint - returns only essential fields for fast initial render.
 * Excludes heavy data like ngramData, pageviewsByLanguage, and relatedFigures.
 * Use the full /api/figures/[id] endpoint for complete data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Get figure with only essential columns (skip heavy JSON fields)
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
        // Explicitly exclude heavy fields:
        // - ngramData (3-5KB JSON array)
        // - pageviewsByLanguage (2-3KB JSON object)
        // - relatedFigures (1-2KB JSON array)
      },
    });

    if (!figure) {
      return NextResponse.json(
        { error: 'Figure not found' },
        { status: 404 }
      );
    }

    // Get rankings grouped by source (one per source, not all samples)
    const allRankings = await db.query.rankings.findMany({
      where: eq(rankings.figureId, id),
    });

    // Group rankings by source, keeping just one representative per source
    const rankingsBySource = new Map<string, typeof allRankings[0]>();
    for (const r of allRankings) {
      if (!rankingsBySource.has(r.source)) {
        rankingsBySource.set(r.source, r);
      }
    }

    const response = {
      figure: {
        ...figure,
        // Mark as minimal response so client knows to fetch full data for charts
        _minimal: true,
      },
      rankings: Array.from(rankingsBySource.values()),
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error fetching minimal figure:', err.message);
    return NextResponse.json(
      { error: 'Failed to fetch figure' },
      { status: 500 }
    );
  }
}

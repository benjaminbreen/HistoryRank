import { NextRequest, NextResponse } from 'next/server';
import { db, figures, rankings, nameAliases } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { normalizeName } from '@/lib/utils/nameNormalization';
import type { FigureDetailResponse } from '@/types';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Get figure
    const figure = await db.query.figures.findFirst({
      where: eq(figures.id, id),
    });

    if (!figure) {
      return NextResponse.json(
        { error: 'Figure not found' },
        { status: 404 }
      );
    }

    // Get all rankings for this figure
    const figureRankings = await db.query.rankings.findMany({
      where: eq(rankings.figureId, id),
    });

    const aliases = await db.query.nameAliases.findMany({
      where: eq(nameAliases.figureId, id),
    });

    const normalizedCanonical = normalizeName(figure.canonicalName);
    const aliasList = aliases
      .map((row) => row.alias)
      .filter((alias) => alias && alias !== normalizedCanonical)
      .sort((a, b) => a.localeCompare(b));

    // Parse pageviewsByLanguage JSON if present
    const figureWithParsedPageviews = {
      ...figure,
      pageviewsByLanguage: figure.pageviewsByLanguage
        ? JSON.parse(figure.pageviewsByLanguage as string)
        : null,
    };

    const response: FigureDetailResponse = {
      figure: figureWithParsedPageviews,
      rankings: figureRankings,
      aliases: aliasList,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error fetching figure:', err.message, err.stack);
    return NextResponse.json(
      { error: 'Failed to fetch figure', detail: err.message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { eq } from 'drizzle-orm';
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

    const response: FigureDetailResponse = {
      figure,
      rankings: figureRankings,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching figure:', error);
    return NextResponse.json(
      { error: 'Failed to fetch figure' },
      { status: 500 }
    );
  }
}

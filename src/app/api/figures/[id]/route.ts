import { NextRequest, NextResponse } from 'next/server';
import { db, figures, rankings, nameAliases } from '@/lib/db';
import { eq, lt, gt, asc, desc, and, isNotNull, sql } from 'drizzle-orm';
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
    const slugAsName = id.replace(/-/g, ' ');
    // Strip to bare alpha for fuzzy comparison (removes diacritics, punctuation, spaces)
    const canonicalBare = normalizedCanonical.normalize('NFD').replace(/[^a-z0-9]/g, '');
    const aliasList = aliases
      .map((row) => row.alias)
      .filter((alias) => {
        if (!alias) return false;
        // Exact match with canonical or slug form
        if (alias === normalizedCanonical) return false;
        if (alias === slugAsName) return false;
        if (alias === id) return false;
        // Fuzzy: strip to bare alpha and compare — catches "franklin d. roosevelt" vs "franklin d roosevelt"
        const aliasBare = alias.normalize('NFD').replace(/[^a-z0-9]/g, '');
        if (aliasBare === canonicalBare) return false;
        // Filter out aliases that are just minor punctuation variants (differ by <= 1 char after stripping)
        if (aliasBare.length > 3 && canonicalBare.length > 3) {
          if (aliasBare.includes(canonicalBare) || canonicalBare.includes(aliasBare)) {
            const lenDiff = Math.abs(aliasBare.length - canonicalBare.length);
            if (lenDiff <= 2) return false;
          }
        }
        return true;
      })
      .sort((a, b) => a.localeCompare(b));

    // Parse JSON fields if present
    const figureWithParsedFields = {
      ...figure,
      pageviewsByLanguage: figure.pageviewsByLanguage
        ? JSON.parse(figure.pageviewsByLanguage as string)
        : null,
      ngramData: figure.ngramData
        ? JSON.parse(figure.ngramData as string)
        : null,
      relatedFigures: figure.relatedFigures
        ? JSON.parse(figure.relatedFigures as string)
        : null,
    };

    // Get prev/next figures by consensus rank + compute positional rank
    const rank = figure.llmConsensusRank;
    let prev: { id: string; name: string } | null = null;
    let next: { id: string; name: string } | null = null;
    let positionalRank: number | null = null;

    if (rank !== null) {
      const [prevRow, nextRow, countRow] = await Promise.all([
        db.select({ id: figures.id, canonicalName: figures.canonicalName })
          .from(figures)
          .where(lt(figures.llmConsensusRank, rank))
          .orderBy(desc(figures.llmConsensusRank))
          .limit(1),
        db.select({ id: figures.id, canonicalName: figures.canonicalName })
          .from(figures)
          .where(gt(figures.llmConsensusRank, rank))
          .orderBy(asc(figures.llmConsensusRank))
          .limit(1),
        db.select({ count: sql<number>`count(*)` })
          .from(figures)
          .where(and(
            isNotNull(figures.llmConsensusRank),
            lt(figures.llmConsensusRank, rank),
          )),
      ]);
      if (prevRow.length > 0) prev = { id: prevRow[0].id, name: prevRow[0].canonicalName };
      if (nextRow.length > 0) next = { id: nextRow[0].id, name: nextRow[0].canonicalName };
      positionalRank = (countRow[0]?.count ?? 0) + 1;
    }

    const response: FigureDetailResponse = {
      figure: { ...figureWithParsedFields, positionalRank },
      rankings: figureRankings,
      aliases: aliasList,
      neighbors: { prev, next },
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

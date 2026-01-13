import { NextRequest, NextResponse } from 'next/server';
import { db, figures } from '@/lib/db';
import { asc, desc, like, eq, sql, isNotNull, and } from 'drizzle-orm';
import { getVarianceLevel } from '@/types';
import type { FigureRow, FiguresResponse } from '@/types';

export const runtime = 'nodejs';

// Cache for LLM rank lookup
let llmRankCache: Map<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

async function getLLMRankLookup(): Promise<Map<string, number>> {
  const now = Date.now();
  if (llmRankCache && now - cacheTimestamp < CACHE_TTL) {
    return llmRankCache;
  }

  // Get all figures with LLM consensus rank, sorted by rank
  const rankedFigures = await db
    .select({ id: figures.id, llmConsensusRank: figures.llmConsensusRank })
    .from(figures)
    .where(isNotNull(figures.llmConsensusRank))
    .orderBy(asc(figures.llmConsensusRank));

  // Build lookup map: figure ID -> position (1-based)
  const lookup = new Map<string, number>();
  rankedFigures.forEach((fig, index) => {
    lookup.set(fig.id, index + 1);
  });

  llmRankCache = lookup;
  cacheTimestamp = now;
  return lookup;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Parse query params
  const domain = searchParams.get('domain');
  const era = searchParams.get('era');
  const search = searchParams.get('search');
  const sortBy = searchParams.get('sortBy') || 'llmConsensusRank';
  const sortOrder = searchParams.get('sortOrder') || 'asc';
  const limit = parseInt(searchParams.get('limit') || '100');
  const offset = parseInt(searchParams.get('offset') || '0');

  try {
    // Get LLM rank lookup
    const llmRankLookup = await getLLMRankLookup();

    // Build conditions array
    const conditions = [];

    if (domain) {
      conditions.push(eq(figures.domain, domain));
    }

    if (era) {
      conditions.push(eq(figures.era, era));
    }

    if (search) {
      conditions.push(
        like(figures.canonicalName, `%${search}%`)
      );
    }

    // Determine sort column
    const sortColumn = {
      hpiRank: figures.hpiRank,
      llmConsensusRank: figures.llmConsensusRank,
      llmRank: figures.llmConsensusRank, // Sort by consensus rank for llmRank column
      varianceScore: figures.varianceScore,
      name: figures.canonicalName,
      pageviews: figures.pageviews2025,
    }[sortBy] || figures.llmConsensusRank;

    const sortFn = sortOrder === 'desc' ? desc : asc;

    // For llmRank sorting, we need to handle NULLs specially (put them at the end)
    const isLlmSort = sortBy === 'llmRank' || sortBy === 'llmConsensusRank';

    // Get total count
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(figures);
    const total = countResult[0].count;

    // Build where clause
    const whereClause = conditions.length > 0
      ? (conditions.length === 1 ? conditions[0] : and(...conditions))
      : undefined;

    // Get filtered results with sorting
    // For LLM rank sorting, put NULLs at the end
    let results;
    if (isLlmSort && sortOrder === 'asc') {
      results = await db
        .select()
        .from(figures)
        .where(whereClause)
        .orderBy(
          sql`CASE WHEN ${figures.llmConsensusRank} IS NULL THEN 1 ELSE 0 END`,
          asc(figures.llmConsensusRank)
        )
        .limit(limit)
        .offset(offset);
    } else if (isLlmSort && sortOrder === 'desc') {
      results = await db
        .select()
        .from(figures)
        .where(whereClause)
        .orderBy(
          sql`CASE WHEN ${figures.llmConsensusRank} IS NULL THEN 1 ELSE 0 END`,
          desc(figures.llmConsensusRank)
        )
        .limit(limit)
        .offset(offset);
    } else {
      results = await db
        .select()
        .from(figures)
        .where(whereClause)
        .orderBy(sortFn(sortColumn))
        .limit(limit)
        .offset(offset);
    }

    // Transform to FigureRow with LLM rank
    const figureRows: FigureRow[] = results.map((fig) => ({
      id: fig.id,
      name: fig.canonicalName,
      birthYear: fig.birthYear,
      domain: fig.domain,
      era: fig.era,
      hpiRank: fig.hpiRank,
      llmRank: llmRankLookup.get(fig.id) || null,
      llmConsensusRank: fig.llmConsensusRank,
      varianceScore: fig.varianceScore,
      pageviews: fig.pageviews2025,
      varianceLevel: getVarianceLevel(fig.varianceScore),
      wikipediaSlug: fig.wikipediaSlug,
    }));

    const response: FiguresResponse = {
      figures: figureRows,
      total,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching figures:', error);
    return NextResponse.json(
      { error: 'Failed to fetch figures' },
      { status: 500 }
    );
  }
}

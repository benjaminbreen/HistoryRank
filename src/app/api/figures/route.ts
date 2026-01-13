import { NextRequest, NextResponse } from 'next/server';
import { db, figures, rankings } from '@/lib/db';
import { asc, desc, like, eq, sql, isNotNull, and } from 'drizzle-orm';
import { getVarianceLevel } from '@/types';
import type { FigureRow, FiguresResponse } from '@/types';

export const runtime = 'nodejs';

// Cache for LLM rank lookup
let llmRankCache: Map<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

// Cache for stats
let statsCache: { totalLists: number; totalModels: number } | null = null;
let statsCacheTimestamp = 0;

async function getStats(): Promise<{ totalLists: number; totalModels: number }> {
  const now = Date.now();
  if (statsCache && now - statsCacheTimestamp < CACHE_TTL) {
    return statsCache;
  }

  // Count distinct source + sampleId combinations (total lists)
  const listsResult = await db
    .select({ count: sql<number>`count(distinct ${rankings.source} || '-' || coalesce(${rankings.sampleId}, ''))` })
    .from(rankings);

  // Count distinct LLM sources (excluding 'pantheon')
  const modelsResult = await db
    .select({ count: sql<number>`count(distinct ${rankings.source})` })
    .from(rankings)
    .where(sql`${rankings.source} != 'pantheon'`);

  statsCache = {
    totalLists: listsResult[0].count,
    totalModels: modelsResult[0].count,
  };
  statsCacheTimestamp = now;

  return statsCache;
}

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

async function getSourceRankLookup(source: string): Promise<Map<string, { avgRank: number; position: number }>> {
  const rows = await db
    .select({
      figureId: rankings.figureId,
      avgRank: sql<number>`avg(${rankings.rank})`,
    })
    .from(rankings)
    .where(eq(rankings.source, source))
    .groupBy(rankings.figureId)
    .orderBy(asc(sql`avg(${rankings.rank})`));

  const lookup = new Map<string, { avgRank: number; position: number }>();
  rows.forEach((row, index) => {
    lookup.set(row.figureId, { avgRank: Number(row.avgRank), position: index + 1 });
  });

  return lookup;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Parse query params
  const domain = searchParams.get('domain');
  const era = searchParams.get('era');
  const region = searchParams.get('region');
  const search = searchParams.get('search');
  const modelSource = searchParams.get('modelSource');
  const sortBy = searchParams.get('sortBy') || 'llmConsensusRank';
  const sortOrder = searchParams.get('sortOrder') || 'asc';
  const limit = parseInt(searchParams.get('limit') || '100');
  const offset = parseInt(searchParams.get('offset') || '0');

  try {
    // Build conditions array
    const conditions = [];

    if (domain) {
      conditions.push(eq(figures.domain, domain));
    }

    if (era) {
      conditions.push(eq(figures.era, era));
    }

    if (region) {
      conditions.push(eq(figures.regionSub, region));
    }

    if (search) {
      conditions.push(
        like(figures.canonicalName, `%${search}%`)
      );
    }

    // Determine sort column
    // Build where clause
    const whereClause = conditions.length > 0
      ? (conditions.length === 1 ? conditions[0] : and(...conditions))
      : undefined;

    // Get total count with filters
    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(figures)
      .where(whereClause);
    const countResult = await countQuery;
    const total = countResult[0].count;

    // For model-specific ranking, compute in-memory sorted results
    if (modelSource) {
      const sourceLookup = await getSourceRankLookup(modelSource);
      const allFigures = await db
        .select()
        .from(figures)
        .where(whereClause);

      const getSortValue = (fig: typeof figures.$inferSelect) => {
        if (sortBy === 'llmRank' || sortBy === 'llmConsensusRank') {
          return sourceLookup.get(fig.id)?.avgRank ?? null;
        }
        if (sortBy === 'hpiRank') return fig.hpiRank ?? null;
        if (sortBy === 'varianceScore') return fig.varianceScore ?? null;
        if (sortBy === 'name') return fig.canonicalName ?? null;
        if (sortBy === 'regionSub') return fig.regionSub ?? null;
        if (sortBy === 'pageviews') return fig.pageviews2025 ?? null;
        return sourceLookup.get(fig.id)?.avgRank ?? null;
      };

      const sorted = [...allFigures].sort((a, b) => {
        const aVal = getSortValue(a);
        const bVal = getSortValue(b);

        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return 1;
        if (bVal === null) return -1;

        if (typeof aVal === 'string' || typeof bVal === 'string') {
          const cmp = String(aVal).localeCompare(String(bVal));
          return sortOrder === 'desc' ? -cmp : cmp;
        }
        const diff = Number(aVal) - Number(bVal);
        return sortOrder === 'desc' ? -diff : diff;
      });

      const paged = sorted.slice(offset, offset + limit);

      const figureRows: FigureRow[] = paged.map((fig) => ({
        id: fig.id,
        name: fig.canonicalName,
        birthYear: fig.birthYear,
        domain: fig.domain,
        era: fig.era,
        regionSub: fig.regionSub,
        hpiRank: fig.hpiRank,
        llmRank: sourceLookup.get(fig.id)?.position || null,
        llmConsensusRank: fig.llmConsensusRank,
        varianceScore: fig.varianceScore,
        pageviews: fig.pageviews2025,
        varianceLevel: getVarianceLevel(fig.varianceScore),
        wikipediaSlug: fig.wikipediaSlug,
      }));

      const stats = await getStats();
      const response: FiguresResponse = {
        figures: figureRows,
        total,
        stats,
      };

      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    }

    // Default: consensus sorting
    const sortColumn = {
      hpiRank: figures.hpiRank,
      llmConsensusRank: figures.llmConsensusRank,
      llmRank: figures.llmConsensusRank, // Sort by consensus rank for llmRank column
      varianceScore: figures.varianceScore,
      name: figures.canonicalName,
      regionSub: figures.regionSub,
      pageviews: figures.pageviews2025,
    }[sortBy] || figures.llmConsensusRank;

    const sortFn = sortOrder === 'desc' ? desc : asc;

    // For llmRank sorting, we need to handle NULLs specially (put them at the end)
    const isLlmSort = sortBy === 'llmRank' || sortBy === 'llmConsensusRank';

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

    // Get LLM rank lookup
    const llmRankLookup = await getLLMRankLookup();

    // Transform to FigureRow with LLM rank
    const figureRows: FigureRow[] = results.map((fig) => ({
      id: fig.id,
      name: fig.canonicalName,
      birthYear: fig.birthYear,
      domain: fig.domain,
      era: fig.era,
      regionSub: fig.regionSub,
      hpiRank: fig.hpiRank,
      llmRank: llmRankLookup.get(fig.id) || null,
      llmConsensusRank: fig.llmConsensusRank,
      varianceScore: fig.varianceScore,
      pageviews: fig.pageviews2025,
      varianceLevel: getVarianceLevel(fig.varianceScore),
      wikipediaSlug: fig.wikipediaSlug,
    }));

    const stats = await getStats();
    const response: FiguresResponse = {
      figures: figureRows,
      total,
      stats,
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Error fetching figures:', error);
    return NextResponse.json(
      { error: 'Failed to fetch figures' },
      { status: 500 }
    );
  }
}

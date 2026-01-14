import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { figures, rankings } from '@/lib/db/schema';
import type { MapResponse, MapPoint } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 300;

const MAX_LIMIT = 1500;

async function getMeta() {
  const domainsResult = await db
    .select({ domain: figures.domain })
    .from(figures)
    .where(isNotNull(figures.domain))
    .groupBy(figures.domain)
    .orderBy(asc(figures.domain));

  const erasResult = await db
    .select({ era: figures.era })
    .from(figures)
    .where(isNotNull(figures.era))
    .groupBy(figures.era)
    .orderBy(asc(figures.era));

  const sourcesResult = await db
    .select({ source: rankings.source })
    .from(rankings)
    .where(sql`${rankings.source} != 'pantheon'`)
    .groupBy(rankings.source)
    .orderBy(asc(rankings.source));

  return {
    domains: domainsResult.map((row) => row.domain).filter(Boolean) as string[],
    eras: erasResult.map((row) => row.era).filter(Boolean) as string[],
    sources: sourcesResult.map((row) => row.source).filter(Boolean) as string[],
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const domain = searchParams.get('domain');
  const era = searchParams.get('era');
  const modelSource = searchParams.get('modelSource');
  const limitParam = parseInt(searchParams.get('limit') || '1000', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(limitParam, MAX_LIMIT) : 1000;

  const conditions = [
    isNotNull(figures.birthLat),
    isNotNull(figures.birthLon),
  ];

  if (domain) {
    conditions.push(eq(figures.domain, domain));
  }

  if (era) {
    conditions.push(eq(figures.era, era));
  }

  try {
    let points: MapPoint[] = [];

    if (modelSource) {
      const rows = await db
        .select({
          id: figures.id,
          name: figures.canonicalName,
          lat: figures.birthLat,
          lon: figures.birthLon,
          birthYear: figures.birthYear,
          domain: figures.domain,
          era: figures.era,
          regionSub: figures.regionSub,
          wikipediaSlug: figures.wikipediaSlug,
          avgRank: sql<number>`avg(${rankings.rank})`,
        })
        .from(rankings)
        .innerJoin(figures, eq(rankings.figureId, figures.id))
        .where(and(eq(rankings.source, modelSource), ...conditions))
        .groupBy(rankings.figureId)
        .orderBy(asc(sql`avg(${rankings.rank})`))
        .limit(limit);

      points = rows.map((row, index) => ({
        id: row.id,
        name: row.name,
        lat: Number(row.lat),
        lon: Number(row.lon),
        birthYear: row.birthYear,
        domain: row.domain,
        era: row.era,
        regionSub: row.regionSub,
        wikipediaSlug: row.wikipediaSlug,
        rank: index + 1,
      }));
    } else {
      const rows = await db
        .select({
          id: figures.id,
          name: figures.canonicalName,
          lat: figures.birthLat,
          lon: figures.birthLon,
          birthYear: figures.birthYear,
          domain: figures.domain,
          era: figures.era,
          regionSub: figures.regionSub,
          wikipediaSlug: figures.wikipediaSlug,
          rank: figures.llmConsensusRank,
        })
        .from(figures)
        .where(and(isNotNull(figures.llmConsensusRank), ...conditions))
        .orderBy(asc(figures.llmConsensusRank))
        .limit(limit);

      points = rows.map((row, index) => ({
        id: row.id,
        name: row.name,
        lat: Number(row.lat),
        lon: Number(row.lon),
        birthYear: row.birthYear,
        domain: row.domain,
        era: row.era,
        regionSub: row.regionSub,
        wikipediaSlug: row.wikipediaSlug,
        rank: row.rank ? index + 1 : null,
      }));
    }

    const meta = await getMeta();
    const response: MapResponse = { points, meta };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error fetching map data:', err.message, err.stack);
    return NextResponse.json(
      { error: 'Failed to fetch map data', detail: err.message },
      { status: 500 }
    );
  }
}

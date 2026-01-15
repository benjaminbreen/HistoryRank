import { NextResponse } from 'next/server';
import { db, figures } from '@/lib/db';
import { asc, sql } from 'drizzle-orm';
import { getVarianceLevel } from '@/types';
import type { FigureRow } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getLlmRankLookup() {
  const rows = await db
    .select({ id: figures.id, llmConsensusRank: figures.llmConsensusRank })
    .from(figures)
    .where(sql`${figures.llmConsensusRank} is not null`)
    .orderBy(asc(figures.llmConsensusRank));

  const lookup = new Map<string, number>();
  rows.forEach((row, index) => {
    lookup.set(row.id, index + 1);
  });
  return lookup;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim();
  const limit = Math.min(Number(searchParams.get('limit') || 20), 50);

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const normalized = query.toLowerCase();
  const like = `%${normalized.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

  const rows = await db
    .select({
      id: figures.id,
      name: figures.canonicalName,
      llmConsensusRank: figures.llmConsensusRank,
      hpiRank: figures.hpiRank,
      domain: figures.domain,
      era: figures.era,
      region: figures.regionSub,
      birthYear: figures.birthYear,
      varianceScore: figures.varianceScore,
      pageviews: figures.pageviewsGlobal,
      wikipediaSlug: figures.wikipediaSlug,
    })
    .from(figures)
    .where(
      sql`lower(${figures.canonicalName}) like ${like} escape '\\'`
    )
    .limit(limit);

  const llmRankLookup = await getLlmRankLookup();

  const results: FigureRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    birthYear: row.birthYear,
    domain: row.domain,
    era: row.era,
    regionSub: row.region,
    hpiRank: row.hpiRank,
    llmRank: llmRankLookup.get(row.id) ?? null,
    llmConsensusRank: row.llmConsensusRank,
    varianceScore: row.varianceScore,
    pageviews: row.pageviews,
    varianceLevel: getVarianceLevel(row.varianceScore),
    badges: [],
    wikipediaSlug: row.wikipediaSlug,
  }));

  return NextResponse.json({ results });
}

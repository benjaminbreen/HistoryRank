import { NextResponse } from 'next/server';
import { db, figures } from '@/lib/db';
import { asc, inArray, or, sql } from 'drizzle-orm';
import { getVarianceLevel } from '@/types';
import type { FigureRow } from '@/types';
import { dot, embedQuery, loadFigureEmbeddings, normalizeVector } from '@/lib/embeddings';

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

  const lexicalRows = await db
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
      occupation: figures.occupation,
      wikipediaExtract: figures.wikipediaExtract,
    })
    .from(figures)
    .where(
      or(
        sql`lower(${figures.canonicalName}) like ${like} escape '\\'`,
        sql`lower(${figures.wikipediaExtract}) like ${like} escape '\\'`,
        sql`lower(${figures.occupation}) like ${like} escape '\\'`,
        sql`lower(${figures.domain}) like ${like} escape '\\'`,
        sql`lower(${figures.era}) like ${like} escape '\\'`,
        sql`lower(${figures.regionSub}) like ${like} escape '\\'`,
        sql`lower(${figures.regionMacro}) like ${like} escape '\\'`
      )
    )
    .limit(200);

  const lexicalScores = new Map<string, number>();
  const terms = normalized.split(/\\s+/).filter(Boolean);
  for (const row of lexicalRows) {
    const name = row.name?.toLowerCase() || '';
    const occupation = row.occupation?.toLowerCase() || '';
    const domain = row.domain?.toLowerCase() || '';
    const era = row.era?.toLowerCase() || '';
    const region = row.region?.toLowerCase() || '';
    const extract = row.wikipediaExtract?.toLowerCase() || '';

    let score = 0;
    if (name.includes(normalized)) score += 3;
    if (occupation.includes(normalized)) score += 2;
    if (domain.includes(normalized)) score += 1.5;
    if (era.includes(normalized)) score += 1;
    if (region.includes(normalized)) score += 1;
    if (extract.includes(normalized)) score += 0.5;

    for (const term of terms) {
      if (term.length < 3) continue;
      if (name.includes(term)) score += 1.5;
      if (occupation.includes(term)) score += 1;
      if (domain.includes(term)) score += 0.5;
      if (extract.includes(term)) score += 0.25;
    }

    lexicalScores.set(row.id, score);
  }

  let semanticScores = new Map<string, number>();
  const embeddingsIndex = loadFigureEmbeddings();
  if (embeddingsIndex && process.env.OPENAI_API_KEY) {
    try {
      const queryEmbedding = normalizeVector(await embedQuery(query));
      semanticScores = new Map(
        embeddingsIndex.figures.map((entry) => [entry.id, dot(entry.vector, queryEmbedding)])
      );
    } catch (error) {
      console.warn('[search] Semantic search failed, using lexical only', error);
    }
  }

  const combinedScores = new Map<string, number>();
  const semanticMax = Math.max(0, ...semanticScores.values());
  const lexicalMax = Math.max(0, ...lexicalScores.values());
  const semanticWeight = semanticScores.size ? 0.7 : 0;
  const lexicalWeight = lexicalScores.size ? 0.3 : 1;

  const allIds = new Set<string>([...semanticScores.keys(), ...lexicalScores.keys()]);
  allIds.forEach((id) => {
    const semantic = semanticMax > 0 ? (semanticScores.get(id) || 0) / semanticMax : 0;
    const lexical = lexicalMax > 0 ? (lexicalScores.get(id) || 0) / lexicalMax : 0;
    combinedScores.set(id, semantic * semanticWeight + lexical * lexicalWeight);
  });

  const rankedIds = Array.from(combinedScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (rankedIds.length === 0) {
    return NextResponse.json({ results: [] });
  }

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
    .where(inArray(figures.id, rankedIds));

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const llmRankLookup = await getLlmRankLookup();

  const results: FigureRow[] = rankedIds
    .map((id) => rowsById.get(id))
    .filter(Boolean)
    .map((row) => ({
      id: row!.id,
      name: row!.name,
      birthYear: row!.birthYear,
      domain: row!.domain,
      era: row!.era,
      regionSub: row!.region,
      hpiRank: row!.hpiRank,
      llmRank: llmRankLookup.get(row!.id) ?? null,
      llmConsensusRank: row!.llmConsensusRank,
      varianceScore: row!.varianceScore,
      pageviews: row!.pageviews,
      varianceLevel: getVarianceLevel(row!.varianceScore),
      badges: [],
      wikipediaSlug: row!.wikipediaSlug,
    }));

  return NextResponse.json({ results });
}

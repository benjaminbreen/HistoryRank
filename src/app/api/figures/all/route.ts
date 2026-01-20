import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { figures } from '@/lib/db/schema';
import { asc } from 'drizzle-orm';

// Lightweight endpoint returning minimal data for all figures
export async function GET() {
  try {
    const allFigures = await db
      .select({
        id: figures.id,
        name: figures.canonicalName,
        domain: figures.domain,
        era: figures.era,
        birthYear: figures.birthYear,
        deathYear: figures.deathYear,
        rank: figures.llmConsensusRank,
      })
      .from(figures)
      .orderBy(asc(figures.canonicalName));

    return NextResponse.json({
      figures: allFigures,
      total: allFigures.length,
    });
  } catch (error) {
    console.error('Failed to fetch all figures:', error);
    return NextResponse.json({ error: 'Failed to fetch figures' }, { status: 500 });
  }
}

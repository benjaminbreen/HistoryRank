import { NextResponse } from 'next/server';
import { db, figures } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(figures);
    return NextResponse.json({
      ok: true,
      figures: result[0]?.count ?? 0,
      dbPath: process.env.DATABASE_URL || 'historyrank.db',
      vercel: process.env.VERCEL === '1',
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Health check failed:', err.message, err.stack);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

// Check which candidate paths exist (for debugging)
function checkPaths() {
  const candidates = [
    path.join(__dirname, '../../../historyrank.db'),
    path.join(__dirname, '../../../../historyrank.db'),
    path.join(process.cwd(), 'historyrank.db'),
    path.join(process.cwd(), '.next/server/historyrank.db'),
    '/var/task/historyrank.db',
    '/var/task/.next/server/historyrank.db',
  ];

  return candidates.map(p => ({ path: p, exists: fs.existsSync(p) }));
}

export async function GET() {
  const pathChecks = checkPaths();
  const foundPath = pathChecks.find(p => p.exists)?.path || 'none found';

  try {
    const { db, figures, resolvedDbPath, dbExists } = await import('@/lib/db');
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(figures);
    return NextResponse.json({
      ok: true,
      figures: result[0]?.count ?? 0,
      resolvedDbPath,
      dbExists,
      cwd: process.cwd(),
      dirname: __dirname,
      vercel: process.env.VERCEL === '1',
      pathChecks,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Health check failed:', err.message, err.stack);
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
        cwd: process.cwd(),
        dirname: __dirname,
        vercel: process.env.VERCEL === '1',
        pathChecks,
      },
      { status: 500 }
    );
  }
}

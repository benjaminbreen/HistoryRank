import { NextResponse } from 'next/server';
import { loadMediaItems } from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

export async function GET() {
  const items = loadMediaItems();
  return NextResponse.json({ items });
}

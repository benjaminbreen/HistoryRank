import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { loadMediaItems } from '@/lib/media';

const CACHE_PATH = path.join(process.cwd(), 'data', 'cache', 'media-details.json');

type MediaDetail = ReturnType<typeof loadMediaItems>[number] & {
  wikipedia_extract?: string | null;
  summary_paragraphs?: string[];
  wikidata_qid?: string | null;
  directors?: string[];
  creators?: string[];
  cast?: string[];
  countries?: string[];
  awards?: string[];
  runtime_minutes?: number | null;
};

function loadCache(): Record<string, MediaDetail> {
  if (!fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as Record<string, MediaDetail>;
  } catch {
    return {};
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const items = loadMediaItems();
  const item = items.find((entry) => entry.id === id);
  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const cache = loadCache();
  const detail = cache[id];

  return NextResponse.json({
    item: {
      ...item,
      ...(detail ?? {}),
    },
  });
}

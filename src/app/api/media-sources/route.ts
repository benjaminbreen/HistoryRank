import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

type MediaItem = {
  id: string;
  title: string;
  release_year?: number | null;
};

type MediaSourceEntry = {
  rank: number | null;
  accuracy: number | null;
  quality: number | null;
  notes: string | null;
  summary: string | null;
};

type MediaSourceGroup = {
  source: string;
  avg_accuracy: number | null;
  avg_quality: number | null;
  sample_count: number;
  entries: MediaSourceEntry[];
};

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');
const RAW_DIR = path.join(process.cwd(), 'data', 'raw', 'media');

const cache = {
  mediaById: null as Map<string, MediaItem> | null,
  byKey: null as Map<string, string> | null,
  sourcesByMediaId: null as Map<string, MediaSourceGroup[]> | null,
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getSourceLabel(filename: string) {
  // Extract model name before "MEDIA LIST" or "LIST"
  const match = filename.match(/^(.+?)\s+(?:MEDIA\s+)?LIST/i);
  if (!match) return filename.replace(/\.(json|txt)$/i, '');
  return match[1].trim();
}

function loadMediaIndex() {
  if (cache.mediaById && cache.byKey) return;
  const raw = fs.readFileSync(MEDIA_PATH, 'utf8');
  const seenIds = new Map<string, number>();
  const mediaById = new Map<string, MediaItem>();
  const byKey = new Map<string, string>();

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const item = JSON.parse(trimmed);
    const title = typeof item.title === 'string' ? item.title : '';
    if (!title) continue;
    const baseId = item.id || slugify(title);
    const nextCount = (seenIds.get(baseId) || 0) + 1;
    seenIds.set(baseId, nextCount);
    const id = nextCount > 1 ? `${baseId}-${nextCount}` : baseId;
    const releaseYear = typeof item.release_year === 'number' ? item.release_year : null;
    mediaById.set(id, { id, title, release_year: releaseYear });
    const key = `${normalizeTitle(title)}::${releaseYear ?? ''}`;
    if (!byKey.has(key)) byKey.set(key, id);
  }

  cache.mediaById = mediaById;
  cache.byKey = byKey;
}

function loadSources() {
  if (cache.sourcesByMediaId) return;
  loadMediaIndex();
  const byKey = cache.byKey!;
  const sourcesByMediaId = new Map<string, MediaSourceGroup[]>();

  const files = fs.readdirSync(RAW_DIR).filter((file) => /MEDIA LIST/i.test(file));
  for (const file of files) {
    const filePath = path.join(RAW_DIR, file);
    let parsed: any[] = [];
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    const source = getSourceLabel(file);

    for (const entry of parsed) {
      const title = typeof entry.title === 'string' ? entry.title : '';
      const releaseYear = typeof entry.release_year === 'number' ? entry.release_year : null;
      if (!title || releaseYear === null) continue;
      const key = `${normalizeTitle(title)}::${releaseYear}`;
      const mediaId = byKey.get(key);
      if (!mediaId) continue;

      const record: MediaSourceEntry = {
        rank: typeof entry.rank === 'number' ? entry.rank : null,
        accuracy: typeof entry.llm_accuracy_score === 'number' ? entry.llm_accuracy_score : null,
        quality: typeof entry.llm_quality_score === 'number' ? entry.llm_quality_score : null,
        notes: typeof entry.notes === 'string' ? entry.notes : null,
        summary: typeof entry.summary === 'string' ? entry.summary : null,
      };

      const groups = sourcesByMediaId.get(mediaId) || [];
      let group = groups.find((g) => g.source === source);
      if (!group) {
        group = { source, avg_accuracy: null, avg_quality: null, sample_count: 0, entries: [] };
        groups.push(group);
      }
      group.entries.push(record);
      group.sample_count += 1;
      if (record.accuracy !== null) {
        const prev = group.avg_accuracy ?? 0;
        group.avg_accuracy = Math.round(((prev * (group.sample_count - 1)) + record.accuracy) / group.sample_count * 10) / 10;
      }
      if (record.quality !== null) {
        const prev = group.avg_quality ?? 0;
        group.avg_quality = Math.round(((prev * (group.sample_count - 1)) + record.quality) / group.sample_count * 10) / 10;
      }
      sourcesByMediaId.set(mediaId, groups);
    }
  }

  cache.sourcesByMediaId = sourcesByMediaId;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mediaId = searchParams.get('mediaId');

  if (!mediaId) {
    return NextResponse.json({ error: 'Missing mediaId.' }, { status: 400 });
  }

  loadSources();
  const groups = cache.sourcesByMediaId?.get(mediaId) || [];
  return NextResponse.json({ items: groups });
}

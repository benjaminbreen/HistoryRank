import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

type ListEntry = {
  file: string;
  label: string;
  size: number;
  downloadUrl: string;
};

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');

function parseLabel(file: string): string {
  const match = file.match(/^(.*)\s+LIST\s+\d+\s+\(/i);
  if (match) {
    return match[1].replace(/\s+/g, ' ').trim();
  }
  return file.replace(/\.[^.]+$/, '');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get('file');

  if (file) {
    const decoded = decodeURIComponent(file);
    const safeName = path.basename(decoded);
    if (!fs.existsSync(RAW_DIR)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    const files = fs.readdirSync(RAW_DIR);
    const matched = files.find((f) => f === safeName) || files.find((f) => f.toLowerCase() === safeName.toLowerCase());
    if (!matched) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fullPath = path.join(RAW_DIR, matched);
    const content = fs.readFileSync(fullPath);
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
      },
    });
  }

  if (!fs.existsSync(RAW_DIR)) {
    return NextResponse.json({ lists: [] });
  }

  const files = fs
    .readdirSync(RAW_DIR)
    .filter((file) => file.toLowerCase().includes('list') && file.toLowerCase().endsWith('.txt'))
    .sort((a, b) => a.localeCompare(b));

  const lists: ListEntry[] = files.map((file) => {
    const fullPath = path.join(RAW_DIR, file);
    const stats = fs.statSync(fullPath);
    return {
      file,
      label: parseLabel(file),
      size: stats.size,
      downloadUrl: `/api/lists?file=${encodeURIComponent(file)}`,
    };
  });

  return NextResponse.json({ lists }, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}

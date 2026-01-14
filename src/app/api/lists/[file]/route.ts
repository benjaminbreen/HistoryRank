import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');

function resolveListPath(fileName: string) {
  const decoded = decodeURIComponent(fileName);
  const safeName = path.basename(decoded);
  if (!fs.existsSync(RAW_DIR)) return null;
  const files = fs.readdirSync(RAW_DIR);
  const matched = files.find((file) => file === safeName) || files.find((file) => file.toLowerCase() === safeName.toLowerCase());
  if (!matched) return null;
  return path.join(RAW_DIR, matched);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ file: string }> }
) {
  const { file } = await context.params;
  const fullPath = resolveListPath(file);
  if (!fullPath) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const content = fs.readFileSync(fullPath);
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
    },
  });
}

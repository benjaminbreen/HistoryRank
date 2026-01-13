/**
 * Download missing thumbnails for all figures with Wikipedia slugs
 *
 * Usage:
 *   npx tsx scripts/download-thumbnails.ts           # Download all missing
 *   npx tsx scripts/download-thumbnails.ts --force   # Re-download all
 *   npx tsx scripts/download-thumbnails.ts --check   # Just report missing
 */

import { db, figures } from '../src/lib/db';
import { isNotNull } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import https from 'https';
import http from 'http';
import * as wikipedia from './lib/wikipedia.js';

const THUMBNAILS_DIR = path.join(process.cwd(), 'public', 'thumbnails');
const EXTENSIONS = ['jpg', 'png', 'webp'];

function thumbnailExists(figureId: string): string | null {
  for (const ext of EXTENSIONS) {
    const filePath = path.join(THUMBNAILS_DIR, `${figureId}.${ext}`);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

async function fetchWikipediaThumbnail(slug: string): Promise<string | null> {
  try {
    const json = await wikipedia.fetchWikipediaSummary(slug);
    return json?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

async function downloadImage(figureId: string, imageUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Determine extension from URL
    let ext = 'jpg';
    if (imageUrl.includes('.png')) ext = 'png';
    else if (imageUrl.includes('.webp')) ext = 'webp';

    const filePath = path.join(THUMBNAILS_DIR, `${figureId}.${ext}`);

    const makeRequest = (requestUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        resolve(false);
        return;
      }

      const protocol = requestUrl.startsWith('https') ? https : http;

      protocol.get(requestUrl, { headers: { 'User-Agent': 'HistoryRank/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirect = res.headers.location;
          if (redirect) {
            makeRequest(redirect, redirectCount + 1);
            return;
          }
        }

        if (res.statusCode !== 200) {
          resolve(false);
          return;
        }

        const fileStream = fs.createWriteStream(filePath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(true);
        });
        fileStream.on('error', () => {
          fs.unlink(filePath, () => {});
          resolve(false);
        });
      }).on('error', () => resolve(false));
    };

    makeRequest(imageUrl);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const forceAll = args.includes('--force');
  const checkOnly = args.includes('--check');

  console.log('🖼️  Thumbnail Downloader\n');

  // Ensure directory exists
  fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

  // Get all figures with Wikipedia slugs
  const allFigures = await db.query.figures.findMany({
    where: isNotNull(figures.wikipediaSlug),
    columns: { id: true, canonicalName: true, wikipediaSlug: true },
  });

  console.log(`Found ${allFigures.length} figures with Wikipedia slugs\n`);

  const missing: Array<{ id: string; name: string; slug: string }> = [];
  const existing: string[] = [];

  // Check which ones need thumbnails
  for (const fig of allFigures) {
    const exists = thumbnailExists(fig.id);
    if (exists && !forceAll) {
      existing.push(fig.id);
    } else if (fig.wikipediaSlug) {
      missing.push({ id: fig.id, name: fig.canonicalName, slug: fig.wikipediaSlug });
    }
  }

  console.log(`Existing thumbnails: ${existing.length}`);
  console.log(`Missing thumbnails: ${missing.length}\n`);

  if (checkOnly) {
    if (missing.length > 0) {
      console.log('Missing:');
      for (const m of missing.slice(0, 20)) {
        console.log(`  - ${m.id} (${m.name})`);
      }
      if (missing.length > 20) {
        console.log(`  ... and ${missing.length - 20} more`);
      }
    }
    return;
  }

  if (missing.length === 0) {
    console.log('✅ All thumbnails are present!');
    return;
  }

  // Download missing thumbnails
  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < missing.length; i++) {
    const fig = missing[i];
    process.stdout.write(`[${i + 1}/${missing.length}] ${fig.id}... `);

    const thumbnailUrl = await fetchWikipediaThumbnail(fig.slug);

    if (!thumbnailUrl) {
      console.log('❌ no image');
      failed++;
      continue;
    }

    const success = await downloadImage(fig.id, thumbnailUrl);

    if (success) {
      console.log('✓');
      downloaded++;
    } else {
      console.log('❌ download failed');
      failed++;
    }

    // Rate limit to be nice to Wikipedia
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n📊 Results:`);
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total thumbnails: ${existing.length + downloaded}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });

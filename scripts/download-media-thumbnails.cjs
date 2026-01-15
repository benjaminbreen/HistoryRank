const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');
const wikipedia = require('./lib/wikipedia.js');

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');
const THUMBNAILS_DIR = path.join(process.cwd(), 'public', 'media-thumbnails');
const EXTENSIONS = ['jpg', 'png', 'webp'];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function loadMedia() {
  if (!fs.existsSync(MEDIA_PATH)) return [];
  const raw = fs.readFileSync(MEDIA_PATH, 'utf8');
  const seenIds = new Map();
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const item = JSON.parse(line);
      const baseId = item.id || slugify(item.title || '');
      const nextCount = (seenIds.get(baseId) || 0) + 1;
      seenIds.set(baseId, nextCount);
      const id = nextCount > 1 ? `${baseId}-${nextCount}` : baseId;
      return { ...item, id };
    });
}

function thumbnailExists(mediaId) {
  for (const ext of EXTENSIONS) {
    const filePath = path.join(THUMBNAILS_DIR, `${mediaId}.${ext}`);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

async function fetchWikipediaThumbnail(slug) {
  try {
    const json = await wikipedia.fetchWikipediaSummary(slug);
    return json?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

async function downloadImage(mediaId, imageUrl) {
  return new Promise((resolve) => {
    let ext = 'jpg';
    if (imageUrl.includes('.png')) ext = 'png';
    else if (imageUrl.includes('.webp')) ext = 'webp';

    const filePath = path.join(THUMBNAILS_DIR, `${mediaId}.${ext}`);

    const makeRequest = (requestUrl, redirectCount = 0) => {
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

  console.log('🖼️  Media Thumbnail Downloader\n');
  fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

  const items = loadMedia().filter((item) => item.wikipedia_slug);
  console.log(`Found ${items.length} media items with Wikipedia slugs\n`);

  const missing = [];
  const existing = [];

  for (const item of items) {
    const exists = thumbnailExists(item.id);
    if (exists && !forceAll) {
      existing.push(item.id);
    } else if (item.wikipedia_slug) {
      missing.push({ id: item.id, title: item.title, slug: item.wikipedia_slug });
    }
  }

  console.log(`Existing thumbnails: ${existing.length}`);
  console.log(`Missing thumbnails: ${missing.length}\n`);

  if (checkOnly) {
    if (missing.length > 0) {
      console.log('Missing:');
      for (const m of missing.slice(0, 20)) {
        console.log(`  - ${m.id} (${m.title})`);
      }
      if (missing.length > 20) {
        console.log(`  ... and ${missing.length - 20} more`);
      }
    }
    return;
  }

  if (!missing.length) {
    console.log('✅ All media thumbnails are present!');
    return;
  }

  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < missing.length; i++) {
    const item = missing[i];
    process.stdout.write(`[${i + 1}/${missing.length}] ${item.id}... `);

    const thumbnailUrl = await fetchWikipediaThumbnail(item.slug);
    if (!thumbnailUrl) {
      console.log('❌ no image');
      failed++;
      continue;
    }

    const success = await downloadImage(item.id, thumbnailUrl);
    if (success) {
      console.log('✓');
      downloaded++;
    } else {
      console.log('❌ download failed');
      failed++;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
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

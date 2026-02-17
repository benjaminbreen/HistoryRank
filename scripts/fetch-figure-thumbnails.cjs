#!/usr/bin/env node
/**
 * fetch-figure-thumbnails.cjs
 *
 * Fetches missing thumbnails for figures from Wikipedia API.
 * Reads figure IDs and wikipedia_slugs from SQLite, downloads images
 * to public/thumbnails/.
 *
 * Respects Wikipedia rate limits with configurable delay between requests.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'historyrank.db');
const THUMB_DIR = path.join(__dirname, '..', 'public', 'thumbnails');
const DELAY_MS = 200; // ms between requests (be polite to Wikipedia)
const IMAGE_WIDTH = 400; // px

const db = new Database(DB_PATH, { readonly: true });

// Get all figures with their wikipedia slugs
const figures = db.prepare(
  'SELECT id, canonical_name, wikipedia_slug, llm_consensus_rank FROM figures WHERE wikipedia_slug IS NOT NULL ORDER BY llm_consensus_rank ASC'
).all();

// Find which ones are missing thumbnails
const thumbFiles = new Set(fs.readdirSync(THUMB_DIR).map(f => f.replace(/\.[^.]*$/, '')));
const missing = figures.filter(f => !thumbFiles.has(f.id));

console.log(`Figures missing thumbnails: ${missing.length}`);
console.log(`Starting fetch...\n`);

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'HistoryRank/1.0 (bebreen@ucsc.edu; historical figure thumbnails)' }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode === 429) {
        reject(new Error('RATE_LIMITED'));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const makeRequest = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 5) { reject(new Error('too many redirects')); return; }
      const mod = currentUrl.startsWith('https') ? https : require('http');
      const req = mod.get(currentUrl, {
        headers: { 'User-Agent': 'HistoryRank/1.0 (bebreen@ucsc.edu)' }
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return makeRequest(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const stream = fs.createWriteStream(dest);
        res.pipe(stream);
        stream.on('finish', () => { stream.close(); resolve(); });
        stream.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    };
    makeRequest(url);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchBatch(items, batchLabel) {
  let fetched = 0;
  let noImage = 0;
  let rateLimited = [];
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const fig = items[i];
    const slug = fig.wikipedia_slug;

    let title;
    try { title = decodeURIComponent(slug); }
    catch { title = slug; }
    const baseTitle = title.split('#')[0];

    try {
      const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(baseTitle)}`;
      const data = await fetchJSON(apiUrl);

      if (!data || !data.thumbnail || !data.thumbnail.source) {
        noImage++;
        if ((i + 1) % 50 === 0 || i < 5) {
          process.stdout.write(`  [${batchLabel} ${i+1}/${items.length}] ${fig.canonical_name} - no image\n`);
        }
        await sleep(DELAY_MS / 2);
        continue;
      }

      let imageUrl = data.thumbnail.source;
      imageUrl = imageUrl.replace(/\/\d+px-/, `/${IMAGE_WIDTH}px-`);

      const urlPath = new URL(imageUrl).pathname;
      let ext = path.extname(urlPath).toLowerCase().split('?')[0];
      if (!ext || ext.length > 5) ext = '.jpg';
      if (ext === '.svg') ext = '.png';

      const destFile = path.join(THUMB_DIR, `${fig.id}${ext}`);
      await downloadFile(imageUrl, destFile);

      const stat = fs.statSync(destFile);
      if (stat.size < 500) {
        fs.unlinkSync(destFile);
        noImage++;
      } else {
        fetched++;
        if ((i + 1) % 50 === 0 || i < 5) {
          process.stdout.write(`  [${batchLabel} ${i+1}/${items.length}] ${fig.canonical_name} - OK (${Math.round(stat.size/1024)}KB)\n`);
        }
      }
    } catch (err) {
      if (err.message === 'RATE_LIMITED') {
        rateLimited.push(fig);
        // Back off significantly on rate limit
        process.stdout.write(`  [${batchLabel} ${i+1}/${items.length}] RATE LIMITED - pausing 30s...\n`);
        await sleep(30000);
      } else {
        failed++;
        if ((i + 1) % 50 === 0 || i < 5) {
          process.stdout.write(`  [${batchLabel} ${i+1}/${items.length}] ${fig.canonical_name} - ERROR: ${err.message}\n`);
        }
      }
    }

    await sleep(DELAY_MS);
  }

  return { fetched, noImage, rateLimited, failed };
}

async function main() {
  let totalFetched = 0;
  let totalNoImage = 0;
  let totalFailed = 0;

  // First pass
  console.log('--- Pass 1 ---');
  const r1 = await fetchBatch(missing, 'P1');
  totalFetched += r1.fetched;
  totalNoImage += r1.noImage;
  totalFailed += r1.failed;
  console.log(`\nPass 1: fetched=${r1.fetched} noImage=${r1.noImage} rateLimited=${r1.rateLimited.length} failed=${r1.failed}`);

  // Retry rate-limited items after a longer pause
  if (r1.rateLimited.length > 0) {
    console.log(`\nWaiting 60s before retrying ${r1.rateLimited.length} rate-limited items...`);
    await sleep(60000);
    console.log('--- Pass 2 (retries) ---');
    const r2 = await fetchBatch(r1.rateLimited, 'P2');
    totalFetched += r2.fetched;
    totalNoImage += r2.noImage;
    totalFailed += r2.failed + r2.rateLimited.length;
    console.log(`\nPass 2: fetched=${r2.fetched} noImage=${r2.noImage} stillRateLimited=${r2.rateLimited.length} failed=${r2.failed}`);
  }

  console.log(`\n=== FINAL RESULTS ===`);
  console.log(`Fetched: ${totalFetched}`);
  console.log(`No image available: ${totalNoImage}`);
  console.log(`Failed: ${totalFailed}`);

  // Recount
  const newThumbFiles = new Set(fs.readdirSync(THUMB_DIR).map(f => f.replace(/\.[^.]*$/, '')));
  const allFigures = db.prepare('SELECT id FROM figures').all();
  const stillMissing = allFigures.filter(f => !newThumbFiles.has(f.id)).length;
  console.log(`\nFigures now with thumbnails: ${allFigures.length - stillMissing} / ${allFigures.length} (${((allFigures.length - stillMissing) / allFigures.length * 100).toFixed(1)}%)`);
  console.log(`Still missing: ${stillMissing}`);
}

main().catch(console.error).finally(() => db.close());

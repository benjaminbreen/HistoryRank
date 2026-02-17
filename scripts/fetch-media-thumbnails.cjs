#!/usr/bin/env node
/**
 * fetch-media-thumbnails.cjs
 *
 * Fetches missing thumbnails for media items from Wikipedia API.
 * Uses the page images API to get the main image for each article.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const JSONL = path.join(__dirname, '..', 'data', 'raw', 'media', 'ucsc-history-media.jsonl');
const THUMB_DIR = path.join(__dirname, '..', 'public', 'media-thumbnails');

// Slugify (same as src/lib/media.ts)
function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Load items and assign IDs
const items = fs.readFileSync(JSONL, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const seen = new Map();
items.forEach(item => {
  let base = slugify(item.title);
  if (seen.has(base)) {
    const count = seen.get(base) + 1;
    seen.set(base, count);
    item._id = `${base}-${count}`;
  } else {
    seen.set(base, 1);
    item._id = base;
  }
});

// Find missing
const thumbFiles = new Set(fs.readdirSync(THUMB_DIR).map(f => f.replace(/\.[^.]*$/, '')));
const missing = items.filter(i => !thumbFiles.has(i._id) && i.wikipedia_slug);

console.log(`Missing thumbnails with Wikipedia slug: ${missing.length}`);

// Rate-limited fetch helper
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'HistoryRank/1.0 (bebreen@ucsc.edu)' } }, res => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve, reject);
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
    const makeRequest = (currentUrl) => {
      const mod = currentUrl.startsWith('https') ? https : require('http');
      const req = mod.get(currentUrl, { headers: { 'User-Agent': 'HistoryRank/1.0 (bebreen@ucsc.edu)' } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return makeRequest(res.headers.location);
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

async function main() {
  let fetched = 0;
  let failed = 0;
  let noImage = 0;

  for (let i = 0; i < missing.length; i++) {
    const item = missing[i];
    const slug = item.wikipedia_slug;

    // Decode percent-encoded slugs for the API title parameter
    let title;
    try {
      title = decodeURIComponent(slug);
    } catch {
      title = slug;
    }

    // Handle anchored slugs (e.g., "Arthur_Waley#The_Tale_of_Genji")
    const baseTitle = title.split('#')[0];

    try {
      // Use Wikipedia API to get the main image
      const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(baseTitle)}`;
      const data = await fetchJSON(apiUrl);

      if (!data || !data.thumbnail || !data.thumbnail.source) {
        noImage++;
        process.stdout.write(`  [${i+1}/${missing.length}] ${item.title} - no image\n`);
        await sleep(100);
        continue;
      }

      // Get a reasonably-sized image (request 400px width)
      let imageUrl = data.thumbnail.source;
      // Wikipedia thumbnails have format: .../thumb/.../Filename/Npx-Filename
      // We can change the size by replacing the Npx part
      imageUrl = imageUrl.replace(/\/\d+px-/, '/400px-');

      // Determine extension
      const urlPath = new URL(imageUrl).pathname;
      let ext = path.extname(urlPath).toLowerCase().split('?')[0];
      if (!ext || ext.length > 5) ext = '.jpg';
      if (ext === '.svg') {
        // SVGs from Wikipedia usually have a PNG render
        ext = '.png';
      }

      const destFile = path.join(THUMB_DIR, `${item._id}${ext}`);
      await downloadFile(imageUrl, destFile);

      // Verify file was downloaded and has content
      const stat = fs.statSync(destFile);
      if (stat.size < 500) {
        fs.unlinkSync(destFile);
        noImage++;
        process.stdout.write(`  [${i+1}/${missing.length}] ${item.title} - too small (${stat.size}b)\n`);
      } else {
        fetched++;
        process.stdout.write(`  [${i+1}/${missing.length}] ${item.title} - OK (${Math.round(stat.size/1024)}KB)\n`);
      }
    } catch (err) {
      failed++;
      process.stdout.write(`  [${i+1}/${missing.length}] ${item.title} - ERROR: ${err.message}\n`);
    }

    // Be polite to Wikipedia
    await sleep(150);
  }

  console.log(`\n--- Results ---`);
  console.log(`Fetched: ${fetched}`);
  console.log(`No image available: ${noImage}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
